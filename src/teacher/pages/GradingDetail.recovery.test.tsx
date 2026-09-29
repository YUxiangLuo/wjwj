import { afterEach, beforeEach, expect, test } from "bun:test";
import type { TargetAnalysisMetrics, TargetMethodMetrics } from "@/domain/experiment/analysis-types";
import { installDomGlobals } from "@/test-utils/dom";
const bootstrapDom = installDomGlobals();
const { act, cleanup, fireEvent, render, waitFor, within } = await import("@testing-library/react");
const { MemoryRouter, Route, Routes, useLocation, useNavigate } = await import("react-router-dom");
const { GradingDetail } = await import("./GradingDetail");
const { TeacherIdContext } = await import("../teacher-draft");
bootstrapDom.restore();

const originalFetch = globalThis.fetch;
let restore: () => void;
beforeEach(() => { restore = installDomGlobals().restore; localStorage.clear(); });
afterEach(async () => { cleanup(); await new Promise(resolve => setTimeout(resolve, 0)); localStorage.clear(); globalThis.fetch = originalFetch; restore(); });
const unavailableTargetMethod: TargetMethodMetrics = { estimate: null, standardError: null, marginOfError: null, sampleSize: null, effectiveSampleSize: null, reliability: { status: "unavailable", reasons: [] } };
const frozenTargetMetrics: TargetAnalysisMetrics = {
    contract: { inferred: false, contract: { version: 1, researchQuestion: "总体平均重量是多少？", targetPopulation: "全部单位", unitOfAnalysis: "一行记录", target: { kind: "mean", field: "weight" } } },
    confidenceLevel: "95", plannedMarginOfError: 2, unit: "kg", populationValue: 10,
    methods: {
        simple: { estimate: 9.5, standardError: 0.5, marginOfError: 0.98, sampleSize: 60, effectiveSampleSize: 55, reliability: { status: "ok", reasons: [] } },
        systematic: unavailableTargetMethod, pps: unavailableTargetMethod, stratified: unavailableTargetMethod,
    },
};
function record(version = 1) {
    return { id: 7, version, studentName: "学生", studentId: "S1", topic: "实验", className: "班级", status: "submitted",
        submittedAt: null, reportContent: "报告", questionnaire: null, samplePlan: null, samplingResults: null,
        scoreQuestionnaire: 10, scoreProcess: 20, scoreReport: 30, teacherComment: "初始评语", weights: { questionnaire: 30, process: 30, report: 40 } };
}
function ListLocation() { const location = useLocation(); return <p data-testid="list-location">{location.pathname + location.search}</p>; }
function SubmissionSwitcher() { const navigate = useNavigate(); return <button onClick={() => navigate("/grading/8")}>切换到提交 8</button>; }
function page(entry = "/grading/7") { return render(<TeacherIdContext.Provider value={9}><MemoryRouter initialEntries={[entry]}><SubmissionSwitcher /><Routes><Route path="/grading/:submissionId" element={<GradingDetail />} /><Route path="/grading" element={<ListLocation />} /></Routes></MemoryRouter></TeacherIdContext.Provider>); }

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

test("version conflict loads the latest record instead of replaying an old-version draft", async () => {
    let reads = 0;
    globalThis.fetch = (async (_input, init) => {
        if (init?.method === "POST") return Response.json({ success: false, error: { code: "VERSION_CONFLICT", message: "记录已更新" } }, { status: 409 });
        reads += 1;
        return Response.json({ success: true, data: { ...record(reads), teacherComment: reads === 1 ? "保留当前输入" : "其他页面评语" } });
    }) as typeof fetch;
    const view = page();
    await waitFor(() => expect(view.getByLabelText("教师评语")).toBeTruthy());
    fireEvent.change(view.getByLabelText("教师评语"), { target: { value: "本机批改草稿" } });
    fireEvent.click(view.getByText("提交评分"));
    await waitFor(() => expect(view.getByTestId("teacher-grade-confirm")).toBeTruthy());
    fireEvent.click(view.getByTestId("teacher-grade-confirm"));
    await waitFor(() => expect(view.getByText("重新加载最新记录")).toBeTruthy());
    expect(reads).toBe(1);
    expect((view.getByLabelText("教师评语") as HTMLTextAreaElement).value).toBe("本机批改草稿");
    fireEvent.click(view.getByText("重新加载最新记录"));
    await waitFor(() => expect(reads).toBe(2));
    await waitFor(() => expect(view.queryByText("重新加载最新记录")).toBeNull());
    expect((view.getByLabelText("教师评语") as HTMLTextAreaElement).value).toBe("其他页面评语");
    expect((view.getByLabelText("实验报告（40%）") as HTMLInputElement).value).toBe("30");
});

