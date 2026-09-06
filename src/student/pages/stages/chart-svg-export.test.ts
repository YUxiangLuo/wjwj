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
