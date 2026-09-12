import { beforeEach, afterEach, expect, mock, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";
const bootstrap = installDomGlobals();
const { cleanup, render, fireEvent } = await import("@testing-library/react");
const { QuestionEditor } = await import("./QuestionEditor");
bootstrap.restore();
let restore: () => void;
beforeEach(() => { restore = installDomGlobals().restore; });
afterEach(async () => { cleanup(); await new Promise(resolve => setTimeout(resolve, 0)); restore(); });

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
