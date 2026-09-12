export class CsvEncodingError extends Error {
    constructor() {
        super("CSV 编码无效或不受支持，请在 Excel/WPS 中另存为“CSV UTF-8（逗号分隔）”或 .xlsx 文件后重试。");
        this.name = "CsvEncodingError";
    }
}

export type CsvEncoding = "utf-8" | "gb18030" | "utf-16le" | "utf-16be";

export function getCsvBomEncoding(buffer: ArrayBuffer): CsvEncoding | null {
    const bytes = new Uint8Array(buffer);
    const starts = (...prefix: number[]) => prefix.every((byte, index) => bytes[index] === byte);
    // Do not mistake UTF-32 LE's prefix for UTF-16 LE.
    if (starts(0xff, 0xfe, 0, 0) || starts(0, 0, 0xfe, 0xff)) throw new CsvEncodingError();
    return starts(0xef, 0xbb, 0xbf) ? "utf-8"
        : starts(0xff, 0xfe) ? "utf-16le"
        : starts(0xfe, 0xff) ? "utf-16be" : null;
}

/** New uploads never guess after a decode failure. Explicit choices are for the local preview. */
export function decodeCsvUpload(buffer: ArrayBuffer, encoding?: CsvEncoding): string {
    const declared = getCsvBomEncoding(buffer);
    if (declared && encoding && encoding !== declared) throw new CsvEncodingError();
    try {
        return new TextDecoder(declared ?? encoding ?? "utf-8", { fatal: true }).decode(buffer);
    } catch {
        throw new CsvEncodingError();
    }
}

/** Persist the confirmed text, so all later reads use the same interpretation without DB metadata. */
export function normalizeSpreadsheetUpload(buffer: ArrayBuffer, fileName: string): ArrayBuffer {
    if (!fileName.toLowerCase().endsWith(".csv")) return buffer;
    return new TextEncoder().encode("\uFEFF" + decodeCsvUpload(buffer)).buffer;
}

/** Legacy stored files only: retain the earlier UTF-8/GB18030 fallback, never use for new upload acceptance. */
export function decodeCsvBytes(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    const declared = getCsvBomEncoding(buffer);
    if (declared) {
        try {
            return new TextDecoder(declared, { fatal: true }).decode(bytes);
        } catch {
            throw new CsvEncodingError();
        }
    }
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
        try {
            return new TextDecoder("gb18030", { fatal: true }).decode(bytes);
        } catch {
            throw new CsvEncodingError();
        }
    }
}
