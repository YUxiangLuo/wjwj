import * as XLSX from "xlsx";
import { parseNumericText } from "./numeric-text";
import { createSafeRecord } from "./safe-record";
import { decodeCsvBytes } from "./csv-encoding";

export const MAX_SPREADSHEET_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_SPREADSHEET_MULTIPART_BYTES = MAX_SPREADSHEET_UPLOAD_BYTES + 1024 * 1024;
export const MAX_SPREADSHEET_ROWS = 100_000;
export const MAX_SPREADSHEET_COLUMNS = 50;
export const MAX_COLUMN_VALUE_OPTIONS = 200;
const MAX_XLSX_UNCOMPRESSED_BYTES = 128 * 1024 * 1024;
const MAX_XLSX_ZIP_ENTRIES = 2_048;

export interface SpreadsheetUploadFile {
    name: string;
    size: number;
}

export interface SpreadsheetParseResult {
    rows: Array<Record<string, any>>;
    /** One-based physical source line/worksheet row for each retained data record. */
    rowNumbers?: number[];
    columns: string[];
    duplicateColumns: string[];
    blankColumnIndexes: number[];
    rowCount: number;
    colCount: number;
    preview: Array<Record<string, any>>;
    columnValues: Record<string, string[]>;
    columnValuesTruncated: string[];
    malformed: boolean;
    malformedRow?: number;
}

export function validateSpreadsheetUploadFile(file: SpreadsheetUploadFile) {
    if (typeof file.name !== "string" || !Number.isSafeInteger(file.size) || file.size <= 0) {
        return { code: "INVALID_FILE", message: "表格文件为空或大小无效", status: 400 } as const;
    }
    const normalizedName = file.name.trim().toLowerCase();
    if (!normalizedName.endsWith(".csv") && !normalizedName.endsWith(".xlsx")) {
        return { code: "INVALID_FILE", message: "仅支持 .csv 或 .xlsx 表格文件", status: 400 } as const;
    }
    if (file.size > MAX_SPREADSHEET_UPLOAD_BYTES) {
        return { code: "FILE_TOO_LARGE", message: "表格文件不能超过20 MiB", status: 413 } as const;
    }
    return null;
}

export function spreadsheetRequestExceedsLimit(req: Request) {
    const rawLength = req.headers.get("content-length");
    if (!rawLength || !/^\d+$/.test(rawLength)) return false;
    return BigInt(rawLength) > BigInt(MAX_SPREADSHEET_MULTIPART_BYTES);
}

function inspectHeaderValues(header: unknown[]) {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    const blankColumnIndexes: number[] = [];
    header.forEach((value, index) => {
        const name = String(value).trim().normalize("NFKC");
        if (!name) blankColumnIndexes.push(index + 1);
        if (seen.has(name)) duplicates.add(name);
        seen.add(name);
    });
    return { duplicateColumns: [...duplicates], blankColumnIndexes };
}

function inspectHeaderNames(sheet: XLSX.WorkSheet) {
    const [header = []] = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: "",
        blankrows: false,
    });
    return inspectHeaderValues(header);
}

function csvColumnKeys(header: string[]) {
    const counts = new Map<string, number>();
    return header.map((value) => {
        const base = value || "__EMPTY";
        const count = counts.get(base) ?? 0;
        counts.set(base, count + 1);
        return count === 0 ? base : `${base}_${count}`;
    });
}

function parseUnquotedCsvText(text: string) {
    const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    let rawHeader: string[] | undefined;
    let columns: string[] = [];
    const rows: Array<Record<string, string>> = [];
    const rowNumbers: number[] = [];
    let lineNumber = 0;
    let malformedRow: number | undefined;
    let tooManyColumns = false;
    // Iterate rather than splitting the whole file: millions of blank lines
    // must not allocate millions of entries or hide the oversized-row sentinel.
    for (const match of source.matchAll(/([^\r\n]*)(?:\r\n|\r|\n|$)/g)) {
        lineNumber += 1;
        const line = match[1]!;
        if (!line.trim()) continue;
        const values = line.split(",", MAX_SPREADSHEET_COLUMNS + 2);
        if (values.length > MAX_SPREADSHEET_COLUMNS) tooManyColumns = true;
        if (!rawHeader) {
            rawHeader = values;
            columns = csvColumnKeys(rawHeader.slice(0, MAX_SPREADSHEET_COLUMNS + 1));
            continue;
        }
        if (values.length !== rawHeader.length && malformedRow === undefined) malformedRow = lineNumber;
        rows.push(Object.fromEntries(columns.map((column, columnIndex) => [column, values[columnIndex] ?? ""])));
        rowNumbers.push(lineNumber);
        if (rows.length > MAX_SPREADSHEET_ROWS) break;
    }
    return {
        rows,
        rowNumbers,
        columns,
        ...inspectHeaderValues(rawHeader ?? []),
        rowCount: rows.length,
        colCount: tooManyColumns ? MAX_SPREADSHEET_COLUMNS + 1 : columns.length,
        preview: rows.slice(0, 20),
        malformed: malformedRow !== undefined,
        malformedRow,
    };
}

