import { collectCsvHeaders, recordsToCsv, reserveCsvMetadataHeader } from "../../lib/csv";

const SAMPLING_EXPORT_TYPES = ["simple", "systematic", "pps", "stratified", "all"] as const;

export type SamplingExportType = typeof SAMPLING_EXPORT_TYPES[number];

interface SamplingResultSection {
    data?: Record<string, unknown>[];
    inclusionProbabilities?: number[];
}

type SamplingResultsExportData = Partial<Record<Exclude<SamplingExportType, "all">, SamplingResultSection>>;

export function parseSamplingExportType(value: string | null): SamplingExportType | null {
    const candidate = value ?? "all";
    return (SAMPLING_EXPORT_TYPES as readonly string[]).includes(candidate)
        ? candidate as SamplingExportType
        : null;
}

export function buildSamplingResultsCsvExport(value: unknown, type: SamplingExportType) {
    const results = (value ?? {}) as SamplingResultsExportData;
    const ppsRows = results.pps?.data ?? [];
    const ppsProbabilities = results.pps?.inclusionProbabilities;
    const ppsHeaders = collectCsvHeaders(ppsRows);
    const inclusionProbabilityHeader = reserveCsvMetadataHeader("__wj_inclusion_probability", ppsHeaders);
    const designWeightHeader = reserveCsvMetadataHeader("__wj_design_weight", ppsHeaders);
    const decoratedPpsRows = Array.isArray(ppsProbabilities) && ppsProbabilities.length === ppsRows.length
        ? ppsRows.map((row, index) => {
            const inclusionProbability = Number(ppsProbabilities[index]);
            return Number.isFinite(inclusionProbability) && inclusionProbability > 0
                ? {
                    ...row,
                    [inclusionProbabilityHeader]: inclusionProbability,
                    [designWeightHeader]: 1 / inclusionProbability,
                }
                : row;
        })
        : ppsRows;
    const byMethod = {
        simple: results.simple?.data ?? [],
        systematic: results.systematic?.data ?? [],
        pps: decoratedPpsRows,
        stratified: results.stratified?.data ?? [],
    } satisfies Record<Exclude<SamplingExportType, "all">, Record<string, unknown>[]>;

    let filename: string;
    let data: Record<string, unknown>[];
    if (type === "all") {
        filename = "all_sampling.csv";
        const methodHeader = reserveCsvMetadataHeader(
            "__wj_method",
            collectCsvHeaders(Object.values(byMethod).flat()),
        );
        data = Object.entries(byMethod).flatMap(([method, rows]) =>
            rows.map((row) => ({ ...row, [methodHeader]: method })));
    } else {
        filename = `${type}_sampling.csv`;
        data = byMethod[type];
    }
    if (data.length === 0) return null;

    return {
        csv: recordsToCsv(data),
        filename,
        rowCount: data.length,
    };
}
