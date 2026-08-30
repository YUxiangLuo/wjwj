import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ClusterSamplingCalculator } from "./ClusterSamplingCalculator";

test("整群抽样工具不再把设计效应区间描述为方法默认值", () => {
    const html = renderToStaticMarkup(
        <ClusterSamplingCalculator
            populationSize={10_000}
            confidenceLevel="95"
            marginOfError={5}
        />,
    );

    expect(html).toContain("不要按抽样方法套用固定区间");
    expect(html).toContain("deff≈1+(M−1)ρ");
    expect(html).not.toContain("0.7-0.9");
    expect(html).not.toContain("1.5-2.5");
    expect(html).not.toContain("3.0-5.0");
});
