import { expect, test } from "bun:test";
import { CsvEncodingError, decodeCsvBytes, decodeCsvUpload, normalizeSpreadsheetUpload } from "./csv-encoding";
import { parseSpreadsheetFile } from "./spreadsheet";

const owned = (bytes: Uint8Array) => Uint8Array.from(bytes).buffer;
const hex = (value: string) => owned(Buffer.from(value, "hex"));
const text = '编号, 姓名 ,金额,备注\r\n001,张三,"1,234.50","同意,保留"\r\n';
// Fixed bytes generated with iconv, independent of the decoder under test.
const gbk = hex("b1e0bac52c20d0d5c3fb202cbdf0b6ee2cb1b8d7a20d0a3030312cd5c5c8fd2c22312c3233342e3530222c22cdacd2e22cb1a3c1f4220d0a");
const utf16le = Buffer.from("\uFEFF" + text, "utf16le");
for (const [name, bytes] of [
    ["UTF-8", new TextEncoder().encode(text).buffer],
    ["UTF-8 BOM", new TextEncoder().encode("\uFEFF" + text).buffer],
    ["GBK/CP936", gbk],
    ["UTF-16 LE BOM", owned(utf16le)],
    ["UTF-16 BE BOM", owned(Buffer.from(utf16le).swap16())],
] as const) {
    test(`${name}: CSV preserves exact field keys, leading-zero IDs, quoting and numeric roles`, async () => {
        expect(decodeCsvBytes(bytes)).toBe(text);
        const parsed = await parseSpreadsheetFile(bytes, "population.csv", { numericFields: ["金额"] });
        expect(parsed.columns).toEqual(["编号", " 姓名 ", "金额", "备注"]);
        expect(parsed.rows).toEqual([{ 编号: "001", " 姓名 ": "张三", 金额: 1234.5, 备注: "同意,保留" }]);
        expect(parsed.rowNumbers).toEqual([2]);
        expect(parsed.malformed).toBe(false);
    });
}

test("GB18030 four-byte characters survive rather than becoming replacement characters", async () => {
    const parsed = await parseSpreadsheetFile(hex("b1e0bac52cd0d5c3fb0a3030312c9534b2350a"), "population.csv");
    expect(parsed.rows).toEqual([{ 编号: "001", 姓名: "𠮷" }]);
});

for (const bytes of ["ff", "9534b2", "efbbbfb1e0", "fffe61", "feffd800", "fffe000061000000", "0000feff00000061"]) {
    test(`invalid/unsupported encoding ${bytes} fails explicitly, never substitutes damaged bytes`, () => {
        expect(() => decodeCsvBytes(hex(bytes))).toThrow(CsvEncodingError);
        expect(() => decodeCsvBytes(hex(bytes))).toThrow("另存为");
    });
}

test("new uploads never reinterpret truncated UTF-8 as GB18030", () => {
    const broken = hex("73747564656e7449642c6e616d650a3030312ce5bc0a");
    expect(() => decodeCsvUpload(broken)).toThrow(CsvEncodingError);
    expect(() => normalizeSpreadsheetUpload(broken, "roster.csv")).toThrow(CsvEncodingError);
});

test("ambiguous unmarked bytes require an explicit preview encoding choice", () => {
    const bytes = hex("c2acc3af");
    expect(decodeCsvUpload(bytes)).toBe("¬ï");
    expect(decodeCsvUpload(bytes, "gb18030")).toBe("卢茂");
});

test("new uploads reject unconfirmed GBK, while legacy stored files remain readable", () => {
    expect(() => normalizeSpreadsheetUpload(gbk, "roster.csv")).toThrow(CsvEncodingError);
    expect(decodeCsvBytes(gbk)).toBe(text);
    const confirmed = new TextEncoder().encode("\uFEFF" + decodeCsvUpload(gbk, "gb18030")).buffer;
    expect(decodeCsvBytes(normalizeSpreadsheetUpload(confirmed, "roster.csv"))).toBe(text);
});

for (const bytes of [owned(utf16le), owned(Buffer.from(utf16le).swap16()), new TextEncoder().encode(text).buffer]) {
    test("normalization persists the selected text as UTF-8 BOM without changing fields", () => {
        const stored = normalizeSpreadsheetUpload(bytes, "population.csv");
        expect([...new Uint8Array(stored).slice(0, 3)]).toEqual([239, 187, 191]);
        expect(new TextDecoder("utf-8", { fatal: true }).decode(stored)).toBe(text);
    });
}

test("declared encoding cannot be overridden, and XLSX bytes are never text-decoded", () => {
    expect(() => decodeCsvUpload(owned(utf16le), "gb18030")).toThrow(CsvEncodingError);
    const xlsx = hex("504b0304ff");
    expect(normalizeSpreadsheetUpload(xlsx, "population.xlsx")).toBe(xlsx);
});

test("ASCII and valid UTF-8 remain preferred; NUL is retained for existing per-row validation", () => {
    const source = "id,name\n001,\u00a9\nBAD\0ID,中文\n";
    expect(decodeCsvBytes(new TextEncoder().encode(source).buffer)).toBe(source);
});
