import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SensitivityAnalysisCard } from "./SensitivityAnalysisCard";

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
