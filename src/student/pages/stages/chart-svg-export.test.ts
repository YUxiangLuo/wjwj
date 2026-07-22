import { expect, test } from "bun:test";
import { buildChartSvg } from "./chart-svg-export";

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
