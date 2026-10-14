import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { SavedAnalysisView } from "@/domain/variables/types";
import { AnalysisAppendices, AnalysisResultTable } from "./AnalysisAppendices";

const base = {
    id: 1,
    config: { question: "基准", method: "simple" as const, field: "x", weighted: false },
    variable: { field: "x", label: "值", unit: "分", kind: "continuous" as const, categories: [], missing: [null] },
    source: "fixture",
    dictionaryRevision: 1,
    samplingGeneration: 1,
    algorithmVersion: "fixture-v1",
    createdAt: "2026-09-21T00:00:00.000Z",
    stale: false,
};

test("ST-B4 renders total, valid and missing counts with n-1 SD and R7 labels", () => {
    const record: SavedAnalysisView = {
        ...base,
        result: {
            kind: "numeric", weighted: false, sampleCount: 5, validCount: 4, missingCount: 1,
            mean: 8, sampleStandardDeviation: Math.sqrt(90), min: 0, max: 21,
            q1: 1.5, median: 5.5, q3: 12,
        },
    };
    const html = renderToStaticMarkup(<AnalysisResultTable record={record} />);

    expect(html).toContain("样本 5 · 有效 4 · 缺失 1 · 单位：分");
    expect(html).toContain("样本数");
    expect(html).toContain("样本标准差（SD）");
    expect(html).toContain("9.4868");
    expect(html).toContain("Q1（R7）");
    expect(html).toContain("1.5");
    expect(html).toContain("中位数（R7）");
    expect(html).toContain("5.5");
    expect(html).toContain("Q3（R7）");
});

test("ST-B5 keeps duplicate display labels distinguishable by raw JSON type", () => {
    const record: SavedAnalysisView = {
        ...base,
        variable: {
            field: "x", label: "编码", unit: "", kind: "nominal",
            categories: ["01", "1", 1, false, 0].map(raw => ({ value: raw, label: String(raw) })), missing: [null],
        },
        result: {
            kind: "categorical", weighted: false, sampleCount: 7, validCount: 6, missingCount: 1,
            categories: [
                { value: "01", label: "01", count: 2, proportion: 2 / 6 },
                { value: "1", label: "1", count: 1, proportion: 1 / 6 },
                { value: 1, label: "1", count: 1, proportion: 1 / 6 },
                { value: false, label: "false", count: 1, proportion: 1 / 6 },
                { value: 0, label: "0", count: 1, proportion: 1 / 6 },
            ],
        },
    };
    const html = renderToStaticMarkup(<AnalysisResultTable record={record} />);

    expect(html).toContain("样本 7 · 有效 6 · 缺失 1");
    expect(html).toContain("原值：文本“1”");
    expect(html).toContain("原值：数字 1");
    expect(html).toContain("原始频数");
    expect(html).toContain("33.33%");
    expect(html).toContain("各类别比例独立四舍五入，显示合计可能不等于 100%；底层计算使用未舍入值");
});

test("small nonzero appendix statistics remain distinguishable from zero", () => {
    const record: SavedAnalysisView = { ...base, result: {
        kind: "numeric", weighted: false, sampleCount: 3, validCount: 3, missingCount: 0,
        mean: 4e-8, sampleStandardDeviation: Math.sqrt(13) * 1e-8,
        min: -1e-8, q1: 0, median: 0.0001, q3: 0.00009999, max: 8e-8,
    } };
    const html = renderToStaticMarkup(<AnalysisResultTable record={record} />);
    for (const text of ["4E-8", "3.6056E-8", "-1E-8", "0.0001", "9.999E-5", "8E-8"]) expect(html).toContain(`>${text}<`);
    expect(html).toContain(">0<");
});

test("weighted numeric output leaves unimplemented dispersion and quantiles unavailable", () => {
    const record: SavedAnalysisView = {
        ...base,
        config: { ...base.config, weighted: true },
        result: {
            kind: "numeric", weighted: true, sampleCount: 3, validCount: 3, missingCount: 0,
            mean: 8.2, sampleStandardDeviation: null, min: null, max: null,
            q1: null, median: null, q3: null,
        },
    };
    const html = renderToStaticMarkup(<AnalysisResultTable record={record} />);

    expect(html).toContain("设计加权比率点估计（不提供标准误、置信区间或加权分位数）");
    expect(html).toContain("8.2");
    expect((html.match(/>—</g) ?? [])).toHaveLength(6);
});

test.each([false, true])("table and appendix share type-appropriate caveats (weighted=%s)", (weighted) => {
    for (const kind of ["numeric", "categorical"] as const) {
        const record: SavedAnalysisView = {
            ...base,
            config: { ...base.config, weighted },
            result: kind === "numeric"
                ? { kind, weighted, sampleCount: 2, validCount: 2, missingCount: 0, mean: 3, sampleStandardDeviation: weighted ? null : Math.SQRT2, min: weighted ? null : 2, max: weighted ? null : 4, q1: weighted ? null : 2.5, median: weighted ? null : 3, q3: weighted ? null : 3.5 }
                : { kind, weighted, sampleCount: 2, validCount: 2, missingCount: 0, categories: [{ value: "甲", label: "甲", count: 2, proportion: 1 }] },
        };
        const table = renderToStaticMarkup(<AnalysisResultTable record={record} />);
        const appendix = renderToStaticMarkup(<AnalysisAppendices records={[record]} />);
        const caption = table.match(/<caption[^>]*>(.*?)<\/caption>/s)![1]!;
        expect(appendix).toContain(table);
        expect(caption).toContain("置信区间");
        if (weighted) expect(caption).toContain("不声明估计量无偏");
        if (kind === "categorical") {
            expect(caption).not.toContain("R7");
            expect(caption).not.toContain("SD");
            expect(caption).not.toContain("分位数");
            expect(caption).toContain(weighted ? "原始频数未加权" : "有效样本数为分母");
            if (weighted) expect(caption).toContain("有效记录的权重和为分母");
        } else if (!weighted) {
            expect(caption).toContain("R7");
            expect(caption).toContain("SD");
            expect(caption).toContain("不是标准误");
        }
        expect(appendix.match(/不声明估计量无偏/g) ?? []).toHaveLength(weighted ? 1 : 0);
    }
});

test("appendix uses the same user-facing sampling method names as the analysis UI", () => {
    const record: SavedAnalysisView = {
        ...base,
        config: { ...base.config, method: "simple" },
        result: {
            kind: "numeric", weighted: false, sampleCount: 2, validCount: 2, missingCount: 0,
            mean: 3, sampleStandardDeviation: Math.SQRT2, min: 2, max: 4,
            q1: 2.5, median: 3, q3: 3.5,
        },
    };
    const html = renderToStaticMarkup(<AnalysisAppendices records={[record]} />);

    expect(html).toContain("简单随机抽样");
    expect(html).not.toContain(" · simple · ");
});
