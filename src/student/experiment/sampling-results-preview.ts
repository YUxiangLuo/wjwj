import { inverseProbabilityWeightForDisplay } from "../../domain/statistics/pps";

export const SAMPLING_PREVIEW_ROWS = 50;

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Keep browser responses bounded while retaining the metadata needed by the UI.
 * Replay indices and PPS probabilities remain server-side and full rows stay
 * available through the dedicated CSV export route.
 */
export function previewSamplingMethodResult(value: unknown, limit = SAMPLING_PREVIEW_ROWS) {
    if (!isRecord(value)) return value;
    const {
        indices: _indices,
        inclusionProbabilities,
        data,
        ...metadata
    } = value;
    const probabilityPreview = Array.isArray(data)
        && Array.isArray(inclusionProbabilities)
        && typeof value.sizeField === "string"
        ? data.slice(0, Math.min(Math.max(0, limit), 10)).flatMap((row, index) => {
            const probability = Number(inclusionProbabilities[index]);
            const sizeValue = Number(isRecord(row) ? row[value.sizeField as string] : Number.NaN);
            if (!Number.isFinite(probability) || probability <= 0 || !Number.isFinite(sizeValue)) return [];
            return [{
                samplePosition: index + 1,
                sizeValue,
                inclusionProbability: probability,
                designWeight: inverseProbabilityWeightForDisplay(probability),
            }];
        })
        : [];
    return {
        ...metadata,
        ...(Array.isArray(data) ? { data: data.slice(0, Math.max(0, limit)) } : {}),
        ...(probabilityPreview.length > 0 ? { probabilityPreview } : {}),
    };
}

export function previewSamplingResults(value: unknown, limit = SAMPLING_PREVIEW_ROWS) {
    if (!isRecord(value)) return value;
    return Object.fromEntries(
        Object.entries(value).map(([method, section]) => [
            method,
            previewSamplingMethodResult(section, limit),
        ]),
    );
}
