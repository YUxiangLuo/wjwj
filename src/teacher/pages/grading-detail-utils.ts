export const DEFAULT_SAMPLING_UNAVAILABLE_MESSAGE = "当前任务无可用规模变量，已跳过";

export type SamplingPreviewState =
    | {
        kind: "empty";
        rows: Array<Record<string, unknown>>;
        reason: null;
    }
    | {
        kind: "unavailable";
        rows: Array<Record<string, unknown>>;
        reason: string;
    }
    | {
        kind: "data";
        rows: Array<Record<string, unknown>>;
        reason: null;
    };

export function getSamplingPreviewState(section: unknown): SamplingPreviewState {
    if (!section || typeof section !== "object" || Array.isArray(section)) {
        return { kind: "empty", rows: [], reason: null };
    }

    const record = section as Record<string, unknown>;
    const rows = Array.isArray(record.data)
        ? record.data.filter((row): row is Record<string, unknown> => !!row && typeof row === "object" && !Array.isArray(row))
        : [];

    if (rows.length > 0) {
        return { kind: "data", rows, reason: null };
    }

    if (record.unavailable === true) {
        const unavailableReason = typeof record.unavailableReason === "string" ? record.unavailableReason.trim() : "";
        return {
            kind: "unavailable",
            rows: [],
            reason: unavailableReason || DEFAULT_SAMPLING_UNAVAILABLE_MESSAGE,
        };
    }

    return { kind: "empty", rows: [], reason: null };
}
