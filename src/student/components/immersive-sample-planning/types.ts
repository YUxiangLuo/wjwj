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

import type { ConfidenceLevel } from "../../experiment/confidence-level";
import { Z_VALUES, zForConfidenceLevel } from "../../experiment/confidence-level";

export type { ConfidenceLevel };
export { Z_VALUES, zForConfidenceLevel };

/** Parameters shared across all phases. */
export interface SampleParams {
    populationSize: number;
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
