import { expect, test } from "bun:test";
import { buildSamplingResultsCsvExport } from "./sampling-results-export";
import * as XLSX from "xlsx";

test("PPS export includes aligned inclusion probabilities and design weights", () => {
    const result = buildSamplingResultsCsvExport({
        pps: {
            data: [{ id: 1, size: 10 }, { id: 2, size: 20 }],
            inclusionProbabilities: [0.25, 0.5],
        },
    }, "pps");
    expect(result?.csv).toContain("__wj_inclusion_probability");
    expect(result?.csv).toContain("__wj_design_weight");
    expect(result?.csv).toContain("0.25,4");
});

test("legacy PPS export keeps working when no probability vector is stored", () => {
    const result = buildSamplingResultsCsvExport({ pps: { data: [{ id: 1 }] } }, "pps");
    expect(result?.csv).toBe("\uFEFFid\n1");
});

test("PPS export uses an auditable symbolic weight instead of Infinity", () => {
    const result = buildSamplingResultsCsvExport({
        pps: {
            data: [{ id: 1, size: 1e-320 }],
            inclusionProbabilities: [5e-321],
        },
    }, "pps");
    expect(result?.csv).toContain("5e-321,1/5e-321");
    expect(result?.csv).not.toContain("Infinity");
    expect(result?.csv).not.toContain("NaN");
});

for (const method of ["simple", "systematic", "pps", "stratified", "all"] as const) {
    test(`${method} CSV carries one UTF-8 BOM and preserves Chinese and every source column`, () => {
        const row = { 编号: "001", 城市: "上海", 备注: '含逗号,引号"与\n换行', 未映射字段: "也保留" };
        const results = { simple: { data: [row] }, systematic: { data: [row] }, pps: { data: [row], inclusionProbabilities: [0.5] }, stratified: { data: [row] } };
        const exported = buildSamplingResultsCsvExport(results, method)!;
        const bytes = new TextEncoder().encode(exported.csv);
        expect([...bytes.slice(0, 3)]).toEqual([239, 187, 191]);
        expect(exported.csv.startsWith("\uFEFF\uFEFF")).toBe(false);
        const book = XLSX.read(bytes, { type: "array", raw: true });
        const records = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]!]!) as Record<string, unknown>[];
        expect(records).toHaveLength(method === "all" ? 4 : 1);
        for (const record of records) expect(record).toMatchObject(row);
    });
}

test("sampling export preserves colliding legacy metadata and neutralizes formulas", () => {
    const result = buildSamplingResultsCsvExport({
        pps: {
            data: [{
                id: "=1+1",
                __wj_method: "user-method",
                __wj_inclusion_probability: "user-probability",
                __wj_design_weight: "user-weight",
            }],
            inclusionProbabilities: [0.5],
        },
    }, "all");

    expect(result?.csv).toContain("'=1+1");
    expect(result?.csv).toContain("__wj_method_2");
    expect(result?.csv).toContain("__wj_inclusion_probability_2");
    expect(result?.csv).toContain("__wj_design_weight_2");
    expect(result?.csv).toContain("user-method,user-probability,user-weight");
});
