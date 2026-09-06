import { buildAnalysisMetrics as calculateAnalysisMetrics } from "../../domain/statistics/analysis";
import { resolvePpsMonteCarloReplicates } from "../../domain/statistics/pps";
export { DEFAULT_PPS_MONTE_CARLO_REPLICATES, resolvePpsMonteCarloReplicates } from "../../domain/statistics/pps";
export { computeFinitePopulationEquivalentSampleSize } from "../../domain/statistics/srs";
export type { NumericMethodAnalysis, NumericFieldAnalysis, CategoricalFieldAnalysis, TargetMethodAnalysis, TargetAnalysis, AnalysisMetricsResult } from "../../domain/experiment/analysis-types";

/** Compatibility entry point: resolve server configuration before calling pure calculations. */
export function buildAnalysisMetrics(params: Omit<Parameters<typeof calculateAnalysisMetrics>[0], "ppsMonteCarloReplicates">) {
    return calculateAnalysisMetrics({
        ...params,
        ppsMonteCarloReplicates: resolvePpsMonteCarloReplicates(process.env.PPS_MONTE_CARLO_REPLICATES),
    });
}