/**
 * Parse CSV lexically instead of routing it through SheetJS' spreadsheet type
 * inference. The parser stops retaining data after the first invalid boundary,
 * so a maximum-size upload cannot expand into multiple SheetJS workbook copies.
 */
function parseCsvText(text: string) {
    if (!text.includes('"')) return parseUnquotedCsvText(text);
    const parsedRows: string[][] = [];
    const rowNumbers: number[] = [];
    let lineNumber = 1;
    let rowStartLine = 1;
    let row: string[] = [];
    let quoted = false;
    let closedQuote = false;
    let fieldParts: string[] | null = null;
    let malformed = false;
    let tooManyColumns = false;
    let index = text.charCodeAt(0) === 0xfeff ? 1 : 0;
    let fieldStart = index;
    let rowStartOffset = index;

    const finishField = (end: number, nextStart: number) => {
        let value: string;
        if (fieldParts) {
            if (!closedQuote) fieldParts.push(text.slice(fieldStart, end));
            value = fieldParts.join("");
        } else {
            value = text.slice(fieldStart, end);
        }
        if (row.length < MAX_SPREADSHEET_COLUMNS + 1) row.push(value);
        else tooManyColumns = true;
        fieldParts = null;
        closedQuote = false;
        fieldStart = nextStart;
    };
    const finishRow = (end: number, nextStart: number) => {
        finishField(end, nextStart);
        // Ignore only physically blank records. Explicit fields (,, or "")
        // and blank lines inside a quoted field remain meaningful data.
        if (text.slice(rowStartOffset, end).trim()) {
            parsedRows.push(row);
            rowNumbers.push(rowStartLine);
        }
        row = [];
        rowStartOffset = nextStart;
    };

    while (index < text.length && parsedRows.length <= MAX_SPREADSHEET_ROWS + 1) {
        const character = text[index]!;
        if (quoted) {
            if (character === "\n" || (character === "\r" && text[index + 1] !== "\n")) lineNumber += 1;
            if (character === '"') {
                if (text[index + 1] === '"') {
                    fieldParts ??= [];
                    fieldParts.push(text.slice(fieldStart, index), '"');
                    index += 2;
                    fieldStart = index;
                    continue;
                }
                fieldParts ??= [];
                fieldParts.push(text.slice(fieldStart, index));
                quoted = false;
                closedQuote = true;
            }
            index += 1;
            continue;
        }
        if (closedQuote && character !== "," && character !== "\n" && character !== "\r") {
            if (character !== " " && character !== "\t") malformed = true;
            index += 1;
            continue;
        }
        if (character === '"' && index === fieldStart) {
            quoted = true;
            fieldStart = index + 1;
        } else if (character === ",") {
            finishField(index, index + 1);
        } else if (character === "\n" || character === "\r") {
            const nextStart = character === "\r" && text[index + 1] === "\n" ? index + 2 : index + 1;
            finishRow(index, nextStart);
            lineNumber += 1;
            rowStartLine = lineNumber;
            index = nextStart;
            continue;
        }
        index += 1;
    }
    if (quoted) malformed = true;
    if (index >= text.length && (fieldStart < text.length || row.length > 0 || closedQuote)) {
        finishRow(text.length, text.length);
    }

    const rawHeader = parsedRows.shift() ?? [];
    rowNumbers.shift();
    const columns = csvColumnKeys(rawHeader);
    const inconsistentRowIndex = parsedRows.findIndex((values) => values.length !== rawHeader.length);
    const rows = parsedRows.slice(0, MAX_SPREADSHEET_ROWS + 1).map((values) => Object.fromEntries(
        columns.map((column, columnIndex) => [column, values[columnIndex] ?? ""]),
    ));
    return {
        rows,
        rowNumbers: rowNumbers.slice(0, rows.length),
        columns,
        ...inspectHeaderValues(rawHeader),
        rowCount: rows.length,
        colCount: tooManyColumns ? MAX_SPREADSHEET_COLUMNS + 1 : columns.length,
        preview: rows.slice(0, 20),
        malformed: malformed || inconsistentRowIndex >= 0,
        malformedRow: inconsistentRowIndex >= 0 ? rowNumbers[inconsistentRowIndex] : undefined,
    };
}

