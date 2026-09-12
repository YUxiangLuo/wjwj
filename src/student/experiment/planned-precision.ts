import { isConfidenceLevel, zForConfidenceLevel } from "@/domain/statistics/confidence-level";
import { finitePopulationVarianceFactor } from "./sample-plan";
import { formatStatistic } from "@/utils/statistic-format";

interface PrecisionInputs {
    populationSize: number;
    estimationType: "mean" | "proportion";
    confidenceLevel: string;
    marginOfError: number;
    populationVariance?: number;
    designEffect: number;
    nonResponseRate: number;
}

/** Evaluate the chosen invitation count, rather than recalculating the recommendation.
 * Proportion inputs are percentage points; returned errors are proportions.
 * This is a planning approximation under the stated response/design assumptions.
 */
export function calculatePlannedPrecision(params: PrecisionInputs, invitations: number) {
    const N = params.populationSize;
    const variance = params.estimationType === "mean" ? params.populationVariance : 0.25;
    const targetMargin = params.estimationType === "mean" ? params.marginOfError : params.marginOfError / 100;
    if (!Number.isSafeInteger(N) || N < 1 || !Number.isInteger(invitations) || invitations < 1 || invitations > N
        || !isConfidenceLevel(params.confidenceLevel)
        || variance == null || !Number.isFinite(variance) || variance <= 0
        || !Number.isFinite(targetMargin) || targetMargin <= 0
        || (params.estimationType === "proportion" && (params.marginOfError < 1 || params.marginOfError > 10))
        || !Number.isFinite(params.designEffect) || params.designEffect < 0.5 || params.designEffect > 5
        || !Number.isFinite(params.nonResponseRate) || params.nonResponseRate < 0 || params.nonResponseRate > 0.5) return null;
    const expectedCompleted = invitations * (1 - params.nonResponseRate);
    const standardError = Math.sqrt(variance) * Math.sqrt(
        params.designEffect * finitePopulationVarianceFactor(N, expectedCompleted) / expectedCompleted,
    );
    const marginOfError = zForConfidenceLevel(params.confidenceLevel) * standardError;
    if (!Number.isFinite(marginOfError)) return null;
    return {
        invitations, expectedCompleted, standardError, marginOfError, targetMargin,
        meetsTarget: marginOfError <= targetMargin + Math.max(Number.MIN_VALUE, targetMargin * 1e-10),
    };
}

/** Always distinguish percentage points from an absolute error in the variable's units. */
export function formatPlanningError(error: number, estimationType: "mean" | "proportion") {
    const value = estimationType === "proportion" ? error * 100 : error;
    const formatted = value === 0 ? "0" : Math.abs(value) >= 0.01 && Math.abs(value) < 1e6
        ? Number(value.toFixed(2)).toString() : formatStatistic(value);
    return `±${formatted}${estimationType === "proportion" ? " 个百分点" : ""}`;
}
