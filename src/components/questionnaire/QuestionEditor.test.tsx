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
    const view = render(<QuestionEditor open onOpenChange={() => {}} onSave={save} question={{ id: "math", type: "single", content: "选择数量", options: [{ id: "o_1", label: "10²" }, { id: "o_2", label: "102" }] }} />);
    expect(view.queryByRole("alert")).toBeNull();
    expect((view.getByTestId("student-question-save") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(view.getByTestId("student-question-save"));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ options: [{ id: "o_1", label: "10²" }, { id: "o_2", label: "102" }] }));
});

for (const type of ["single", "multiple"] as const) {
    test(`${type}: duplicates are explained, preserved for correction, and cannot be saved`, () => {
        const save = mock(() => {});
        const view = render(<QuestionEditor open onOpenChange={() => {}} onSave={save} question={{ id: "q", type, content: "选择", options: [{ id: "o_1", label: "同一选项" }, { id: "o_2", label: " 同一选项 " }], minSelect: 1, maxSelect: 2 }} />);
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
        expect(save).toHaveBeenCalledWith(expect.objectContaining({ options: [{ id: "o_1", label: "同一选项" }, { id: "o_2", label: "另一个选项" }] }));
    });
}

test("editing and deleting options preserve the surviving option identities", () => {
    const save = mock((_question: import("@/lib/questionnaire-types").Question) => {});
    const view = render(<QuestionEditor open onOpenChange={() => {}} onSave={save} question={{ id: "stable", type: "single", content: "选择", options: [{ id: "a", label: "甲" }, { id: "b", label: "乙" }, { id: "c", label: "丙" }] }} />);
    fireEvent.change(view.getByTestId("student-question-option-3"), { target: { value: "丙改名" } });
    fireEvent.click(view.getByRole("button", { name: "删除选项 2" }));
    fireEvent.click(view.getByTestId("student-question-save"));
    expect(save.mock.calls[0]![0]).toMatchObject({ options: [{ id: "a", label: "甲" }, { id: "c", label: "丙改名" }] });
});

for (const type of ["multiple", "scale"] as const) {
    test(`${type}: invalid numeric input is retained rather than rounded or replaced by defaults`, () => {
        const save = mock(() => {});
        const view = render(<QuestionEditor open onOpenChange={() => {}} onSave={save} question={{ id: "rules", type, content: "规则测试", ...(type === "scale" ? { scaleMin: 1, scaleMax: 5 } : { options: [{ id: "o_1", label: "甲" }, { id: "o_2", label: "乙" }], minSelect: 1, maxSelect: 2 }) }} />);
        const input = view.getByTestId(type === "scale" ? "student-question-scale-min" : "student-question-min-select") as HTMLInputElement;
        const button = view.getByTestId("student-question-save") as HTMLButtonElement;
        for (const value of ["1.5", "", "0", "1e0", "1.00000000000000001"]) {
            fireEvent.change(input, { target: { value } });
            expect(input.value).toBe(value); expect(input.getAttribute("aria-invalid")).toBe("true");
            expect(view.getByRole("alert").textContent).toContain("整数");
            expect(button.disabled).toBe(true); fireEvent.click(button); expect(save).not.toHaveBeenCalled();
        }
        fireEvent.change(input, { target: { value: "1" } });
        expect(button.disabled).toBe(false); fireEvent.click(button);
        expect(save).toHaveBeenCalledWith(expect.objectContaining(type === "scale" ? { scaleMin: 1, scaleMax: 5 } : { minSelect: 1, maxSelect: 2 }));
    });
}

test("an empty option cannot be silently discarded on save", () => {
    const save = mock(() => {});
    const view = render(<QuestionEditor open onOpenChange={() => {}} onSave={save} question={{ id: "empty", type: "single", content: "请选择", options: [{ id: "a", label: "甲" }, { id: "b", label: "乙" }, { id: "c", label: "" }] }} />);
    expect(view.getByRole("alert").textContent).toContain("不会自动忽略");
    fireEvent.click(view.getByTestId("student-question-save")); expect(save).not.toHaveBeenCalled();
    fireEvent.click(view.getByTestId("student-question-remove-option-3"));
    fireEvent.click(view.getByTestId("student-question-save"));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ options: [{ id: "a", label: "甲" }, { id: "b", label: "乙" }] }));
});
