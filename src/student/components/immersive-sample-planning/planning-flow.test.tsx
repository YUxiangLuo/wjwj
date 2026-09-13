import { beforeEach, afterEach, expect, mock, test } from "bun:test";
import type { ComponentProps } from "react";
import type { SampleParams, SamplePlanningWizardDraft } from "./types";
import { installDomGlobals } from "@/test-utils/dom";
const initialDom = installDomGlobals();
const { cleanup, render, fireEvent, waitFor, within } = await import("@testing-library/react");
const { ImmersiveSamplePlanning } = await import("./index");
initialDom.restore();
let restore: () => void;
let screen: ReturnType<typeof render>;
beforeEach(() => { restore = installDomGlobals().restore; });
afterEach(() => { cleanup(); restore(); });

function start(options: Partial<ComponentProps<typeof ImmersiveSamplePlanning>> = {}) {
    const onComplete = mock((_params: SampleParams) => {});
    const onDraftChange = mock((_draft: SamplePlanningWizardDraft) => {});
    screen = render(<ImmersiveSamplePlanning populationSize={160} initialEstimationType="proportion" onClose={() => {}} {...options} onComplete={onComplete} onDraftChange={onDraftChange}/>);
    return { ...screen, onComplete, onDraftChange };
}
function editSize(value: string) { fireEvent.change(screen.getByRole("spinbutton", { name: "最终样本量" }), { target: { value } }); }
function next() { fireEvent.click(screen.getByTestId("immersive-sp-decision-next")); }

test("first visit opens a two-column editable plan with a single persistent primary action, no guessing or questions", () => {
    start();
    expect(screen.getByRole("dialog").parentElement).toBe(document.body);
    expect(screen.getByTestId("planning-workspace")).toBeTruthy();
    expect(screen.getByRole("spinbutton", { name: "最终样本量" }).getAttribute("value")).toBe("114");
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "检查答案" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "样本量规划步骤" })).toBeNull();
    expect(within(screen.getByTestId("planning-actions")).getByRole("button", { name: "检查并确认方案" })).toBeTruthy();
});

test("final count rejects blank, out-of-frame and fractional values without truncation", () => {
    const { onComplete } = start();
    for (const value of ["", "0", "161", "40.5"]) {
        editSize(value);
        expect((screen.getByTestId("immersive-sp-decision-next") as HTMLButtonElement).disabled).toBe(true);
        next();
        expect(screen.queryByTestId("immersive-sp-confirm")).toBeNull();
        expect(screen.getByText("请输入 1～160 之间的整数")).toBeTruthy();
    }
    expect(onComplete).not.toHaveBeenCalled();
});

test("valid below-target plan proceeds directly to review and submits the reviewed snapshot once", async () => {
    const { onComplete } = start();
    editSize("40");
    next();
    expect(screen.getByText("预计未达到目标")).toBeTruthy();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    fireEvent.click(screen.getByTestId("immersive-sp-confirm"));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ finalSampleSize: 40, recommendedSize: 114 }));
});

test("required stratification still enforces its minimum and census still explains comparison limits", () => {
    start({ minimumSampleSize: 4 });
    editSize("3");
    expect((screen.getByTestId("immersive-sp-decision-next") as HTMLButtonElement).disabled).toBe(true);
    editSize("160");
    expect(screen.getByTestId("planning-outcome").textContent).toContain("完整普查");
    expect((screen.getByTestId("immersive-sp-decision-next") as HTMLButtonElement).disabled).toBe(false);
});

test("parameter edits follow recommendations until a manual override, and adopting the suggestion restores following", () => {
    const { onDraftChange } = start();
    const error = screen.getByRole("spinbutton", { name: "比例估计允许误差" });
    fireEvent.change(error, { target: { value: "2.5" } });
    let last = onDraftChange.mock.calls.at(-1)![0];
    expect(last.finalSampleSize).toBeGreaterThan(114);
    editSize("40");
    fireEvent.change(error, { target: { value: "5" } });
    expect(onDraftChange.mock.calls.at(-1)![0].finalSampleSize).toBe(40);
    fireEvent.click(screen.getByRole("button", { name: "采用建议值" }));
    last = onDraftChange.mock.calls.at(-1)![0];
    expect(last.finalSampleSize).toBe(114);
    expect(last.userTouchedFinal).toBe(false);
});

