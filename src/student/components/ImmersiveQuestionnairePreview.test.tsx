import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";
import type { QuestionnaireData } from "../api-client";
import * as XLSX from "xlsx";
import { happinessQuestionnaire } from "../../db/seeds/happiness-topic";
import { buildHappinessWorkbook } from "../../db/seeds/happiness-materials";
import { createYouthHappinessPopulation } from "../../db/seeds/dogfood-fixtures";

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

test("the happiness leisure hint gives an accepted zero answer in both the questionnaire and downloadable brief", () => {
    const leisure = happinessQuestionnaire.questions.find(question => question.id === "hq13")!;
    const suggestedZero = /没有则填(\d+(?:\.\d+)?)/.exec(leisure.content)?.[1];
    expect(suggestedZero).toBeDefined();
    const workbook = XLSX.read(buildHappinessWorkbook(createYouthHappinessPopulation()), { type: "buffer" });
    const brief = XLSX.utils.sheet_to_json<{ 项目: string; 说明: string }>(workbook.Sheets["调查说明"]!);
    expect(brief.find(row => row.项目 === "推荐题8（numeric）")?.说明).toBe(leisure.content);
    const view = render(<ImmersiveQuestionnairePreview questionnaire={{ ...happinessQuestionnaire, questions: [leisure] }} onComplete={() => {}} onClose={() => {}} />);
    fireEvent.click(view.getByTestId("immersive-preview-start"));
    fireEvent.change(view.getByTestId("questionnaire-preview-numeric"), { target: { value: suggestedZero } });
    expect((view.getByTestId("immersive-preview-next") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(view.getByTestId("immersive-preview-next"));
    expect((view.getByTestId("immersive-preview-submit") as HTMLButtonElement).disabled).toBe(false);
});

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

// 数值预试边界：范围 −1.5～2.5、恰好 1 位小数。
test("numeric preview enforces inclusive bounds and exactly one decimal digit without rounding", () => {
    const numeric: QuestionnaireData = { ...questionnaire, questions: [
        { id: "numeric", type: "numeric", content: "温度？", unit: "℃", numericMin: -1.5, numericMax: 2.5, decimalPlaces: 1 },
        questionnaire.questions[1]!,
    ] };
    const view = render(<ImmersiveQuestionnairePreview questionnaire={numeric} onComplete={() => {}} onClose={() => {}} />);
    fireEvent.click(view.getByTestId("immersive-preview-start"));
    const input = view.getByTestId("questionnaire-preview-numeric") as HTMLInputElement;
    const next = view.getByTestId("immersive-preview-next") as HTMLButtonElement;

    const invalid = ["", " ", "-1.6", "0", "2.6", "1.00", "1.25", "-0.55"];
    for (const value of invalid) {
        fireEvent.change(input, { target: { value } });
        // 空值不得当成 0；位数不符不得静默舍入；越界不得放行
        expect(next.disabled).toBe(true);
        expect(view.getByText("温度？")).toBeTruthy();
    }
    for (const value of ["-1.5", "0.0", "2.5", "-0.5"]) {
        fireEvent.change(input, { target: { value } });
        expect(next.disabled).toBe(false);
    }
    // 合法值仍需明确点击，不会自动进入下一题
    expect(view.getByText("温度？")).toBeTruthy();
    fireEvent.click(next);
    expect(view.getByText("最后一题？")).toBeTruthy();
});

// 试填答案只存在于组件状态，不进入网络或问卷定义。
test("preview answers stay client-side and never mutate the questionnaire definition", () => {
    const originalFetch = globalThis.fetch;
    const fetchSpy = mock(() => { throw new Error("preview must not call the network"); });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    try {
        const definition: QuestionnaireData = { ...questionnaire, questions: [
            { id: "numeric", type: "numeric", content: "时长？", unit: "小时", numericMin: 0, numericMax: 10, decimalPlaces: 1 },
            { id: "last", type: "boolean", content: "最后一题？" },
        ] };
        const snapshot = JSON.stringify(definition);
        const onComplete = mock(() => {});
        const view = render(<ImmersiveQuestionnairePreview questionnaire={definition} onComplete={onComplete} onClose={() => {}} />);
        fireEvent.click(view.getByTestId("immersive-preview-start"));
        fireEvent.change(view.getByTestId("questionnaire-preview-numeric"), { target: { value: "3.5" } });
        fireEvent.click(view.getByTestId("immersive-preview-next"));
        fireEvent.click(view.getByText("是"));
        fireEvent.click(view.getByTestId("immersive-preview-next"));
        fireEvent.click(view.getByTestId("immersive-preview-submit"));
        expect(onComplete).toHaveBeenCalledTimes(1);
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(JSON.stringify(definition)).toBe(snapshot);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

// 提示承诺“按 Enter 继续”，键盘路径必须真的成立。
test("Enter continues a valid numeric answer and leaves invalid input untouched", () => {
    const view = render(<ImmersiveQuestionnairePreview questionnaire={{ ...questionnaire, questions: [
        { id: "numeric", type: "numeric", content: "时长？", unit: "小时", numericMin: 0, numericMax: 10, decimalPlaces: 1 },
        questionnaire.questions[1]!,
    ] }} onComplete={() => {}} onClose={() => {}} />);
    fireEvent.click(view.getByTestId("immersive-preview-start"));
    const input = view.getByTestId("questionnaire-preview-numeric");
    // 空值：Enter 不得前进
    fireEvent.keyDown(input, { key: "Enter" });
    expect(view.getByText("时长？")).toBeTruthy();
    // 小数位不符：Enter 不得前进，也不得吞掉输入
    fireEvent.change(input, { target: { value: "1.23" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(view.getByText("时长？")).toBeTruthy();
    expect((input as HTMLInputElement).value).toBe("1.23");
    // 合法值：Enter 明确前进
    fireEvent.change(input, { target: { value: "10.0" } });
    fireEvent.keyDown(input, { key: "Enter" });
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
