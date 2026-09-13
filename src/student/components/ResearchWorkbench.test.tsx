import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";
import { researchFixture } from "@/test-utils/research-analysis";
const bootstrap = installDomGlobals();
const { cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const f = researchFixture();
const api = { list: mock(async (_id: number, _signal?: AbortSignal) => ({ success: true as boolean, data: f.list })), run: mock(async (_id: number, _data: any, _signal?: AbortSignal): Promise<any> => ({ success: true, data: { run: f.run, replayed: false } })) };
mock.module("../research-api", () => ({ researchApi: api }));
const { ResearchWorkbench } = await import("./ResearchWorkbench");
bootstrap.restore();
let restore: () => void;
beforeEach(() => { restore = installDomGlobals().restore; api.list.mockReset(); api.run.mockReset(); api.list.mockImplementation(async () => ({ success: true, data: structuredClone(f.list) })); });
afterEach(async () => { cleanup(); await new Promise(resolve => setTimeout(resolve, 0)); restore(); });
async function ready() {
    const change = mock((_ids: string[]) => {});
    const view = render(<ResearchWorkbench taskId={3} observedVersion={7} references={[]} onReferencesChange={change} />);
    await waitFor(() => expect(view.getByTestId("research-variable").textContent).toContain("等待时长"));
    fireEvent.change(view.getByTestId("research-question"), { target: { value: f.run.spec.question } });
    fireEvent.change(view.getByTestId("research-method"), { target: { value: "simple" } });
    fireEvent.change(view.getByTestId("research-variable"), { target: { value: "v_2" } });
    return { view, change };
}
test("selection does not run; explicit save is single-flight and citation changes only the report draft", async () => {
    const pending = Promise.withResolvers<any>(); api.run.mockImplementation(() => pending.promise);
    const { view, change } = await ready(); expect(api.run).not.toHaveBeenCalled();
    fireEvent.click(view.getByTestId("research-run")); fireEvent.click(view.getByTestId("research-run"));
    expect(api.run).toHaveBeenCalledTimes(1); expect((view.getByTestId("research-variable") as HTMLSelectElement).disabled).toBe(true);
    expect(api.run.mock.calls[0]![1]).toMatchObject({ observedVersion: 7, spec: f.run.spec });
    api.list.mockImplementation(async () => ({ success: true, data: { ...f.list, runs: [{ run: f.run, current: true }] } }));
    pending.resolve({ success: true, data: { run: f.run, replayed: false } });
    const cite = await view.findByTestId(`research-cite-${f.run.id}`); fireEvent.click(cite);
    expect(change).toHaveBeenCalledWith([f.run.id]); expect(api.run).toHaveBeenCalledTimes(1);
    fireEvent.change(view.getByTestId("research-question"), { target: { value: "换一个问题" } });
    expect(view.getByText(/配置已修改，尚未重新运行/)).toBeTruthy(); expect(view.getAllByText("2.500000")).toHaveLength(2); // Mean and median.
});
test("uncertain network outcome retains idempotency key for an explicit retry", async () => {
    api.run.mockImplementation(async () => ({ success: false, error: { message: "网络中断" } }));
    const { view } = await ready(); fireEvent.click(view.getByTestId("research-run")); await view.findByText("网络中断");
    const first = api.run.mock.calls[0]![1].requestKey;
    fireEvent.click(view.getByTestId("research-run")); await waitFor(() => expect(api.run).toHaveBeenCalledTimes(2));
    expect(api.run.mock.calls[1]![1].requestKey).toBe(first);
});
test("a task switch aborts work and ignores even an uncancellable late response", async () => {
    const pending = Promise.withResolvers<any>(); api.run.mockImplementation(() => pending.promise);
    const { view, change } = await ready(); fireEvent.click(view.getByTestId("research-run"));
    const signal = api.run.mock.calls[0]![2];
    view.rerender(<ResearchWorkbench taskId={4} observedVersion={1} references={[]} onReferencesChange={change} />);
    expect(signal!.aborted).toBe(true);
    pending.resolve({ success: true, data: { run: f.run } });
    await waitFor(() => expect(api.list.mock.calls.some(c => c[0] === 4)).toBe(true));
    expect(view.queryByTestId(`research-result-${f.run.id}`)).toBeNull(); expect(change).not.toHaveBeenCalled();
});
test("late list responses cannot replace newer results; version changes require fresh source verification", async () => {
    const initial = Promise.withResolvers<any>(), recheck = Promise.withResolvers<any>();
    api.list.mockImplementationOnce(() => initial.promise).mockImplementationOnce(async () => ({ success: true, data: { ...f.list, runs: [{ run: f.run, current: true }] } })).mockImplementationOnce(() => recheck.promise);
    const change = mock((_ids: string[]) => {});
    const view = render(<ResearchWorkbench taskId={3} observedVersion={7} references={[]} onReferencesChange={change} />);
    fireEvent.click(view.getByText("刷新已保存记录"));
    await view.findByTestId(`research-result-${f.run.id}`);
    initial.resolve({ success: true, data: f.list }); await new Promise(resolve => setTimeout(resolve, 0));
    expect(view.getByTestId(`research-result-${f.run.id}`)).toBeTruthy();
    view.rerender(<ResearchWorkbench taskId={3} observedVersion={8} references={[]} onReferencesChange={change} />);
    expect((view.getByTestId(`research-cite-${f.run.id}`) as HTMLButtonElement).disabled).toBe(true);
    recheck.resolve({ success: true, data: { ...f.list, runs: [{ run: f.run, current: false }] } });
    await view.findByText(/已过期或来源无法核对/); expect(change).not.toHaveBeenCalled();
});
test("expired records remain visible but cannot be newly cited; explicit removal does not delete the result", async () => {
    api.list.mockImplementation(async () => ({ success: true, data: { ...f.list, runs: [{ run: f.run, current: false }] } }));
    const change = mock((_ids: string[]) => {});
    const view = render(<ResearchWorkbench taskId={3} observedVersion={7} references={[]} onReferencesChange={change} />);
    const button = await view.findByTestId(`research-cite-${f.run.id}`); expect((button as HTMLButtonElement).disabled).toBe(true);
    view.rerender(<ResearchWorkbench taskId={3} observedVersion={7} references={[f.run.id]} onReferencesChange={change} />);
    fireEvent.click(view.getByText("从报告草稿移除这条引用")); expect(change).toHaveBeenCalledWith([]);
    expect(view.getByTestId(`research-result-${f.run.id}`)).toBeTruthy(); expect(api.run).not.toHaveBeenCalled();
});