test("mean parameters keep absolute units and invalid temporary edits cannot save or erase the chosen size", () => {
    const { onDraftChange } = start({ initialEstimationType: "mean", initialPopulationVariance: 100, initialMarginOfError: 2, initialFinalSampleSize: 80 });
    expect(screen.getByTestId("planning-outcome").textContent).not.toContain("个百分点");
    const error = screen.getByRole("spinbutton", { name: "绝对误差限" });
    fireEvent.change(error, { target: { value: "" } });
    expect(onDraftChange.mock.calls.at(-1)![0].finalSampleSize).toBe(80);
    expect((screen.getByTestId("immersive-sp-decision-next") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(error, { target: { value: "0.1" } });
    expect((screen.getByTestId("immersive-sp-decision-next") as HTMLButtonElement).disabled).toBe(false);
});

test("optional principles are freely browsable and examples do not alter the real plan", () => {
    const { onDraftChange } = start();
    editSize("80");
    const original = onDraftChange.mock.calls.at(-1)![0];
    fireEvent.click(screen.getByRole("button", { name: "计算依据与原理" }));
    expect(screen.getByText("n₂ = n₁ × N / (N − 1 + n₁)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "影响因素" }));
    const choices = within(screen.getByRole("group", { name: "选择影响因素" }));
    expect(choices.getAllByRole("button").every(button => !(button as HTMLButtonElement).disabled)).toBe(true);
    fireEvent.click(choices.getByRole("button", { name: "允许多大的误差" }));
    fireEvent.click(screen.getByRole("button", { name: "±1%" }));
    fireEvent.click(screen.getByRole("button", { name: "返回调整" }));
    expect(onDraftChange.mock.calls.at(-1)![0]).toEqual(original);
    next();
    expect(screen.getByTestId("immersive-sp-confirm")).toBeTruthy();
});

test("reopening a saved plan retains its chosen count and displayed precision", () => {
    const first = start();
    editSize("80");
    const draft = first.onDraftChange.mock.calls.at(-1)![0];
    first.unmount();
    start({ initialDraft: draft });
    expect((screen.getByRole("spinbutton", { name: "最终样本量" }) as HTMLInputElement).value).toBe("80");
    expect(screen.getByTestId("planning-outcome").textContent).toContain("±7.77 个百分点");
});

test("unsupported navigation cannot jump straight to confirmation or auto-submit", () => {
    const first = start();
    editSize("80");
    const draft = first.onDraftChange.mock.calls.at(-1)![0];
    draft.navigation = { phase: { type: "quiz" } } as any;
    first.unmount();
    const restored = start({ initialDraft: draft });
    expect(restored.onComplete).not.toHaveBeenCalled();
    expect(screen.queryByTestId("immersive-sp-confirm")).toBeNull();
    expect(restored.onDraftChange.mock.calls.at(-1)![0]).toMatchObject({ finalSampleSize: 80, navigation: { phase: { type: "decision" } } });
    next(); expect(screen.getByTestId("immersive-sp-confirm")).toBeTruthy();
});

test("cross-tab draft conflicts still block progression and final submission", () => {
    const first = start();
    next();
    const draft = first.onDraftChange.mock.calls.at(-1)![0];
    first.unmount();
    const { onComplete } = start({ initialDraft: draft, draftSaveStatus: "conflict" });
    const confirm = screen.getByTestId("immersive-sp-confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(confirm);
    expect(onComplete).not.toHaveBeenCalled();
});

test("saved advanced plans survive review and an explicitly cleared draft source stays cleared", async () => {
    const snapshot: NonNullable<SampleParams["advancedPlans"]>[number] = {
        version: 1, kind: "cost", appliedAt: "2026-09-01T00:00:00Z",
        inputs: { confidenceLevel: "95", targetMarginOfError: 5, designEffect: 1, nonResponseRate: 0, fixedCost: 0, variableCostPerUnit: 10, totalBudget: 10000 },
        result: { requiredSampleSize: 114, totalCost: 1140, feasible: true },
    };
    const first = start({ initialAdvancedPlanSource: "cost", initialAdvancedPlans: [snapshot] });
    next();
    fireEvent.click(screen.getByTestId("immersive-sp-confirm"));
    await waitFor(() => expect(first.onComplete).toHaveBeenCalledWith(expect.objectContaining({ advancedPlanSource: "cost", advancedPlans: [snapshot] })));
    const draft = first.onDraftChange.mock.calls.at(-1)![0];
    draft.advancedPlanSource = null;
    draft.navigation = { phase: { type: "decision" } };
    first.unmount();
    const restored = start({ initialDraft: draft, initialAdvancedPlanSource: "cost", initialAdvancedPlans: [snapshot] });
    expect(restored.onDraftChange.mock.calls.at(-1)![0].advancedPlanSource).toBeNull();
    expect(restored.onDraftChange.mock.calls.at(-1)![0].advancedPlans).toEqual([snapshot]);
});

test("exiting keeps draft changes and asks before closing", () => {
    const onClose = mock(() => {});
    const { onDraftChange } = start({ onClose, draftSaveStatus: "saved" });
    editSize("80");
    fireEvent.click(screen.getByTestId("immersive-sp-close"));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog").textContent).toContain("当前参数已保存到本机");
    fireEvent.click(screen.getByRole("button", { name: "确定退出" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onDraftChange.mock.calls.at(-1)![0].finalSampleSize).toBe(80);
});
