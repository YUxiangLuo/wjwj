import type { SamplingResultsData } from "../../api-client";

export interface SamplingExecutionDraft {
    simpleSeed: string;
    systematicSeed: string;
    ppsSeed: string;
    stratifiedSeed: string;
    kValue: number;
    ppsSizeField: string;
    ppsSampleSize: number;
    stratifyBy: string;
    layerSampleCounts: number[];
}

interface StoredSamplingExecutionDraft {
    value?: SamplingExecutionDraft;
    dependencySnapshot?: string;
}

export type SamplingDraftRestoreDecision =
    | { type: "none"; draft: null }
    | { type: "auto_restore"; draft: SamplingExecutionDraft }
    | { type: "prompt_restore"; draft: SamplingExecutionDraft };

function normalizeSeed(value: unknown) {
    if (typeof value === "number" && Number.isSafeInteger(value)) {
        return String(value);
    }

    if (typeof value !== "string") {
        return "";
    }

    const trimmed = value.trim();
    return /^-?\d+$/.test(trimmed) ? trimmed : "";
}

function normalizeInteger(value: unknown, fallback: number, min = 0) {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    if (!Number.isSafeInteger(parsed)) return fallback;
    if (parsed < min) return fallback;
    return parsed;
}

export function serializeSamplingExecutionDraft(value: SamplingExecutionDraft, dependencySnapshot?: string) {
    if (dependencySnapshot === undefined) {
        return JSON.stringify(value);
    }
    return JSON.stringify({
        value,
        dependencySnapshot,
    } satisfies StoredSamplingExecutionDraft);
}

export function resolvePpsSizeField(currentValue: string, numericFields: string[]) {
    if (currentValue.trim()) return currentValue;
    return numericFields[0] ?? "";
}

export function hasCompletedSamplingResults(results: SamplingResultsData | null | undefined) {
    return Boolean(
        results?.simple?.completed
        || results?.systematic?.completed
        || results?.pps?.completed
        || results?.stratified?.completed
    );
}

export function buildSamplingExecutionDraftFromResults(params: {
    results: SamplingResultsData | null | undefined;
    populationSize: number;
    sampleSize: number;
}): SamplingExecutionDraft {
    const { results, populationSize, sampleSize } = params;

    return {
        simpleSeed: results?.simple?.seed !== undefined ? String(results.simple.seed) : "",
        systematicSeed: results?.systematic?.seed !== undefined ? String(results.systematic.seed) : "",
        ppsSeed: results?.pps?.seed !== undefined ? String(results.pps.seed) : "",
        stratifiedSeed: results?.stratified?.seed !== undefined ? String(results.stratified.seed) : "",
        kValue: results?.systematic?.kValue ?? Math.round(populationSize / sampleSize),
        ppsSizeField: results?.pps?.sizeField ?? "",
        ppsSampleSize: results?.pps?.sampleCount ?? sampleSize,
        stratifyBy: results?.stratified?.stratifyBy ?? "",
        layerSampleCounts: results?.stratified?.layers?.map((layer) => layer.sampleCount) ?? [],
    };
}

export function decideSamplingDraftRestore(params: {
    rawDraft: string | null;
    serverValue: SamplingExecutionDraft;
    hasCompletedResults: boolean;
    defaults?: SamplingDraftDefaults;
    dependencySnapshot?: string;
}): SamplingDraftRestoreDecision {
    const { rawDraft, serverValue, hasCompletedResults, defaults, dependencySnapshot } = params;

    if (!rawDraft) {
        return { type: "none", draft: null };
    }

    const draft = parseSamplingExecutionDraft(rawDraft, defaults, dependencySnapshot);
    if (!draft) {
        return { type: "none", draft: null };
    }

    if (serializeSamplingExecutionDraft(draft) === serializeSamplingExecutionDraft(serverValue)) {
        return { type: "none", draft: null };
    }

    if (hasCompletedResults) {
        return { type: "prompt_restore", draft };
    }

    return { type: "auto_restore", draft };
}

export interface SamplingDraftDefaults {
    ppsSampleSize?: number;
    kValue?: number;
}

export function parseSamplingExecutionDraft(
    raw: string,
    defaults?: SamplingDraftDefaults,
    dependencySnapshot?: string,
): SamplingExecutionDraft | null {
    try {
        const parsed = JSON.parse(raw) as Partial<SamplingExecutionDraft> | StoredSamplingExecutionDraft;
        if (!parsed || typeof parsed !== "object") return null;
        const stored = "value" in parsed
            ? parsed as StoredSamplingExecutionDraft
            : null;
        if (!stored && dependencySnapshot !== undefined) {
            return null;
        }
        if (stored && dependencySnapshot !== undefined && stored.dependencySnapshot !== dependencySnapshot) {
            return null;
        }
        const data = (stored?.value ?? parsed) as Partial<SamplingExecutionDraft>;
        if (!data || typeof data !== "object") return null;

        return {
            simpleSeed: normalizeSeed(data.simpleSeed),
            systematicSeed: normalizeSeed(data.systematicSeed),
            ppsSeed: normalizeSeed(data.ppsSeed),
            stratifiedSeed: normalizeSeed(data.stratifiedSeed),
            kValue: normalizeInteger(data.kValue, defaults?.kValue ?? 1, 1),
            ppsSizeField: typeof data.ppsSizeField === "string" ? data.ppsSizeField.trim() : "",
            ppsSampleSize: normalizeInteger(data.ppsSampleSize, defaults?.ppsSampleSize ?? 1, 1),
            stratifyBy: typeof data.stratifyBy === "string" ? data.stratifyBy.trim() : "",
            layerSampleCounts: Array.isArray(data.layerSampleCounts)
                ? data.layerSampleCounts.map((value: unknown) => normalizeInteger(value, 0, 0))
                : [],
        };
    } catch {
        return null;
    }
}
