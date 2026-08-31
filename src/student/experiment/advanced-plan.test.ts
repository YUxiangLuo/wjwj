import { expect, test } from "bun:test";
import {
    isAdvancedPlanSnapshot,
    leaveAdvancedFinalSizeSource,
    normalizeFinalSizeSource,
    parseAdvancedPlans,
    type AdvancedPlanSnapshot,
} from "./advanced-plan";

const appliedAt = "2026-08-31T04:00:00.000Z";

const validPlans: AdvancedPlanSnapshot[] = [
    {
        version: 1,
        kind: "domain",
        appliedAt,
        inputs: {
            estimationType: "mean",
            populationVariance: 100,
            domains: [{ name: "东部", populationSize: 500, confidenceLevel: "95", marginOfError: 2, requiredSampleSize: 49 }],
        },
        result: { requiredSampleSize: 49 },
    },
    {
        version: 1,
        kind: "cost",
        appliedAt,
        inputs: { confidenceLevel: "95", targetMarginOfError: 5, designEffect: 1, nonResponseRate: 0.1, fixedCost: 1000, variableCostPerUnit: 10, totalBudget: 5000 },
        result: { requiredSampleSize: 278, totalCost: 3780, feasible: true },
    },
    {
        version: 1,
        kind: "deff",
        appliedAt,
        inputs: { designEffect: 1.5 },
        result: { appliedDesignEffect: 1.5 },
    },
    {
        version: 1,
        kind: "multivar",
        appliedAt,
        inputs: {
            variables: [{
                name: "成绩",
                type: "mean",
                estimatedValue: 80,
                estimatedStdDev: 10,
                importance: "primary",
                confidenceLevel: "95",
                marginOfError: 5,
                requiredSampleSize: 24,
            }],
        },
        result: { requiredSampleSize: 24 },
    },
    {
        version: 1,
        kind: "cv",
        appliedAt,
        inputs: { confidenceLevel: "95", targetCV: 0.05, estimatedCV: 0.4, designEffect: 1.2, nonResponseRate: 0.1 },
        result: { requiredSampleSize: 246, expectedRespondentSampleSize: 221.4, achievedCV: 0.049 },
    },
    {
        version: 1,
        kind: "cluster",
        appliedAt,
        inputs: { confidenceLevel: "95", marginOfError: 5, clusterSize: 20, designEffect: 1.8, nonResponseRate: 0.1 },
        result: { requiredClusters: 20, requiredSampleSize: 400, intraClassCorrelation: 0.042 },
    },
];

test("advanced-plan parser validates every discriminated variant", () => {
    expect(validPlans.every(isAdvancedPlanSnapshot)).toBe(true);
    expect(parseAdvancedPlans(validPlans)).toHaveLength(6);

    const malformed = validPlans.map((plan) => ({
        ...plan,
        inputs: {},
        result: {},
    }));
    expect(malformed.every((plan) => !isAdvancedPlanSnapshot(plan))).toBe(true);
    expect(parseAdvancedPlans(malformed)).toEqual([]);
});

test("advanced-plan parser rejects values that could crash snapshot rendering", () => {
    expect(isAdvancedPlanSnapshot({
        version: 1,
        kind: "cost",
        appliedAt,
        inputs: { ...validPlans[1]!.inputs, totalBudget: undefined },
        result: validPlans[1]!.result,
    })).toBe(false);
    expect(isAdvancedPlanSnapshot({
        version: 1,
        kind: "multivar",
        appliedAt,
        inputs: { variables: [{ name: "x" }] },
        result: { requiredSampleSize: 10 },
    })).toBe(false);
});

test("leaving an advanced result never keeps advanced provenance without a source", () => {
    expect(leaveAdvancedFinalSizeSource("advanced")).toBe("manual");
    expect(leaveAdvancedFinalSizeSource("basic")).toBe("basic");
    expect(normalizeFinalSizeSource({ value: "advanced", hasAdvancedSource: false, hasExplicitFinalSize: true })).toBe("manual");
    expect(normalizeFinalSizeSource({ value: "advanced", hasAdvancedSource: false, hasExplicitFinalSize: false })).toBe("basic");
    expect(normalizeFinalSizeSource({ value: "advanced", hasAdvancedSource: true, hasExplicitFinalSize: true })).toBe("advanced");
});
