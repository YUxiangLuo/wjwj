import { afterEach, beforeEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { installDomGlobals } from "@/test-utils/dom";
import { GradingDetail } from "./GradingDetail";

const originalFetch = globalThis.fetch;
let restore: () => void;
beforeEach(() => { restore = installDomGlobals().restore; });
afterEach(() => { cleanup(); globalThis.fetch = originalFetch; restore(); });
function record(version = 1) {
    return { id: 7, version, studentName: "学生", studentId: "S1", topic: "实验", className: "班级", status: "submitted",
        submittedAt: null, reportContent: "报告", questionnaire: null, samplePlan: null, samplingResults: null,
        scoreQuestionnaire: 10, scoreProcess: 20, scoreReport: 30, teacherComment: "初始评语", weights: { questionnaire: 30, process: 30, report: 40 } };
}
function page() { return render(<MemoryRouter initialEntries={["/grading/7"]}><Routes><Route path="/grading/:submissionId" element={<GradingDetail />} /></Routes></MemoryRouter>); }

test("ungraded submissions keep score fields empty until the teacher enters them", async () => {
    globalThis.fetch = (async () => Response.json({ success: true, data: { ...record(), scoreQuestionnaire: null, scoreProcess: null, scoreReport: null } })) as unknown as typeof fetch;
    const view = page();
    await waitFor(() => expect(view.getByLabelText("教师评语")).toBeTruthy());
    expect((view.getByLabelText("问卷设计（30%）") as HTMLInputElement).value).toBe("");
    expect((view.getByRole("button", { name: "提交评分" }) as HTMLButtonElement).disabled).toBe(true);
});

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

test("a completed save cannot navigate away from the page the teacher opened next", async () => {
    let finish!: (response: Response) => void;
    globalThis.fetch = (async (_input, init) => {
        if (init?.method === "POST") return new Promise<Response>(resolve => { finish = resolve; });
        return Response.json({ success: true, data: record() });
    }) as typeof fetch;
    const view = render(<MemoryRouter initialEntries={["/grading/7"]}>
        <Link to="/other">切换页面</Link>
        <Routes><Route path="/grading/:submissionId" element={<GradingDetail />} /><Route path="/other" element={<p>其他页面</p>} /><Route path="/grading" element={<p>批改列表</p>} /></Routes>
    </MemoryRouter>);
    await waitFor(() => expect(view.getByText("提交评分")).toBeTruthy());
    fireEvent.click(view.getByText("提交评分"));
    await waitFor(() => expect(view.getByTestId("teacher-grade-confirm")).toBeTruthy());
    fireEvent.click(view.getByTestId("teacher-grade-confirm"));
    fireEvent.click(view.getByText("切换页面"));
    expect(view.getByText("其他页面")).toBeTruthy();
    await act(async () => { finish(Response.json({ success: true, data: { totalScore: 90 } })); });
    expect(view.getByText("其他页面")).toBeTruthy();
    expect(view.queryByText("批改列表")).toBeNull();
});
