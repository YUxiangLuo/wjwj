import { beforeEach, afterEach, expect, mock, test } from "bun:test";
import type { ComponentProps } from "react";
import type { SampleParams } from "./types";
import { installDomGlobals } from "@/test-utils/dom";
const initialDom = installDomGlobals();
const { cleanup, render, fireEvent, waitFor } = await import("@testing-library/react");
const { ImmersiveSamplePlanning } = await import("./index");
initialDom.restore();
let restore: () => void;
let screen: ReturnType<typeof render>;
beforeEach(() => { restore = installDomGlobals().restore; });
afterEach(() => { cleanup(); restore(); });

function start(options: Partial<ComponentProps<typeof ImmersiveSamplePlanning>> = {}) {
    const onComplete = mock((_params: SampleParams) => {});
    const onDraftChange = mock((_draft: import("./types").SamplePlanningWizardDraft) => {});
    const view = render(<ImmersiveSamplePlanning populationSize={160} initialEstimationType="proportion" {...options} onClose={() => {}} onComplete={onComplete} onDraftChange={onDraftChange}/>);
    screen = view;
    return { ...view, onComplete, onDraftChange };
}

test("initial form explains precision before guessing and rejects invalid integers without truncation", () => {
    start();
    const dialog = screen.getByRole("dialog");
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog.textContent).toContain("±5 个百分点");
    const input = screen.getByRole("spinbutton", { name: "你准备调查多少个单位？" });
    for (const value of ["", "0", "161", "40.5"]) {
        fireEvent.change(input, { target: { value } });
        fireEvent.click(screen.getByTestId("immersive-sp-guess-submit"));
        expect(screen.getByRole("alert").textContent).toContain("之间的整数");
        expect(screen.queryByText("当前条件下的参考方案")).toBeNull();
    }
    fireEvent.change(input, { target: { value: "80" } });
    fireEvent.submit(input.closest("form")!);
    expect(screen.getByText("预计未达到目标")).toBeTruthy();
    expect(screen.getByText("±7.77 个百分点")).toBeTruthy();
    expect(screen.queryByText("很接近！你的直觉不错。")).toBeNull();
});

test("skipped guesses, live final precision, validation, and confirmation survive the complete planning flow", async () => {
    const { onComplete, onDraftChange } = start();
    fireEvent.click(screen.getByRole("button", { name: "暂不估计，直接查看建议" }));
    fireEvent.click(screen.getByRole("button", { name: "已了解，直接调整方案" }));
    const input = screen.getByRole("spinbutton", { name: "最终样本量" });
    fireEvent.change(input, { target: { value: "40.5" } });
    expect((screen.getByTestId("immersive-sp-decision-next") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: "40" } });
    expect(screen.getByTestId("planning-outcome").textContent).toContain("±13.46 个百分点");
    expect(screen.getByTestId("planning-outcome").textContent).toContain("预计未达到目标");
    fireEvent.click(screen.getByTestId("immersive-sp-decision-next"));
    // The optional quiz has its own answer/skip actions, no generic next bypass.
    expect(screen.queryByTestId("immersive-sp-next")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "跳过，直接去确认" }));
    expect(screen.getByTestId("planning-outcome").textContent).toContain("±13.46 个百分点");
    fireEvent.click(screen.getByTestId("immersive-sp-confirm"));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ finalSampleSize: 40, recommendedSize: 114 }));
    expect(onDraftChange).toHaveBeenCalledWith(expect.objectContaining({ navigation: expect.objectContaining({ challenge: { guess: null, revealed: true } }) }));
});

test("reopening a saved wizard restores the chosen count and its unmet precision", () => {
    const { onDraftChange, unmount } = start();
    fireEvent.click(screen.getByRole("button", { name: "暂不估计，直接查看建议" }));
    fireEvent.click(screen.getByRole("button", { name: "已了解，直接调整方案" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "最终样本量" }), { target: { value: "80" } });
    const saved = onDraftChange.mock.calls.at(-1)![0];
    unmount();
    screen = render(<ImmersiveSamplePlanning populationSize={160} initialDraft={saved} onComplete={() => {}} onClose={() => {}}/>);
    expect((screen.getByRole("spinbutton", { name: "最终样本量" }) as HTMLInputElement).value).toBe("80");
    expect(screen.getByTestId("planning-outcome").textContent).toContain("±7.77 个百分点");
});

function openDecision() {
    fireEvent.click(screen.getByRole("button", { name: "暂不估计，直接查看建议" }));
    fireEvent.click(screen.getByRole("button", { name: "已了解，直接调整方案" }));
}

function openSensitivity() {
    fireEvent.click(screen.getByText("比较其他精度方案（点击即可采用）"));
}

async function confirmPlan(onComplete: ReturnType<typeof start>["onComplete"]) {
    fireEvent.click(screen.getByTestId("immersive-sp-decision-next"));
    fireEvent.click(screen.getByRole("button", { name: "跳过，直接去确认" }));
    fireEvent.click(screen.getByTestId("immersive-sp-confirm"));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    return onComplete.mock.calls[0]![0];
}

