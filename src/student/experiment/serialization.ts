export function parseStoredJson<T>(value: T | string | null | undefined): T | null {
    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value !== "string") {
        return value;
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
