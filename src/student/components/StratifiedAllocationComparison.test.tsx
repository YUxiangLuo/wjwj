import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
    calculateStratifiedMeanVariance,
    StratifiedAllocationComparison,
} from "./StratifiedAllocationComparison";

const layers = [
    { name: "A", count: 100, ratio: 0.5 },
    { name: "B", count: 100, ratio: 0.5 },
];

test("未抽取正总体层时，分层均值方差不可计算", () => {
    expect(calculateStratifiedMeanVariance([
        { layerName: "A", populationSize: 100, sampleSize: 10 },
        { layerName: "B", populationSize: 100, sampleSize: 0 },
    ], layers, [10, 10])).toBeNull();
});

test("每层都有样本时，分层均值方差使用标准公式", () => {
    const variance = calculateStratifiedMeanVariance([
        { layerName: "A", populationSize: 100, sampleSize: 10 },
        { layerName: "B", populationSize: 100, sampleSize: 10 },
    ], layers, [10, 20]);

    expect(variance).toBeCloseTo(11.25, 12);
});

test("总样本不足覆盖所有层时停止效率比较和应用", () => {
    const html = renderToStaticMarkup(
        <StratifiedAllocationComparison
            layers={layers}
            totalSampleSize={1}
            numericFields={["x"]}
            stratumStdDevs={{
                A: { x: { mean: 10, stdDev: 2 } },
                B: { x: { mean: 20, stdDev: 3 } },
            }}
            onApplyAllocation={() => {}}
        />,
    );

    expect(html).toContain("普通分层均值无法估计");
    expect(html).toContain("disabled");
    expect(html).not.toContain("当前对比最低");
});
