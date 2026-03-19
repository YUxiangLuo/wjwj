import { experiment } from "../../db/schema";
import { attachCalculatedSampleSize } from "./sample-plan";
import { parseStoredJson } from "./serialization";
import { ExperimentStatus } from "./status";
import {
    getTargetSampleSizeFromSamplePlan,
    validateQuestionnaireForSubmit,
    validateSamplePlanForSubmit,
    validateSamplingResultsForSubmit,
} from "./submit-validation";

type ExperimentRecord = typeof experiment.$inferSelect;

interface FailureResult {
    ok: false;
    code: string;
    message: string;
    status: number;
}

function fail(message: string, code: string, status = 400): FailureResult {
    return { ok: false, message, code, status };
}

function isValidStage(stage: number) {
    return Number.isInteger(stage) && stage >= 0 && stage <= 4;
}

function validateStageAdvance(params: {
    nextStage: number;
    currentStage: number;
    questionnaire: unknown;
    samplePlan: unknown;
    samplingResults: unknown;
    populationSize: number | null | undefined;
}) {
    if (params.nextStage <= params.currentStage) {
        return null;
    }

    if (params.nextStage >= 2) {
        const questionnaireError = validateQuestionnaireForSubmit(params.questionnaire);
        if (questionnaireError) {
            return fail(questionnaireError, "VALIDATION_ERROR");
        }
    }

    if (params.nextStage >= 3) {
        const samplePlanError = validateSamplePlanForSubmit(params.samplePlan, params.populationSize ?? null);
        if (samplePlanError) {
            return fail(samplePlanError, "VALIDATION_ERROR");
        }
    }

    if (params.nextStage >= 4) {
        const targetSampleSize = getTargetSampleSizeFromSamplePlan(params.samplePlan);
        const samplingResultsError = validateSamplingResultsForSubmit(params.samplingResults, targetSampleSize);
        if (samplingResultsError) {
            return fail(samplingResultsError, "VALIDATION_ERROR");
        }
    }

    return null;
}

export function buildExperimentSaveUpdates(params: {
    experimentRecord: ExperimentRecord;
    body: {
        currentStage?: number;
        questionnaire?: unknown;
        samplePlan?: unknown;
        samplingResults?: unknown;
        reportContent?: string;
    };
    populationSize: number | null | undefined;
    deadlinePassed: boolean;
}) {
    const exp = params.experimentRecord;
    if (exp.status !== ExperimentStatus.IN_PROGRESS && exp.status !== ExperimentStatus.REJECTED) {
        return fail("实验已提交，无法修改", "ALREADY_SUBMITTED");
    }

    if (exp.status === ExperimentStatus.REJECTED && params.deadlinePassed) {
        return fail("任务已截止，无法重新提交", "TASK_DEADLINE");
    }

    const lastSavedAt = new Date();
    const nextQuestionnaire = params.body.questionnaire !== undefined
        ? params.body.questionnaire
        : parseStoredJson(exp.questionnaire);
    const nextSamplePlan = params.body.samplePlan !== undefined
        ? attachCalculatedSampleSize(params.body.samplePlan as Record<string, any>, params.populationSize)
        : parseStoredJson(exp.samplePlan);
    const nextSamplingResults = params.body.samplingResults !== undefined
        ? params.body.samplingResults
        : parseStoredJson(exp.samplingResults);
    const updates: Record<string, unknown> = {
        lastSavedAt,
        version: exp.version + 1,
    };

    if (params.body.currentStage !== undefined) {
        const nextStage = Number(params.body.currentStage);
        if (!isValidStage(nextStage)) {
            return fail("当前阶段必须是0-4的整数", "VALIDATION_ERROR");
        }
        if (params.deadlinePassed && nextStage > exp.currentStage) {
            return fail("任务已截止，无法进入下一阶段", "TASK_DEADLINE");
        }

        const stageAdvanceError = validateStageAdvance({
            nextStage,
            currentStage: exp.currentStage,
            questionnaire: nextQuestionnaire,
            samplePlan: nextSamplePlan,
            samplingResults: nextSamplingResults,
            populationSize: params.populationSize,
        });
        if (stageAdvanceError) {
            return stageAdvanceError;
        }

        updates.currentStage = nextStage;
        if (nextStage >= 1 && !exp.stage1CompletedAt) updates.stage1CompletedAt = new Date();
        if (nextStage >= 2 && !exp.stage2CompletedAt) updates.stage2CompletedAt = new Date();
        if (nextStage >= 3 && !exp.stage3CompletedAt) updates.stage3CompletedAt = new Date();
        if (nextStage >= 4 && !exp.stage4CompletedAt) updates.stage4CompletedAt = new Date();
    }

    if (params.body.questionnaire !== undefined) updates.questionnaire = params.body.questionnaire;
    if (params.body.samplePlan !== undefined) updates.samplePlan = nextSamplePlan;
    if (params.body.samplingResults !== undefined) updates.samplingResults = params.body.samplingResults;
    if (params.body.reportContent !== undefined) updates.reportContent = params.body.reportContent;

    // ── Downstream invalidation ──────────────────────────────────────────
    // When upstream data is being saved and downstream data wasn't
    // included in the same request, clear the stale downstream to prevent
    // inconsistencies (e.g. old sampling results paired with a new sample
    // plan).
    let invalidatedResults = false;
    let invalidatedReport = false;

    if (params.body.samplePlan !== undefined) {
        if (params.body.samplingResults === undefined && exp.samplingResults != null) {
            updates.samplingResults = null;
            updates.stage3CompletedAt = null;
            invalidatedResults = true;
        }
        if (params.body.reportContent === undefined && exp.reportContent != null) {
            updates.reportContent = null;
            updates.stage4CompletedAt = null;
            invalidatedReport = true;
        }
    }
    if (params.body.samplingResults !== undefined && !invalidatedReport) {
        if (params.body.reportContent === undefined && exp.reportContent != null) {
            updates.reportContent = null;
            updates.stage4CompletedAt = null;
            invalidatedReport = true;
        }
    }

    // Cap currentStage so it does not exceed the stage whose prerequisite
    // data is still available after invalidation.
    if (invalidatedResults || invalidatedReport) {
        const effectiveStage = updates.currentStage !== undefined
            ? Number(updates.currentStage)
            : exp.currentStage;
        if (invalidatedResults && effectiveStage > 2) {
            updates.currentStage = 2;
        } else if (invalidatedReport && effectiveStage > 3) {
            updates.currentStage = 3;
        }
    }
    // ─────────────────────────────────────────────────────────────────────

    if (exp.status === ExperimentStatus.REJECTED) {
        updates.status = ExperimentStatus.IN_PROGRESS;
    }

    return { ok: true as const, updates, lastSavedAt };
}

