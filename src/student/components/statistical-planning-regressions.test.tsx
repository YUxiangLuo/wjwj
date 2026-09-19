import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";
import { parseAdvancedPlans, validateAdvancedPlanConsistency } from "../experiment/advanced-plan";
import type { SurveyVariableSpec } from "@/domain/experiment/planning-types";
// React determines input-event support when react-dom is first imported.
const bootstrap = installDomGlobals();
const { cleanup, fireEvent, render } = await import("@testing-library/react");
const { PrecisionCostTradeoff } = await import("./PrecisionCostTradeoff");
const { PrecisionPhase } = await import("./immersive-sample-planning/phases/PrecisionPhase");
const { MultiVariableSamplePlan } = await import("./MultiVariableSamplePlan");
const { ClusterSamplingCalculator } = await import("./ClusterSamplingCalculator");
bootstrap.restore();

let restore: () => void;
beforeEach(() => { restore = installDomGlobals().restore; });
afterEach(() => { cleanup(); restore(); });

test("cluster UI applies reachable within-cluster response plans and blocks unmet precision", () => {
    const onSnapshot = mock(() => {});
    const onApplyResult = mock(() => {});
    const props = { populationSize: 40, confidenceLevel: "95", marginOfError: 5, initialNonResponseRate: 0.1, onSnapshot, onApplyResult };
    const view = render(<ClusterSamplingCalculator {...props} />);
    fireEvent.keyDown(view.getByRole("slider", { name: "规划群规模" }), { key: "Home" });
    const deff = view.getByRole("slider", { name: "整群抽样设计效应" });
    for (let step = 0; step < 6; step++) fireEvent.keyDown(deff, { key: "ArrowRight" });
    expect(view.getByText("模型假设下的预期误差限：4.87%")).toBeTruthy();
    const apply = view.getByRole("button", { name: "应用整群抽样方案" }) as HTMLButtonElement;
    expect(apply.disabled).toBe(false);
    fireEvent.click(apply);
    expect(onApplyResult).toHaveBeenCalledWith(4, 40);
    expect(onSnapshot).toHaveBeenCalledWith(expect.objectContaining({
        result: expect.objectContaining({ requiredClusters: 4, requiredSampleSize: 40, intraClassCorrelation: expect.closeTo(1 / 9, 10) }),
    }));
    view.rerender(<ClusterSamplingCalculator {...props} marginOfError={4} />);
    expect(apply.disabled).toBe(true);
    expect(view.getByRole("alert").textContent).toContain("按当前模型");
    fireEvent.change(view.getByRole("spinbutton", { name: "无回答率 (%)" }), { target: { value: "100" } });
    expect(view.getByRole("alert").textContent).toContain("无法形成有效规划");
    expect(view.queryByRole("button", { name: "应用整群抽样方案" })).toBeNull();
});

test("cost UI names unmet precision explicitly and saves an honest status", () => {
    const onSnapshot = mock(() => {});
    const view = render(<PrecisionCostTradeoff populationSize={100} confidenceLevel="95" designEffect={1} nonResponseRate={.5} onApplyBudget={() => {}} onSnapshot={onSnapshot} />);
    expect(view.getByText("预算充足")).toBeTruthy();
    expect(view.getByText("预期精度未达标")).toBeTruthy();
    expect(view.getByText(/预期完成 50 份，预期误差限 ±9.85/)).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "采用此未达标样本量" }));
    expect(onSnapshot).toHaveBeenCalledWith(expect.objectContaining({ result: { requiredSampleSize: 100, totalCost: 6500, feasible: false } }));
    expect(view.getByRole("img", { name: /横轴为总成本，纵轴为预期误差限/ })).toBeTruthy();
});

test("cost inputs cannot persist negative costs, including the free-survey boundary", () => {
    const onSnapshot = mock(() => {});
    const view = render(<PrecisionCostTradeoff populationSize={100} confidenceLevel="95" designEffect={1} nonResponseRate={0} onApplyBudget={() => {}} onSnapshot={onSnapshot} />);
    fireEvent.click(view.getByRole("button", { name: "自定义成本参数" }));
    for (const id of ["precision-fixed-cost", "precision-variable-cost", "precision-total-budget"]) {
        fireEvent.change(view.container.querySelector(`#${id}`)!, { target: { value: "-1" } });
    }
    fireEvent.click(view.getByRole("button", { name: "应用此样本量" }));
    expect(onSnapshot).toHaveBeenCalledWith(expect.objectContaining({ inputs: expect.objectContaining({ fixedCost: 0, variableCostPerUnit: 0, totalBudget: 0 }), result: expect.objectContaining({ totalCost: 0, feasible: true }) }));
});

