import { expect, test } from "bun:test";
import { DEFAULT_SCORING_WEIGHTS, isValidScore, scoringWeightsFrom, weightedScore } from "./scoring-weights";

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

test("scores allow hundredths without float multiplication false negatives", () => {
    for (let cents = 0; cents <= 10000; cents++) expect(isValidScore(cents / 100)).toBe(true);
    for (const value of [1.005, 1.001, 99.999, -1, 101, NaN, Infinity, "1.00", null]) expect(isValidScore(value)).toBe(false);
});

test("weighted totals use half-up hundredths, including decimal percentage weights", () => {
    const weights = scoringWeightsFrom({ questionnaire: 50, process: 20, report: 30 });
    expect(weightedScore({ questionnaire: 1.01, process: 1, report: 1 }, weights)).toBe(1.01);
    expect(weightedScore({ questionnaire: 1, process: 1.02, report: 1 }, weights)).toBe(1);
    expect(weightedScore({ questionnaire: 1, process: 1.03, report: 1 }, weights)).toBe(1.01);
    expect(weightedScore({ questionnaire: 1.02, process: 1, report: 1 }, scoringWeightsFrom({ questionnaire: 25, process: 35.5, report: 39.5 }))).toBe(1.01);
    expect(weightedScore({ questionnaire: 100, process: 100, report: 100 }, weights)).toBe(100);
    expect(() => weightedScore({ questionnaire: 1.005, process: 1, report: 1 }, weights)).toThrow(RangeError);
});
