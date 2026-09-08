import { expect, test } from "bun:test";
import { calculateCostPlan } from "./cost-plan";
import { validateAdvancedPlanConsistency } from "./advanced-plan";

const inputs = { confidenceLevel: "95", targetMarginOfError: 5, designEffect: 1, nonResponseRate: .5, fixedCost: 5000, variableCostPerUnit: 15, totalBudget: 50000 };
test("a population-capped plan separates affordability from unmet precision and persists that distinction", () => {
    const result = calculateCostPlan(inputs, 100)!;
    expect(result).toMatchObject({ requiredSampleSize: 100, expectedCompleted: 50, totalCost: 6500, budgetFeasible: true, precisionReached: false, isFeasible: false });
    expect(result.marginOfError).toBeCloseTo(.0984937058954, 12);
    const snapshot = { version: 1 as const, kind: "cost" as const, appliedAt: "2026-09-08T00:00:00Z", inputs, result: { requiredSampleSize: 100, totalCost: 6500, feasible: false } };
    expect(validateAdvancedPlanConsistency(snapshot, 100, 100)).toBeNull();
    expect(validateAdvancedPlanConsistency({ ...snapshot, result: { ...snapshot.result, feasible: true } }, 100, 100)).not.toBeNull();
});
test("zero-cost plans are valid and fractional percentage inputs are converted exactly once", () => {
    expect(calculateCostPlan({ ...inputs, nonResponseRate: 0, fixedCost: 0, variableCostPerUnit: 0, totalBudget: 0 }, 100)!.isFeasible).toBe(true);
    const halfPercent = calculateCostPlan({ ...inputs, nonResponseRate: 0, targetMarginOfError: .5 }, 10000)!;
    expect(halfPercent.targetMarginOfError).toBe(.005);
    expect(halfPercent.requiredSampleSize).toBeGreaterThan(7000);
});