export function normalizeExperimentResetRequest(body: { resetToStage?: number; clearQuestionnaire?: boolean }) {
    let resetToStageInput = Number(body.resetToStage);
    if (!Number.isFinite(resetToStageInput)) {
        resetToStageInput = 1;
    }

    return {
        resetToStage: Math.max(0, Math.min(4, resetToStageInput)),
        clearQuestionnaire: Boolean(body.clearQuestionnaire),
    };
}

export function buildExperimentResetUpdates(params: {
    experimentRecord: ExperimentRecord;
    resetToStage: number;
    clearQuestionnaire: boolean;
    deadlinePassed: boolean;
}) {
    const exp = params.experimentRecord;
    if (exp.status === ExperimentStatus.SUBMITTED || exp.status === ExperimentStatus.GRADED) {
        return fail("实验已提交或批改，无法重置", "ALREADY_SUBMITTED");
    }

    if (exp.status === ExperimentStatus.REJECTED && params.deadlinePassed) {
        return fail("任务已截止，无法重新提交", "TASK_DEADLINE");
    }

    const lastSavedAt = new Date();
    const updates: Record<string, unknown> = {
        currentStage: params.resetToStage,
        lastSavedAt,
        version: exp.version + 1,
    };

    if (params.clearQuestionnaire) updates.questionnaire = null;

    if (params.resetToStage <= 0) {
        updates.questionnaire = null;
        updates.stage1CompletedAt = null;
    }

    if (params.resetToStage <= 1) {
        updates.samplePlan = null;
        updates.samplingResults = null;
        updates.reportContent = null;
        updates.stage2CompletedAt = null;
        updates.stage3CompletedAt = null;
        updates.stage4CompletedAt = null;
    }

    if (params.resetToStage <= 2) {
        updates.samplingResults = null;
        updates.reportContent = null;
        updates.stage3CompletedAt = null;
        updates.stage4CompletedAt = null;
    }

    if (params.resetToStage <= 3) {
        updates.reportContent = null;
        updates.stage4CompletedAt = null;
    }

    if (exp.status === ExperimentStatus.REJECTED) {
        updates.status = ExperimentStatus.IN_PROGRESS;
    }

    return { ok: true as const, updates, lastSavedAt };
}
