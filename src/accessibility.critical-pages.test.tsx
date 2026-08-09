import { afterAll, afterEach, beforeAll, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { getAccessibilityViolations } from "@/test-utils/accessibility";
import { installDomGlobals } from "@/test-utils/dom";

let restoreDom: (() => void) | null = null;
let AnnouncementManagement: typeof import("@/admin/pages/AnnouncementManagement").AnnouncementManagement;
let TeacherManagement: typeof import("@/admin/pages/TeacherManagement").TeacherManagement;
let TaskHall: typeof import("@/student/pages/TaskHall").TaskHall;
let GradeExport: typeof import("@/teacher/pages/GradeExport").GradeExport;
const originalFetch = globalThis.fetch;

beforeAll(async () => {
    restoreDom = installDomGlobals("http://localhost/").restore;
    [
        { AnnouncementManagement },
        { TeacherManagement },
        { TaskHall },
        { GradeExport },
    ] = await Promise.all([
        import("@/admin/pages/AnnouncementManagement"),
        import("@/admin/pages/TeacherManagement"),
        import("@/student/pages/TaskHall"),
        import("@/teacher/pages/GradeExport"),
    ]);
});

afterEach(async () => {
    cleanup();
    document.body.innerHTML = "";
    globalThis.fetch = originalFetch;
    await new Promise((resolve) => setTimeout(resolve, 0));
});

afterAll(() => {
    restoreDom?.();
    restoreDom = null;
});

function jsonResponse(data: unknown) {
    return new Response(JSON.stringify({ success: true, data }), {
        headers: { "Content-Type": "application/json" },
    });
}

test("student task hall has no automated structural accessibility violations", async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/student/tasks")) {
            return jsonResponse([{
                id: 1,
                topicId: 1,
                name: "校园抽样",
                description: null,
                publishedAt: "2026-07-20T00:00:00.000Z",
                deadline: "2026-12-20T00:00:00.000Z",
                status: "in_progress",
                progress: 50,
                currentStage: 2,
            }]);
        }
        if (url.endsWith("/api/student/announcements")) return jsonResponse([]);
        throw new Error(`Unhandled fetch: ${url}`);
    }) as unknown as typeof fetch;

    const view = render(<MemoryRouter><TaskHall /></MemoryRouter>);
    await waitFor(() => expect(view.getByText("校园抽样")).toBeTruthy());

    expect(await getAccessibilityViolations(view.container)).toEqual([]);
});

test("teacher grade export names filters, task selectors, and progress", async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/teacher/classes")) {
            return jsonResponse([{
                id: 1,
                name: "统计一班",
                semester: "2026 秋",
                studentCount: 2,
                createdAt: "2026-07-20T00:00:00.000Z",
            }]);
        }
        if (url.endsWith("/api/teacher/topics")) {
            return jsonResponse([{
                id: 1,
                name: "校园抽样",
                description: null,
                status: 1,
                dataRows: 200,
                createdAt: "2026-07-20T00:00:00.000Z",
            }]);
        }
        if (url.includes("/api/teacher/grade-export/preview")) {
            return jsonResponse([{
                taskId: 1,
                topicId: 1,
                topic: "校园抽样",
                classId: 1,
                className: "统计一班",
                graded: 1,
                total: 2,
                avgScore: 90,
            }]);
        }
        throw new Error(`Unhandled fetch: ${url}`);
    }) as unknown as typeof fetch;

    const view = render(<GradeExport />);
    await waitFor(() => expect(view.getByTestId("teacher-export-row-1")).toBeTruthy());

    expect(await getAccessibilityViolations(view.container)).toEqual([]);
});

test("admin teacher management gives the search control an accessible name", async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/admin/teachers")) return jsonResponse([]);
        throw new Error(`Unhandled fetch: ${url}`);
    }) as unknown as typeof fetch;

    const view = render(<TeacherManagement />);
    await waitFor(() => expect(view.getByRole("button", { name: "搜索教师" })).toBeTruthy());

    expect(await getAccessibilityViolations(view.container)).toEqual([]);
});

test("admin announcement editor exposes labels and named controls", async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/admin/announcements")) return jsonResponse([]);
        throw new Error(`Unhandled fetch: ${url}`);
    }) as unknown as typeof fetch;

    const view = render(<AnnouncementManagement />);
    await waitFor(() => expect(view.getByText("暂无公告")).toBeTruthy());
    fireEvent.click(view.getByRole("button", { name: "新建公告" }));
    const dialog = await waitFor(() => (
        view.queryByRole("dialog")
        ?? view.getByTestId("mock-dialog-root")
    ));

    expect(await getAccessibilityViolations(dialog)).toEqual([]);
});
