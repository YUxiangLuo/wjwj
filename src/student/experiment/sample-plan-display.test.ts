import { expect, test } from "bun:test";
import { normalizeSamplePlanData } from "./sample-plan-display";

test("normalizeSamplePlanData backfills legacy proportion sample plans", () => {
    const normalized = normalizeSamplePlanData({
        confidenceLevel: "95",
        marginOfError: 5,
        recommendedSize: 370,
        finalSampleSize: 400,
    }, 10_000);

    expect(normalized).toMatchObject({
        estimationType: "proportion",
        confidenceLevel: "95",
        marginOfError: 5,
        designEffect: 1,
        nonResponseRate: 0,
        recommendedSize: 370,
        finalSampleSize: 400,
    });
});

test("normalizeSamplePlanData keeps calculatedSampleSize while backfilling defaults", () => {
    const normalized = normalizeSamplePlanData({
        confidenceLevel: "95",
        marginOfError: 5,
        finalSampleSize: 50,
        calculatedSampleSize: 132,
    }, 200) as Record<string, unknown> | null;

    expect(normalized).toMatchObject({
        estimationType: "proportion",
        designEffect: 1,
        nonResponseRate: 0,
        recommendedSize: 132,
        finalSampleSize: 50,
        calculatedSampleSize: 132,
    });
});

test("normalizeSamplePlanData preserves valid advanced plan source and drops invalid values", () => {
    const normalized = normalizeSamplePlanData({
        confidenceLevel: "95",
        marginOfError: 5,
        recommendedSize: 370,
        finalSampleSize: 400,
        advancedPlanSource: "cv",
    }, 10_000);

    expect(normalized).toMatchObject({
        advancedPlanSource: "cv",
    });

    const invalid = normalizeSamplePlanData({
        confidenceLevel: "95",
        marginOfError: 5,
        recommendedSize: 370,
        finalSampleSize: 400,
        advancedPlanSource: "metrics",
    }, 10_000) as Record<string, unknown> | null;

    expect(invalid?.advancedPlanSource).toBeUndefined();
});
