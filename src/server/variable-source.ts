import { parseSpreadsheetFile } from "../lib/spreadsheet";
import { resolveStoragePath } from "./storage-files";

export function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    if (value && typeof value === "object") return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
    return JSON.stringify(value) ?? "null";
}

export async function readVariableSource(path: string, fieldMapping: unknown) {
    const bytes = await Bun.file(resolveStoragePath(path)).arrayBuffer();
    const fileHash = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    const mapping = fieldMapping as Record<string, unknown> | null;
    // Exclude research prose; include only roles and the primary target's interpretation.
    const interpretation = mapping ? {
        identifier: mapping.identifier, numeric: mapping.numeric, stratified: mapping.stratified, others: mapping.others,
        target: (mapping.studyContract as Record<string, unknown> | undefined)?.target ?? mapping.analysisTarget,
    } : null;
    const source = new Bun.CryptoHasher("sha256").update(fileHash + canonicalJson(interpretation)).digest("hex");
    const parsed = await parseSpreadsheetFile(bytes, path, { preserveRawValues: true, includeColumnValues: false });
    if (!parsed.rows.length || parsed.malformed || parsed.duplicateColumns.length || parsed.blankColumnIndexes.length) throw new Error("总体数据无效，请重新上传并确认字段");
    return { source, fileHash, rows: parsed.rows, parserVersion: "raw-values-v1" };
}
