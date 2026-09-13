import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";
import { bindingQuestion } from "@/test-utils/question-variable-binding";
import type { Question } from "@/lib/questionnaire-types";
const bootstrap = installDomGlobals();
const { cleanup, render, fireEvent } = await import("@testing-library/react");
const { QuestionEditor } = await import("./QuestionEditor");
bootstrap.restore();
let restore: () => void;
beforeEach(() => { restore = installDomGlobals().restore; });
// Radix restores focus on a timer; drain the real timer queue before replacing DOM globals.
afterEach(async () => { cleanup(); await new Promise(resolve => setTimeout(resolve, 0)); restore(); });

test("reorder, rename, delete and add move whole option objects without identity drift", () => {
    const question = bindingQuestion(); question.options!.push({ id: "o_c", label: "丙类" });
    const before = structuredClone(question), save = mock((_q: Question) => {});
    const view = render(<QuestionEditor open question={question} onSave={save} onOpenChange={() => {}} />);
    fireEvent.click(view.getByRole("button", { name: "下移选项 1" }));
    expect((view.getByTestId("student-question-option-1") as HTMLInputElement).value).toBe("乙类");
    fireEvent.change(view.getByTestId("student-question-option-2"), { target: { value: "甲类改名" } });
    fireEvent.click(view.getByTestId("student-question-remove-option-1"));
    fireEvent.click(view.getByTestId("student-question-add-option"));
    fireEvent.change(view.getByTestId("student-question-option-3"), { target: { value: "丁类" } });
    fireEvent.click(view.getByTestId("student-question-save"));
    const result = save.mock.calls[0]![0];
    expect(result.options!.slice(0, 2)).toEqual([{ id: "o_a", label: "甲类改名" }, { id: "o_c", label: "丙类" }]);
    expect(result.options![2]!.id).toMatch(/^o_[a-f0-9]{32}$/); expect(result.options![2]!.label).toBe("丁类");
    expect(result).not.toHaveProperty("optionIds"); expect(question).toEqual(before);
});
test("opening an invalid stored choice blocks editing without allocating substitute identities", () => {
    const question = { ...bindingQuestion(), options: ["甲", "乙"] } as unknown as Question;
    const save = mock((_q: Question) => {}), random = spyOn(crypto, "getRandomValues");
    try {
        const view = render(<QuestionEditor open question={question} onSave={save} onOpenChange={() => {}} />);
        expect(view.getByRole("alert").textContent).toContain("不会自动转换或补充身份");
        expect(view.queryByTestId("student-question-option-1")).toBeNull();
        expect((view.getByTestId("student-question-save") as HTMLButtonElement).disabled).toBe(true);
        expect(random).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
    } finally { random.mockRestore(); }
});
test("opening and saving an existing valid choice never allocates replacement identities", () => {
    const question = bindingQuestion(), save = mock((_q: Question) => {});
    const random = spyOn(crypto, "getRandomValues");
    try {
        const view = render(<QuestionEditor open question={question} onSave={save} onOpenChange={() => {}} />);
        fireEvent.click(view.getByTestId("student-question-save"));
        expect(save.mock.calls[0]![0].options).toEqual(question.options);
        expect(random).not.toHaveBeenCalled();
    } finally { random.mockRestore(); }
});
