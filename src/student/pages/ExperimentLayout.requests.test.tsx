import { expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { installDomGlobals } from "@/test-utils/dom";
import type { ComponentProps, ReactNode } from "react";

const Panel = ({ children, ...props }: ComponentProps<"div">) => <div {...props}>{children}</div>;
const Modal = ({ children, open }: { children: ReactNode; open?: boolean }) => open ? <div>{children}</div> : null;
const ModalButton = ({ children, variant: _variant, ...props }: ComponentProps<"button"> & { variant?: string }) => <button {...props}>{children}</button>;
mock.module("@/components/ui/dialog", () => ({
    Dialog: Modal, DialogContent: Panel, DialogDescription: Panel, DialogFooter: Panel, DialogHeader: Panel, DialogTitle: Panel,
}));
mock.module("@/components/ui/alert-dialog", () => ({
    AlertDialog: Modal, AlertDialogContent: Panel, AlertDialogDescription: Panel, AlertDialogFooter: Panel, AlertDialogHeader: Panel, AlertDialogTitle: Panel,
    AlertDialogAction: ModalButton, AlertDialogCancel: ModalButton,
}));

mock.module("@/components/RichTextEditor", () => ({
    RichTextEditor: ({ value, editorTestId }: { value: string; editorTestId?: string }) => <div data-testid={editorTestId} dangerouslySetInnerHTML={{ __html: value }} />,
}));
const { ExperimentLayout } = await import("./ExperimentLayout");

function NavigationProbe() {
    const location = useLocation();
    const navigate = useNavigate();
    return <><output data-testid="location">{location.pathname}</output><button onClick={() => navigate("/task/2/experiment")}>切换实验</button></>;
}

function experiment(taskId: number, overrides: Record<string, unknown> = {}) {
    return {
        id: taskId * 100, taskId, version: 5, currentStage: 5, activeWaveNumber: 2, status: "in_progress",
        questionnaire: { title: `问卷${taskId}`, welcomeText: "欢迎", endingText: "感谢", questions: [] },
        reportContent: `<p>${`任务${taskId}的报告`.repeat(30)}</p>`, samplingResults: {}, populationSize: 1000,
        stage1CompletedAt: "2026-03-01T00:00:00Z", stage2CompletedAt: "2026-03-01T00:00:00Z", stage3CompletedAt: "2026-03-01T00:00:00Z", stage4CompletedAt: "2026-03-01T00:00:00Z", stage5CompletedAt: null,
        ...overrides,
    };
}

const conflict = () => Response.json({ success: false, error: { code: "VERSION_CONFLICT", message: "记录已变化" } }, { status: 409 });
type Operation = "save" | "save-conflict" | "reopen";

test("successful reopen retry clears the visible network error and opens the requested stage", async () => {
    const dom = installDomGlobals("http://localhost/student/task/1/experiment");
    const originalFetch = globalThis.fetch;
    let attempts = 0;
    try {
        globalThis.fetch = (async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith("/reopen")) {
                attempts += 1;
                if (attempts === 1) throw new TypeError("Failed to fetch");
                return Response.json({ success: true, data: experiment(1, { version: 6, currentStage: 1, stage1CompletedAt: null, stage2CompletedAt: null, stage3CompletedAt: null, stage4CompletedAt: null, stage5CompletedAt: null }) });
            }
            if (url.endsWith("/experiment")) return Response.json({ success: true, data: experiment(1) });
            if (url.endsWith("/variables")) return Response.json({ success: true, data: { dictionary: null } });
            if (url.endsWith("/analysis-metrics")) return Response.json({ success: true, data: { numericFields: [], categoricalFields: [], numeric: {}, categorical: {} } });
            if (url.endsWith("/tasks/1")) return Response.json({ success: true, data: { id: 1, topicId: 3, name: "重试实验", status: "in_progress", currentStage: 5, publishedAt: "2026-03-01T00:00:00Z", deadline: "2099-03-01T00:00:00Z", populationSize: 1000, attachments: [], recommendQuestions: [] } });
            throw new Error(`Unexpected request: ${url}`);
        }) as typeof fetch;
        const view = render(<MemoryRouter initialEntries={["/task/1/experiment"]}><Routes><Route path="/task/:taskId/experiment" element={<ExperimentLayout />} /></Routes></MemoryRouter>);
        const reopen = async () => {
            fireEvent.click(await waitFor(() => view.getByRole("button", { name: /查看已完成阶段 1/ })));
            fireEvent.click(await waitFor(() => view.getByRole("button", { name: "重新编辑此阶段" })));
            fireEvent.click(await waitFor(() => view.getByRole("button", { name: "确认重新编辑" })));
        };
        await reopen();
        const errorMessage = "网络连接失败，请检查网络后重试";
        await waitFor(() => expect(view.queryByText(errorMessage) !== null).toBe(true));
        await reopen();
        await waitFor(() => expect(view.queryByRole("button", { name: /当前阶段 1：商业问卷设计/ }) !== null).toBe(true));
        await waitFor(() => expect(view.queryByText(errorMessage) === null).toBe(true));
        expect(attempts).toBe(2);
        expect(view.getAllByRole("heading", { name: "商业问卷设计" }).length).toBeGreaterThan(0);
    } finally { cleanup(); globalThis.fetch = originalFetch; dom.restore(); }
});

