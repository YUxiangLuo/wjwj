import { parseVariableDictionary } from "../domain/experiment/variable-dictionary";
import { parseTopicFieldMapping } from "../domain/statistics/population";

/** Content-based identity, independent of a copied filename or topic title.
 * Variable IDs are scoped by topic: an identical hash never grants access.
 */
export function dictionaryDatasetRevision(buffer: ArrayBuffer, filename: string, fieldMapping: unknown): string {
    return dictionaryDatasetRevisionFromHash(new Bun.CryptoHasher("sha256").update(buffer).digest("hex"), filename, fieldMapping);
}
export function dictionaryDatasetRevisionFromHash(fileHash: string, filename: string, fieldMapping: unknown): string {
    const mapping = parseTopicFieldMapping(fieldMapping);
    const profile = JSON.stringify({
        parserVersion: "spreadsheet-v2",
        format: filename.toLowerCase().endsWith(".csv") ? "csv" : "xlsx",
        identifier: mapping?.identifier ?? null,
        numeric: [...new Set(mapping?.numeric ?? [])].sort(),
        stratified: [...new Set(mapping?.stratified ?? [])].sort(),
        others: [...new Set(mapping?.others ?? [])].sort(),
    });
    return new Bun.CryptoHasher("sha256").update(profile).update("\0").update(fileHash).digest("hex");
}

export function readStoredVariableDictionary(raw: unknown, expectedRevision?: number) {
    const corrupt = () => ({
        ok: false as const, message: "变量字典存储损坏或版本暂不支持，请联系管理员",
        code: "INVALID_DICTIONARY_STORAGE", status: 409,
    });
    if (raw == null) return { ok: true as const, value: null };
    let value: unknown = raw;
    if (typeof raw === "string") {
        try { value = JSON.parse(raw); } catch { return corrupt(); }
    }
    const parsed = parseVariableDictionary(value);
    if (!parsed.ok || parsed.value.revision === 0
        || (expectedRevision !== undefined && parsed.value.revision !== expectedRevision)) return corrupt();
    return parsed;
}
