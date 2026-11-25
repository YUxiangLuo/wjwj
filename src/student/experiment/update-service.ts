import { experiment } from "../../db/schema";
import { attachCalculatedSampleSize } from "./sample-plan";
import { parseStoredJson } from "./serialization";
import { ExperimentStatus } from "@/domain/experiment/status";
import { getRequiredStratifiedMinimum } from "./final-sample-bounds";
import { resolveAnalysisTarget } from "../../lib/analysis-target";
import { canonicalizeRichTextHtmlForStorage } from "../../server/rich-text";
import { canonicalJson } from "../../server/variable-source";
import { validateQuestionBindings } from "../../domain/variables/question-binding";
import type { VariableDictionary } from "../../domain/variables/types";
import type { QuestionnaireData } from "../../lib/questionnaire-types";
import {
    DEFAULT_CLEANING_CONFIG,
    evaluateQuestionnaireBurden,
    parseAdjustmentPlan,
    validateAdjustmentPlan,
    type StoredExperimentWave,
} from "../../domain/fieldwork";
import { isCompletedSamplingResult, resolveSamplingPolicy, SAMPLING_METHODS } from "../../lib/sampling-policy";
import { ensureActiveWave, parseStoredWaves } from "./fieldwork-wave-service";
import { compactSamplingResults } from "./sampling-storage";
import {
    getTargetSampleSizeFromSamplePlan,
    validateMeanPlanVariance,
    validateQuestionnaireForSubmit,
    validateReportForSubmit,
    validateSamplePlanForSubmit,
    validateSamplingResultsForSubmit,
} from "./submit-validation";

type ExperimentRecord = typeof experiment.$inferSelect;

interface Failure {
    ok: false;
    code: string;
    message: string;
    status: number;
}

function fail(message: string, code = "VALIDATION_ERROR", status = 400): Failure {
    return { ok: false, code, message, status };
}

function isEditable(record: ExperimentRecord) {
    return record.status === ExperimentStatus.IN_PROGRESS || record.status === ExperimentStatus.REJECTED;
}

function completedAtForStage(record: ExperimentRecord, stage: number) {
    if (stage === 1) return record.stage1CompletedAt;
    if (stage === 2) return record.stage2CompletedAt;
    if (stage === 3) return record.stage3CompletedAt;
    if (stage === 4) return record.stage4CompletedAt;
    if (stage === 5) return record.stage5CompletedAt;
    return null;
}

function normalizeQuestionnairePayload(rawQuestionnaire: unknown) {
    if (rawQuestionnaire && typeof rawQuestionnaire === "object" && !Array.isArray(rawQuestionnaire)) {
        return {
            ...rawQuestionnaire,
            welcomeText: canonicalizeRichTextHtmlForStorage((rawQuestionnaire as Record<string, unknown>).welcomeText),
            endingText: canonicalizeRichTextHtmlForStorage((rawQuestionnaire as Record<string, unknown>).endingText),
        };
    }
    return rawQuestionnaire;
}

