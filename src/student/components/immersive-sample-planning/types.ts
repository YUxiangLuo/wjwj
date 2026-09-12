/** Phase state machine for the guided sample planning flow. */

export type FormulaStep = "z" | "e" | "summary";
export type FourStepScenario = "deff" | "nrr" | "summary";
export type FactorsStep = "error_tolerance" | "subpopulation" | "variability" | "design_effect" | "non_response" | "cost_balance" | "summary";
export type EstimationType = "proportion" | "mean";

export type Phase =
    | { type: "challenge"; guess: number | null; revealed: boolean }
    | { type: "precision" }
    | { type: "factors"; step: FactorsStep }
    | { type: "formula"; step: FormulaStep }
    | { type: "fpc" }
    | { type: "fourstep"; scenario: FourStepScenario }
    | { type: "decision" }
    | { type: "quiz"; questionIndex: number }
    | { type: "confirm" }
    | { type: "launching" }
    | { type: "done" };

export const PHASE_ORDER = [
    "challenge",
    "precision",
    "factors",
    "formula",
    "fpc",
    "fourstep",
    "decision",
    "quiz",
    "confirm",
    "launching",
    "done",
] as const;

export type PhaseType = (typeof PHASE_ORDER)[number];

/** Visible steps; legacy formula/fpc drafts remain readable within the calculation step. */
export const PLANNING_STEPS = [
    { type: "challenge", label: "明确目标", description: "试估一个样本量" },
    { type: "precision", label: "认识精度", description: "看看样本量与误差" },
    { type: "factors", label: "了解影响因素", description: "逐项理解六类条件" },
    { type: "fourstep", label: "理解推荐", description: "用当前数据算一遍" },
    { type: "decision", label: "调整方案", description: "选择实际采用的数量" },
    { type: "quiz", label: "检查与确认", description: "自检后保存规划" },
] as const;

export function planningStepIndex(type: PhaseType) {
    if (type === "formula" || type === "fpc") return 3;
    if (type === "confirm" || type === "launching" || type === "done") return 5;
    return Math.max(0, PLANNING_STEPS.findIndex(step => step.type === type));
}

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
    challenge: {
        guess: number | null;
        revealed: boolean;
    };
    /** Missing on legacy drafts; resume at the first unfinished learning check. */
    learning?: import("./learning").LearningProgress;
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

export function initialPhase(): Phase {
    return { type: "challenge", guess: null, revealed: false };
}

export {
    getFinalSampleSizeBounds,
} from "../../experiment/final-sample-bounds";
