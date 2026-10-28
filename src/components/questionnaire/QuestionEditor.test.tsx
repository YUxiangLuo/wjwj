import { beforeEach, afterEach, expect, mock, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";
import type { Question } from "@/lib/questionnaire-types";
import { questionSignature } from "@/domain/variables/question-binding";
import { happinessQuestionnaire } from "@/db/seeds/happiness-topic";
const bootstrap = installDomGlobals();
const { cleanup, render, fireEvent } = await import("@testing-library/react");
const { QuestionEditor } = await import("./QuestionEditor");
bootstrap.restore();
let restore: () => void;
beforeEach(() => { restore = installDomGlobals().restore; });
afterEach(async () => { cleanup(); await new Promise(resolve => setTimeout(resolve, 0)); restore(); });

for (const [question, field, value] of [
    [{ id: "single", type: "single", content: "选择", options: ["甲", "乙"] }, "option-2", ""],
    [{ id: "multiple", type: "multiple", content: "选择", options: ["甲", "乙", "丙"], maxSelect: 3 }, "max-select", "2"],
    [{ id: "scale", type: "scale", content: "评分" }, "scale-min-label", "不满意"],
    [{ id: "numeric", type: "numeric", content: "时长", numericMin: 0 }, "numeric-min", "-2"],
    [{ id: "boolean", type: "boolean", content: "是否参加" }, "content", "是否愿意参加"],
] as [Question, string, string][]) {
    test(`${question.type}: dismissing discard keeps raw input; accepting closes without saving`, () => {
        const close = mock(() => {});
        const save = mock(() => {});
        const confirm = mock(() => false);
        window.confirm = confirm;
        const view = render(<QuestionEditor open question={question} onOpenChange={close} onSave={save} />);
        const input = view.getByTestId(`student-question-${field}`) as HTMLInputElement;
        fireEvent.change(input, { target: { value } });
        fireEvent.click(view.getByTestId("student-question-cancel"));
        expect(confirm).toHaveBeenCalledTimes(1);
        expect(close).not.toHaveBeenCalled();
        expect(input.value).toBe(value);
        confirm.mockReturnValue(true);
        fireEvent.click(view.getByRole("button", { name: "关闭" }));
        expect(close).toHaveBeenCalledWith(false);
        expect(save).not.toHaveBeenCalled();
    });
}

test("reverting edits removes unload protection and closes without confirmation", () => {
    const question: Question = { id: "q", type: "numeric", content: "时长", numericMin: 0 };
    const close = mock(() => {});
    window.confirm = mock(() => false);
    const view = render(<QuestionEditor open question={question} onOpenChange={close} onSave={() => {}} />);
    const input = view.getByTestId("student-question-numeric-min");
    fireEvent.change(input, { target: { value: "" } });
    const dirtyUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirtyUnload);
    expect(dirtyUnload.defaultPrevented).toBe(true);
    fireEvent.change(input, { target: { value: "0" } });
    const cleanUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(cleanUnload);
    expect(cleanUnload.defaultPrevented).toBe(false);
    fireEvent.click(view.getByTestId("student-question-cancel"));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledWith(false);
});

test("saving bypasses discard confirmation; reopening a new question resets its draft", () => {
    const close = mock(() => {});
    const save = mock(() => {});
    window.confirm = mock(() => false);
    const props = { onOpenChange: close, onSave: save };
    const view = render(<QuestionEditor open {...props} />);
    fireEvent.change(view.getByTestId("student-question-content"), { target: { value: "选择饮料" } });
    fireEvent.change(view.getByTestId("student-question-option-1"), { target: { value: "茶" } });
    fireEvent.change(view.getByTestId("student-question-option-2"), { target: { value: "水" } });
    fireEvent.click(view.getByTestId("student-question-save"));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ content: "选择饮料", options: ["茶", "水"] }));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledWith(false);
    view.rerender(<QuestionEditor open={false} {...props} />);
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(false);
    view.rerender(<QuestionEditor open {...props} />);
    expect((view.getByTestId("student-question-content") as HTMLTextAreaElement).value).toBe("");
    fireEvent.click(view.getByTestId("student-question-cancel"));
    expect(window.confirm).not.toHaveBeenCalled();
});

test("mathematically different option labels remain editable and saveable", () => {
    const save = mock(() => {});
    const view = render(<QuestionEditor open onOpenChange={() => {}} onSave={save} question={{ id: "math", type: "single", content: "选择数量", options: ["10²", "102"] }} />);
    expect(view.queryByRole("alert")).toBeNull();
    expect((view.getByTestId("student-question-save") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(view.getByTestId("student-question-save"));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ options: ["10²", "102"] }));
});

