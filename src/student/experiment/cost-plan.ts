import { isConfidenceLevel } from "@/domain/statistics/confidence-level";
import { calculateSampleSizeMetrics } from "./sample-plan";
import type { AdvancedPlanSnapshot } from "../../domain/experiment/planning-types";

export function calculateCostPlan(inputs: Extract<AdvancedPlanSnapshot, { kind: "cost" }>["inputs"], populationSize: number) {
    if (!Number.isInteger(populationSize) || populationSize < 1
        || !isConfidenceLevel(inputs.confidenceLevel)
        || !Number.isFinite(inputs.targetMarginOfError) || inputs.targetMarginOfError <= 0 || inputs.targetMarginOfError >= 100
        || !Number.isFinite(inputs.designEffect) || inputs.designEffect <= 0
        || !Number.isFinite(inputs.nonResponseRate) || inputs.nonResponseRate < 0 || inputs.nonResponseRate >= 1
        || [inputs.fixedCost, inputs.variableCostPerUnit, inputs.totalBudget].some(value => !Number.isFinite(value) || value < 0)) return null;
    const metrics = calculateSampleSizeMetrics({ ...inputs, marginOfError: inputs.targetMarginOfError / 100, populationSize });
    if (!metrics || !Number.isFinite(metrics.marginOfError)) return null;
    const totalCost = inputs.fixedCost + metrics.n * inputs.variableCostPerUnit;
    if (!Number.isFinite(totalCost)) return null;
    const budgetFeasible = totalCost <= inputs.totalBudget;
    const precisionReached = metrics.marginOfError <= inputs.targetMarginOfError / 100 + 1e-12;
    return { ...metrics, requiredSampleSize: metrics.n, totalCost, budgetFeasible, precisionReached,
        isFeasible: budgetFeasible && precisionReached, budgetGap: Math.max(0, totalCost - inputs.totalBudget) };
}
