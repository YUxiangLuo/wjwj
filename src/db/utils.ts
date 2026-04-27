export function getAffectedRows(result: unknown) {
    if (Array.isArray(result)) return result.length;
    if (!result || typeof result !== "object") return 0;
    const value = (result as { affectedRows?: unknown; rowCount?: unknown }).affectedRows
        ?? (result as { rowCount?: unknown }).rowCount;
    return typeof value === "number" ? value : 0;
}