for (const type of ["single", "multiple"] as const) {
    test(`${type}: duplicates are explained, preserved for correction, and cannot be saved`, () => {
        const save = mock(() => {});
        const view = render(<QuestionEditor open onOpenChange={() => {}} onSave={save} question={{ id: "q", type, content: "选择", options: ["同一选项", " 同一选项 "], minSelect: 1, maxSelect: 2 }} />);
        const button = view.getByTestId("student-question-save") as HTMLButtonElement;
        const input = view.getByTestId("student-question-option-2") as HTMLInputElement;
        expect(button.disabled).toBe(true);
        expect(view.getByRole("alert").textContent).toContain("第 1、2 个选项内容重复");
        expect(view.getByRole("alert").compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(input.value).toBe(" 同一选项 ");
        expect(input.getAttribute("aria-invalid")).toBe("true");
        fireEvent.click(button);
        expect(save).not.toHaveBeenCalled();
        fireEvent.change(input, { target: { value: "另一个选项" } });
        expect(button.disabled).toBe(false);
        expect(view.queryByRole("alert")).toBeNull();
        fireEvent.click(button);
        expect(save).toHaveBeenCalledWith(expect.objectContaining({ options: ["同一选项", "另一个选项"] }));
    });
}

function boundServiceQuestion(): Question {
    const question = structuredClone(happinessQuestionnaire.questions.find(item => item.id === "hq14")!);
    question.variableBinding = {
        taskId: 7, source: "confirmed-source", revision: 2, signature: questionSignature(question),
        mappings: [{ field: "社区服务满意度", answers: question.options!.map((answer, index) => ({ answer, value: index === 5 ? null : index + 1 })) }],
    };
    return question;
}

for (const order of ["seed", "database"] as const) {
    test(`${order} property order: saving an unchanged question retains its confirmed ordinal and missing mapping`, () => {
        const original = boundServiceQuestion();
        // JSONB does not preserve insertion order; use its returned top-level
        // order to exercise the actual editor rather than testing a comparator.
        const question: Question = order === "seed" ? original : {
            id: original.id, type: original.type, content: original.content,
            options: original.options, section: original.section, variableBinding: original.variableBinding,
        };
        const save = mock((_question: Question) => {});
        const view = render(<QuestionEditor open question={question} onOpenChange={() => {}} onSave={save} />);
        fireEvent.click(view.getByTestId("student-question-save"));
        const saved = save.mock.calls[0]![0];
        expect(questionSignature(saved)).toBe(questionSignature(question));
        expect(saved.variableBinding).toEqual(original.variableBinding);
    });
}

test("a real option change still clears an existing association", () => {
    const question = boundServiceQuestion();
    const save = mock((_question: Question) => {});
    const view = render(<QuestionEditor open question={question} onOpenChange={() => {}} onSave={save} />);
    fireEvent.change(view.getByTestId("student-question-option-2"), { target: { value: "不太满意" } });
    fireEvent.click(view.getByTestId("student-question-save"));
    const saved = save.mock.calls[0]![0];
    expect(questionSignature(saved)).not.toBe(questionSignature(question));
    expect(saved.variableBinding).toBeUndefined();
});

test("changing numeric measurement units still clears the association", () => {
    const question: Question = { id: "sleep", type: "numeric", section: "main", content: "平均睡眠时间", unit: "小时", decimalPlaces: 1, numericMin: 0, numericMax: 24 };
    question.variableBinding = { taskId: 7, source: "confirmed-source", revision: 2, signature: questionSignature(question), mappings: [{ field: "睡眠", answers: [] }] };
    const save = mock((_question: Question) => {});
    const view = render(<QuestionEditor open question={question} onOpenChange={() => {}} onSave={save} />);
    fireEvent.change(view.getByTestId("student-question-numeric-unit"), { target: { value: "分钟" } });
    fireEvent.click(view.getByTestId("student-question-save"));
    expect(save.mock.calls[0]![0].variableBinding).toBeUndefined();
});

test("an unchanged save does not revive an association with an already stale signature", () => {
    const question = boundServiceQuestion();
    question.content = "您对另一种服务的满意程度如何？";
    const save = mock((_question: Question) => {});
    const view = render(<QuestionEditor open question={question} onOpenChange={() => {}} onSave={save} />);
    fireEvent.click(view.getByTestId("student-question-save"));
    expect(save.mock.calls[0]![0].variableBinding).toBeUndefined();
});
