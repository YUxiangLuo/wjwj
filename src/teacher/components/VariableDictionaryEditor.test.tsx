import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";
import type { VariableDictionary } from "@/domain/variables/types";

// 缺失编码非法 JSON 与网络失败时保留输入，不静默覆盖服务端版本；
// 等价保存仍走显式确认。

const bootstrapDom = installDomGlobals("http://localhost/teacher");
const { cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const { VariableDictionaryEditor } = await import("./VariableDictionaryEditor");
bootstrapDom.restore();

const dictionary: VariableDictionary = {
    source: "source-hash",
    revision: 3,
    variables: [
        { field: "value", label: "分数", unit: "", kind: "continuous", categories: [], missing: [null] },
        { field: "group", label: "组", unit: "", kind: "nominal", categories: [{ value: "A", label: "A" }, { value: "B", label: "B" }], missing: [null] },
    ],
};
const getVariableDictionary = mock(async () => ({ success: true, data: { dictionary, suggestion: dictionary, source: "source-hash", revision: 3, locked: false } }));
const updateVariableDictionary = mock(async (_id: number, _body: unknown): Promise<{ success: boolean; data?: { success: boolean; revision: number }; error?: { code: string; message: string } }> => ({ success: true, data: { success: true, revision: 4 } }));
mock.module("../api-client", () => ({
    teacherApi: { getVariableDictionary, updateVariableDictionary },
}));

let restoreDom: (() => void) | null = null;
beforeEach(() => {
    restoreDom = installDomGlobals("http://localhost/teacher").restore;
    getVariableDictionary.mockClear();
    updateVariableDictionary.mockClear();
});
afterEach(async () => {
    cleanup();
    // Let React/scheduler deferred work run before the document is torn down.
    await new Promise(resolve => setTimeout(resolve, 0));
    restoreDom?.();
    restoreDom = null;
});

test("invalid missing-code JSON keeps the input, explains the format and never writes", async () => {
    const view = render(<VariableDictionaryEditor topicId={7} />);
    const input = await waitFor(() => view.getByLabelText("缺失值编码（高级）", { selector: "input#missing-0" }) as HTMLInputElement);
    fireEvent.change(input, { target: { value: "[broken" } });
    fireEvent.click(view.getByText("明确确认并保存"));
    await waitFor(() => expect(view.getByRole("alert")).toBeTruthy());
    expect(view.getByRole("alert").textContent).toContain("缺失编码格式无效");
    expect(view.getByRole("alert").textContent).toContain("JSON 数组");
    expect(input.value).toBe("[broken");
    expect(updateVariableDictionary).not.toHaveBeenCalled();
});

test("a failed save preserves the draft and a later valid save sends the confirmed revision", async () => {
    updateVariableDictionary.mockImplementationOnce(async () => ({ success: false, error: { code: "VARIABLE_REVISION_CONFLICT", message: "变量字典已被更新，请重新载入" } }));
    const view = render(<VariableDictionaryEditor topicId={7} />);
    const missing = await waitFor(() => view.getByLabelText("缺失值编码（高级）", { selector: "input#missing-0" }) as HTMLInputElement);
    fireEvent.change(missing, { target: { value: '[null, "NA"]' } });
    fireEvent.click(view.getByText("明确确认并保存"));
    await waitFor(() => expect(view.getByRole("alert").textContent).toContain("变量字典已被更新"));
    expect(missing.value).toBe('[null, "NA"]');

    fireEvent.click(view.getByText("明确确认并保存"));
    await waitFor(() => expect(updateVariableDictionary).toHaveBeenCalledTimes(2));
    const call = updateVariableDictionary.mock.calls[1]! as unknown as [number, { source: string; observedRevision: number; dictionary: VariableDictionary }];
    expect(call[0]).toBe(7);
    expect(call[1].source).toBe("source-hash");
    expect(call[1].observedRevision).toBe(3);
    expect(call[1].dictionary.revision).toBe(3);
    expect(call[1].dictionary.variables.find(variable => variable.field === "value")!.missing).toEqual([null, "NA"]);
});

test("a frozen template renders the dictionary read-only without a save action", async () => {
    getVariableDictionary.mockImplementationOnce(async () => ({ success: true, data: { dictionary, suggestion: dictionary, source: "source-hash", revision: 3, locked: true } }));
    const view = render(<VariableDictionaryEditor topicId={7} />);
    await view.findByLabelText("value 标签");
    expect(view.queryByLabelText("缺失值编码（高级）")).toBeNull();
    expect(view.queryByText("高级设置：自定义缺失值")).toBeNull();
    expect(view.queryByText("明确确认并保存")).toBeNull();
});

test("viewing a template explains missing values without exposing editable JSON", async () => {
    const examples: Array<[VariableDictionary["variables"][number]["missing"], string]> = [
        [[null], "空白单元格按缺失值处理"],
        [[], "未指定缺失值"],
        [[null, "", "null", " ", 0, "0", false, true], '空白单元格、空文本、文本 "null"、文本 " "、数值 0、文本 "0"、逻辑值 false（假）、逻辑值 true（真）按缺失值处理'],
    ];
    const sample: VariableDictionary = { ...dictionary, variables: examples.map(([missing], index) => ({ ...dictionary.variables[0]!, field: `value${index}`, missing })) };
    getVariableDictionary.mockImplementationOnce(async () => ({ success: true, data: { dictionary: sample, suggestion: sample, source: "source-hash", revision: 3, locked: false } }));
    const view = render(<VariableDictionaryEditor topicId={7} readOnly />);
    await view.findByLabelText("value0 标签");
    examples.forEach(([, description], index) => expect(view.getByTestId(`teacher-missing-summary-${index}`).textContent).toBe(`缺失值处理：${description}`));
    expect(view.queryByLabelText("缺失值编码（高级）")).toBeNull();
    expect(view.queryByText("高级设置：自定义缺失值")).toBeNull();
    expect(view.queryByText("明确确认并保存")).toBeNull();
    expect(view.container.textContent).not.toContain("JSON");
    expect(updateVariableDictionary).not.toHaveBeenCalled();
});

test("advanced settings default to collapsed and confirming unchanged rules preserves their types", async () => {
    const state = mock((_state: { dirty: boolean; busy: boolean }) => {});
    const view = render(<VariableDictionaryEditor topicId={7} onStateChange={state} />);
    const toggle = await view.findByTestId("teacher-missing-settings-0");
    expect((toggle.parentElement as HTMLDetailsElement).open).toBe(false);
    expect(view.getByTestId("teacher-missing-summary-0").textContent).toBe("缺失值处理：空白单元格按缺失值处理");
    expect(state.mock.calls.at(-1)?.[0]).toEqual({ dirty: false, busy: false });
    fireEvent.click(view.getByText("明确确认并保存"));
    await waitFor(() => expect(updateVariableDictionary).toHaveBeenCalledTimes(1));
    const body = updateVariableDictionary.mock.calls[0]![1] as { dictionary: VariableDictionary };
    expect(body.dictionary).toEqual(dictionary);
});

test("editing updates the description and preserves exact scalar types through saving", async () => {
    const view = render(<VariableDictionaryEditor topicId={7} />);
    const toggle = await view.findByTestId("teacher-missing-settings-0");
    fireEvent.click(toggle);
    const input = view.getByLabelText("缺失值编码（高级）", { selector: "input#missing-0" }) as HTMLInputElement;
    const values = [null, "", "null", " ", 0, "0", false, true];
    fireEvent.change(input, { target: { value: JSON.stringify(values) } });
    expect(view.getByTestId("teacher-missing-summary-0").textContent).toContain('数值 0、文本 "0"、逻辑值 false（假）、逻辑值 true（真）');
    fireEvent.click(view.getByText("明确确认并保存"));
    await waitFor(() => expect(updateVariableDictionary).toHaveBeenCalledTimes(1));
    const body = updateVariableDictionary.mock.calls[0]![1] as { dictionary: VariableDictionary };
    expect(body.dictionary.variables[0]!.missing).toEqual(values);
});

test.each(["[broken", "{}", "[{}]", "[1e400]"])("invalid advanced values %s never display the previous rule or write", async (value) => {
    const view = render(<VariableDictionaryEditor topicId={7} />);
    const toggle = await view.findByTestId("teacher-missing-settings-0");
    fireEvent.click(toggle);
    const input = view.getByLabelText("缺失值编码（高级）", { selector: "input#missing-0" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value } });
    fireEvent.click(toggle);
    expect(view.getByTestId("teacher-missing-summary-0").textContent).toBe("缺失值处理：格式有误，请展开高级设置检查");
    fireEvent.click(view.getByText("明确确认并保存"));
    await view.findByRole("alert");
    expect(input.value).toBe(value);
    expect(updateVariableDictionary).not.toHaveBeenCalled();
});