async function setup(operation: Operation) {
    const pending = Promise.withResolvers<Response>();
    let started = false;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        const taskId = Number(url.match(/\/tasks\/(\d+)/)?.[1]);
        if (url.endsWith("/complete")) {
            started = true;
            return pending.promise;
        }
        if (url.endsWith("/reopen")) { started = true; return pending.promise; }
        if (url.endsWith("/experiment")) {
            return Response.json({ success: true, data: experiment(taskId) });
        }
        if (url.endsWith("/variables")) return Response.json({ success: true, data: { dictionary: null } });
        if (url.endsWith("/analysis-metrics")) return Response.json({ success: true, data: { numericFields: [], categoricalFields: [], numeric: {}, categorical: {} } });
        if (url.endsWith(`/tasks/${taskId}`)) return Response.json({ success: true, data: {
            id: taskId, topicId: 3, name: `任务${taskId}`, status: "in_progress", currentStage: 5,
            publishedAt: "2026-03-01T00:00:00Z", deadline: "2099-03-01T00:00:00Z", populationSize: 1000, attachments: [], recommendQuestions: [],
        } });
        throw new Error(`Unexpected request: ${url}`);
    }) as typeof fetch;
    const view = render(<MemoryRouter initialEntries={["/task/1/experiment"]}>
        <NavigationProbe />
        <Routes>
            <Route path="/task/:taskId/experiment" element={<ExperimentLayout />} />
            <Route path="/task/:taskId" element={<p>已退出实验</p>} />
            <Route path="/task/:taskId/preview" element={<p>提交预览</p>} />
        </Routes>
    </MemoryRouter>);
    fireEvent.click(await waitFor(() => view.getByTestId("student-analysis-write")));
    await waitFor(() => expect((view.getByTestId("student-analysis-preview") as HTMLButtonElement).disabled).toBe(false));
    if (operation === "reopen") {
        fireEvent.click(view.getByRole("button", { name: /查看已完成阶段 1/ }));
        fireEvent.click(await waitFor(() => view.getByRole("button", { name: "重新编辑此阶段" })));
        fireEvent.click(await waitFor(() => view.getByRole("button", { name: "确认重新编辑" })));
    } else {
        fireEvent.click(view.getByTestId("student-analysis-preview"));
    }
    await waitFor(() => expect(started).toBe(true));
    return { view, finish: async () => {
        await act(async () => {
            pending.resolve(operation === "save-conflict" ? conflict() : Response.json({ success: true, data: experiment(1, {
                version: 6, status: "rejected", rejectReason: "旧任务的迟到响应不应出现",
            }) }));
            await new Promise(resolve => setTimeout(resolve, 0));
        });
    } };
}

// One representative in-flight operation covers the shared mounted/task guard.
for (const operation of ["save"] as const) {
    test(`${operation} response cannot update or navigate a different task`, async () => {
        const dom = installDomGlobals("http://localhost/student/task/1/experiment");
        const originalFetch = globalThis.fetch;
        try {
            const { view, finish } = await setup(operation);
            fireEvent.click(view.getByRole("button", { name: "切换实验" }));
            await waitFor(() => expect(view.getByTestId("student-analysis-report-editor").textContent).toContain("任务2的报告"));
            fireEvent.click(view.getByTestId("student-analysis-write"));
            await finish();
            expect(view.getByTestId("location").textContent).toBe("/task/2/experiment");
            expect(view.getByTestId("student-analysis-report-editor").textContent).toContain("任务2的报告");
            expect(view.queryByTestId("student-refresh-experiment") === null).toBe(true);
            expect(view.queryByText("旧任务的迟到响应不应出现") === null).toBe(true);
            expect((view.getByTestId("student-analysis-preview") as HTMLButtonElement).disabled).toBe(false);
        } finally { cleanup(); globalThis.fetch = originalFetch; dom.restore(); }
    });
}

test("exiting through the actual exit link during report save is not undone by its response", async () => {
    const dom = installDomGlobals("http://localhost/student/task/1/experiment");
    const originalFetch = globalThis.fetch;
    try {
        const { view, finish } = await setup("save");
        fireEvent.click(view.getByRole("link", { name: "课题书" }));
        await waitFor(() => expect(view.getByText("已退出实验")).toBeTruthy());
        await finish();
        expect(view.getByTestId("location").textContent).toBe("/task/1");
        expect(view.queryByText("提交预览") === null).toBe(true);
    } finally { cleanup(); globalThis.fetch = originalFetch; dom.restore(); }
});

