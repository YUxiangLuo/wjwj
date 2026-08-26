import { afterAll, afterEach, beforeAll, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { installDomGlobals } from "@/test-utils/dom";
import type { ComponentProps, ReactNode } from "react";

mock.module("../components/RichTextEditor", () => ({
    RichTextEditor: ({ value, dataTestId, editorTestId }: { value: string; dataTestId?: string; editorTestId?: string }) => (
        <div data-testid={dataTestId}>
            <div data-testid={editorTestId} dangerouslySetInnerHTML={{ __html: value }} />
        </div>
    ),
}));

mock.module("@/components/ui/select", () => ({
    Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectContent: ({ children, ...props }: ComponentProps<"div">) => <div {...props}>{children}</div>,
    SelectItem: ({ children, value, ...props }: ComponentProps<"div"> & { value: string }) => <div data-value={value} {...props}>{children}</div>,
    SelectTrigger: ({ children, ...props }: ComponentProps<"button">) => <button {...props}>{children}</button>,
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder ?? ""}</span>,
}));

const { ExperimentLayout } = await import("./ExperimentLayout");

let restoreDom: (() => void) | null = null;
const originalFetch = globalThis.fetch;

beforeAll(() => {
    restoreDom = installDomGlobals("http://localhost/student/task/2/experiment").restore;
});

afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    globalThis.fetch = originalFetch;
});

afterAll(() => {
    restoreDom?.();
    restoreDom = null;
});

function experiment(version: number, reportContent: string, overrides: Record<string, unknown> = {}) {
    return {
        id: 88,
        taskId: 2,
        version,
        currentStage: 4,
        status: "in_progress",
        questionnaire: { title: "问卷", welcomeText: "欢迎参与本次抽样调查实验。", endingText: "感谢参与本次抽样调查实验。", questions: [] },
        samplePlan: { confidenceLevel: "95", marginOfError: 5, designEffect: 1, nonResponseRate: 0, recommendedSize: 100, finalSampleSize: 100 },
        samplingResults: {},
        reportContent,
        stage1CompletedAt: "2026-03-01T00:00:00.000Z",
        stage2CompletedAt: "2026-03-01T00:00:00.000Z",
        stage3CompletedAt: "2026-03-01T00:00:00.000Z",
        stage4CompletedAt: "2026-03-01T00:00:00.000Z",
        populationSize: 1000,
        ...overrides,
    };
}

test("rejected experiment keeps the teacher reason visible while the student edits", async () => {
    const rejectReason = "请补充四种抽样方法的比较，并说明分层分配依据。";
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/student/tasks/2/experiment")) {
            return Response.json({
                success: true,
                data: experiment(7, `<p>${"待修改报告".repeat(30)}</p>`, {
                    status: "rejected",
                    rejectReason,
                }),
            });
        }
        if (url.endsWith("/api/student/tasks/2")) {
            return Response.json({
                success: true,
                data: {
                    id: 2,
                    topicId: 3,
                    name: "驳回实验",
                    description: null,
                    publishedAt: "2026-03-01T00:00:00.000Z",
                    deadline: "2099-03-01T00:00:00.000Z",
                    status: "rejected",
                    currentStage: 4,
                    rejectReason,
                    populationSize: 1000,
                    attachments: [],
                    recommendQuestions: [],
                },
            });
        }
        if (url.endsWith("/api/student/tasks/2/analysis-metrics")) {
            return Response.json({ success: true, data: { numericFields: [], categoricalFields: [], numeric: {}, categorical: {} } });
        }
        throw new Error(`Unhandled fetch: ${url}`);
    }) as unknown as typeof fetch;

    let view!: ReturnType<typeof render>;
    await act(async () => {
        view = render(
            <MemoryRouter initialEntries={["/task/2/experiment"]}>
                <Routes>
                    <Route path="/task/:taskId/experiment" element={<ExperimentLayout />} />
                </Routes>
            </MemoryRouter>,
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const notice = await waitFor(() => view.getByTestId("student-experiment-rejection-notice"));
    expect(notice.getAttribute("role")).toBe("alert");
    expect(notice.textContent).toContain(rejectReason);
    expect(view.getByTestId("student-analysis-report-editor")).toBeTruthy();
});

test("version conflict blocks retry until the student explicitly loads the latest version", async () => {
    const staleReport = `<p>${"旧标签页草稿".repeat(30)}</p>`;
    const latestReport = `<p>${"服务器最新报告".repeat(30)}</p>`;
    let experimentGetCount = 0;
    let completeCount = 0;

    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/student/tasks/2/experiment") && (init?.method ?? "GET") === "GET") {
            experimentGetCount += 1;
            return Response.json({ success: true, data: experimentGetCount === 1 ? experiment(5, staleReport) : experiment(6, latestReport) });
        }
        if (url.endsWith("/api/student/tasks/2")) {
            return Response.json({
                success: true,
                data: {
                    id: 2,
                    topicId: 3,
                    name: "并发实验",
                    description: null,
                    publishedAt: "2026-03-01T00:00:00.000Z",
                    deadline: "2099-03-01T00:00:00.000Z",
                    status: "in_progress",
                    currentStage: 4,
                    populationSize: 1000,
                    attachments: [],
                    recommendQuestions: [],
                },
            });
        }
        if (url.endsWith("/api/student/tasks/2/analysis-metrics")) {
            return Response.json({ success: true, data: { numericFields: [], categoricalFields: [], numeric: {}, categorical: {} } });
        }
        if (url.endsWith("/api/student/tasks/2/experiment/stages/4/complete") && init?.method === "POST") {
            completeCount += 1;
            return Response.json({ success: false, error: { code: "VERSION_CONFLICT", message: "记录已发生变化" } }, { status: 409 });
        }
        throw new Error(`Unhandled fetch: ${url} ${init?.method ?? "GET"}`);
    }) as unknown as typeof fetch;

    let view!: ReturnType<typeof render>;
    await act(async () => {
        view = render(
            <MemoryRouter initialEntries={["/task/2/experiment"]}>
                <Routes>
                    <Route path="/task/:taskId/experiment" element={<ExperimentLayout />} />
                </Routes>
            </MemoryRouter>,
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const submit = await waitFor(() => {
        const button = view.getByTestId("student-analysis-preview") as HTMLButtonElement;
        expect(button.disabled).toBe(false);
        return button;
    });

    await act(async () => {
        fireEvent.click(submit);
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(view.getByTestId("student-load-latest-version")).toBeTruthy());
    await act(async () => {
        fireEvent.click(view.getByTestId("student-analysis-preview"));
        await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(completeCount).toBe(1);
    expect(experimentGetCount).toBe(1);

    await act(async () => {
        fireEvent.click(view.getByTestId("student-load-latest-version"));
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => {
        expect(view.getByTestId("student-analysis-report-editor").textContent).toContain("服务器最新报告");
    });
    expect(experimentGetCount).toBe(2);
});
