import { afterEach, expect, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";

// React's input event feature detection must see a document on first import.
const bootstrapDom = installDomGlobals();
const { act, cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const { MemoryRouter } = await import("react-router-dom");
bootstrapDom.restore();

const originalFetch = globalThis.fetch;
let dom: ReturnType<typeof installDomGlobals>;
afterEach(async () => {
    await act(async () => cleanup());
    await new Promise(resolve => setTimeout(resolve, 0));
    globalThis.fetch = originalFetch;
    dom?.restore();
});

const semesters = [
    { id: 2, name: "后创建的历史学期", isCurrent: 0, classCount: 0, createdAt: "2026-09-09" },
    { id: 1, name: "当前秋季学期", isCurrent: 1, classCount: 0, createdAt: "2026-09-08" },
];
async function setup(options = semesters) {
    dom = installDomGlobals("http://localhost/admin/classes");
    const writes: unknown[] = [];
    globalThis.fetch = (async (url, init) => {
        if (init?.method === "POST") {
            writes.push(JSON.parse(String(init.body)));
            return Response.json({ success: true, data: { success: true } });
        }
        const path = String(url);
        const data = path.endsWith("/semesters") ? options : path.endsWith("/teachers")
            ? [{ id: 1, name: "教师甲", employeeId: "T01", status: 1 }] : [];
        return Response.json({ success: true, data });
    }) as typeof fetch;
    const { ClassManagement } = await import("./ClassManagement");
    const view = render(<MemoryRouter><ClassManagement /></MemoryRouter>);
    await waitFor(() => expect(view.queryByText("正在加载班级选项")).toBeNull());
    fireEvent.click(view.getByRole("button", { name: "创建班级" }));
    await waitFor(() => expect(view.getByRole("combobox", { name: "新建班级授课教师" }).textContent).toContain("教师甲"));
    return { view, writes };
}

test("new class defaults to the current semester even when history was created more recently", async () => {
    const { view, writes } = await setup();
    expect(view.getByRole("combobox", { name: "新建班级所属学期" }).textContent).toBe("当前秋季学期");
    fireEvent.change(view.getByRole("textbox", { name: "班级名称" }), { target: { value: "实验班" } });
    fireEvent.click(view.getByRole("button", { name: "确认创建" }));
    await waitFor(() => expect(writes).toEqual([{ name: "实验班", semesterId: 1, teacherId: 1 }]));
});

test("without semesters class creation remains unavailable", async () => {
    const { view } = await setup([]);
    expect((view.getByRole("button", { name: "确认创建" }) as HTMLButtonElement).disabled).toBe(true);
});

test("class delete is disabled with the blocking reason instead of failing after a click", async () => {
    dom = installDomGlobals("http://localhost/admin/classes");
    globalThis.fetch = (async (url) => {
        const path = String(url);
        const data = path.endsWith("/semesters") ? semesters : path.endsWith("/teachers")
            ? [{ id: 1, name: "教师甲", employeeId: "T01" }]
            : [
                { id: 7, name: "统计一班", semesterId: 1, semesterName: "当前秋季学期", teacherId: 1, teacherName: "教师甲", studentCount: 12, taskCount: 2, deleteBlockers: ["12 名学生", "2 个任务"], createdAt: "2026-09-08" },
                { id: 8, name: "空班级", semesterId: 1, semesterName: "当前秋季学期", teacherId: 1, teacherName: "教师甲", studentCount: 0, taskCount: 0, deleteBlockers: [], createdAt: "2026-09-08" },
            ];
        return Response.json({ success: true, data });
    }) as typeof fetch;
    const { ClassManagement } = await import("./ClassManagement");
    const view = render(<MemoryRouter><ClassManagement /></MemoryRouter>);
    await waitFor(() => expect(view.getByTestId("class-delete-7")).toBeTruthy());

    expect((view.getByTestId("class-delete-7") as HTMLButtonElement).disabled).toBe(true);
    expect((view.getByTestId("class-delete-8") as HTMLButtonElement).disabled).toBe(false);
});