test("inspecting Stage 2 shows Wave 1 snapshot and double-clicking reopen dispatches only once", async () => {
    const dom = installDomGlobals("http://localhost/student/task/1/experiment");
    const originalFetch = globalThis.fetch;
    const pendingReopen = Promise.withResolvers<Response>();
    let reopenCalls = 0;
    try {
        globalThis.fetch = (async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith("/reopen")) {
                reopenCalls += 1;
                return pendingReopen.promise;
            }
            if (url.endsWith("/experiment")) {
                return Response.json({
                    success: true,
                    data: experiment(1, {
                        waves: [
                            {
                                waveNumber: 1,
                                kind: "pilot",
                                label: "第 1 轮 · 首轮试投",
                                questionnaire: { title: "首轮冻结问卷", welcomeText: "欢迎", endingText: "感谢", questions: [] },
                                samplePlan: { estimationType: "mean", confidenceLevel: "95", marginOfError: 3, populationVariance: 100, designEffect: 1, nonResponseRate: 0.1, recommendedSize: 35, finalSampleSize: 35 },
                                samplingResults: { simple: { completed: true, sampleCount: 35, data: [] } },
                                completedAt: "2026-03-01T00:00:00Z",
                            },
                        ],
                    }),
                });
            }
            if (url.endsWith("/variables")) return Response.json({ success: true, data: { dictionary: null } });
            if (url.endsWith("/analysis-metrics")) return Response.json({ success: true, data: { numericFields: [], categoricalFields: [], numeric: {}, categorical: {} } });
            if (url.endsWith("/tasks/1")) return Response.json({ success: true, data: { id: 1, topicId: 3, name: "试投检视实验", status: "in_progress", currentStage: 5, publishedAt: "2026-03-01T00:00:00Z", deadline: "2099-03-01T00:00:00Z", populationSize: 1000, attachments: [], recommendQuestions: [] } });
            throw new Error(`Unexpected request: ${url}`);
        }) as typeof fetch;

        const view = render(<MemoryRouter initialEntries={["/task/1/experiment"]}><Routes><Route path="/task/:taskId/experiment" element={<ExperimentLayout />} /></Routes></MemoryRouter>);
        fireEvent.click(await waitFor(() => view.getByRole("button", { name: /查看已完成阶段 2/ })));
        await waitFor(() => expect(view.queryByTestId("wave-loop-snapshot") !== null).toBe(true));
        expect(view.container.textContent).toContain("35 份");

        fireEvent.click(view.getByRole("button", { name: "重新编辑此阶段" }));
        const confirmBtn = await waitFor(() => view.getByRole("button", { name: "确认重新编辑" }));
        fireEvent.click(confirmBtn);
        fireEvent.click(confirmBtn);
        expect(reopenCalls).toBe(1);

        await act(async () => {
            pendingReopen.resolve(Response.json({ success: true, data: experiment(1, { version: 6, currentStage: 2, stage2CompletedAt: null, stage3CompletedAt: null, stage4CompletedAt: null }) }));
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
    } finally { cleanup(); globalThis.fetch = originalFetch; dom.restore(); }
});

test.each([
    {
        label: "not-yet-open task",
        taskData: {
            id: 9,
            topicId: 3,
            name: "未开放课题",
            status: "not_started",
            currentStage: 0,
            publishedAt: "2099-09-01T00:00:00Z",
            deadline: "2099-10-01T00:00:00Z",
            populationSize: 1000,
            attachments: [],
            recommendQuestions: [],
        },
        expStatus: 403,
        expError: { code: "TASK_NOT_OPEN", message: "实验尚未开放" },
    },
    {
        label: "expired unstarted task",
        taskData: {
            id: 9,
            topicId: 3,
            name: "已截止未立项课题",
            status: "not_started",
            currentStage: 0,
            publishedAt: "2025-09-01T00:00:00Z",
            deadline: "2025-10-01T00:00:00Z",
            populationSize: 1000,
            attachments: [],
            recommendQuestions: [],
        },
        expStatus: 400,
        expError: { code: "TASK_DEADLINE", message: "任务已截止" },
    },
])("deep-linking /experiment on $label redirects cleanly to /task/:id instead of rendering error page", async ({ taskData, expStatus, expError }) => {
    const dom = installDomGlobals("http://localhost/student/task/9/experiment");
    const originalFetch = globalThis.fetch;
    try {
        globalThis.fetch = (async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith("/tasks/9/experiment")) {
                return Response.json({ success: false, error: expError }, { status: expStatus });
            }
            if (url.endsWith("/tasks/9")) {
                return Response.json({ success: true, data: taskData });
            }
            throw new Error(`Unexpected request: ${url}`);
        }) as typeof fetch;

        const view = render(
            <MemoryRouter initialEntries={["/task/9/experiment"]}>
                <NavigationProbe />
                <Routes>
                    <Route path="/task/:taskId/experiment" element={<ExperimentLayout />} />
                    <Route path="/task/:taskId" element={<p data-testid="task-detail-destination">课题详情页</p>} />
                </Routes>
            </MemoryRouter>,
        );

        await waitFor(() => expect(view.queryByTestId("task-detail-destination") !== null).toBe(true));
        expect(view.getByTestId("location").textContent).toBe("/task/9");
        expect(view.queryByText("实验进度加载失败，请重试或返回任务。") === null).toBe(true);
    } finally {
        cleanup();
        globalThis.fetch = originalFetch;
        dom.restore();
    }
});
