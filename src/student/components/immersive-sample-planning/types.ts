/** Phase state machine for the guided sample planning flow. */

export type FormulaStep = "z" | "e" | "summary";
export type FourStepScenario = "deff" | "nrr" | "summary";
export type FactorsStep = "error_tolerance" | "subpopulation" | "variability" | "cost_balance" | "summary";
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
}

export function initialPhase(): Phase {
    return { type: "challenge", guess: null, revealed: false };
}

export {
    getFinalSampleSizeBounds,
} from "../../experiment/final-sample-bounds";
