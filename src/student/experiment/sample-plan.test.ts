import { expect, test } from "bun:test";
import { attachCalculatedSampleSize, calculateFinitePopulationSampleSize } from "./sample-plan";

test("sample size calculation keeps the original default formula when no adjustments are provided", () => {
    expect(calculateFinitePopulationSampleSize({
        confidenceLevel: "95",
        marginOfError: 5,
        populationSize: 200,
    })).toBe(132);
});

test("sample size calculation applies expected proportion, design effect, and nonresponse adjustments", () => {
    expect(calculateFinitePopulationSampleSize({
        confidenceLevel: "95",
        marginOfError: 5,
        expectedProportion: 40,
        designEffect: 1.5,
        nonResponseRate: 10,
        populationSize: 10000,
    })).toBe(593);
});

test("attachCalculatedSampleSize stores the adjusted sample size on the sample plan payload", () => {
    expect(attachCalculatedSampleSize({
        confidenceLevel: "95",
        marginOfError: 5,
        expectedProportion: 40,
        designEffect: 1.5,
        nonResponseRate: 10,
        finalSampleSize: 650,
    }, 10000)).toMatchObject({
        calculatedSampleSize: 593,
    });
});