function assertXlsxArchiveBudget(bytes: Uint8Array) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const minimumOffset = Math.max(0, bytes.byteLength - 65_557);
    let endOffset = -1;
    for (let offset = bytes.byteLength - 22; offset >= minimumOffset; offset -= 1) {
        if (view.getUint32(offset, true) === 0x06054b50) {
            endOffset = offset;
            break;
        }
    }
    if (endOffset < 0) throw new Error("XLSX_ARCHIVE_INVALID");
    const entryCount = view.getUint16(endOffset + 10, true);
    const centralSize = view.getUint32(endOffset + 12, true);
    const centralOffset = view.getUint32(endOffset + 16, true);
    if (entryCount > MAX_XLSX_ZIP_ENTRIES || centralOffset + centralSize > bytes.byteLength) {
        throw new Error("XLSX_ARCHIVE_TOO_LARGE");
    }
    let totalUncompressed = 0;
    let offset = centralOffset;
    for (let entry = 0; entry < entryCount; entry += 1) {
        if (offset + 46 > bytes.byteLength || view.getUint32(offset, true) !== 0x02014b50) {
            throw new Error("XLSX_ARCHIVE_INVALID");
        }
        totalUncompressed += view.getUint32(offset + 24, true);
        if (totalUncompressed > MAX_XLSX_UNCOMPRESSED_BYTES) throw new Error("XLSX_ARCHIVE_TOO_LARGE");
        const nameLength = view.getUint16(offset + 28, true);
        const extraLength = view.getUint16(offset + 30, true);
        const commentLength = view.getUint16(offset + 32, true);
        offset += 46 + nameLength + extraLength + commentLength;
    }
}

export async function parseSpreadsheetFile(
    buffer: ArrayBuffer,
    fileName?: string | null,
    options: { includeColumnValues?: boolean; numericFields?: string[]; preserveRawValues?: boolean } = {},
): Promise<SpreadsheetParseResult> {
    const normalizedName = fileName?.toLowerCase() ?? "";
    if (normalizedName.endsWith(".csv")) {
        const parsed = parseCsvText(decodeCsvBytes(buffer));
        // Convert only declared numeric roles: IDs and numeric-looking categories
        // must retain their displayed text (including leading zeros).
        const rows: Array<Record<string, unknown>> = parsed.rows;
        for (const field of options.preserveRawValues ? [] : options.numericFields ?? []) {
            for (const row of rows) {
                if (Object.hasOwn(row, field)) row[field] = parseNumericText(row[field]) ?? row[field];
            }
        }
        return {
            ...parsed,
            rows,
            preview: rows.slice(0, 20),
            ...(options.includeColumnValues === false
                ? { columnValues: {}, columnValuesTruncated: [] }
                : collectUniqueColumnValues(rows, parsed.columns)),
        };
    }

    assertXlsxArchiveBudget(new Uint8Array(buffer));
    const workbook = XLSX.read(buffer, { type: "array", sheetRows: MAX_SPREADSHEET_ROWS + 2 });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return { rows: [], columns: [], duplicateColumns: [], blankColumnIndexes: [], rowCount: 0, colCount: 0, preview: [], columnValues: {}, columnValuesTruncated: [], malformed: false };
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return { rows: [], columns: [], duplicateColumns: [], blankColumnIndexes: [], rowCount: 0, colCount: 0, preview: [], columnValues: {}, columnValuesTruncated: [], malformed: false };

    const displayedRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "", raw: false });
    const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: options.preserveRawValues ? null : "", raw: true });
    const numericFields = new Set(options.numericFields ?? []);
    const rows = displayedRows.map((displayed, rowIndex) => {
        const raw = rawRows[rowIndex] ?? {};
        return Object.fromEntries(Object.keys(displayed).map((field) => [
            field,
            options.preserveRawValues ? raw[field] : numericFields.has(field) ? parseNumericText(raw[field]) ?? raw[field] : displayed[field],
        ]));
    });
    const columns = Object.keys(rows[0] ?? {});
    const headerIssues = inspectHeaderNames(sheet);
    return {
        rows,
        rowNumbers: displayedRows.map((row, index) => Number(row.__rowNum__ ?? index + 1) + 1),
        columns,
        ...headerIssues,
        rowCount: rows.length,
        colCount: columns.length,
        preview: rows.slice(0, 20),
        ...(options.includeColumnValues === false
            ? { columnValues: {}, columnValuesTruncated: [] }
            : collectUniqueColumnValues(rows, columns)),
        malformed: false,
    };
}

export function uniqueColumnValues(
    rows: Array<Record<string, unknown>>,
    columns: string[],
): Record<string, string[]> {
    return collectUniqueColumnValues(rows, columns).columnValues;
}

export function collectUniqueColumnValues(
    rows: Array<Record<string, unknown>>,
    columns: string[],
) {
    const result = createSafeRecord<string[]>();
    const truncated: string[] = [];
    for (const column of columns) {
        const seen = new Set<string>();
        for (const row of rows) {
            const value = String(row[column] ?? "").trim();
            if (!value || seen.has(value)) continue;
            if (seen.size >= MAX_COLUMN_VALUE_OPTIONS) {
                truncated.push(column);
                break;
            }
            seen.add(value);
        }
        result[column] = [...seen];
    }
    return { columnValues: result, columnValuesTruncated: truncated };
}
