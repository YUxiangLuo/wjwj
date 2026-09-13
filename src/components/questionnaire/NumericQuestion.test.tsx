import { beforeEach, afterEach, expect, mock, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";
import { parseRecommendQuestionFromPayload } from "@/lib/validate-question";
const bootstrap = installDomGlobals();
const { render, fireEvent, cleanup } = await import("@testing-library/react");
const { QuestionEditor } = await import("./QuestionEditor");
const { NumericQuestionSummary } = await import("./NumericQuestionSummary");
bootstrap.restore(); let restore: () => void;
beforeEach(() => { restore = installDomGlobals().restore; });
afterEach(async () => { cleanup(); await new Promise(r => setTimeout(r, 0)); restore(); });
test("numeric question creation is separate from scale and saves explicit rules without options", () => {
    const save = mock((_q: any) => {});
    const view = render(<QuestionEditor open onOpenChange={() => {}} onSave={save} />);
    fireEvent.mouseDown(view.getByTestId("student-question-type-numeric"), { button: 0, ctrlKey: false });
    fireEvent.change(view.getByTestId("student-question-content"), { target: { value: "等候多少分钟？" } });
    fireEvent.change(view.getByTestId("question-number-unit"), { target: { value: "分钟" } });
    fireEvent.change(view.getByTestId("question-number-min"), { target: { value: "0" } });
    fireEvent.change(view.getByTestId("question-number-max"), { target: { value: "300.5" } });
    fireEvent.change(view.getByLabelText("最多小数位"), { target: { value: "1" } });
    fireEvent.click(view.getByTestId("student-question-save"));
    const q = save.mock.calls[0]![0];
    expect(q).toMatchObject({ type: "numeric", numberRule: { unit: "分钟", min: 0, max: 300.5, decimalPlaces: 1 } });
    expect(q).not.toHaveProperty("options"); expect(q).not.toHaveProperty("scaleMin"); expect(q).not.toHaveProperty("optionIds");
    expect(parseRecommendQuestionFromPayload(q, 1)).toEqual(q);
});
test("invalid numeric bounds stay visible and prevent save, not rounded or clamped", () => {
    const save = mock(() => {});
    const view = render(<QuestionEditor open onOpenChange={() => {}} onSave={save} question={{ id: "n", type: "numeric", content: "数值？", numberRule: { unit: "元", min: 0, max: 100, decimalPlaces: 2 } }} />);
    const min = view.getByTestId("question-number-min") as HTMLInputElement;
    for (const value of ["100", "101", "0.001", "0.10000000000000001", "NaN"]) {
        fireEvent.change(min, { target: { value } }); expect(min.value).toBe(value);
        expect((view.getByTestId("student-question-save") as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(view.getByTestId("student-question-save")); expect(save).not.toHaveBeenCalled();
    }
    fireEvent.change(min, { target: { value: "" } });
    expect((view.getByTestId("student-question-save") as HTMLButtonElement).disabled).toBe(false);
});
test("readonly numeric rules never become a score or silently get default bounds", () => {
    const view = render(<NumericQuestionSummary question={{ id: "q", type: "numeric", content: "值？", numberRule: { unit: "分钟", min: 0, max: null, decimalPlaces: 0 } }} />);
    expect(view.container.textContent).toContain("仅整数"); expect(view.container.textContent).toContain("不限上限");
    view.rerender(<NumericQuestionSummary question={{ id: "q", type: "numeric", content: "值？" }} />);
    expect(view.getByRole("alert").textContent).toContain("规则无效");
});
