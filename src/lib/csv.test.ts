import { expect, test } from "bun:test";
import { encodeCsvCell, recordsToCsv, reserveCsvMetadataHeader } from "./csv";

test("CSV cells quote CR/LF/commas/quotes and neutralize spreadsheet formulas", () => {
    expect(encodeCsvCell("plain")).toBe("plain");
    expect(encodeCsvCell("a\rb")).toBe('"a\rb"');
    expect(encodeCsvCell('a,"b"')).toBe('"a,""b"""');
    expect(encodeCsvCell("=HYPERLINK(\"https://example.invalid\")"))
        .toBe('"\'=HYPERLINK(""https://example.invalid"")"');
    expect(encodeCsvCell(" \t-2+3")).toBe("' \t-2+3");
    expect(encodeCsvCell("\u3000@SUM(A1:A2)")).toBe("'\u3000@SUM(A1:A2)");
    expect(encodeCsvCell(-2)).toBe("-2");
});

test("CSV writer also protects user-controlled headers", () => {
    expect(recordsToCsv([{ "=cmd": "@payload" }])).toBe("'=cmd\n'@payload");
});

test("metadata headers never overwrite an existing user column", () => {
    const used = new Set(["__wj_method", "__wj_method_2"]);
    expect(reserveCsvMetadataHeader("__wj_method", used)).toBe("__wj_method_3");
});