test.each(["edited", "previously saved"] as const)("adopting a sensitivity plan replaces the %s count in the draft and confirmed plan", async (source) => {
    const { onComplete, onDraftChange } = start(source === "previously saved" ? { initialFinalSampleSize: 40 } : {});
    openDecision();
    if (source === "edited") fireEvent.change(screen.getByTestId("immersive-sp-final-size"), { target: { value: "40" } });
    openSensitivity();
    fireEvent.click(screen.getByRole("button", { name: "采用 95% 置信、误差 1 个百分点的方案：158 个单位" }));
    expect((screen.getByTestId("immersive-sp-final-size") as HTMLInputElement).value).toBe("158");
    expect(screen.getByTestId("planning-outcome").textContent).toContain("预计达到目标");
    expect(onDraftChange.mock.calls.at(-1)![0]).toMatchObject({ confidenceLevel: "95", marginOfError: 1, finalSampleSize: 158 });
    expect(await confirmPlan(onComplete)).toMatchObject({ confidenceLevel: "95", marginOfError: 1, recommendedSize: 158, finalSampleSize: 158 });
});

test("adopting a preset from a restored wizard clears the advanced source and preserves the adopted count on reopening", () => {
    const original = start({ initialFinalSampleSize: 40, initialAdvancedPlanSource: "cost" });
    openDecision();
    const saved = original.onDraftChange.mock.calls.at(-1)![0];
    original.unmount();
    const resumed = start({ initialDraft: saved });
    openSensitivity();
    fireEvent.click(screen.getByRole("button", { name: "采用 90% 置信、误差 10 个百分点的方案：48 个单位" }));
    const adopted = resumed.onDraftChange.mock.calls.at(-1)![0];
    expect(adopted).toMatchObject({ confidenceLevel: "90", marginOfError: 10, finalSampleSize: 48, advancedPlanSource: null });
    resumed.unmount();
    start({ initialDraft: adopted });
    expect((screen.getByTestId("immersive-sp-final-size") as HTMLInputElement).value).toBe("48");
    expect(screen.queryByText(/当前最终样本量正在使用高级工具/)).toBeNull();
});

test.each([
    { confidence: "90", margin: 10, count: 99 },
    { confidence: "95", margin: 1, count: 160 },
])("preset $confidence% / $margin uses current design and response assumptions and caps at N", async ({ confidence, margin, count }) => {
    const { onComplete } = start({ initialFinalSampleSize: 40, initialDesignEffect: 2, initialNonResponseRate: 0.25 });
    openDecision();
    openSensitivity();
    fireEvent.click(screen.getByRole("button", { name: `采用 ${confidence}% 置信、误差 ${margin} 个百分点的方案：${count} 个单位` }));
    expect((screen.getByTestId("immersive-sp-final-size") as HTMLInputElement).value).toBe(String(count));
    expect(await confirmPlan(onComplete)).toMatchObject({ confidenceLevel: confidence, marginOfError: margin, designEffect: 2, nonResponseRate: 0.25, recommendedSize: count, finalSampleSize: count });
});

test("preset labels and adopted counts respect the required stratification minimum without changing the formula recommendation", async () => {
    const { onComplete } = start({ minimumSampleSize: 100, initialFinalSampleSize: 130 });
    openDecision();
    openSensitivity();
    const preset = screen.getByRole("button", { name: "采用 90% 置信、误差 10 个百分点的方案：100 个单位" });
    expect(preset.textContent).toBe("100");
    fireEvent.click(preset);
    expect((screen.getByTestId("immersive-sp-final-size") as HTMLInputElement).value).toBe("100");
    expect(await confirmPlan(onComplete)).toMatchObject({ confidenceLevel: "90", marginOfError: 10, recommendedSize: 48, finalSampleSize: 100 });
});

test.each([
    { kind: "proportion" as const, recommended: 114, error: "±13.46 个百分点" },
    { kind: "mean" as const, recommended: 61, error: "±2.69" },
])("advanced $kind metrics identify the recommended plan and disclose a differing actual count", ({ kind, recommended, error }) => {
    start({ initialEstimationType: kind, initialFinalSampleSize: 40 });
    openDecision();
    expect(screen.getByTestId("planning-outcome").textContent).toContain(error);
    fireEvent.click(screen.getByText("高级工具（可选）"));
    fireEvent.click(screen.getByRole("button", { name: "SE/CV/敏感性" }));
    const dialog = document.querySelector('[data-slot="dialog-content"]')!;
    expect(dialog.textContent).toContain(`您选择的最终样本量 (40) 与公式推荐值 (${recommended}) 不同`);
    expect(dialog.textContent).toContain("常规推荐方案的精度");
    expect(dialog.textContent).toContain(`按公式推荐邀请数 n = ${recommended} 计算`);
    expect(dialog.textContent).not.toContain("当前样本量下的理论区间半宽");
});

test("advanced metrics do not warn when the chosen count matches the recommendation", () => {
    start({ initialFinalSampleSize: 114 });
    openDecision();
    fireEvent.click(screen.getByText("高级工具（可选）"));
    fireEvent.click(screen.getByRole("button", { name: "SE/CV/敏感性" }));
    const dialog = document.querySelector('[data-slot="dialog-content"]')!;
    expect(dialog.textContent).toContain("常规推荐方案的精度");
    expect(dialog.textContent).not.toContain("您选择的最终样本量");
});
