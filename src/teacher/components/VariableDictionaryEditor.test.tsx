import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";
import type { VariableDictionary } from "@/domain/variables/types";

// docs/VARIABLE_ANALYSIS_TEST_PLAN.md D06：缺失编码非法 JSON 与网络失败保留输入，
// 不静默覆盖服务端版本；等价保存仍走显式确认。

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
    const input = await waitFor(() => view.getByLabelText("缺失编码（JSON 标量数组）", { selector: "input#missing-0" }) as HTMLInputElement);
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
    const missing = await waitFor(() => view.getByLabelText("缺失编码（JSON 标量数组）", { selector: "input#missing-0" }) as HTMLInputElement);
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
    const input = await waitFor(() => view.getByLabelText("缺失编码（JSON 标量数组）", { selector: "input#missing-0" }) as HTMLInputElement);
    expect(input.disabled).toBe(true);
    expect(view.queryByText("明确确认并保存")).toBeNull();
});
