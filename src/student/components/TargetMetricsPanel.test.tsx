import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { TargetAnalysisMetrics, TargetMethodMetrics } from "@/domain/experiment/analysis-types";
import { TargetMetricsPanel } from "./TargetMetricsPanel";

const method: TargetMethodMetrics = {
    estimate: 10,
    standardError: 1,
    marginOfError: 1.96,
    sampleSize: 50,
    effectiveSampleSize: 50,
    reliability: { status: "ok", reasons: [] },
};

const target: TargetAnalysisMetrics = {
    contract: {
        inferred: false,
        contract: {
            version: 1,
            researchQuestion: "总体平均值是多少？",
            targetPopulation: "全部单位",
            unitOfAnalysis: "一行记录",
            target: { kind: "mean", field: "value" },
        },
    },
    confidenceLevel: "95",
    plannedMarginOfError: 2,
    populationValue: 10,
    methods: {
        simple: method,
        systematic: method,
        pps: method,
        stratified: method,
    },
};

test("labels z times design SE as a normal approximation rather than a validated interval", () => {
    const html = renderToStaticMarkup(<TargetMetricsPanel target={target} methods={["simple"]} />);

    expect(html).toContain("95% 正态近似教学半宽");
    expect(html).toContain("它不表示覆盖率已经验证，也不应当作正式置信区间");
});