test("score inputs hint the expected 0–100 range", async () => {
    globalThis.fetch = (async () => Response.json({ success: true, data: record() })) as unknown as typeof fetch;
    const view = page();
    await waitFor(() => expect(view.getByLabelText("教师评语")).toBeTruthy());
    for (const label of ["问卷设计（30%）", "实验过程（30%）", "实验报告（40%）"]) {
        expect((view.getByLabelText(label) as HTMLInputElement).placeholder).toBe("0–100");
    }
});

test("viewing server grading values does not create a local draft", async () => {
    globalThis.fetch = (async () => Response.json({ success: true, data: record() })) as unknown as typeof fetch;
    const view = page();
    await waitFor(() => expect((view.getByLabelText("教师评语") as HTMLTextAreaElement).value).toBe("初始评语"));
    expect(localStorage.getItem("wj:teacher-draft:9:grading:7")).toBeNull();
});

test("switching submissions cannot copy one submission draft into another", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const id = Number(new URL(String(input), "http://localhost").pathname.split("/").at(-1));
        return Response.json({ success: true, data: {
            ...record(),
            id,
            topic: `实验 ${id}`,
            scoreQuestionnaire: id === 8 ? 40 : 10,
            scoreProcess: id === 8 ? 50 : 20,
            scoreReport: id === 8 ? 60 : 30,
            teacherComment: `服务端评语 ${id}`,
        } });
    }) as unknown as typeof fetch;
    const view = page();
    await waitFor(() => expect((view.getByLabelText("教师评语") as HTMLTextAreaElement).value).toBe("服务端评语 7"));
    fireEvent.change(view.getByLabelText("教师评语"), { target: { value: "提交 7 的本地草稿" } });
    expect(localStorage.getItem("wj:teacher-draft:9:grading:7")).toContain("提交 7 的本地草稿");

    fireEvent.click(view.getByText("切换到提交 8"));
    await waitFor(() => expect(view.getByRole("heading", { name: "学生 · 实验 8" })).toBeTruthy());
    expect((view.getByLabelText("教师评语") as HTMLTextAreaElement).value).toBe("服务端评语 8");
    expect((view.getByLabelText("问卷设计（30%）") as HTMLInputElement).value).toBe("40");
    expect(localStorage.getItem("wj:teacher-draft:9:grading:8")).toBeNull();
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

test("report review renders the frozen target estimate, teaching half-width, and unit", async () => {
    globalThis.fetch = (async () => Response.json({ success: true, data: { ...record(), targetMetrics: frozenTargetMetrics } })) as unknown as typeof fetch;
    const view = page();
    await waitFor(() => expect(view.getByLabelText("教师评语")).toBeTruthy());
    fireEvent.keyDown(view.getByRole("tab", { name: "报告" }), { key: "Enter" });
    expect(view.getByText("研究目标结果")).toBeTruthy();
    expect(view.getByText("10.0000 kg")).toBeTruthy();
    expect(view.getByText("9.5000 kg")).toBeTruthy();
    expect(view.getByText("±0.9800 kg")).toBeTruthy();
});

test("pending grading freezes inputs; failure preserves them and retry returns to the original list", async () => {
    const writes: Array<(response: Response) => void> = [];
    globalThis.fetch = (async (_input, init) => init?.method === "POST"
        ? new Promise<Response>(resolve => writes.push(resolve))
        : Response.json({ success: true, data: record() })) as typeof fetch;
    const view = page("/grading/7?status=graded&keyword=S1&page=2");
    await waitFor(() => expect(view.getByLabelText("教师评语")).toBeTruthy());
    fireEvent.change(view.getByLabelText("教师评语"), { target: { value: "保留这条评语" } });
    expect(localStorage.getItem("wj:teacher-draft:9:grading:7")).toContain("保留这条评语");
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
    expect(localStorage.getItem("wj:teacher-draft:9:grading:7")).toBeNull();
});

