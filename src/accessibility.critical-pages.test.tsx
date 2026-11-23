import { afterAll, afterEach, beforeAll, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { getAccessibilityViolations } from "@/test-utils/accessibility";
import { installDomGlobals } from "@/test-utils/dom";

// One smoke test per surface: a data-heavy page and a dialog. Keep this list
// short; axe scans are slow and only one representative page per pattern adds
// meaningful regression signal.

let restoreDom: (() => void) | null = null;
let AnnouncementManagement: typeof import("@/admin/pages/AnnouncementManagement").AnnouncementManagement;
let ClassManagement: typeof import("@/admin/pages/ClassManagement").ClassManagement;
let TaskHall: typeof import("@/student/pages/TaskHall").TaskHall;
let TaskProgressDetail: typeof import("@/teacher/pages/TaskProgressDetail").TaskProgressDetail;
const originalFetch = globalThis.fetch;

beforeAll(async () => {
    restoreDom = installDomGlobals("http://localhost/").restore;
    [{ AnnouncementManagement }, { ClassManagement }, { TaskHall }, { TaskProgressDetail }] = await Promise.all([
        import("@/admin/pages/AnnouncementManagement"),
        import("@/admin/pages/ClassManagement"),
        import("@/student/pages/TaskHall"),
        import("@/teacher/pages/TaskProgressDetail"),
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
    await waitFor(() => expect(view.getByTestId("student-task-card-1")).toBeTruthy());

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

test("admin class edit dialog and teacher 5-stage progress page have no accessibility violations", async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/admin/semesters")) return jsonResponse([{ id: 1, name: "2026-2027-1", isCurrent: 1, classCount: 1, createdAt: "2026-09-01T00:00:00.000Z" }]);
        if (url.includes("/api/admin/teachers")) return jsonResponse([{ id: 1, employeeId: "T001", name: "张岚", classCount: 1, createdAt: "2026-09-01T00:00:00.000Z" }]);
        if (url.includes("/api/admin/classes")) {
            return jsonResponse([{ id: 3, name: "2026级商务统计1班", semesterId: 1, semesterName: "2026-2027-1", teacherId: 1, teacherName: "张岚", studentCount: 10, createdAt: "2026-09-01T00:00:00.000Z" }]);
        }
        if (url.includes("/api/teacher/tasks/5/progress")) {
            return jsonResponse({
                task: { topicName: "新锐现制茶饮新品定价与支付意愿调研", className: "2026级商务统计1班", deadline: "2026-12-20T00:00:00.000Z" },
                counts: { not_started: 1, stage1: 1, stage2: 1, stage3: 1, stage4: 1, stage5: 1, submitted: 1, graded: 1, rejected: 0 },
                students: [{ studentId: "S2601", name: "林知夏", status: "stage3", stage: 3, lastActivity: "2026-10-01T00:00:00.000Z", submissionId: null }],
            });
        }
        throw new Error(`Unhandled fetch: ${url}`);
    }) as unknown as typeof fetch;

    const adminView = render(<MemoryRouter><ClassManagement /></MemoryRouter>);
    fireEvent.click(await adminView.findByTestId("class-edit-open-3"));
    const dialog = await waitFor(() => adminView.queryByRole("dialog") ?? adminView.getByTestId("mock-dialog-root"));
    expect(await getAccessibilityViolations(dialog)).toEqual([]);
    adminView.unmount();

    const progressView = render(
        <MemoryRouter initialEntries={["/task/5/progress"]}>
            <Routes><Route path="/task/:taskId/progress" element={<TaskProgressDetail />} /></Routes>
        </MemoryRouter>,
    );
    fireEvent.click(await progressView.findByRole("button", { name: /查看阶段分布/ }));
    await progressView.findByRole("img", { name: "学生实验状态分布环形图" });
    expect(await getAccessibilityViolations(progressView.container)).toEqual([]);
});
