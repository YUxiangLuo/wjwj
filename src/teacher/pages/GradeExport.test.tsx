import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { act, cleanup, render, waitFor, within } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import { GradeExport } from "./GradeExport";

const originalFetch = globalThis.fetch;
let restoreDom: (() => void) | null = null;

beforeEach(() => {
    restoreDom = installDomGlobals("http://localhost/teacher/grade-export").restore;
});

afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    globalThis.fetch = originalFetch;
    restoreDom?.();
    restoreDom = null;
});

function success(data: unknown) {
    return Response.json({ success: true, data });
}

test("grade analytics render missing component averages as unavailable instead of zero", async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/teacher/classes") || url.endsWith("/api/teacher/topics")) return success([]);
        if (url.includes("/api/teacher/grade-export/preview")) return success([]);
        if (url.includes("/api/teacher/grade-export/analytics")) {
            return success({
                funnel: { total: 0, notStarted: 0, inProgress: 0, pendingGrading: 0, graded: 0, rejected: 0 },
                scores: {
                    count: 0,
                    average: null,
                    median: null,
                    componentAverages: { questionnaire: null, process: null, report: null },
                    bands: ["<60", "60–69", "70–79", "80–89", "90–100"].map((label) => ({ label, count: 0 })),
                },
            });
        }
        throw new Error(`Unhandled fetch: ${url}`);
    }) as unknown as typeof fetch;

    const view = render(<GradeExport />);
    await waitFor(() => expect(view.getByTestId("teacher-grade-analytics")).toBeTruthy());
    const componentCard = view.getByText("分项平均分").closest("div[class]")?.parentElement?.parentElement;
    expect(componentCard).toBeTruthy();
    expect(within(componentCard as HTMLElement).queryByText("0.0 分")).toBeNull();
    expect(within(componentCard as HTMLElement).getAllByText("—")).toHaveLength(3);
});

test("grade export distinguishes API failures from genuinely empty results", async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/teacher/classes") || url.endsWith("/api/teacher/topics")) return success([]);
        if (url.includes("/api/teacher/grade-export/preview")) {
            return Response.json({ success: false, error: { code: "FAILED", message: "导出列表暂不可用" } }, { status: 500 });
        }
        if (url.includes("/api/teacher/grade-export/analytics")) {
            return Response.json({ success: false, error: { code: "FAILED", message: "成绩分析暂不可用" } }, { status: 500 });
        }
        throw new Error(`Unhandled fetch: ${url}`);
    }) as unknown as typeof fetch;

    const view = render(<GradeExport />);
    await waitFor(() => expect(view.getByText("成绩分析暂不可用")).toBeTruthy());
    expect(view.getByText("导出列表暂不可用")).toBeTruthy();
    expect(view.queryByTestId("teacher-grade-analytics")).toBeNull();
    expect(view.queryByText("暂无符合条件的数据")).toBeNull();
});

test("grade export localizes low-level network errors", async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/teacher/classes") || url.endsWith("/api/teacher/topics")) return success([]);
        if (url.includes("/api/teacher/grade-export")) throw new TypeError("Failed to fetch");
        throw new Error(`Unhandled fetch: ${url}`);
    }) as unknown as typeof fetch;

    const view = render(<GradeExport />);
    await waitFor(() => expect(view.getByText("成绩分析加载失败，请检查网络后重试")).toBeTruthy());
    expect(view.getByText("导出任务加载失败，请检查网络后重试")).toBeTruthy();
    expect(view.container.textContent).not.toContain("Failed to fetch");
});

test("grade analytics can retry in place after a transient failure", async () => {
    let analyticsCalls = 0;
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/teacher/classes") || url.endsWith("/api/teacher/topics")) return success([]);
        if (url.includes("/api/teacher/grade-export/preview")) return success([]);
        if (url.includes("/api/teacher/grade-export/analytics")) {
            analyticsCalls += 1;
            if (analyticsCalls === 1) {
                return Response.json({ success: false, error: { code: "FAILED", message: "成绩分析暂不可用" } }, { status: 500 });
            }
            return success({
                funnel: { total: 3, notStarted: 1, inProgress: 1, pendingGrading: 0, graded: 1, rejected: 0 },
                scores: {
                    count: 1,
                    average: 86,
                    median: 86,
                    componentAverages: { questionnaire: 85, process: 86, report: 87 },
                    bands: ["<60", "60–69", "70–79", "80–89", "90–100"].map((label, index) => ({ label, count: index === 3 ? 1 : 0 })),
                },
            });
        }
        throw new Error(`Unhandled fetch: ${url}`);
    }) as unknown as typeof fetch;

    const view = render(<GradeExport />);
    await waitFor(() => expect(view.getByRole("button", { name: "重试分析" })).toBeTruthy());
    await act(async () => view.getByRole("button", { name: "重试分析" }).click());

    await waitFor(() => expect(view.getByTestId("teacher-grade-analytics")).toBeTruthy());
    expect(analyticsCalls).toBe(2);
    expect(view.queryByText("成绩分析暂不可用")).toBeNull();
});
