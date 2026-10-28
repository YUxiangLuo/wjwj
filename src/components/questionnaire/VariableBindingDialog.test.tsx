import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";
import { createHappinessDictionary, happinessQuestionnaire } from "@/db/seeds/happiness-topic";
import { validateQuestionBindings } from "@/domain/variables/question-binding";
import type { Question } from "@/lib/questionnaire-types";

const bootstrap = installDomGlobals();
const { cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const { VariableBindingDialog } = await import("./VariableBindingDialog");
bootstrap.restore();
let restore: () => void;
beforeEach(() => { restore = installDomGlobals().restore; });
afterEach(async () => { cleanup(); await new Promise(resolve => setTimeout(resolve, 0)); restore(); });

const dictionary = createHappinessDictionary("happiness-source");
const question = happinessQuestionnaire.questions.find(item => item.id === "hq14")!;
type View = ReturnType<typeof render>;
async function select(view: View, label: string, option: string) {
    fireEvent.keyDown(view.getByRole("combobox", { name: label }), { key: "ArrowDown" });
    const item = await waitFor(() => view.getByRole("option", { name: option }));
    fireEvent.keyDown(item, { key: "Enter" });
    await waitFor(() => expect(view.queryByRole("listbox")).toBeNull());
}
const confirm = (view: View) => view.getByRole("button", { name: "确认关联" }) as HTMLButtonElement;
const validate = (value: Question, source = dictionary) => validateQuestionBindings({ ...happinessQuestionnaire, questions: [value] }, source, 1);

test("service binding requires an explicit missing answer, survives reopen, and passes server validation", async () => {
    const saved = mock((_value: Question) => {}), close = mock(() => {});
    const props = { dictionary, taskId: 1, onConfirm: saved, onOpenChange: close };
    const view = render(<VariableBindingDialog open question={question} {...props} />);
    await select(view, "选择变量字段", "社区服务满意度（社区服务满意度）");
    expect(confirm(view).disabled).toBe(true);
    expect(view.getByRole("combobox", { name: "选择缺失选项" }).textContent).toContain("请选择");
    fireEvent.click(confirm(view));
    expect(saved).not.toHaveBeenCalled();
    await select(view, "选择缺失选项", "近3个月未使用过");
    expect(confirm(view).disabled).toBe(false);
    expect(view.getByText(/近3个月未使用过 → 空白（缺失，不计入有效分母）/)).toBeTruthy();
    fireEvent.click(confirm(view));
    const value = saved.mock.calls[0]![0];
    expect(value.variableBinding!.mappings[0]!.answers.map(item => item.value)).toEqual([1, 2, 3, 4, 5, null]);
    expect(() => validate(value)).not.toThrow();
    expect(close).toHaveBeenCalledWith(false);
    view.rerender(<VariableBindingDialog open={false} question={value} {...props} />);
    view.rerender(<VariableBindingDialog open question={value} {...props} />);
    expect(view.getByRole("combobox", { name: "选择缺失选项" }).textContent).toContain("近3个月未使用过");
    expect(confirm(view).disabled).toBe(false);
    await select(view, "选择变量字段", "自评健康（自评健康）");
    expect(confirm(view).disabled).toBe(true);
    expect(view.getByRole("combobox", { name: "选择缺失选项" }).textContent).toContain("请选择");
});

test("a nonuser option at the beginning is mapped explicitly without shifting the valid category meaning", async () => {
    const reordered = { ...question, options: [question.options![5]!, ...question.options!.slice(0, 5)] };
    const saved = mock((_value: Question) => {});
    const view = render(<VariableBindingDialog open question={reordered} dictionary={dictionary} taskId={1} onConfirm={saved} onOpenChange={() => {}} />);
    await select(view, "选择变量字段", "社区服务满意度（社区服务满意度）");
    expect(confirm(view).disabled).toBe(true);
    await select(view, "选择缺失选项", "近3个月未使用过");
    fireEvent.click(confirm(view));
    const value = saved.mock.calls[0]![0];
    expect(value.variableBinding!.mappings[0]!.answers.map(item => item.value)).toEqual([null, 1, 2, 3, 4, 5]);
    expect(() => validate(value)).not.toThrow();
});

test("multiple declared missing codes require an explicit code selection", async () => {
    const source = structuredClone(dictionary);
    source.variables.find(variable => variable.field === "社区服务满意度")!.missing = [null, -99];
    const saved = mock((_value: Question) => {});
    const view = render(<VariableBindingDialog open question={question} dictionary={source} taskId={1} onConfirm={saved} onOpenChange={() => {}} />);
    await select(view, "选择变量字段", "社区服务满意度（社区服务满意度）");
    await select(view, "选择缺失选项", "近3个月未使用过");
    expect(confirm(view).disabled).toBe(true);
    await select(view, "选择缺失值", "-99（缺失，不计入有效分母）");
    fireEvent.click(confirm(view));
    const value = saved.mock.calls[0]![0];
    expect(value.variableBinding!.mappings[0]!.answers.at(-1)!.value).toBe(-99);
    expect(() => validate(value, source)).not.toThrow();
});

test("ordinary five-point scales still bind without a missing-option prompt", async () => {
    const scale = happinessQuestionnaire.questions.find(item => item.id === "hq3")!;
    const saved = mock((_value: Question) => {});
    const view = render(<VariableBindingDialog open question={scale} dictionary={dictionary} taskId={1} onConfirm={saved} onOpenChange={() => {}} />);
    await select(view, "选择变量字段", "社会支持感（社会支持感）");
    expect(confirm(view).disabled).toBe(false);
    expect(view.queryByRole("combobox", { name: "选择缺失选项" })).toBeNull();
    fireEvent.click(confirm(view));
    expect(() => validate(saved.mock.calls[0]![0])).not.toThrow();
});