test("precision teaching preserves small nonzero SE and ME", () => {
    const view = render(<PrecisionPhase initialSampleSize={100} params={{ populationSize: 1000, estimationType: "mean", populationVariance: 2e-10, confidenceLevel: "95", marginOfError: 2, designEffect: 1, nonResponseRate: 0, recommendedSize: 50, finalSampleSize: 50 }} onNext={() => {}} />);
    expect(view.getByText("1.342e-6")).toBeTruthy();
    expect(view.getByText("±2.631e-6")).toBeTruthy();
    expect(view.queryByText("0.0000")).toBeNull();
});

test("the plotted budget intersection agrees with the displayed cost analysis for a large population", () => {
    const view = render(<PrecisionCostTradeoff populationSize={100000} confidenceLevel="95" designEffect={1} nonResponseRate={0} onApplyBudget={() => {}} />);
    const chart = view.getByRole("img", { name: /横轴为总成本，纵轴为预期误差限/ });
    const lines = [...chart.querySelectorAll("line")];
    const targetLine = lines.find(line => line.getAttribute("y1") === line.getAttribute("y2"))!;
    const budgetLine = lines.find(line => line.getAttribute("x1") === line.getAttribute("x2"))!;
    const budgetX = Number(budgetLine.getAttribute("x1"));
    const points = chart.querySelector("polyline")!.getAttribute("points")!.split(" ").map(point => point.split(",").map(Number));
    const rightIndex = points.findIndex(([x], i) => i > 0 && x! >= budgetX);
    const [leftX, leftY] = points[rightIndex - 1]!, [rightX, rightY] = points[rightIndex]!;
    const plottedY = leftY! + (rightY! - leftY!) * (budgetX - leftX!) / (rightX! - leftX!);
    const zeroY = Number(budgetLine.getAttribute("y2"));
    const plottedError = (zeroY - plottedY) / (zeroY - Number(targetLine.getAttribute("y1"))) * 5;
    expect(plottedError).toBeCloseTo(1.7621930616641295, 10);
    const rows = [...chart.parentElement!.querySelectorAll("tbody tr")].map(row => row.textContent);
    expect(rows).toContain("38310,745±5.00");
    expect(rows).toContain("300050,000±1.76");
});

test("invalid multivariable inputs cannot be applied, and corrected inputs produce a valid snapshot", () => {
    const onApply = mock((_payload: { variables: SurveyVariableSpec[]; recommendedSampleSize: number }) => {});
    const view = render(<MultiVariableSamplePlan populationSize={1000} onVariablesChange={() => {}} onApplyToPlan={onApply} />);
    fireEvent.click(view.getByRole("button", { name: "添加调查变量" }));
    const p = view.getByRole("spinbutton", { name: "估计比例 p（0-1）" });
    const margin = view.getByRole("spinbutton", { name: "允许误差" });
    const apply = view.getByRole("button", { name: "应用到样本量规划" }) as HTMLButtonElement;
    for (const value of ["2", "-1"]) {
        fireEvent.change(p, { target: { value } });
        expect(apply.disabled).toBe(true);
        expect(view.getByRole("alert").textContent).toContain("估计比例 p 必须在 0～1 之间");
        fireEvent.click(apply);
        expect(onApply).not.toHaveBeenCalled();
    }
    fireEvent.change(p, { target: { value: ".5" } });
    fireEvent.change(margin, { target: { value: "100" } });
    expect(apply.disabled).toBe(true);
    expect(view.getByRole("alert").textContent).toContain("误差限需大于 0 且小于 100%");
    fireEvent.change(margin, { target: { value: "5" } });
    expect(view.queryByRole("alert")).toBeNull();
    expect(apply.disabled).toBe(false);
    fireEvent.click(apply);
    const payload = onApply.mock.calls[0]![0];
    expect(payload.recommendedSampleSize).toBe(278);
    const plans = parseAdvancedPlans([{ version: 1, kind: "multivar", appliedAt: "2026-09-08T00:00:00Z",
        inputs: { variables: payload.variables }, result: { requiredSampleSize: payload.recommendedSampleSize } }]);
    expect(plans).not.toBeNull();
    expect(validateAdvancedPlanConsistency(plans![0]!, 1000, 278)).toBeNull();
});
