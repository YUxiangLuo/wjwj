import { beforeEach, afterEach, expect, mock, test } from "bun:test";
import type { ComponentProps } from "react";
import type { SampleParams } from "./types";
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

test("the required learning flow preserves final precision, validation, and confirmation", async () => {
    const { onComplete, onDraftChange } = start();
    openDecision();
    const input = screen.getByRole("spinbutton", { name: "最终样本量" });
    fireEvent.change(input, { target: { value: "40.5" } });
    expect((screen.getByTestId("immersive-sp-decision-next") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: "40" } });
    expect(screen.getByTestId("planning-outcome").textContent).toContain("±13.46 个百分点");
    expect(screen.getByTestId("planning-outcome").textContent).toContain("预计未达到目标");
    fireEvent.click(screen.getByTestId("immersive-sp-decision-next"));
    // Neither the footer nor a skip action can bypass the three understanding checks.
    expect(screen.queryByTestId("immersive-sp-next")).toBeNull();
    expect(screen.queryByRole("button", { name: /跳过/ })).toBeNull();
    completeQuiz();
    expect(screen.getByTestId("planning-outcome").textContent).toContain("±13.46 个百分点");
    fireEvent.click(screen.getByTestId("immersive-sp-confirm"));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ finalSampleSize: 40, recommendedSize: 114 }));
    expect(onDraftChange).toHaveBeenCalledWith(expect.objectContaining({ navigation: expect.objectContaining({ challenge: { guess: null, revealed: true } }) }));
});

test("reopening a saved wizard restores the chosen count and its unmet precision", () => {
    const { onDraftChange, unmount } = start();
    openDecision();
    fireEvent.change(screen.getByRole("spinbutton", { name: "最终样本量" }), { target: { value: "80" } });
    const saved = onDraftChange.mock.calls.at(-1)![0];
    unmount();
    screen = render(<ImmersiveSamplePlanning populationSize={160} initialDraft={saved} onComplete={() => {}} onClose={() => {}}/>);
    expect((screen.getByRole("spinbutton", { name: "最终样本量" }) as HTMLInputElement).value).toBe("80");
    expect(screen.getByTestId("planning-outcome").textContent).toContain("±7.77 个百分点");
});

function openDecision() {
    fireEvent.click(screen.getByRole("button", { name: "暂不估计，直接查看建议" }));
    expect(screen.queryByRole("button", { name: "已了解，直接调整方案" })).toBeNull();
    next();
    answer("precision", 1);
    next();
    for (const [id, choice] of [["error_tolerance", 0], ["subpopulation", 2], ["variability", 1], ["design_effect", 2], ["non_response", 0], ["cost_balance", 1]] as const) {
        answer(id, choice);
        next();
    }
    next(); // six-factor summary
    answer("calculation", 2);
    next();
}

function next() {
    const button = screen.getByTestId("immersive-sp-next") as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
}

function answer(id: string, choice: number) {
    const check = within(screen.getByTestId(`learning-check-${id}`));
    fireEvent.click(check.getAllByRole("radio")[choice]!);
    fireEvent.click(check.getByRole("button", { name: "检查答案" }));
    expect(check.getByRole("status").textContent).toContain("理解正确");
}

function completeQuiz() {
    for (const [id, choice] of [["quiz_se", 0], ["quiz_population", 1], ["quiz_design", 0]] as const) {
        const next = screen.getByTestId("immersive-sp-quiz-next") as HTMLButtonElement;
        expect(next.disabled).toBe(true);
        fireEvent.click(next);
        expect(screen.queryByTestId("immersive-sp-confirm")).toBeNull();
        answer(id, choice);
        expect(next.disabled).toBe(false);
        fireEvent.click(next);
    }
}

function openSensitivity() {
    fireEvent.click(screen.getByText("比较其他精度方案（点击即可采用）"));
}

