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

// Smoke coverage for the immersive planner: input validation, the learning
// gate, draft restoration, and final confirmation.

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
});

test("the required learning flow preserves final precision, validation, and confirmation", async () => {
    const { onComplete } = start();
    openDecision();
    const input = screen.getByRole("spinbutton", { name: "最终样本量" });
    fireEvent.change(input, { target: { value: "40.5" } });
    expect((screen.getByTestId("immersive-sp-decision-next") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: "40" } });
    fireEvent.click(screen.getByTestId("immersive-sp-decision-next"));
    expect(screen.queryByTestId("immersive-sp-next")).toBeNull();
    expect(screen.queryByRole("button", { name: /跳过/ })).toBeNull();
    completeQuiz();
    fireEvent.click(screen.getByTestId("immersive-sp-confirm"));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ finalSampleSize: 40, recommendedSize: 114 }));
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

test("wrong answers cannot unlock lessons and completed checks survive reopening", () => {
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
    answer("precision", 1);
    next();
    answer("error_tolerance", 0);
    next();
    const saved = first.onDraftChange.mock.calls.at(-1)![0];
    expect(saved.navigation.learning?.completed).toEqual(["precision", "error_tolerance"]);
    first.unmount();
    start({ initialDraft: saved });
    expect(screen.getByTestId("learning-check-subpopulation")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "允许多大的误差" }));
    const restored = within(screen.getByTestId("learning-check-error_tolerance"));
    expect(restored.getByText("已掌握")).toBeTruthy();
    expect(restored.queryByRole("button", { name: "检查答案" })).toBeNull();
    expect((screen.getByTestId("immersive-sp-next") as HTMLButtonElement).disabled).toBe(false);
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
