import { afterEach, expect, mock, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";

const bootstrapDom = installDomGlobals("http://localhost/student/task/1/experiment");
const { cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const { MemoryRouter, Route, Routes } = await import("react-router-dom");

mock.module("@/components/RichTextEditor", () => ({
    RichTextEditor: ({ value, editorTestId }: { value: string; editorTestId?: string }) => (
        <div data-testid={editorTestId} dangerouslySetInnerHTML={{ __html: value }} />
    ),
}));

const { ExperimentLayout } = await import("./ExperimentLayout");
bootstrapDom.restore();

const originalFetch = globalThis.fetch;
let dom: ReturnType<typeof installDomGlobals> | null = null;

afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    globalThis.fetch = originalFetch;
    dom?.restore();
    dom = null;
});

test("canceling stage reopen after inspect-dialog handoff restores focus to the completed stage pill button", async () => {
    dom = installDomGlobals("http://localhost/student/task/1/experiment");
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/tasks/1/experiment")) {
            return Response.json({
                success: true,
                data: {
                    id: 100,
                    taskId: 1,
                    version: 5,
                    currentStage: 5,
                    activeWaveNumber: 2,
                    status: "in_progress",
                    questionnaire: { title: "测试问卷", welcomeText: "欢迎语", endingText: "结束语", questions: [] },
                    reportContent: "<p>草稿内容</p>",
                    samplingResults: {},
                    populationSize: 1000,
                    stage1CompletedAt: "2026-03-01T00:00:00Z",
                    stage2CompletedAt: "2026-03-01T00:00:00Z",
                    stage3CompletedAt: "2026-03-01T00:00:00Z",
                    stage4CompletedAt: "2026-03-01T00:00:00Z",
                    stage5CompletedAt: null,
                },
            });
        }
        if (url.endsWith("/tasks/1")) {
            return Response.json({
                success: true,
                data: {
                    id: 1,
                    topicId: 3,
                    name: "焦点回归实验",
                    status: "in_progress",
                    currentStage: 5,
                    publishedAt: "2026-03-01T00:00:00Z",
                    deadline: "2099-03-01T00:00:00Z",
                    populationSize: 1000,
                    attachments: [],
                    recommendQuestions: [],
                },
            });
        }
        if (url.endsWith("/analysis-metrics")) {
            return Response.json({ success: true, data: { numericFields: [], categoricalFields: [], numeric: {}, categorical: {} } });
        }
        if (url.endsWith("/variables")) {
            return Response.json({ success: true, data: { dictionary: null } });
        }
        throw new Error(`Unexpected request: ${url}`);
    }) as typeof fetch;

    const view = render(
        <MemoryRouter initialEntries={["/task/1/experiment"]}>
            <Routes>
                <Route path="/task/:taskId/experiment" element={<ExperimentLayout />} />
            </Routes>
        </MemoryRouter>,
    );

    const stage1Btn = await waitFor(() => view.getByRole("button", { name: /查看已完成阶段 1/ }));
    stage1Btn.focus();
    fireEvent.click(stage1Btn);

    const reopenTrigger = await view.findByRole("button", { name: "重新编辑此阶段" });
    reopenTrigger.focus();
    fireEvent.click(reopenTrigger);

    await view.findByRole("alertdialog");
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    await waitFor(() => expect(view.queryByRole("alertdialog") === null).toBe(true));
    await waitFor(() => expect(document.activeElement === stage1Btn).toBe(true));
});
