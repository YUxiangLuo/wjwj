/** Phase state machine for the guided sample planning flow. */

export type FormulaStep = "z" | "e" | "summary";
export type RealWorldScenario = "deff" | "nrr" | "summary";

export type Phase =
    | { type: "challenge"; guess: number | null; revealed: boolean }
    | { type: "formula"; step: FormulaStep }
    | { type: "fpc" }
    | { type: "realworld"; scenario: RealWorldScenario }
    | { type: "decision" }
    | { type: "quiz"; questionIndex: number }
    | { type: "confirm" }
    | { type: "launching" }
    | { type: "done" };

export const PHASE_ORDER = [
    "challenge",
    "formula",
    "fpc",
    "realworld",
    "decision",
    "quiz",
    "confirm",
    "launching",
    "done",
] as const;

export type PhaseType = (typeof PHASE_ORDER)[number];

/** Parameters shared across all phases. */
export interface SampleParams {
    populationSize: number;
    confidenceLevel: string;
    marginOfError: number;
    designEffect: number;
    nonResponseRate: number;
    finalSampleSize: number;
    recommendedSize: number;
}

export const Z_VALUES: Record<string, number> = {
    "90": 1.645,
    "95": 1.96,
    "99": 2.576,
};

export function initialPhase(): Phase {
    return { type: "challenge", guess: null, revealed: false };
}

export {
    getFinalSampleSizeBounds,
    isSmallPopulationSampleBounds,
} from "../../experiment/final-sample-bounds";