test("unpersisted field configuration disables writes without discarding a dictionary draft", async () => {
    const view = render(<VariableDictionaryEditor topicId={7} />);
    const input = await view.findByLabelText("value 标签") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "待确认标签" } });
    view.rerender(<VariableDictionaryEditor topicId={7} disabled />);
    expect(input.disabled).toBe(true);
    expect((view.getByText("明确确认并保存") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(view.getByText("明确确认并保存"));
    expect(updateVariableDictionary).not.toHaveBeenCalled();
    expect(input.value).toBe("待确认标签");
    view.rerender(<VariableDictionaryEditor topicId={7} />);
    expect(input.disabled).toBe(false);
    fireEvent.click(view.getByText("明确确认并保存"));
    await waitFor(() => expect(updateVariableDictionary).toHaveBeenCalledTimes(1));
    const body = updateVariableDictionary.mock.calls[0]![1] as { dictionary: VariableDictionary };
    expect(body.dictionary.variables[0]!.label).toBe("待确认标签");
});

test("dirty state follows raw input, reverts and successful reload; cancelling reload preserves invalid input", async () => {
    const state = mock((_state: { dirty: boolean; busy: boolean }) => {});
    const view = render(<VariableDictionaryEditor topicId={7} onStateChange={state} />);
    const missing = await waitFor(() => view.getByLabelText("缺失值编码（高级）", { selector: "input#missing-0" }) as HTMLInputElement);
    expect(state.mock.calls.at(-1)?.[0]).toEqual({ dirty: false, busy: false });
    fireEvent.change(missing, { target: { value: "[broken" } });
    expect(state.mock.calls.at(-1)?.[0].dirty).toBe(true);
    fireEvent.change(missing, { target: { value: "[null]" } });
    expect(state.mock.calls.at(-1)?.[0].dirty).toBe(false);
    fireEvent.change(missing, { target: { value: "[broken" } });
    fireEvent.click(view.getByText("明确确认并保存"));
    await waitFor(() => expect(view.getByRole("alert")).toBeTruthy());
    const confirm = mock(() => false);
    window.confirm = confirm;
    fireEvent.click(view.getByText("重新载入"));
    expect(getVariableDictionary).toHaveBeenCalledTimes(1);
    expect(missing.value).toBe("[broken");
    confirm.mockReturnValue(true);
    fireEvent.click(view.getByText("重新载入"));
    await waitFor(() => expect(state.mock.calls.at(-1)?.[0]).toEqual({ dirty: false, busy: false }));
    expect(getVariableDictionary).toHaveBeenCalledTimes(2);
});

