import { experiment } from "../../db/schema";
import { attachCalculatedSampleSize } from "./sample-plan";
import { parseStoredJson } from "./serialization";
import { ExperimentStatus } from "./status";
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
        const questionnaire = payload.questionnaire;
        const validationError = validateQuestionnaireForSubmit(questionnaire);
        if (validationError) return fail(validationError);
        updates.questionnaire = questionnaire;
        updates.stage1CompletedAt = now;
        updates.currentStage = 2;
    }

    if (stage === 2) {
        const rawSamplePlan = payload.samplePlan;
        if (!rawSamplePlan || typeof rawSamplePlan !== "object" || Array.isArray(rawSamplePlan)) {
            return fail("请填写完整的抽样方案");
        }
        const samplePlan = attachCalculatedSampleSize(rawSamplePlan as Record<string, unknown>, params.populationSize);
        const validationError = validateSamplePlanForSubmit(samplePlan, params.populationSize);
        if (validationError) return fail(validationError);
        updates.samplePlan = samplePlan;
        updates.stage2CompletedAt = now;
        updates.currentStage = 3;
    }

    if (stage === 3) {
        const samplePlan = parseStoredJson(record.samplePlan);
        const validationError = validateSamplingResultsForSubmit(
            payload.samplingResults,
            getTargetSampleSizeFromSamplePlan(samplePlan),
        );
        if (validationError) return fail(validationError);
        updates.samplingResults = payload.samplingResults;
        updates.stage3CompletedAt = now;
        updates.currentStage = 4;
    }

    if (stage === 4) {
        const reportContent = typeof payload.reportContent === "string" ? payload.reportContent : "";
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
