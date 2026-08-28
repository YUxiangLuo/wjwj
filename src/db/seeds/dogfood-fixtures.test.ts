import { expect, test } from "bun:test";
import { allocateIntegerShares, computePpsMeanPlan } from "./dogfood-fixtures";

test("allocateIntegerShares preserves the total with largest remainder", () => {
    expect(allocateIntegerShares(49, [0.4, 0.3, 0.2, 0.1]).reduce((sum, n) => sum + n, 0)).toBe(49);
    expect(allocateIntegerShares(15, [1 / 3, 1 / 3, 1 / 3])).toEqual([5, 5, 5]);
});

test("computePpsMeanPlan matches the mean formula for the PPS population", () => {
    const plan = computePpsMeanPlan();
    expect(plan.recommendedSize).toBe(49);
    expect(plan.populationVariance).toBeCloseTo(67.128040201005, 6);
});