test("failed reload keeps the draft dirty and releases busy state", async () => {
    const state = mock((_state: { dirty: boolean; busy: boolean }) => {});
    const view = render(<VariableDictionaryEditor topicId={7} onStateChange={state} />);
    const missing = await waitFor(() => view.getByLabelText("缺失值编码（高级）", { selector: "input#missing-0" }) as HTMLInputElement);
    fireEvent.change(missing, { target: { value: "[broken" } });
    fireEvent.click(view.getByText("明确确认并保存"));
    await waitFor(() => expect(view.getByRole("alert")).toBeTruthy());
    window.confirm = mock(() => true);
    getVariableDictionary.mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(view.getByText("重新载入"));
    await waitFor(() => expect(view.getByRole("alert").textContent).toContain("已有输入已保留"));
    expect(state.mock.calls.at(-1)?.[0]).toEqual({ dirty: true, busy: false });
    expect((view.getByLabelText("缺失值编码（高级）", { selector: "input#missing-0" }) as HTMLInputElement).value).toBe("[broken");
});

test("distinguishes unconfirmed suggestion from confirmed active dictionary", async () => {
    getVariableDictionary.mockImplementationOnce(async () => ({
        success: true,
        data: { dictionary: null, suggestion: dictionary, source: "source-hash", revision: 1, locked: false },
    }) as never);
    const unconfirmed = render(<VariableDictionaryEditor topicId={7} />);
    await unconfirmed.findByLabelText("value 标签");
    expect(unconfirmed.getByText("未确认保存")).toBeTruthy();
    expect(unconfirmed.getByText(/尚未对学生启用/)).toBeTruthy();
    unconfirmed.unmount();

    const confirmed = render(<VariableDictionaryEditor topicId={7} />);
    await confirmed.findByLabelText("value 标签");
    expect(confirmed.getByText("已确认生效")).toBeTruthy();
    expect(confirmed.queryByText(/尚未对学生启用/) === null).toBe(true);
});
