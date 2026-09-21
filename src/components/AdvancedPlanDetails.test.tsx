import { afterEach, beforeEach, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import { SamplePlanSnapshot } from "./SamplePlanSnapshot";
import { AdvancedPlanDetails } from "./AdvancedPlanDetails";

let restore: () => void;
beforeEach(() => { restore = installDomGlobals().restore; });
afterEach(() => { cleanup(); restore(); });

test("reviewers can distinguish base assumptions from applied cost assumptions and unmet precision", () => {
    const cost = { version: 1, kind: "cost", appliedAt: "2026-09-07T23:17:44.279Z",
        inputs: { confidenceLevel: "99", targetMarginOfError: 1, designEffect: 1, nonResponseRate: .5, fixedCost: 5000, variableCostPerUnit: 15, totalBudget: 50000 },
        result: { requiredSampleSize: 100, totalCost: 6500, feasible: false } };
    const view = render(<SamplePlanSnapshot populationSize={100} value={{ confidenceLevel: "90", marginOfError: 10, designEffect: 1, nonResponseRate: 0, recommendedSize: 41, finalSampleSize: 100, advancedPlanSource: "cost", advancedPlans: [cost] }} />);
    expect(view.getByText("90%")).toBeTruthy();
    expect(view.getByText("99%")).toBeTruthy();
    expect(view.getByText("±10%")).toBeTruthy();
    expect(view.getByText("±1 个百分点")).toBeTruthy();
    expect(view.getByText("预算充足；预期精度未达标")).toBeTruthy();
    expect(view.getByTestId("advanced-plan-details").textContent).toContain("应用时间：2026/09/08 07:17；");
});

test("ST-B2 frozen plan display preserves invitation count, design effect, and nonresponse", () => {
    const view = render(<SamplePlanSnapshot populationSize={1000} value={{
        estimationType: "proportion",
        confidenceLevel: "95",
        marginOfError: 5,
        designEffect: 1.5,
        nonResponseRate: 0.2,
        recommendedSize: 458,
        calculatedSampleSize: 458,
        finalSampleSize: 458,
    }} />);
    const text = view.getByTestId("sample-plan-snapshot").textContent ?? "";
    expect(text).toContain("设计效应 deff1.50");
    expect(text).toContain("预期无回答率20%");
    expect(text).toContain("推荐样本量458");
    expect(text).toContain("最终样本量458");
});

test("saved CV plans retain an explicit unmet-target status", () => {
    const view = render(<AdvancedPlanDetails source="cv" populationSize={100} value={[{
        version: 1, kind: "cv", appliedAt: "2026-09-08T00:00:00Z",
        inputs: { confidenceLevel: "95", targetCV: 1, estimatedCV: 30, designEffect: 1, nonResponseRate: 50 },
        result: { requiredSampleSize: 100, expectedRespondentSampleSize: 50, achievedCV: .0301511344578 },
    }]} />);
    expect(view.getByText("预期设计 CV 未达标")).toBeTruthy();
    expect(view.getByText("1% / 30%")).toBeTruthy();
    expect(view.getByText("3.01511%")).toBeTruthy();
});

test("partial cluster snapshots show unavailable ICC rather than zero and explain the approximation", () => {
    const view = render(<AdvancedPlanDetails source="cluster" populationSize={95} value={[{
        version: 1, kind: "cluster", appliedAt: "2026-09-08T00:00:00Z",
        inputs: { confidenceLevel: "95", marginOfError: 1, clusterSize: 50, designEffect: 2, nonResponseRate: 0 },
        result: { requiredClusters: 2, requiredSampleSize: 95, intraClassCorrelation: null },
    }]} />);
    expect(view.getByText("2 / 不适用")).toBeTruthy();
    expect(view.getByText(/按平均群规模近似方差/)).toBeTruthy();
    expect(view.getByText(/计划发放量上限：95/)).toBeTruthy();
});
