import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { getSensitivityHeatClass, SensitivityAnalysisCard } from "./SensitivityAnalysisCard";

test("灵敏度说明区分未校正理论倍数与当前表格实际倍数", () => {
    const html = renderToStaticMarkup(
        <SensitivityAnalysisCard
            matrix={[
                { confidenceLabel: "95%", confidenceLevel: "95", marginOfError: 3, sampleSize: 100 },
                { confidenceLabel: "95%", confidenceLevel: "95", marginOfError: 5, sampleSize: 50 },
            ]}
            currentConfidenceLevel="95"
            currentMarginOfError={5}
        />,
    );

    expect(html).toContain("(5/3)²≈2.78");
    expect(html).toContain("实际倍数为 2.00");
});

test("灵敏度热力图保留四档显式强度色", () => {
    const classes = [
        getSensitivityHeatClass(20, false),
        getSensitivityHeatClass(45, false),
        getSensitivityHeatClass(65, false),
        getSensitivityHeatClass(90, false),
    ];
    expect(classes).toEqual([
        "bg-heatmap-low",
        "bg-heatmap-moderate",
        "bg-heatmap-high",
        "bg-heatmap-maximum",
    ]);

    const html = renderToStaticMarkup(
        <SensitivityAnalysisCard
            matrix={[
                { confidenceLabel: "95%", confidenceLevel: "95", marginOfError: 1, sampleSize: 20 },
                { confidenceLabel: "95%", confidenceLevel: "95", marginOfError: 2, sampleSize: 45 },
                { confidenceLabel: "95%", confidenceLevel: "95", marginOfError: 3, sampleSize: 65 },
                { confidenceLabel: "95%", confidenceLevel: "95", marginOfError: 5, sampleSize: 100 },
            ]}
            currentConfidenceLevel="90"
            currentMarginOfError={5}
        />,
    );
    for (const className of classes) expect(html).toContain(className);
});
