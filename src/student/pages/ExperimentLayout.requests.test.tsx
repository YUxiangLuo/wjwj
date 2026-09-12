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
        id: taskId * 100, taskId, version: 5, currentStage: 4, status: "in_progress",
        questionnaire: { title: `问卷${taskId}`, welcomeText: "欢迎", endingText: "感谢", questions: [] },
        reportContent: `<p>${`任务${taskId}的报告`.repeat(30)}</p>`, samplingResults: {}, populationSize: 1000,
        stage1CompletedAt: "2026-03-01T00:00:00Z", stage2CompletedAt: "2026-03-01T00:00:00Z", stage3CompletedAt: "2026-03-01T00:00:00Z", stage4CompletedAt: null,
        ...overrides,
    };
}

const conflict = () => Response.json({ success: false, error: { code: "VERSION_CONFLICT", message: "记录已变化" } }, { status: 409 });
type Operation = "save" | "save-conflict" | "latest" | "reopen";

async function setup(operation: Operation) {
    const pending = Promise.withResolvers<Response>();
    let started = false;
    let firstTaskReads = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        const taskId = Number(url.match(/\/tasks\/(\d+)/)?.[1]);
        if (url.endsWith("/complete")) {
            if (operation === "latest") return conflict();
            started = true;
            return pending.promise;
        }
        if (url.endsWith("/reopen")) { started = true; return pending.promise; }
        if (url.endsWith("/experiment")) {
            if (taskId === 1 && ++firstTaskReads > 1 && operation === "latest") { started = true; return pending.promise; }
            return Response.json({ success: true, data: experiment(taskId) });
        }
        if (url.endsWith("/analysis-metrics")) return Response.json({ success: true, data: { numericFields: [], categoricalFields: [], numeric: {}, categorical: {} } });
        if (url.endsWith(`/tasks/${taskId}`)) return Response.json({ success: true, data: {
            id: taskId, topicId: 3, name: `任务${taskId}`, status: "in_progress", currentStage: 4,
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
        if (operation === "latest") fireEvent.click(await waitFor(() => view.getByTestId("student-load-latest-version")));
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

// One representative in-flight operation; the guard is shared by save,
// conflict, latest-version and reopen responses.
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
            expect(view.queryByTestId("student-load-latest-version") === null).toBe(true);
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
        fireEvent.click(view.getByRole("link", { name: "返回任务" }));
        await waitFor(() => expect(view.getByText("已退出实验")).toBeTruthy());
        await finish();
        expect(view.getByTestId("location").textContent).toBe("/task/1");
        expect(view.queryByText("提交预览") === null).toBe(true);
    } finally { cleanup(); globalThis.fetch = originalFetch; dom.restore(); }
});
