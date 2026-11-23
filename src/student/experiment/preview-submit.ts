import type { ExperimentData } from "@/domain/experiment/types";
import { validateAdjustmentPlan } from "@/domain/fieldwork";
import {
    getTargetSampleSizeFromSamplePlan,
    validateQuestionnaireForSubmit,
    validateReportForSubmit,
    validateSamplePlanForSubmit,
    validateSamplingResultsForSubmit,
} from "./submit-validation";

export function isSubmissionCompleteResponse(response: { success: boolean; error?: { code?: string } }) {
    return response.success || response.error?.code === "ALREADY_SUBMITTED";
}

export function getPreviewSubmitBlocker(
    experiment: Pick<
        ExperimentData,
        "questionnaire" | "samplePlan" | "samplingResults" | "reportContent" | "populationSize" | "analysisTarget" | "samplingPolicy"
    > & {
        adjustmentPlan?: ExperimentData["adjustmentPlan"];
        waves?: ExperimentData["waves"];
    },
) {
    const questionnaireError = validateQuestionnaireForSubmit(experiment.questionnaire, { allowLegacyDuplicateOptions: true });
    if (questionnaireError) return questionnaireError;

    if (experiment.waves !== undefined && experiment.waves.length < 2) {
        return "请完成首轮试投诊断与二轮调优正式投放后再提交";
    }

    if (experiment.adjustmentPlan !== undefined) {
        const adjustmentError = validateAdjustmentPlan(experiment.adjustmentPlan);
        if (adjustmentError) return adjustmentError;
    }

    const samplePlanError = validateSamplePlanForSubmit(
        experiment.samplePlan,
        experiment.populationSize,
        experiment.analysisTarget?.target.kind,
        { allowLegacyAdvancedSourceWithoutSnapshot: true },
    );
    if (samplePlanError) return samplePlanError;

    const targetSampleSize = getTargetSampleSizeFromSamplePlan(experiment.samplePlan);
    const samplingResultsError = validateSamplingResultsForSubmit(
        experiment.samplingResults,
        targetSampleSize,
        experiment.populationSize,
        experiment.samplingPolicy,
    );
    if (samplingResultsError) return samplingResultsError;

    const reportError = validateReportForSubmit(experiment.reportContent);
    if (reportError) return reportError;

    return null;
}
