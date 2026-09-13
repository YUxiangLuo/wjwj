import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import type { QuestionnaireData } from "../api-client";
import { ImmersiveQuestionnairePreview } from "./ImmersiveQuestionnairePreview";

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
