import { afterEach, expect, mock, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";

// React's input event feature detection must see a document on first import.
const bootstrapDom = installDomGlobals();
const { cleanup, fireEvent, render, waitFor, within } = await import("@testing-library/react");
const { MemoryRouter } = await import("react-router-dom");
bootstrapDom.restore();

const originalFetch = globalThis.fetch;
let dom: ReturnType<typeof installDomGlobals>;
afterEach(async () => {
    await cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    globalThis.fetch = originalFetch;
    dom?.restore();
});

const classes = [
    { id: 7, name: "统计一班", semesterId: 1, semesterName: "本学期", teacherId: 1, teacherName: "教师甲", studentCount: 3, taskCount: 0, createdAt: "2026-09-01T00:00:00.000Z" },
    { id: 8, name: "统计二班", semesterId: 1, semesterName: "本学期", teacherId: 1, teacherName: "教师甲", studentCount: 0, taskCount: 0, createdAt: "2026-09-02T00:00:00.000Z" },
];

function setup(options: { moved?: boolean } = {}) {
    const writes: unknown[] = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/students/lookup")) {
            return Response.json({
                success: true,
                data: {
                    student: {
                        id: 9, studentId: "S009", name: "林清", email: "s009@example.edu",
                        classId: 7, className: "统计一班", teacherId: 1, teacherName: "教师甲",
                        createdAt: "2026-09-03T00:00:00.000Z",
                    },
                    impact: { experiments: 3, submitted: 2, graded: 1 },
                },
            });
        }
        if (url.includes("/students/9/class") && init?.method === "PUT") {
            writes.push(JSON.parse(String(init.body)));
            return Response.json({ success: true, data: { success: true, moved: options.moved ?? true, classId: 8, previousClassId: 7 } });
        }
        const data = url.includes("/api/admin/classes") ? classes : { items: [], total: 0, page: 1, pageSize: 20 };
        return Response.json({ success: true, data });
    }) as unknown as typeof fetch;
    return { writes };
}

async function renderPage() {
    dom = installDomGlobals("http://localhost/admin/student");
    const { StudentManagement } = await import("./StudentManagement");
    const view = render(<MemoryRouter><StudentManagement /></MemoryRouter>);
    await waitFor(() => expect(view.getByTestId("admin-student-lookup-input")).toBeTruthy());
    return view;
}

test("student lookup shows who owns the ID and what history it carries", async () => {
    setup();
    const view = await renderPage();

    fireEvent.change(view.getByTestId("admin-student-lookup-input"), { target: { value: "S009" } });
    fireEvent.click(view.getByTestId("admin-student-lookup-submit"));

    await waitFor(() => expect(view.getByTestId("admin-student-lookup-result")).toBeTruthy());
    const result = view.getByTestId("admin-student-lookup-result");
    expect(result.textContent).toContain("统计一班");
    expect(result.textContent).toContain("教师甲");
    expect(result.textContent).toContain("已有 3 条实验记录");
    expect(result.textContent).toContain("已批改 1");
});

test("student lookup moves the account without touching its history", async () => {
    const { writes } = setup();
    const view = await renderPage();

    fireEvent.change(view.getByTestId("admin-student-lookup-input"), { target: { value: "S009" } });
    fireEvent.click(view.getByTestId("admin-student-lookup-submit"));
    await waitFor(() => expect(view.getByTestId("admin-student-lookup-result")).toBeTruthy());

    fireEvent.click(within(view.getByTestId("admin-student-lookup-result")).getByRole("combobox", { name: "选择目标班级" }));
    fireEvent.click(await view.findByRole("option", { name: "统计二班" }));
    fireEvent.click(view.getByTestId("admin-student-lookup-move"));

    await waitFor(() => expect(writes).toEqual([{ classId: 8 }]));
    // The panel resets so the same lookup cannot be re-submitted blindly.
    await waitFor(() => expect(view.queryByTestId("admin-student-lookup-result")).toBeNull());
});

test("student lookup surfaces an unknown ID instead of an empty panel", async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/students/lookup")) {
            return Response.json({ success: false, error: { code: "NOT_FOUND", message: "未找到该学号" } });
        }
        const data = url.includes("/api/admin/classes") ? classes : { items: [], total: 0, page: 1, pageSize: 20 };
        return Response.json({ success: true, data });
    }) as unknown as typeof fetch;
    const view = await renderPage();

    fireEvent.change(view.getByTestId("admin-student-lookup-input"), { target: { value: "S404" } });
    fireEvent.click(view.getByTestId("admin-student-lookup-submit"));

    await waitFor(() => expect((view.getByTestId("admin-student-lookup-submit") as HTMLButtonElement).disabled).toBe(false));
    expect(view.queryByTestId("admin-student-lookup-result")).toBeNull();
});
