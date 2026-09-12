import { afterEach, beforeEach, expect, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";
const bootstrapDom = installDomGlobals();
const { act, cleanup, fireEvent, render, waitFor, within } = await import("@testing-library/react");
const { MemoryRouter, Route, Routes, useLocation } = await import("react-router-dom");
const { GradingDetail } = await import("./GradingDetail");
bootstrapDom.restore();

const originalFetch = globalThis.fetch;
let restore: () => void;
beforeEach(() => { restore = installDomGlobals().restore; });
afterEach(async () => { cleanup(); await new Promise(resolve => setTimeout(resolve, 0)); globalThis.fetch = originalFetch; restore(); });
function record(version = 1) {
    return { id: 7, version, studentName: "学生", studentId: "S1", topic: "实验", className: "班级", status: "submitted",
        submittedAt: null, reportContent: "报告", questionnaire: null, samplePlan: null, samplingResults: null,
        scoreQuestionnaire: 10, scoreProcess: 20, scoreReport: 30, teacherComment: "初始评语", weights: { questionnaire: 30, process: 30, report: 40 } };
}
function ListLocation() { const location = useLocation(); return <p data-testid="list-location">{location.pathname + location.search}</p>; }
function page(entry = "/grading/7") { return render(<MemoryRouter initialEntries={[entry]}><Routes><Route path="/grading/:submissionId" element={<GradingDetail />} /><Route path="/grading" element={<ListLocation />} /></Routes></MemoryRouter>); }

test("initial request failure is retryable rather than a missing submission", async () => {
    let requests = 0;
    globalThis.fetch = (async () => ++requests === 1
        ? Response.json({ success: false, error: { message: "服务暂不可用", code: "FAILED" } })
        : Response.json({ success: true, data: record() })) as unknown as typeof fetch;
    const view = page();
    await waitFor(() => expect(view.getByRole("alert").textContent).toContain("服务暂不可用"));
    expect(view.queryByText("未找到提交记录")).toBeNull();
    fireEvent.click(view.getByText("重试加载"));
    await waitFor(() => expect(view.getByLabelText("教师评语")).toBeTruthy());
});

test("version conflict keeps scoring inputs until an explicit refresh", async () => {
    let reads = 0;
    globalThis.fetch = (async (_input, init) => {
        if (init?.method === "POST") return Response.json({ success: false, error: { code: "VERSION_CONFLICT", message: "记录已更新" } }, { status: 409 });
        reads += 1;
        return Response.json({ success: true, data: { ...record(reads), teacherComment: reads === 1 ? "保留当前输入" : "其他页面评语" } });
    }) as typeof fetch;
    const view = page();
    await waitFor(() => expect(view.getByLabelText("教师评语")).toBeTruthy());
    fireEvent.click(view.getByText("提交评分"));
    await waitFor(() => expect(view.getByTestId("teacher-grade-confirm")).toBeTruthy());
    fireEvent.click(view.getByTestId("teacher-grade-confirm"));
    await waitFor(() => expect(view.getByText("加载最新记录并保留输入")).toBeTruthy());
    expect(reads).toBe(1);
    expect((view.getByLabelText("教师评语") as HTMLTextAreaElement).value).toBe("保留当前输入");
    fireEvent.click(view.getByText("加载最新记录并保留输入"));
    await waitFor(() => expect(reads).toBe(2));
    await waitFor(() => expect(view.queryByText("加载最新记录并保留输入")).toBeNull());
    expect((view.getByLabelText("教师评语") as HTMLTextAreaElement).value).toBe("保留当前输入");
    expect((view.getByLabelText("实验报告（40%）") as HTMLInputElement).value).toBe("30");
});

test("reading different materials keeps scores, comments and student identity in a separate panel", async () => {
    globalThis.fetch = (async () => Response.json({ success: true, data: record() })) as unknown as typeof fetch;
    const view = page();
    await waitFor(() => expect(view.getByLabelText("教师评语")).toBeTruthy());
    const panel = view.getByTestId("teacher-grading-panel");
    expect(within(panel).getByText("学生 · S1")).toBeTruthy();
    fireEvent.change(view.getByLabelText("教师评语"), { target: { value: "阅读时保留" } });
    fireEvent.keyDown(view.getByRole("tab", { name: "报告" }), { key: "Enter" });
    expect((within(panel).getByLabelText("教师评语") as HTMLTextAreaElement).value).toBe("阅读时保留");
    expect(panel.closest('[role="tabpanel"]')).toBeNull();
    expect(view.getByRole("tablist", { name: "提交材料" }).classList.contains("sticky")).toBe(true);
    fireEvent.change(view.getByLabelText("问卷设计（30%）"), { target: { value: "101" } });
    expect((view.getByText("提交评分") as HTMLButtonElement).disabled).toBe(true);
    expect(panel.textContent).toContain("分项分数需在 0–100 之间");
});

test("pending grading freezes inputs; failure preserves them and retry returns to the original list", async () => {
    const writes: Array<(response: Response) => void> = [];
    globalThis.fetch = (async (_input, init) => init?.method === "POST"
        ? new Promise<Response>(resolve => writes.push(resolve))
        : Response.json({ success: true, data: record() })) as typeof fetch;
    const view = page("/grading/7?status=graded&keyword=S1&page=2");
    await waitFor(() => expect(view.getByLabelText("教师评语")).toBeTruthy());
    fireEvent.change(view.getByLabelText("教师评语"), { target: { value: "保留这条评语" } });
    fireEvent.click(view.getByText("提交评分"));
    fireEvent.click(view.getByTestId("teacher-grade-confirm"));
    expect(writes).toHaveLength(1);
    expect((view.getByLabelText("教师评语") as HTMLTextAreaElement).disabled).toBe(true);
    expect((view.getByLabelText("问卷设计（30%）") as HTMLInputElement).disabled).toBe(true);
    expect((view.getByText("返回列表") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => writes[0]!(Response.json({ success: false, error: { code: "FAILED", message: "稍后重试" } })));
    expect((view.getByLabelText("教师评语") as HTMLTextAreaElement).value).toBe("保留这条评语");
    fireEvent.click(view.getByText("提交评分"));
    fireEvent.click(view.getByTestId("teacher-grade-confirm"));
    await act(async () => writes[1]!(Response.json({ success: true })));
    await waitFor(() => expect(view.getByTestId("list-location").textContent).toBe("/grading?status=graded&keyword=S1&page=2"));
});

test("pending rejection cannot be repeated or dismissed and a failed reason remains editable", async () => {
    let finish!: (response: Response) => void;
    let writes = 0;
    globalThis.fetch = (async (_input, init) => {
        if (init?.method === "POST") { writes++; return new Promise<Response>(resolve => { finish = resolve; }); }
        return Response.json({ success: true, data: record() });
    }) as typeof fetch;
    const view = page();
    await waitFor(() => expect(view.getByText("驳回修改")).toBeTruthy());
    fireEvent.click(view.getByText("驳回修改"));
    fireEvent.change(view.getByLabelText("请说明需要修改的内容"), { target: { value: "请补充具体估计值" } });
    fireEvent.click(view.getByText("确认驳回"));
    fireEvent.click(view.getByText("正在驳回…"));
    expect(writes).toBe(1);
    expect((view.getByText("取消") as HTMLButtonElement).disabled).toBe(true);
    expect((view.getByLabelText("请说明需要修改的内容") as HTMLTextAreaElement).disabled).toBe(true);
    await act(async () => finish(Response.json({ success: false, error: { code: "FAILED", message: "网络失败" } })));
    expect((view.getByLabelText("请说明需要修改的内容") as HTMLTextAreaElement).value).toBe("请补充具体估计值");
    expect((view.getByText("确认驳回") as HTMLButtonElement).disabled).toBe(false);
});

test("an out-of-range entered score is explained even while other scores are still blank", async () => {
    globalThis.fetch = (async () => Response.json({ success: true, data: { ...record(), scoreQuestionnaire: null, scoreProcess: null, scoreReport: null } })) as unknown as typeof fetch;
    const view = page();
    await waitFor(() => expect(view.getByLabelText("问卷设计（30%）")).toBeTruthy());
    fireEvent.change(view.getByLabelText("问卷设计（30%）"), { target: { value: "101" } });
    expect(view.getByText("分项分数需在 0–100 之间。")).toBeTruthy();
    expect((view.getByText("提交评分") as HTMLButtonElement).disabled).toBe(true);
});

test("zero scores still require explicit confirmation rather than being submitted automatically", async () => {
    let writes = 0;
    globalThis.fetch = (async (_input, init) => { if (init?.method === "POST") writes++; return Response.json({ success: true, data: record() }); }) as typeof fetch;
    const view = page();
    await waitFor(() => expect(view.getByLabelText("教师评语")).toBeTruthy());
    for (const input of view.getAllByRole("spinbutton")) fireEvent.change(input, { target: { value: "0" } });
    fireEvent.click(view.getByText("提交评分"));
    expect(view.getByText(/三项得分都是 0/)).toBeTruthy();
    expect(view.getByTestId("teacher-grade-confirm")).toBeTruthy();
    expect(writes).toBe(0);
});
