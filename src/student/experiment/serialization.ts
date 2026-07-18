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
