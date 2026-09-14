import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";
import type { QuestionnaireData } from "../api-client";

const bootstrapDom = installDomGlobals();
const { cleanup, fireEvent, render } = await import("@testing-library/react");
const { ImmersiveQuestionnairePreview } = await import("./ImmersiveQuestionnairePreview");
bootstrapDom.restore();

let restoreDom: (() => void) | undefined;
beforeEach(() => { restoreDom = installDomGlobals("http://localhost/student").restore; });
afterEach(() => { cleanup(); restoreDom?.(); });

const questionnaire: QuestionnaireData = {
    title: "试填门控",
    welcomeText: "欢迎",
    endingText: "谢谢",
    questions: [
        { id: "first", type: "boolean", content: "第一题？" },
        { id: "last", type: "boolean", content: "最后一题？" },
    ],
};

test("numeric questions request explicit continuation before and after valid input", () => {
    const view = render(<ImmersiveQuestionnairePreview questionnaire={{ ...questionnaire, questions: [
        { id: "numeric", type: "numeric", content: "时长？", unit: "小时", numericMin: 0, numericMax: 10, decimalPlaces: 1 },
        questionnaire.questions[1]!,
    ] }} onComplete={() => {}} onClose={() => {}} />);
    fireEvent.click(view.getByTestId("immersive-preview-start"));
    expect(view.getByText("请输入符合范围和小数位要求的数值，确认后点击下方按钮或按 Enter 继续。")).toBeTruthy();
    expect(view.queryByText(/首次选择后自动继续/)).toBeNull();
    fireEvent.change(view.getByTestId("questionnaire-preview-numeric"), { target: { value: "10.0" } });
    expect(view.getByText("时长？")).toBeTruthy();
    expect(view.queryByText(/首次选择后自动继续/)).toBeNull();
    expect((view.getByTestId("immersive-preview-next") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(view.getByTestId("immersive-preview-next"));
    expect(view.getByText("最后一题？")).toBeTruthy();
});

test("skipping a question blocks completion until every answer is supplied", () => {
    const onComplete = mock(() => {});
    const view = render(<ImmersiveQuestionnairePreview questionnaire={questionnaire} onComplete={onComplete} onClose={() => {}} />);
    fireEvent.click(view.getByTestId("immersive-preview-start"));
    fireEvent.click(view.getByTitle("第 2 题"));
    fireEvent.click(view.getByText("是"));
    fireEvent.click(view.getByTestId("immersive-preview-next"));
    expect((view.getByTestId("immersive-preview-submit") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(view.getByTestId("immersive-preview-submit"));
    expect(onComplete).not.toHaveBeenCalled();

    fireEvent.click(view.getByText("返回未答题"));
    expect(view.getByText("第一题？")).toBeTruthy();
    fireEvent.click(view.getByText("否"));
    fireEvent.click(view.getByTestId("immersive-preview-next"));
    fireEvent.click(view.getByTestId("immersive-preview-next"));
    expect((view.getByTestId("immersive-preview-submit") as HTMLButtonElement).disabled).toBe(false);
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.click(view.getByTestId("immersive-preview-submit"));
    expect(onComplete).toHaveBeenCalledTimes(1);
});

test("multiple choice enforces both selection bounds and invalidates reordered answers", () => {
    const multiple: QuestionnaireData = { ...questionnaire, questions: [
        { id: "multi", type: "multiple", content: "选两项", options: ["甲", "乙", "丙"], minSelect: 2, maxSelect: 2 },
    ] };
    const view = render(<ImmersiveQuestionnairePreview questionnaire={multiple} onComplete={() => {}} onClose={() => {}} />);
    fireEvent.click(view.getByTestId("immersive-preview-start"));
    const next = view.getByTestId("immersive-preview-multiple-next") as HTMLButtonElement;
    fireEvent.click(view.getByText("甲"));
    expect(next.disabled).toBe(true);
    fireEvent.click(view.getByText("乙"));
    expect(next.disabled).toBe(false);
    expect((view.getByText("丙").closest("button") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(view.getByText("甲"));
    expect(next.disabled).toBe(true);
    view.rerender(<ImmersiveQuestionnairePreview questionnaire={{ ...multiple, questions: [
        { ...multiple.questions[0]!, options: ["乙", "甲", "丙"] },
    ] }} onComplete={() => {}} onClose={() => {}} />);
    expect(document.querySelectorAll('[data-preview-answer][aria-pressed="true"]').length).toBe(0);
});
