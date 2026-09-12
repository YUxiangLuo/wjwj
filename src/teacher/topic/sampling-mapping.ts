import { parseTopicFieldMapping } from "../../domain/statistics/population";
import { resolveAnalysisTarget } from "../../lib/analysis-target";

function samplingMappingKey(value: unknown): string | null {
    const mapping = parseTopicFieldMapping(value);
    if (!mapping || Array.isArray(mapping)) return null;
    const roles = [mapping.stratified, mapping.numeric, mapping.others].map(fields => {
        if (fields === undefined) return [];
        if (!Array.isArray(fields) || fields.some(field => typeof field !== "string")) return null;
        return [...fields].sort();
    });
    if (roles.some(fields => fields === null)) return null;
    // Resolve before sorting: legacy inference depends on the first numeric
    // field. Exact column keys and explicit-vs-inferred targets matter for PPS.
    return JSON.stringify([mapping.identifier ?? null, ...roles, resolveAnalysisTarget(mapping)]);
}

/** Cosmetic edits and equivalent contract representations do not change designs. */
export function hasSameSamplingMapping(previous: unknown, next: unknown): boolean {
    const previousKey = samplingMappingKey(previous);
    return previousKey !== null && previousKey === samplingMappingKey(next);
}
