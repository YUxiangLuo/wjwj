import type { MethodKey } from "../api-client";

interface SamplingResultLike {
    sampleCount?: number;
    data?: unknown[];
    layers?: Array<{ sampleCount: number }>;
}

export function getSamplingResultCount(
    method: MethodKey,
    result: SamplingResultLike | null | undefined,
) {
    if (!result) return 0;

    if (typeof result.sampleCount === "number" && Number.isFinite(result.sampleCount)) {
        return result.sampleCount;
    }

    if (method === "stratified" && "layers" in result && result.layers?.length) {
        return result.layers.reduce((total, layer) => total + layer.sampleCount, 0);
    }

    return Array.isArray(result.data) ? result.data.length : 0;
}
