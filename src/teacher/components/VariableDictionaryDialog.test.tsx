import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";
import { suggestVariableDictionary } from "@/domain/experiment/variable-dictionary";
import type { ApiResponse, TopicVariableDictionary } from "../api-client";

const bootstrap = installDomGlobals();
const { act, cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const get = mock(async (_id: number, _signal?: AbortSignal): Promise<ApiResponse<TopicVariableDictionary>> => ({ success: true, data: fixture() }));
const put = mock(async (_id: number, dictionary: TopicVariableDictionary["dictionary"]): Promise<ApiResponse<TopicVariableDictionary>> => ({ success: true, data: { dictionary: { ...dictionary, revision: dictionary.revision + 1 }, confirmed: true, editable: true } }));
mock.module("../api-client", () => ({ teacherApi: { getVariableDictionary: get, updateVariableDictionary: put } }));
const { VariableDictionaryDialog } = await import("./VariableDictionaryDialog");
bootstrap.restore();
function fixture(): TopicVariableDictionary {
    const dictionary = suggestVariableDictionary({ columns: ["编号", " 等待分钟 ", "类别"], identifier: "编号", numeric: [" 等待分钟 "], datasetRevision: "a".repeat(64),
        rows: [{ 编号: "001", " 等待分钟 ": 1.25, 类别: "01" }, { 编号: "002", " 等待分钟 ": 0, 类别: "1" }] });
    dictionary.revision = 7; // Suggestions may have a positive invalidation counter.
    return { dictionary, confirmed: false, editable: true };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
let restore: () => void;
beforeEach(() => {
    restore = installDomGlobals("http://localhost/teacher/topic").restore;
    get.mockReset(); put.mockReset();
    get.mockImplementation(async () => ({ success: true, data: fixture() }));
    put.mockImplementation(async (_id, dictionary) => ({ success: true, data: { dictionary: { ...dictionary, revision: dictionary.revision + 1 }, confirmed: true, editable: true } }));
});
afterEach(async () => { cleanup(); await new Promise(r => setTimeout(r, 0)); restore(); });
async function setup(onClose = mock(() => {})) {
    const view = render(<VariableDictionaryDialog topicId={14} onClose={onClose} />);
    await view.findByTestId("dictionary-source-field");
    return { view, onClose };
}
test("opening only reads, and positive-revision suggestions still require explicit confirmation", async () => {
    const { view } = await setup();
    expect(get).toHaveBeenCalledTimes(1); expect(put).not.toHaveBeenCalled();
    expect(view.getByText("仅建议 · 未确认")).toBeTruthy();
    expect((view.getByTestId("dictionary-save") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(view.getByTestId("dictionary-save"));
    await view.findByText("已确认");
    expect(put.mock.calls[0]![0]).toBe(14);
    expect(put.mock.calls[0]![1].revision).toBe(7);
    expect(view.getByText(/修订 8/)).toBeTruthy();
    expect((view.getByTestId("dictionary-save") as HTMLButtonElement).disabled).toBe(true);
});
test("variable navigation retains unsaved labels/units and exact source keys", async () => {
    const { view } = await setup();
    fireEvent.click(view.getByTestId("dictionary-variable-v_2"));
    expect(view.getByTestId("dictionary-source-field").textContent).toBe('" 等待分钟 "');
    fireEvent.change(view.getByLabelText("变量显示名称"), { target: { value: "服务等待时长" } });
    fireEvent.change(view.getByLabelText("变量单位"), { target: { value: "分钟" } });
    fireEvent.click(view.getByTestId("dictionary-variable-v_1"));
    fireEvent.click(view.getByTestId("dictionary-variable-v_2"));
    expect((view.getByLabelText("变量单位") as HTMLInputElement).value).toBe("分钟");
    fireEvent.click(view.getByTestId("dictionary-save"));
    await view.findByText("已确认");
    expect(put.mock.calls[0]![1].variables[1]).toMatchObject({ id: "v_2", sourceField: " 等待分钟 ", label: "服务等待时长", unit: "分钟", storageType: "number" });
});
test("category ordering, labels and typed missing codes use structured controls", async () => {
    const { view } = await setup();
    fireEvent.click(view.getByTestId("dictionary-variable-v_3"));
    fireEvent.change(view.getByLabelText("变量测量类型"), { target: { value: "ordinal" } });
    fireEvent.change(view.getByLabelText("类别 1 标签"), { target: { value: "编码零一" } });
    fireEvent.click(view.getByLabelText("下移类别 1"));
    expect((view.getByLabelText("类别 2 原值") as HTMLInputElement).value).toBe("01");
    fireEvent.click(view.getByRole("button", { name: "添加缺失编码" }));
    fireEvent.change(view.getByLabelText("缺失编码 1 类型"), { target: { value: "number" } });
    expect((view.getByTestId("dictionary-save") as HTMLButtonElement).disabled).toBe(true);
    expect(view.getByRole("alert").textContent).toContain("原值格式无效");
    fireEvent.change(view.getByLabelText("缺失编码 1 原值"), { target: { value: "0" } });
    fireEvent.click(view.getByTestId("dictionary-save"));
    await view.findByText("已确认");
    expect(put.mock.calls[0]![1].variables[2]).toMatchObject({ measurementLevel: "ordinal", categories: [{ value: "1", label: "1" }, { value: "01", label: "编码零一" }], missingValues: [0] });
});
test("marking a category missing removes it from valid categories without changing its type", async () => {
    const { view } = await setup(); fireEvent.click(view.getByTestId("dictionary-variable-v_3"));
    fireEvent.click(view.getAllByRole("button", { name: "设为缺失" })[0]!);
    expect((view.getByLabelText("缺失编码 1 原值") as HTMLInputElement).value).toBe("01");
    fireEvent.click(view.getByTestId("dictionary-save")); await view.findByText("已确认");
    expect(put.mock.calls[0]![1].variables[2]!.missingValues).toEqual(["01"]);
    expect(put.mock.calls[0]![1].variables[2]!.categories).toEqual([{ value: "1", label: "1" }]);
});
test("closing dirty forms asks before discarding and retaining edits does not write", async () => {
    const { view, onClose } = await setup();
    fireEvent.change(view.getByLabelText("变量显示名称"), { target: { value: "未保存名称" } });
    fireEvent.click(view.getByRole("button", { name: "关闭" }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole("button", { name: "保留修改" }));
    expect((view.getByLabelText("变量显示名称") as HTMLInputElement).value).toBe("未保存名称");
    fireEvent.click(view.getByRole("button", { name: "关闭" }));
    fireEvent.click(view.getByRole("button", { name: "放弃修改并关闭" }));
    expect(onClose).toHaveBeenCalledTimes(1); expect(put).not.toHaveBeenCalled();
});
test("pending saves are single-flight, freeze edits, and cannot be closed", async () => {
    const pending = deferred<ApiResponse<TopicVariableDictionary>>(); put.mockImplementation(() => pending.promise);
    const { view, onClose } = await setup();
    const button = view.getByTestId("dictionary-save");
    fireEvent.click(button); fireEvent.click(button);
    expect(put).toHaveBeenCalledTimes(1);
    expect((view.getByLabelText("变量显示名称").closest("fieldset") as HTMLFieldSetElement).disabled).toBe(true);
    fireEvent.keyDown(view.getByTestId("variable-dictionary-dialog"), { key: "Escape" });
    fireEvent.click(view.getByRole("button", { name: "关闭" }));
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => pending.resolve({ success: true, data: { ...fixture(), confirmed: true, dictionary: { ...fixture().dictionary, revision: 8 } } }));
    await view.findByText("已确认");
});
test("network failures retain edits and the original CAS revision for explicit retry", async () => {
    put.mockResolvedValueOnce({ success: false, error: { code: "NETWORK_ERROR", message: "网络连接失败" } });
    const { view } = await setup();
    fireEvent.change(view.getByLabelText("变量显示名称"), { target: { value: "保留我的输入" } });
    fireEvent.click(view.getByTestId("dictionary-save"));
    await waitFor(() => expect(view.getByRole("alert").textContent).toContain("网络连接失败"));
    expect((view.getByLabelText("变量显示名称") as HTMLInputElement).value).toBe("保留我的输入");
    fireEvent.click(view.getByTestId("dictionary-save")); await view.findByText("已确认");
    expect(put.mock.calls.map(call => call[1].revision)).toEqual([7, 7]);
});
for (const code of ["VERSION_CONFLICT", "DATASET_CHANGED", "FORBIDDEN"]) {
    test(`${code} retains input but blocks stale writes until explicit reload`, async () => {
        put.mockResolvedValueOnce({ success: false, error: { code, message: "服务端版本已改变" } });
        const { view } = await setup();
        fireEvent.change(view.getByLabelText("变量显示名称"), { target: { value: "不要覆盖我" } });
        fireEvent.click(view.getByTestId("dictionary-save"));
        await waitFor(() => expect(view.getByRole("alert").textContent).toContain("不能用旧版本继续保存"));
        expect((view.getByTestId("dictionary-save") as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(view.getByRole("button", { name: "重新加载" }));
        expect(get).toHaveBeenCalledTimes(1);
        fireEvent.click(view.getByRole("button", { name: "保留修改" }));
        expect((view.getByLabelText("变量显示名称") as HTMLInputElement).value).toBe("不要覆盖我");
        fireEvent.click(view.getByRole("button", { name: "重新加载" }));
        const next = fixture(); next.confirmed = true; next.dictionary.revision = 10;
        get.mockResolvedValueOnce({ success: true, data: next });
        fireEvent.click(view.getByRole("button", { name: "放弃修改并重新加载" }));
        await view.findByText("已确认");
        expect((view.getByLabelText("变量显示名称") as HTMLInputElement).value).toBe("编号");
        expect(view.getByText(/修订 10/)).toBeTruthy(); expect(put).toHaveBeenCalledTimes(1);
    });
}
for (const serverEditable of [false, true]) {
    test(`read-only viewing cannot confirm suggestions (server editable ${serverEditable})`, async () => {
        get.mockResolvedValueOnce({ success: true, data: { ...fixture(), editable: serverEditable } });
        const view = render(<VariableDictionaryDialog topicId={14} readOnly={serverEditable} onClose={() => {}} />);
        await view.findByTestId("dictionary-source-field");
        fireEvent.click(view.getByTestId("dictionary-variable-v_3"));
        expect((view.getByLabelText("变量显示名称").closest("fieldset") as HTMLFieldSetElement).disabled).toBe(true);
        expect(view.queryByTestId("dictionary-save")).toBeNull();
        expect(view.queryByRole("button", { name: "添加类别" })).toBeNull();
        expect(put).not.toHaveBeenCalled();
    });
}
test("GET errors can be retried and never silently become an editable suggestion", async () => {
    get.mockResolvedValueOnce({ success: false, error: { code: "INVALID_DICTIONARY_STORAGE", message: "变量字典存储损坏" } });
    const view = render(<VariableDictionaryDialog topicId={14} onClose={() => {}} />);
    await waitFor(() => expect(view.getByRole("alert").textContent).toContain("存储损坏"));
    expect(view.queryByTestId("dictionary-save")).toBeNull();
    fireEvent.click(view.getByRole("button", { name: "重新加载" }));
    await view.findByTestId("dictionary-source-field"); expect(put).not.toHaveBeenCalled();
});
test("late GET responses cannot replace the dictionary for a different topic", async () => {
    const old = deferred<ApiResponse<TopicVariableDictionary>>(); get.mockImplementationOnce(() => old.promise);
    const view = render(<VariableDictionaryDialog topicId={14} onClose={() => {}} />);
    const next = fixture(); next.dictionary.variables[0]!.label = "新模板标识";
    get.mockResolvedValueOnce({ success: true, data: next });
    view.rerender(<VariableDictionaryDialog topicId={15} onClose={() => {}} />);
    await view.findByTestId("dictionary-source-field");
    expect(get.mock.calls[0]![1]!.aborted).toBe(true);
    await act(async () => old.resolve({ success: true, data: fixture() }));
    expect((view.getByLabelText("变量显示名称") as HTMLInputElement).value).toBe("新模板标识");
    fireEvent.click(view.getByTestId("dictionary-save")); await view.findByText("已确认");
    expect(put.mock.calls[0]![0]).toBe(15);
});
test("late PUT responses are ignored after changing the topic scope", async () => {
    const old = deferred<ApiResponse<TopicVariableDictionary>>(); put.mockImplementationOnce(() => old.promise);
    const { view } = await setup(); fireEvent.click(view.getByTestId("dictionary-save"));
    view.rerender(<VariableDictionaryDialog topicId={15} onClose={() => {}} />);
    await view.findByTestId("dictionary-source-field");
    const changed = fixture(); changed.confirmed = true; changed.dictionary.revision = 8; changed.dictionary.variables[0]!.label = "旧保存结果";
    await act(async () => old.resolve({ success: true, data: changed }));
    expect((view.getByLabelText("变量显示名称") as HTMLInputElement).value).toBe("编号");
    expect(view.getByText("仅建议 · 未确认")).toBeTruthy();
});
test("unexpected save versions do not rebase the draft or allow further writes", async () => {
    put.mockResolvedValueOnce({ success: true, data: { ...fixture(), confirmed: true } });
    const { view } = await setup(); fireEvent.click(view.getByTestId("dictionary-save"));
    await waitFor(() => expect(view.getByRole("alert").textContent).toContain("来源或版本不一致"));
    expect((view.getByTestId("dictionary-save") as HTMLButtonElement).disabled).toBe(true);
    expect(view.getByText(/修订 7/)).toBeTruthy();
});
