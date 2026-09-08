import { beforeEach, afterEach, expect, mock, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";
const initialDom = installDomGlobals();
const { cleanup, render, fireEvent, waitFor } = await import("@testing-library/react");
const { ImmersiveSamplePlanning } = await import("./index");
initialDom.restore();
let restore: () => void;
let screen: ReturnType<typeof render>;
beforeEach(() => { restore = installDomGlobals().restore; });
afterEach(() => { cleanup(); restore(); });

function start() {
    const onComplete = mock(() => {});
    const onDraftChange = mock((_draft: import("./types").SamplePlanningWizardDraft) => {});
    const view = render(<ImmersiveSamplePlanning populationSize={160} initialEstimationType="proportion" onClose={() => {}} onComplete={onComplete} onDraftChange={onDraftChange}/>);
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
