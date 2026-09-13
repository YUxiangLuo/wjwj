import { parseSpreadsheetFile } from "../lib/spreadsheet";
import { resolveStoragePath } from "./storage-files";

export function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    if (value && typeof value === "object") {
        const entries = Object.entries(value).filter(([, item]) => item !== undefined)
            .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
        return "{" + entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",") + "}";
    }
    return JSON.stringify(value) ?? "null";
}

export async function readVariableSource(path: string, fieldMapping: unknown) {
    const bytes = await Bun.file(resolveStoragePath(path)).arrayBuffer();
    const fileHash = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    const mapping = fieldMapping as Record<string, unknown> | null;
    // Exclude research prose; include only roles and the primary target's interpretation.
    const interpretation = mapping ? {
        identifier: mapping.identifier,
        numeric: Array.isArray(mapping.numeric) ? [...mapping.numeric].sort() : [],
        stratified: Array.isArray(mapping.stratified) ? [...mapping.stratified].sort() : [],
        others: Array.isArray(mapping.others) ? [...mapping.others].sort() : [],
        target: (mapping.studyContract as Record<string, unknown> | undefined)?.target ?? mapping.analysisTarget,
    } : null;
    const source = new Bun.CryptoHasher("sha256").update(fileHash + canonicalJson(interpretation)).digest("hex");
    const parsed = await parseSpreadsheetFile(bytes, path, { preserveRawValues: true, includeColumnValues: false });
    if (!parsed.rows.length || parsed.rowCount > 100_000 || parsed.colCount > 50 || parsed.malformed || parsed.duplicateColumns.length || parsed.blankColumnIndexes.length) throw new Error("总体数据无效，请重新上传并确认字段");
    const design = await parseSpreadsheetFile(bytes, path, { numericFields: Array.isArray(mapping?.numeric) ? mapping.numeric as string[] : [], includeColumnValues: false });
    if (design.rows.length !== parsed.rows.length || canonicalJson(design.rowNumbers) !== canonicalJson(parsed.rowNumbers)) throw new Error("总体解析行序不一致");
    return { source, fileHash, rows: parsed.rows, designRows: design.rows, parserVersion: "raw-values-v1" };
}