test("a grading draft survives leaving and reopening the page", async () => {
    globalThis.fetch = (async () => Response.json({ success: true, data: record() })) as unknown as typeof fetch;
    const first = page();
    await waitFor(() => expect(first.getByLabelText("教师评语")).toBeTruthy());
    fireEvent.change(first.getByLabelText("教师评语"), { target: { value: "浏览器本地草稿" } });
    first.unmount();

    const reopened = page();
    await waitFor(() => expect((reopened.getByLabelText("教师评语") as HTMLTextAreaElement).value).toBe("浏览器本地草稿"));
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

test("continue grading waits for save, freezes the queue lookup and restores only the next submission's draft", async () => {
    let finishSave!: (response: Response) => void;
    let finishQueue!: (response: Response) => void;
    const requests: string[] = [];
    globalThis.fetch = (async (input, init) => {
        const url = new URL(String(input), "http://localhost");
        requests.push(`${init?.method ?? "GET"} ${url.pathname}${url.search}`);
        if (init?.method === "POST") return new Promise<Response>(resolve => { finishSave = resolve; });
        if (url.pathname === "/api/teacher/grading") return new Promise<Response>(resolve => { finishQueue = resolve; });
        const id = Number(url.pathname.split("/").at(-1));
        return Response.json({ success: true, data: { ...record(), id, studentName: `学生${id}`, scoreReport: id === 8 ? 65 : 30 } });
    }) as typeof fetch;
    localStorage.setItem("wj:teacher-draft:9:grading:8", JSON.stringify({ version: 1, scores: { questionnaire: "45", process: "55", report: "65" }, comment: "第八份草稿", rejectReason: "" }));
    const view = page("/grading/7?status=all&keyword=S&page=3");
    await waitFor(() => expect(view.getByLabelText("教师评语")).toBeTruthy());
    fireEvent.change(view.getByLabelText("教师评语"), { target: { value: "第七份评语" } });
    fireEvent.click(view.getByText("提交评分"));
    fireEvent.click(view.getByTestId("teacher-grade-next"));
    expect(requests).toHaveLength(2);
    expect(localStorage.getItem("wj:teacher-draft:9:grading:7")).toContain("第七份评语");
    await act(async () => finishSave(Response.json({ success: true })));
    expect(requests[2]).toBe("GET /api/teacher/grading?status=pending&keyword=S&page=1&pageSize=1");
    expect((view.getByLabelText("教师评语") as HTMLTextAreaElement).disabled).toBe(true);
    expect((view.getByText("返回列表") as HTMLButtonElement).disabled).toBe(true);
    expect(localStorage.getItem("wj:teacher-draft:9:grading:7")).toBeNull();
    await act(async () => finishQueue(Response.json({ success: true, data: { items: [{ id: 8 }], total: 1 } })));
    await waitFor(() => expect(view.getByRole("heading", { name: "学生8 · 实验" })).toBeTruthy());
    expect(document.activeElement === view.getByRole("heading", { name: "学生8 · 实验" })).toBe(true);
    expect((view.getByLabelText("教师评语") as HTMLTextAreaElement).value).toBe("第八份草稿");
    expect((view.getByLabelText("实验报告（40%）") as HTMLInputElement).value).toBe("65");
    expect((view.getByLabelText("教师评语") as HTMLTextAreaElement).disabled).toBe(false);
    fireEvent.click(view.getByText("返回列表"));
    expect(view.getByTestId("list-location").textContent).toBe("/grading?status=all&keyword=S&page=3");
});

for (const outcome of ["save-failed", "queue-failed", "empty"] as const) test(`continue grading: ${outcome} does not lose or resubmit a grade`, async () => {
    let writes = 0;
    let queues = 0;
    globalThis.fetch = (async (input, init) => {
        if (init?.method === "POST") { writes++; return Response.json(outcome === "save-failed" ? { success: false, error: { message: "保存失败" } } : { success: true }); }
        if (new URL(String(input), "http://localhost").pathname === "/api/teacher/grading") {
            queues++;
            return Response.json(outcome === "queue-failed" ? { success: false, error: { message: "列表失败" } } : { success: true, data: { items: [], total: 0 } });
        }
        return Response.json({ success: true, data: record() });
    }) as typeof fetch;
    const view = page("/grading/7?keyword=S1&page=2");
    await waitFor(() => expect(view.getByLabelText("教师评语")).toBeTruthy());
    fireEvent.change(view.getByLabelText("教师评语"), { target: { value: "待保存评语" } });
    fireEvent.click(view.getByText("提交评分"));
    fireEvent.click(view.getByTestId("teacher-grade-next"));
    if (outcome === "save-failed") {
        await waitFor(() => expect((view.getByLabelText("教师评语") as HTMLTextAreaElement).disabled).toBe(false));
        expect(queues).toBe(0);
        expect(localStorage.getItem("wj:teacher-draft:9:grading:7")).toContain("待保存评语");
        expect(view.queryByTestId("list-location")).toBeNull();
    } else {
        await waitFor(() => expect(view.getByTestId("list-location").textContent).toBe("/grading?keyword=S1&page=2"));
        expect(queues).toBe(1);
        expect(localStorage.getItem("wj:teacher-draft:9:grading:7")).toBeNull();
    }
    expect(writes).toBe(1);
});
