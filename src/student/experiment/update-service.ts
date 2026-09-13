import { experiment } from "../../db/schema";
import { parseQuestionVariableBinding, validateQuestionnaireBindings } from "@/domain/experiment/question-variable-binding";
import type { VariableDictionaryV1 } from "@/domain/experiment/variable-dictionary";
import type { QuestionnaireData } from "@/lib/questionnaire-types";
import { attachCalculatedSampleSize } from "./sample-plan";
import { readStoredDocument } from "@/lib/stored-document";
import { ExperimentStatus } from "@/domain/experiment/status";
import { getRequiredStratifiedMinimum } from "./final-sample-bounds";
import { resolveAnalysisTarget } from "../../lib/analysis-target";
import { canonicalizeRichTextHtmlForStorage } from "../../server/rich-text";
import {
    getTargetSampleSizeFromSamplePlan,
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
    return null;
}

export function buildStageCompletionUpdates(params: {
    experimentRecord: ExperimentRecord;
    stage: number;
    payload: Record<string, unknown>;
    populationSize: number | null;
    deadlinePassed: boolean;
    fieldMapping?: unknown;
    samplingPolicy?: unknown;
    variableDictionary?: VariableDictionaryV1 | null;
    stratifiedStats?: Record<string, Record<string, number>>;
}) {
    const { experimentRecord: record, stage, payload } = params;
    if (!Number.isInteger(stage) || stage < 1 || stage > 4) return fail("阶段必须是1-4的整数");
    if (!isEditable(record)) return fail("实验已提交或批改，不能继续修改", "EXPERIMENT_LOCKED", 409);
    if (params.deadlinePassed) return fail("任务已截止，无法完成阶段", "TASK_DEADLINE");
    if (record.currentStage !== stage) return fail("请按顺序完成当前阶段", "INVALID_STAGE_ORDER", 409);
    if (stage > 1 && !completedAtForStage(record, stage - 1)) {
        return fail("请先完成上一阶段", "INVALID_STAGE_ORDER", 409);
    }

    const now = new Date();
    const updates: Partial<typeof experiment.$inferInsert> = {
        version: record.version + 1,
        updatedAt: now,
    };

    if (stage === 1) {
        const rawQuestionnaire = payload.questionnaire;
        const questionnaire = rawQuestionnaire && typeof rawQuestionnaire === "object" && !Array.isArray(rawQuestionnaire)
            ? {
                ...rawQuestionnaire,
                welcomeText: canonicalizeRichTextHtmlForStorage((rawQuestionnaire as Record<string, unknown>).welcomeText),
                endingText: canonicalizeRichTextHtmlForStorage((rawQuestionnaire as Record<string, unknown>).endingText),
            }
            : rawQuestionnaire;
        const validationError = validateQuestionnaireForSubmit(questionnaire);
        if (validationError) return fail(validationError);
        const bindingError = validateQuestionnaireBindings(questionnaire, params.variableDictionary ?? null, record.taskId);
        if (bindingError) return fail(bindingError, "INVALID_VARIABLE_BINDING");
        const data = questionnaire as QuestionnaireData;
        updates.questionnaire = { ...data, questions: data.questions.map(question => {
            if (question.variableBinding === undefined) return question;
            const parsed = parseQuestionVariableBinding(question.variableBinding, question, params.variableDictionary ?? null, record.taskId);
            return parsed.ok ? { ...question, variableBinding: parsed.value } : question;
        }) };
        updates.stage1CompletedAt = now;
        updates.currentStage = 2;
    }

    if (stage === 2) {
        const rawSamplePlan = payload.samplePlan;
        if (!rawSamplePlan || typeof rawSamplePlan !== "object" || Array.isArray(rawSamplePlan)) {
            return fail("请填写完整的抽样方案");
        }
        const samplePlan = attachCalculatedSampleSize(rawSamplePlan as Record<string, unknown>, params.populationSize);
        const analysisTargetKind = resolveAnalysisTarget(params.fieldMapping)?.target.kind;
        const minimumSampleSize = getRequiredStratifiedMinimum(params.stratifiedStats, params.samplingPolicy, params.populationSize ?? 0);
        if (minimumSampleSize === null) return fail("必做分层抽样缺少覆盖完整总体的分层数据，请联系教师检查课题");
        if (minimumSampleSize > 1 && Number(samplePlan.finalSampleSize) < minimumSampleSize) {
            return fail(`必做分层抽样至少需要 ${minimumSampleSize} 个样本，以覆盖每个非空层`);
        }
        const validationError = validateSamplePlanForSubmit(samplePlan, params.populationSize, analysisTargetKind, { minimumSampleSize });
        if (validationError) return fail(validationError);
        updates.samplePlan = samplePlan;
        updates.stage2CompletedAt = now;
        updates.currentStage = 3;
    }

    if (stage === 3) {
        const samplePlan = readStoredDocument(record.samplePlan);
        const validationError = validateSamplingResultsForSubmit(
            readStoredDocument(record.samplingResults),
            getTargetSampleSizeFromSamplePlan(samplePlan),
            params.populationSize,
            params.samplingPolicy,
        );
        if (validationError) return fail(validationError);
        updates.stage3CompletedAt = now;
        updates.currentStage = 4;
    }

    if (stage === 4) {
        // 报告只接受富文本 HTML 字符串：结构化对象会被规范化成空内容，报"字数不足"会误导
        if (payload.reportContent !== undefined && payload.reportContent !== null && typeof payload.reportContent !== "string") {
            return fail("报告内容格式无效，请重新编辑后再提交", "VALIDATION_ERROR", 400);
        }
        const reportContent = canonicalizeRichTextHtmlForStorage(payload.reportContent);
        const validationError = validateReportForSubmit(reportContent);
        if (validationError) return fail(validationError);
        updates.reportContent = reportContent;
        updates.stage4CompletedAt = now;
        updates.currentStage = 4;
    }

    return { ok: true as const, updates };
}

export function buildStageReopenUpdates(params: {
    experimentRecord: ExperimentRecord;
    stage: number;
    deadlinePassed: boolean;
}) {
    const { experimentRecord: record, stage } = params;
    if (!Number.isInteger(stage) || stage < 1 || stage > 4) return fail("阶段必须是1-4的整数");
    if (!isEditable(record)) return fail("实验已提交或批改，不能重新编辑", "EXPERIMENT_LOCKED", 409);
    if (params.deadlinePassed) return fail("任务已截止，无法重新编辑", "TASK_DEADLINE");
    if (!completedAtForStage(record, stage)) return fail("该阶段尚未完成", "STAGE_NOT_COMPLETED", 409);

    const updates: Partial<typeof experiment.$inferInsert> = {
        version: record.version + 1,
        currentStage: stage,
        updatedAt: new Date(),
    };

    if (stage <= 1) {
        updates.stage1CompletedAt = null;
        updates.samplePlan = null;
        updates.samplingResults = null;
        updates.reportContent = null;
        updates.stage2CompletedAt = null;
        updates.stage3CompletedAt = null;
        updates.stage4CompletedAt = null;
    } else if (stage === 2) {
        updates.stage2CompletedAt = null;
        updates.samplingResults = null;
        updates.reportContent = null;
        updates.stage3CompletedAt = null;
        updates.stage4CompletedAt = null;
    } else if (stage === 3) {
        updates.stage3CompletedAt = null;
        updates.reportContent = null;
        updates.stage4CompletedAt = null;
    } else {
        updates.stage4CompletedAt = null;
    }

    return { ok: true as const, updates };
}
