export function parseStoredJson<T>(value: unknown): T | null {
    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value !== "string") {
        return typeof value === "object" ? (value as T) : null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    try {
        return JSON.parse(trimmed) as T;
    } catch {
        return null;
    }
}

export function deserializeExperimentFields<T extends {
    questionnaire?: unknown;
    samplePlan?: unknown;
    samplingResults?: unknown;
}>(record: T) {
    return {
        ...record,
        questionnaire: parseStoredJson<Record<string, unknown>>(record.questionnaire),
        samplePlan: parseStoredJson<Record<string, unknown>>(record.samplePlan),
        samplingResults: parseStoredJson<Record<string, unknown>>(record.samplingResults),
    };
}