test("wrong answers cannot unlock lessons, and completed checks survive closing and restoring the draft", () => {
    const first = start();
    fireEvent.click(screen.getByRole("button", { name: "暂不估计，直接查看建议" }));
    next();
    const check = within(screen.getByTestId("learning-check-precision"));
    const forward = screen.getByTestId("immersive-sp-next") as HTMLButtonElement;
    expect(forward.disabled).toBe(true);
    fireEvent.click(check.getAllByRole("radio")[0]!);
    fireEvent.click(check.getByRole("button", { name: "检查答案" }));
    expect(check.getByRole("status").textContent).toContain("再想一想");
    expect(forward.disabled).toBe(true);
    fireEvent.click(forward);
    expect(screen.getByTestId("learning-check-precision")).toBeTruthy();
    const decision = screen.getByRole("button", { name: /调整方案 选择实际采用/ }) as HTMLButtonElement;
    expect(decision.disabled).toBe(true);
    fireEvent.click(decision);
    expect(screen.queryByTestId("immersive-sp-final-size")).toBeNull();
    answer("precision", 1);
    next();
    expect((screen.getByRole("button", { name: "六因素汇总" }) as HTMLButtonElement).disabled).toBe(true);
    answer("error_tolerance", 0);
    next();
    const saved = first.onDraftChange.mock.calls.at(-1)![0];
    expect(saved.navigation.learning?.completed).toEqual(["precision", "error_tolerance"]);
    first.unmount();
    start({ initialDraft: saved });
    expect(screen.getByTestId("learning-check-subpopulation")).toBeTruthy();
    expect((screen.getByTestId("immersive-sp-next") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "允许多大的误差" }));
    const restored = within(screen.getByTestId("learning-check-error_tolerance"));
    expect(restored.getByText("已掌握")).toBeTruthy();
    expect(restored.queryByRole("button", { name: "检查答案" })).toBeNull();
    expect((screen.getByTestId("immersive-sp-next") as HTMLButtonElement).disabled).toBe(false);
});

test("legacy confirmation drafts retain the selected count but require unfinished learning", () => {
    const first = start({ initialFinalSampleSize: 40 });
    const saved = first.onDraftChange.mock.calls.at(-1)![0];
    first.unmount();
    const resumed = start({ initialDraft: { ...saved, navigation: {
        phase: { type: "confirm" }, challenge: { guess: 40, revealed: true },
    } } });
    expect(screen.getByTestId("learning-check-precision")).toBeTruthy();
    expect(screen.queryByTestId("immersive-sp-confirm")).toBeNull();
    expect(resumed.onComplete).not.toHaveBeenCalled();
    expect(resumed.onDraftChange.mock.calls.at(-1)![0].finalSampleSize).toBe(40);
});

test("incorrect quiz answers cannot advance or turn into completed answers after reopening", () => {
    const first = start();
    openDecision();
    fireEvent.click(screen.getByTestId("immersive-sp-decision-next"));
    const check = within(screen.getByTestId("learning-check-quiz_se"));
    fireEvent.click(check.getAllByRole("radio")[1]!);
    fireEvent.click(check.getByRole("button", { name: "检查答案" }));
    expect((screen.getByTestId("immersive-sp-quiz-next") as HTMLButtonElement).disabled).toBe(true);
    const saved = first.onDraftChange.mock.calls.at(-1)![0];
    first.unmount();
    start({ initialDraft: saved });
    expect((screen.getByTestId("immersive-sp-quiz-next") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId("immersive-sp-confirm")).toBeNull();
    answer("quiz_se", 0);
    fireEvent.click(screen.getByTestId("immersive-sp-quiz-next"));
    fireEvent.click(screen.getByRole("button", { name: "上一步" }));
    expect(within(screen.getByTestId("learning-check-quiz_se")).getByText("已掌握")).toBeTruthy();
    expect((screen.getByTestId("immersive-sp-quiz-next") as HTMLButtonElement).disabled).toBe(false);
});

async function confirmPlan(onComplete: ReturnType<typeof start>["onComplete"]) {
    fireEvent.click(screen.getByTestId("immersive-sp-decision-next"));
    completeQuiz();
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
