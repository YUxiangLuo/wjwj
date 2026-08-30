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
        inclusionProbabilities: _inclusionProbabilities,
        data,
        ...metadata
    } = value;
    return {
        ...metadata,
        ...(Array.isArray(data) ? { data: data.slice(0, Math.max(0, limit)) } : {}),
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
