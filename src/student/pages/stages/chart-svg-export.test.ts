import { expect, test } from "bun:test";
import { buildChartSvg } from "./chart-svg-export";

test("signed and tiny chart exports retain visible bars and meaningful labels", () => {
    const theme = { background: "white", foreground: "black", mutedForeground: "gray", border: "gray" };
    for (const values of [[-1000, 500], [0.000001, 0.000003], [0, 0]]) {
        const svg = buildChartSvg({ title: "研究变量", fileName: "test.svg", rows: [
            { label: "甲", values: { simple: values[0]! } },
            { label: "乙", values: { simple: values[1]! } },
        ], series: [{ key: "simple", label: "简单随机", color: "blue" }] }, theme)!;
        const bars = [...svg.matchAll(/<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)" rx="4"/g)];
        expect(bars).toHaveLength(2);
        bars.forEach((bar, index) => {
            const height = Number(bar[4]);
            expect(height).toBeGreaterThanOrEqual(0);
            if (values[index] !== 0) expect(height).toBeGreaterThan(0);
        });
        if (values[0] === -1000) {
            expect(Number(bars[0]![2])).toBeGreaterThan(Number(bars[1]![2]));
            expect(svg).toContain("-1000.00");
        }
        if (values[0] === 0.000001) expect(svg).toContain("1.000e-6");
    }
});

test("chart SVG uses the light theme supplied by the shared theme source", () => {
    const svg = buildChartSvg({
        title: "均值对比",
        fileName: "mean.svg",
        rows: [{ label: "每周学习时长", values: { simple: 8.5 } }],
        series: [{ key: "simple", label: "简单随机", color: "#2563eb" }],
    }, {
        background: "#ffffff",
        foreground: "#0f172a",
        mutedForeground: "#475569",
        border: "#e2e8f0",
    });

    expect(svg).toContain('<rect width="100%" height="100%" fill="#ffffff"');
    expect(svg).toContain('fill="#0f172a"');
    expect(svg).toContain('stroke="#e2e8f0"');
    expect(svg).not.toContain("#020617");
});

test("deviation SVG retains explicit percentage-point units and escaped standalone context", () => {
    const svg = buildChartSvg({
        title: "分类分布偏差（百分点）", fileName: "categorical.svg", unit: "百分点",
        rows: [{ label: "年龄", values: { simple: 6.349206349 } }],
        series: [{ key: "simple", label: "简单随机", color: "blue" }],
        notes: ["各类占比绝对差的平均", "独立尺度，不可横比；不能单独证明样本无偏或具有整体代表性。", "<说明>&"],
    }, { background: "white", foreground: "black", mutedForeground: "gray", border: "gray" })!;
    expect(svg).toContain("6.35百分点");
    expect(svg).not.toContain("6.35%");
    expect(svg).toContain("各类占比绝对差的平均");
    expect(svg).toContain("独立尺度，不可横比");
    expect(svg).toContain("&lt;说明&gt;&amp;");
    expect(svg).toContain('height="692"');
});
