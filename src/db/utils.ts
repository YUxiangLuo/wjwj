export function getAffectedRows(result: unknown) {
    if (!result || typeof result !== "object") return 0;
    const value = (result as { affectedRows?: unknown }).affectedRows;
    return typeof value === "number" ? value : 0;
}
