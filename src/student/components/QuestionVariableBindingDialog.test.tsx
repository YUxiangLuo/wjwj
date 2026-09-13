import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";
import { bindingDictionary, bindingFor, bindingQuestion } from "@/test-utils/question-variable-binding";
import { parseQuestionVariableBinding } from "@/domain/experiment/question-variable-binding";
import { variableValueKey } from "@/domain/experiment/variable-dictionary";
import type { Question } from "@/lib/questionnaire-types";
const bootstrap = installDomGlobals();
const { render, fireEvent, cleanup, waitFor, act } = await import("@testing-library/react");
const get = mock(async (_id: number, _signal?: AbortSignal): Promise<any> => ({ success: true, data: { dictionary: bindingDictionary() } }));
mock.module("../api-client", () => ({ tasksApi: { getVariables: get } }));
const { QuestionVariableBindingDialog } = await import("./QuestionVariableBindingDialog");
bootstrap.restore(); let restore: () => void;
beforeEach(() => { restore = installDomGlobals().restore; get.mockReset(); get.mockImplementation(async () => ({ success: true, data: { dictionary: bindingDictionary() } })); });
afterEach(async () => { cleanup(); await new Promise(r => setTimeout(r, 0)); restore(); });
async function setup(question: Question = bindingQuestion()) {
    const apply = mock((_question: Question) => {}), close = mock(() => {});
    const view = render(<QuestionVariableBindingDialog taskId={3} question={question} onApply={apply} onClose={close} />);
    await view.findByLabelText(question.type === "multiple" ? "选项 1 的二值变量" : "关联变量");
    return { view, apply, close };
}
test("reading metadata makes no guesses and applies exact typed codes only on confirmation", async () => {
    const original = bindingQuestion(); delete original.optionIds;
    const { view, apply } = await setup(original);
    expect(apply).not.toHaveBeenCalled(); expect((view.getByTestId("question-binding-apply") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(view.getByLabelText("关联变量"), { target: { value: "v_2" } });
    fireEvent.change(view.getByLabelText("选项 1 对应原值"), { target: { value: variableValueKey("01") } });
    fireEvent.change(view.getByLabelText("选项 2 对应原值"), { target: { value: variableValueKey(1) } });
    expect(apply).not.toHaveBeenCalled(); fireEvent.click(view.getByTestId("question-binding-apply"));
    const question = apply.mock.calls[0]![0];
    expect(parseQuestionVariableBinding(question.variableBinding, question, bindingDictionary(), 3).ok).toBe(true);
    expect(original.optionIds).toBeUndefined(); expect(new Set(question.optionIds).size).toBe(2);
});
test("duplicate code choices cannot be applied", async () => {
    const { view, apply } = await setup();
    fireEvent.change(view.getByLabelText("关联变量"), { target: { value: "v_2" } });
    for (const index of [1, 2]) fireEvent.change(view.getByLabelText(`选项 ${index} 对应原值`), { target: { value: variableValueKey("01") } });
    expect((view.getByTestId("question-binding-apply") as HTMLButtonElement).disabled).toBe(true);
    expect(view.getByRole("alert").textContent).toContain("一一对应"); expect(apply).not.toHaveBeenCalled();
});
test("multiresponse selection requires a different actual binary field per option", async () => {
    const { view, apply } = await setup({ ...bindingQuestion(), type: "multiple", minSelect: 1, maxSelect: 2 });
    for (const index of [1, 2]) {
        fireEvent.change(view.getByLabelText(`选项 ${index} 的二值变量`), { target: { value: "v_2" } });
        fireEvent.change(view.getByLabelText(`选项 ${index} 对应原值`), { target: { value: variableValueKey("01") } });
    }
    expect((view.getByTestId("question-binding-apply") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(view.getByLabelText("选项 2 的二值变量"), { target: { value: "v_3" } });
    fireEvent.change(view.getByLabelText("选项 2 对应原值"), { target: { value: variableValueKey(false) } });
    fireEvent.click(view.getByTestId("question-binding-apply"));
    expect(apply.mock.calls[0]![0].variableBinding!.answers[1]!.value).toBe(false);
});
test("canceling edited selections requires explicit discard and can retain local choices", async () => {
    const { view, apply, close } = await setup();
    fireEvent.change(view.getByLabelText("关联变量"), { target: { value: "v_2" } });
    fireEvent.click(view.getByRole("button", { name: "取消" })); expect(close).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole("button", { name: "继续编辑" }));
    expect((view.getByLabelText("关联变量") as HTMLSelectElement).value).toBe("v_2");
    fireEvent.click(view.getByRole("button", { name: "取消" })); fireEvent.click(view.getByRole("button", { name: "放弃并关闭" }));
    expect(close).toHaveBeenCalledTimes(1); expect(apply).not.toHaveBeenCalled();
});
test("old dictionary revisions do not silently rebase existing selections", async () => {
    const question = { ...bindingQuestion(), variableBinding: bindingFor() }; question.variableBinding.dictionaryRevision = 2;
    const { view, apply } = await setup(question);
    expect(view.getByRole("alert").textContent).toContain("不会沿用旧映射");
    expect((view.getByLabelText("关联变量") as HTMLSelectElement).value).toBe("");
    fireEvent.click(view.getByRole("button", { name: "仅认知预试，不关联数据" }));
    expect(apply.mock.calls[0]![0]).not.toHaveProperty("variableBinding");
});
test("absence of a teacher dictionary is not a mandatory completion gate", async () => {
    get.mockResolvedValueOnce({ success: true, data: { dictionary: null } });
    const apply = mock((_question: Question) => {});
    const view = render(<QuestionVariableBindingDialog taskId={3} question={bindingQuestion()} onApply={apply} onClose={() => {}} />);
    await view.findByText(/教师尚未确认/);
    expect((view.getByTestId("question-binding-apply") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(view.getByRole("button", { name: "仅认知预试，不关联数据" }));
    expect(apply.mock.calls[0]![0]).toEqual(bindingQuestion());
});
test("failed reads can be retried without generating a dictionary or a link", async () => {
    get.mockResolvedValueOnce({ success: false, error: { message: "来源读取失败" } });
    const apply = mock(() => {});
    const view = render(<QuestionVariableBindingDialog taskId={3} question={bindingQuestion()} onApply={apply} onClose={() => {}} />);
    await view.findByText("来源读取失败");
    fireEvent.click(view.getByRole("button", { name: "重新读取" })); await view.findByLabelText("关联变量");
    expect(apply).not.toHaveBeenCalled(); expect(get).toHaveBeenCalledTimes(2);
});
test("late reads cannot leak a previous task's dictionary into the new task", async () => {
    let resolve!: (value: unknown) => void; get.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const view = render(<QuestionVariableBindingDialog taskId={3} question={bindingQuestion()} onApply={() => {}} onClose={() => {}} />);
    get.mockResolvedValueOnce({ success: true, data: { dictionary: null } });
    view.rerender(<QuestionVariableBindingDialog taskId={4} question={bindingQuestion()} onApply={() => {}} onClose={() => {}} />);
    await view.findByText(/教师尚未确认/); expect(get.mock.calls[0]![1]!.aborted).toBe(true);
    await act(async () => resolve({ success: true, data: { dictionary: bindingDictionary() } }));
    await waitFor(() => expect(view.queryByLabelText("关联变量")).toBeNull());
});