export function buildStageCompletionUpdates(params: {
    experimentRecord: ExperimentRecord;
    stage: number;
    payload: Record<string, unknown>;
    populationSize: number | null;
    deadlinePassed: boolean;
    fieldMapping?: unknown;
    samplingPolicy?: unknown;
    stratifiedStats?: Record<string, Record<string, number>>;
    populationVariance?: number | null;
    verifiedWave1Variance?: number | readonly number[] | null;
    verifiedWave1Variances?: readonly number[] | null;
    variableDictionary?: VariableDictionary | null;
}) {
    const { experimentRecord: record, stage, payload } = params;
    if (!Number.isInteger(stage) || stage < 1 || stage > 5) return fail("阶段必须是1-5的整数");
    if (!isEditable(record)) return fail("实验已提交或批改，不能继续修改", "EXPERIMENT_LOCKED", 409);
    if (params.deadlinePassed) return fail("任务已截止，无法完成阶段", "TASK_DEADLINE");
    if (record.currentStage !== stage) return fail("请按顺序完成当前阶段", "INVALID_STAGE_ORDER", 409);
    if (stage > 1 && !completedAtForStage(record, stage - 1)) {
        return fail("请先完成上一阶段", "INVALID_STAGE_ORDER", 409);
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const updates: Partial<typeof experiment.$inferInsert> = {
        version: record.version + 1,
        updatedAt: now,
    };

    const resolvedTarget = resolveAnalysisTarget(params.fieldMapping);

    // 阶段 1：商业问卷设计与指标绑定
    if (stage === 1) {
        const questionnaire = normalizeQuestionnairePayload(payload.questionnaire);
        const validationError = validateQuestionnaireForSubmit(questionnaire);
        if (validationError) return fail(validationError);
        try {
            validateQuestionBindings(questionnaire as QuestionnaireData, params.variableDictionary ?? null, record.taskId);
        } catch (cause) {
            return fail(cause instanceof Error ? cause.message : "变量关联无效");
        }
        if (params.variableDictionary && resolvedTarget && !resolvedTarget.inferred) {
            const burden = evaluateQuestionnaireBurden(questionnaire as QuestionnaireData, params.variableDictionary, resolvedTarget.target);
            if (!burden.primaryTargetBound) {
                return fail(`请至少将核心商业研究指标「${resolvedTarget.target.field}」绑定到问卷中的对应题目，否则发放后无法回收核心数据`);
            }
        }
        const wave1: StoredExperimentWave = {
            waveNumber: 1,
            kind: "pilot",
            label: "第 1 轮 · 首轮试投",
            questionnaire: questionnaire as QuestionnaireData,
            samplePlan: null,
            samplingResults: null,
            fieldwork: null,
            cleaningConfig: { ...DEFAULT_CLEANING_CONFIG },
            completedAt: null,
        };
        const nextWaves = [wave1];

        updates.questionnaire = questionnaire;
        updates.samplePlan = null;
        updates.samplingResults = null;
        updates.adjustmentPlan = null;
        updates.activeWaveNumber = 1;
        updates.wavesData = nextWaves;
        updates.stage1CompletedAt = now;
        updates.currentStage = 2;
        return { ok: true as const, updates };
    }

    // 阶段 2：首轮试投规划、抽样与发放（Wave 1）
    if (stage === 2) {
        const storedWaves = parseStoredWaves(record.wavesData);
        const { waves, activeWave } = ensureActiveWave({ ...record, activeWaveNumber: 1 });
        const rawSamplePlan = payload.samplePlan ?? activeWave.samplePlan ?? parseStoredJson(record.samplePlan);
        if (!rawSamplePlan || typeof rawSamplePlan !== "object" || Array.isArray(rawSamplePlan)) {
            return fail("请先完成首轮试投的样本量规划");
        }
        const samplePlan = attachCalculatedSampleSize(rawSamplePlan as Record<string, unknown>, params.populationSize);
        const analysisTargetKind = resolvedTarget?.target.kind;
        const validationError = validateSamplePlanForSubmit(samplePlan, params.populationSize, analysisTargetKind);
        if (validationError) return fail(validationError);
        const varianceError = validateMeanPlanVariance(samplePlan, analysisTargetKind, params.populationVariance, {
            allowPriorEstimate: true,
        });
        if (varianceError) return fail(varianceError);

        const prevTargetSize = getTargetSampleSizeFromSamplePlan(activeWave.samplePlan);
        const nextTargetSize = getTargetSampleSizeFromSamplePlan(samplePlan);
        if (prevTargetSize !== null && prevTargetSize !== nextTargetSize) {
            return fail("样本量规划已变更，请先保存最新规划并重新完成首轮抽样与问卷发放", "FIELDWORK_REQUIRED", 409);
        }

        const waveSampling = storedWaves.some((w) => w.waveNumber === 1)
            ? activeWave.samplingResults
            : (activeWave.samplingResults ?? compactSamplingResults(parseStoredJson(record.samplingResults)));
        const policy = resolveSamplingPolicy(params.samplingPolicy);
        const completedMethods = SAMPLING_METHODS.filter((m) => isCompletedSamplingResult((waveSampling as Record<string, unknown> | null)?.[m]));
        if (completedMethods.length === 0) {
            return fail("请先执行至少一种抽样方法抽取首轮试投受访者名单", "SAMPLING_RESULTS_REQUIRED", 409);
        }
        for (const method of completedMethods) {
            if (policy.methods[method] === "disabled") {
                return fail("首轮试投包含当前实验模板已禁用的抽样方法", "SAMPLING_METHOD_DISABLED", 409);
            }
            const section = (waveSampling as Record<string, Record<string, unknown> | undefined>)[method];
            if (section?.serverGenerated !== true) {
                return fail("请使用系统生成的有效抽样名单", "SAMPLING_RESULTS_REQUIRED", 409);
            }
        }
        const hasAllFieldwork = completedMethods.every((m) => Boolean(activeWave.fieldwork?.methods?.[m]?.records?.length));
        if (!hasAllFieldwork) {
            return fail("请点击“发放首轮试投问卷”完成受访者模拟回收后再进入质检诊断阶段", "FIELDWORK_REQUIRED", 409);
        }

        const updatedWave1: StoredExperimentWave = {
            ...activeWave,
            samplePlan,
            samplingResults: waveSampling as Record<string, unknown> | null,
            completedAt: nowIso,
        };
        const nextWaves = waves.map((w) => (w.waveNumber === 1 ? updatedWave1 : w));

        updates.samplePlan = samplePlan;
        updates.samplingResults = waveSampling;
        updates.wavesData = nextWaves;
        updates.stage2CompletedAt = now;
        updates.currentStage = 3;
        return { ok: true as const, updates };
    }

    // 阶段 3：回收诊断、废卷质检清洗与调优立项
    if (stage === 3) {
        const rawAdjustment = payload.adjustmentPlan ?? parseStoredJson(record.adjustmentPlan);
        const planError = validateAdjustmentPlan(rawAdjustment);
        if (planError) return fail(planError);
        const adjustmentPlan = {
            ...parseAdjustmentPlan(rawAdjustment)!,
            updatedAt: nowIso,
        };

        const waves = parseStoredWaves(record.wavesData);
        const wave1 = waves.find((w) => w.waveNumber === 1);
        const baseQuestionnaire = wave1?.questionnaire
            ?? parseStoredJson<QuestionnaireData>(record.questionnaire)
            ?? { title: "", welcomeText: "", endingText: "", questions: [] };
        const existingWave2 = waves.find((w) => w.waveNumber === 2);
        const wave2: StoredExperimentWave = existingWave2 ?? {
            waveNumber: 2,
            kind: "main",
            label: "第 2 轮 · 调优正式投放",
            questionnaire: structuredClone(baseQuestionnaire),
            samplePlan: wave1?.samplePlan ? structuredClone(wave1.samplePlan) : parseStoredJson<Record<string, unknown>>(record.samplePlan),
            samplingResults: null,
            fieldwork: null,
            cleaningConfig: wave1 ? { ...wave1.cleaningConfig } : { ...DEFAULT_CLEANING_CONFIG },
            completedAt: null,
        };
        const nextWaves = existingWave2
            ? waves
            : [...waves, wave2].sort((a, b) => a.waveNumber - b.waveNumber);
        const nextActiveWaveNumber = existingWave2 ? Math.max(2, record.activeWaveNumber) : 2;
        const targetActiveWave = nextWaves.find((w) => w.waveNumber === nextActiveWaveNumber) ?? wave2;

        updates.adjustmentPlan = adjustmentPlan;
        updates.activeWaveNumber = nextActiveWaveNumber;
        updates.questionnaire = targetActiveWave.questionnaire;
        updates.samplePlan = targetActiveWave.samplePlan;
        updates.samplingResults = (targetActiveWave.samplingResults as Record<string, unknown> | null) ?? null;
        updates.wavesData = nextWaves;
        updates.stage3CompletedAt = now;
        updates.currentStage = 4;
        return { ok: true as const, updates };
    }

    // 阶段 4：调整思路与二轮正式投放（Wave 2+）
    if (stage === 4) {
        const storedWaves = parseStoredWaves(record.wavesData);
        const targetWaveNum = Math.max(2, record.activeWaveNumber || 2);
        const { waves, activeWave } = ensureActiveWave({ ...record, activeWaveNumber: targetWaveNum });

        const effectiveQuestionnaire = payload.questionnaire !== undefined
            ? normalizeQuestionnairePayload(payload.questionnaire)
            : activeWave.questionnaire;
        const qErr = validateQuestionnaireForSubmit(effectiveQuestionnaire);
        if (qErr) return fail(qErr);
        try {
            validateQuestionBindings(effectiveQuestionnaire as QuestionnaireData, params.variableDictionary ?? null, record.taskId);
        } catch (cause) {
            return fail(cause instanceof Error ? cause.message : "二轮问卷变量关联无效");
        }
        if (params.variableDictionary && resolvedTarget && !resolvedTarget.inferred) {
            const burden = evaluateQuestionnaireBurden(effectiveQuestionnaire as QuestionnaireData, params.variableDictionary, resolvedTarget.target);
            if (!burden.primaryTargetBound) {
                return fail(`二轮问卷仍须保持核心研究指标「${resolvedTarget.target.field}」已绑定`);
            }
        }
        if (
            payload.questionnaire !== undefined
            && canonicalJson(effectiveQuestionnaire) !== canonicalJson(normalizeQuestionnairePayload(activeWave.questionnaire))
        ) {
            return fail("正式轮问卷已修改但尚未保存并重新投放，请先保存修订问卷并重新执行问卷发放回收", "FIELDWORK_REQUIRED", 409);
        }

        const rawSamplePlan = payload.samplePlan ?? activeWave.samplePlan ?? (storedWaves.length === 0 ? parseStoredJson(record.samplePlan) : null);
        if (!rawSamplePlan || typeof rawSamplePlan !== "object" || Array.isArray(rawSamplePlan)) {
            return fail("请完成正式投放轮次的样本量重算与保存");
        }
        const samplePlan = attachCalculatedSampleSize(rawSamplePlan as Record<string, unknown>, params.populationSize);
        const analysisTargetKind = resolvedTarget?.target.kind;
        const minimumSampleSize = getRequiredStratifiedMinimum(params.stratifiedStats, params.samplingPolicy, params.populationSize ?? 0);
        if (minimumSampleSize === null) return fail("必做分层抽样缺少覆盖完整总体的分层数据，请联系教师检查课题");
        if (minimumSampleSize > 1 && Number(samplePlan.finalSampleSize) < minimumSampleSize) {
            return fail(`必做分层抽样至少需要 ${minimumSampleSize} 个样本，以覆盖每个非空层`);
        }
        const planValidationError = validateSamplePlanForSubmit(samplePlan, params.populationSize, analysisTargetKind, { minimumSampleSize });
        if (planValidationError) return fail(planValidationError);
        const varianceError = validateMeanPlanVariance(samplePlan, analysisTargetKind, params.populationVariance, {
            verifiedEmpiricalVariance: params.verifiedWave1Variance,
            verifiedEmpiricalVariances: params.verifiedWave1Variances,
        });
        if (varianceError) return fail(varianceError);

        const prevTargetSize = getTargetSampleSizeFromSamplePlan(activeWave.samplePlan);
        const nextTargetSize = getTargetSampleSizeFromSamplePlan(samplePlan);
        if (prevTargetSize !== null && prevTargetSize !== nextTargetSize) {
            return fail("正式轮样本量规划已变更，请先保存最新规划并重新完成抽样与问卷投放", "FIELDWORK_REQUIRED", 409);
        }

        const waveSampling = storedWaves.length > 0
            ? activeWave.samplingResults
            : (activeWave.samplingResults ?? compactSamplingResults(parseStoredJson(record.samplingResults)));
        const samplingError = validateSamplingResultsForSubmit(
            waveSampling,
            getTargetSampleSizeFromSamplePlan(samplePlan),
            params.populationSize,
            params.samplingPolicy,
        );
        if (samplingError) return fail(samplingError);

        const completedMethods = SAMPLING_METHODS.filter((m) => isCompletedSamplingResult((waveSampling as Record<string, unknown> | null)?.[m]));
        const missingFieldwork = completedMethods.some((m) => !activeWave.fieldwork?.methods?.[m]?.records?.length);
        if (missingFieldwork) {
            return fail("请点击“执行正式问卷投放与回收”获取二轮各抽样方法的回收数据后再进入报告阶段", "FIELDWORK_REQUIRED", 409);
        }

        const finalizedWave: StoredExperimentWave = {
            ...activeWave,
            questionnaire: effectiveQuestionnaire as QuestionnaireData,
            samplePlan,
            samplingResults: waveSampling as Record<string, unknown> | null,
            completedAt: nowIso,
        };
        const nextWaves = waves.map((w) => (w.waveNumber === targetWaveNum ? finalizedWave : w));

        updates.questionnaire = effectiveQuestionnaire;
        updates.samplePlan = samplePlan;
        updates.samplingResults = waveSampling;
        updates.wavesData = nextWaves;
        updates.stage4CompletedAt = now;
        updates.currentStage = 5;
        return { ok: true as const, updates };
    }

    // 阶段 5：商务统计分析与管理决策报告
    if (payload.reportContent !== undefined && payload.reportContent !== null && typeof payload.reportContent !== "string") {
        return fail("报告内容格式无效，请重新编辑后再提交", "VALIDATION_ERROR", 400);
    }
    const reportContent = canonicalizeRichTextHtmlForStorage(payload.reportContent);
    const reportValidationError = validateReportForSubmit(reportContent);
    if (reportValidationError) return fail(reportValidationError);
    updates.reportContent = reportContent;
    updates.stage5CompletedAt = now;
    updates.currentStage = 5;

    return { ok: true as const, updates };
}

export function buildStageReopenUpdates(params: {
    experimentRecord: ExperimentRecord;
    stage: number;
    deadlinePassed: boolean;
}) {
    const { experimentRecord: record, stage } = params;
    if (!Number.isInteger(stage) || stage < 1 || stage > 5) return fail("阶段必须是1-5的整数");
    if (!isEditable(record)) return fail("实验已提交或批改，不能重新编辑", "EXPERIMENT_LOCKED", 409);
    if (params.deadlinePassed) return fail("任务已截止，无法重新编辑", "TASK_DEADLINE");
    if (!completedAtForStage(record, stage)) return fail("该阶段尚未完成", "STAGE_NOT_COMPLETED", 409);

    const waves = parseStoredWaves(record.wavesData);
    const updates: Partial<typeof experiment.$inferInsert> = {
        version: record.version + 1,
        currentStage: stage,
        updatedAt: new Date(),
    };
    if (stage <= 4) {
        updates.samplingGeneration = record.samplingGeneration + 1;
        updates.analysisReferences = [];
    }

    if (stage === 1) {
        updates.activeWaveNumber = 1;
        updates.wavesData = [];
        updates.samplePlan = null;
        updates.samplingResults = null;
        updates.adjustmentPlan = null;
        updates.reportContent = null;
        updates.stage1CompletedAt = null;
        updates.stage2CompletedAt = null;
        updates.stage3CompletedAt = null;
        updates.stage4CompletedAt = null;
        updates.stage5CompletedAt = null;
    } else if (stage === 2) {
        const wave1 = waves.find((w) => w.waveNumber === 1);
        const hadFormalWave = waves.some((w) => w.waveNumber > 1);
        updates.activeWaveNumber = 1;
        updates.wavesData = waves.filter((w) => w.waveNumber === 1).map((w) => ({ ...w, completedAt: null }));
        if (wave1) {
            updates.questionnaire = wave1.questionnaire;
            if (wave1.samplePlan !== null || hadFormalWave) updates.samplePlan = wave1.samplePlan;
            if (wave1.samplingResults !== null || hadFormalWave) updates.samplingResults = wave1.samplingResults;
        }
        updates.adjustmentPlan = null;
        updates.reportContent = null;
        updates.stage2CompletedAt = null;
        updates.stage3CompletedAt = null;
        updates.stage4CompletedAt = null;
        updates.stage5CompletedAt = null;
    } else if (stage === 3) {
        const wave1 = waves.find((w) => w.waveNumber === 1);
        const hadFormalWave = waves.some((w) => w.waveNumber > 1);
        updates.activeWaveNumber = 1;
        updates.wavesData = waves.filter((w) => w.waveNumber === 1);
        if (wave1) {
            updates.questionnaire = wave1.questionnaire;
            if (wave1.samplePlan !== null || hadFormalWave) updates.samplePlan = wave1.samplePlan;
            if (wave1.samplingResults !== null || hadFormalWave) updates.samplingResults = wave1.samplingResults;
        }
        updates.reportContent = null;
        updates.stage3CompletedAt = null;
        updates.stage4CompletedAt = null;
        updates.stage5CompletedAt = null;
    } else if (stage === 4) {
        const activeNum = Math.max(2, record.activeWaveNumber || 2);
        const activeWave = waves.find((w) => w.waveNumber === activeNum);
        updates.activeWaveNumber = activeNum;
        updates.wavesData = waves
            .filter((w) => w.waveNumber <= activeNum)
            .map((w) => (w.waveNumber === activeNum ? { ...w, completedAt: null } : w));
        if (activeWave) {
            updates.questionnaire = activeWave.questionnaire;
            updates.samplePlan = activeWave.samplePlan;
            updates.samplingResults = activeWave.samplingResults;
        }
        updates.reportContent = null;
        updates.stage4CompletedAt = null;
        updates.stage5CompletedAt = null;
    } else {
        updates.stage5CompletedAt = null;
    }

    return { ok: true as const, updates };
}
