/** Planning workspace state and resumable parameter draft. */
export type FourStepScenario = "deff" | "nrr" | "summary";
export type FactorsStep = "error_tolerance" | "subpopulation" | "variability" | "design_effect" | "non_response" | "cost_balance" | "summary";
export type EstimationType = "proportion" | "mean";

export type PhaseType = "decision" | "reference" | "confirm" | "done";
export type Phase = { type: PhaseType };

import { Z_VALUES, zForConfidenceLevel, type ConfidenceLevel } from "@/domain/statistics/confidence-level";

export type { ConfidenceLevel };
export { Z_VALUES, zForConfidenceLevel };

/** Parameters shared across all phases. */
export interface SampleParams {
    populationSize: number;
    /** Required design constraint supplied by the current topic's frame. */
    minimumSampleSize?: number;
    estimationType: EstimationType;
    confidenceLevel: ConfidenceLevel;
    marginOfError: number;
    populationVariance?: number;
    designEffect: number;
    nonResponseRate: number;
    finalSampleSize: number;
    recommendedSize: number;
    advancedPlanSource?: "cost" | "multivar" | "cv" | "cluster";
    /** 高级规划快照（每类一份，最新覆盖）；随 SamplePlanData 持久化，提交时服务端复算。 */
    advancedPlans?: import("../../experiment/advanced-plan").AdvancedPlanSnapshot[];
}

export interface PhaseNavigationSnapshot {
    phase: Phase;
}

/** Serializable state required to resume the immersive planning flow exactly where it stopped. */
export interface SamplePlanningWizardDraft {
    navigation: PhaseNavigationSnapshot;
    confidenceLevel: ConfidenceLevel;
    marginOfError: number;
    designEffect: number;
    nonResponseRate: number;
    estimationType: EstimationType;
    populationVariance: number;
    finalSampleSize: number;
    userTouchedFinal: boolean;
    advancedPlanSource: SampleParams["advancedPlanSource"] | null;
    advancedPlans?: import("../../experiment/advanced-plan").AdvancedPlanSnapshot[];
    domains: import("../DomainEstimationManager").Domain[];
    surveyVariables: import("../MultiVariableSamplePlan").SurveyVariable[];
}

export {
    getFinalSampleSizeBounds,
} from "../../experiment/final-sample-bounds";
