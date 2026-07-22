import { expect, test } from "bun:test";
import { DEFAULT_SCORING_WEIGHTS, scoringWeightsFrom } from "./scoring-weights";

test("scoringWeightsFrom accepts stored objects and JSON strings", () => {
    const weights = { questionnaire: 40, process: 35, report: 25 };
    expect(scoringWeightsFrom(weights)).toEqual(weights);
    expect(scoringWeightsFrom(JSON.stringify(weights))).toEqual(weights);
});

test("scoringWeightsFrom falls back for missing or invalid totals", () => {
    expect(scoringWeightsFrom(null)).toEqual(DEFAULT_SCORING_WEIGHTS);
    expect(scoringWeightsFrom({ questionnaire: 50, process: 50, report: 50 })).toEqual(DEFAULT_SCORING_WEIGHTS);
    expect(scoringWeightsFrom({ questionnaire: -10, process: 60, report: 50 })).toEqual(DEFAULT_SCORING_WEIGHTS);
});
