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
    unit: "kg",
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
    expect(html).toContain("10.0000 kg");
    expect(html).toContain("±2.0000 kg");
    expect(html).toContain("设计 SE（kg）");
    expect(html).toContain("依赖教学系统已知的完整虚拟总体");
    expect(html).toContain("现实调查通常不知道总体真值");
    expect(html).toContain("它不表示覆盖率已经验证，也不是正式置信区间");
    expect(html).toContain("不能单独证明无偏、代表性或某种方法更好");
});
