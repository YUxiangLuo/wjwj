import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import type { GradeExportPreviewItem } from "../api-client";
import { installDomGlobals } from "@/test-utils/dom";

const bootstrapDom = installDomGlobals();
const { cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");

const downloadTeacherFile = mock(async (_path: string, _name: string) => undefined);
const toastError = mock(() => undefined);
mock.module("sonner", () => ({ toast: { error: toastError, success: mock(() => undefined) } }));

const preview: GradeExportPreviewItem[] = [
    { taskId: 1, topicId: 1, topic: "咖啡馆调查", classId: 1, className: "统计一班", graded: 1, total: 2, avgScore: 90 },
    { taskId: 2, topicId: 2, topic: "阅读时长", classId: 2, className: "统计二班", graded: 2, total: 2, avgScore: 80 },
];

const realClient = await import("../api-client");
mock.module("../api-client", () => ({
    ...realClient,
    downloadTeacherFile,
    teacherApi: {
        ...realClient.teacherApi,
        getClasses: async () => ({ success: true, data: [] }),
        getTopics: async () => ({ success: true, data: [] }),
        getGradeExportPreview: async () => ({ success: true, data: preview }),
        getGradeAnalytics: async () => ({ success: true, data: {
            funnel: { total: 4, notStarted: 0, inProgress: 0, pendingGrading: 0, graded: 3, rejected: 0 },
            scores: { count: 3, average: 85, median: 85, componentAverages: { questionnaire: 85, process: 85, report: 85 }, bands: [] },
        } }),
    },
}));

const { GradeExport } = await import("./GradeExport");
bootstrapDom.restore();

let restoreDom: (() => void) | null = null;

beforeEach(() => {
    restoreDom = installDomGlobals("http://localhost/teacher").restore;
    downloadTeacherFile.mockClear();
    toastError.mockClear();
});

afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    restoreDom?.();
    restoreDom = null;
});

async function renderReady() {
    const view = render(<GradeExport />);
    await waitFor(() => expect(view.getByTestId("teacher-export-row-1")).toBeTruthy());
    return view;
}

test("batch export is disabled until at least one task is selected", async () => {
    const view = await renderReady();
    const batch = view.getByTestId("teacher-export-batch") as HTMLButtonElement;
    expect(batch.disabled).toBe(true);

    fireEvent.click(view.getByTestId("teacher-export-check-1"));
    expect((view.getByTestId("teacher-export-batch") as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(view.getByTestId("teacher-export-check-1"));
    expect((view.getByTestId("teacher-export-batch") as HTMLButtonElement).disabled).toBe(true);
});

test("check-all selects every visible task", async () => {
    const view = await renderReady();

    fireEvent.click(view.getByTestId("teacher-export-check-all"));

    expect((view.getByTestId("teacher-export-check-1") as HTMLInputElement).checked).toBe(true);
    expect((view.getByTestId("teacher-export-check-2") as HTMLInputElement).checked).toBe(true);
});

test("a single row export addresses only that task", async () => {
    const view = await renderReady();

    fireEvent.click(view.getByTestId("teacher-export-single-1"));

    await waitFor(() => expect(downloadTeacherFile).toHaveBeenCalledTimes(1));
    expect(downloadTeacherFile.mock.calls[0]![0]).toContain("taskId=1");
    expect(downloadTeacherFile.mock.calls[0]![1]).toContain(".xlsx");
});

test("a batch export joins the selected task ids", async () => {
    const view = await renderReady();

    fireEvent.click(view.getByTestId("teacher-export-check-1"));
    fireEvent.click(view.getByTestId("teacher-export-check-2"));
    fireEvent.click(view.getByTestId("teacher-export-batch"));

    await waitFor(() => expect(downloadTeacherFile).toHaveBeenCalledTimes(1));
    const path = downloadTeacherFile.mock.calls[0]![0];
    expect(path).toContain("taskIds=1%2C2");
});

test("a failed export reports an error instead of silently succeeding", async () => {
    downloadTeacherFile.mockRejectedValueOnce(new Error("network"));
    const view = await renderReady();

    fireEvent.click(view.getByTestId("teacher-export-single-1"));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("导出失败"));
});
