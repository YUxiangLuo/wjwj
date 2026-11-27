import { afterEach, expect, test } from "bun:test";
import { MemoryRouter } from "react-router-dom";
import { installDomGlobals } from "@/test-utils/dom";

const bootstrapDom = installDomGlobals("http://localhost/admin");
const { act, cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const { SemesterManagement, formatSemesterDeleteBlockerTitle } = await import("./SemesterManagement");
const { ClassManagement } = await import("./ClassManagement");
bootstrapDom.restore();

const originalFetch = globalThis.fetch;
let dom: ReturnType<typeof installDomGlobals> | null = null;

afterEach(async () => {
    await act(async () => cleanup());
    await new Promise((resolve) => setTimeout(resolve, 0));
    globalThis.fetch = originalFetch;
    dom?.restore();
    dom = null;
});

test("formatSemesterDeleteBlockerTitle produces natural Chinese tooltips without '已有 当前学期' grammar errors", () => {
    expect(formatSemesterDeleteBlockerTitle([])).toBe("删除学期");
    expect(formatSemesterDeleteBlockerTitle(["当前学期"])).toBe("该学期为当前学期，无法删除");
    expect(formatSemesterDeleteBlockerTitle(["3 个班级"])).toBe("该学期含 3 个班级，无法删除");
    expect(formatSemesterDeleteBlockerTitle(["当前学期", "3 个班级"])).toBe("该学期为当前学期且含 3 个班级，无法删除");
});

test("SemesterManagement wraps disabled delete buttons in hoverable span with natural tooltip and restores focus on deletion", async () => {
    dom = installDomGlobals("http://localhost/admin/semester");
    let semesters = [
        { id: 1, name: "2026-2027-1", isCurrent: 1, classCount: 3, deleteBlockers: ["当前学期", "3 个班级"], createdAt: "2026-09-01T00:00:00Z" },
        { id: 2, name: "2025-2026-2", isCurrent: 0, classCount: 2, deleteBlockers: ["2 个班级"], createdAt: "2026-02-01T00:00:00Z" },
        { id: 3, name: "2024-2025-1", isCurrent: 0, classCount: 0, deleteBlockers: [], createdAt: "2024-09-01T00:00:00Z" },
    ];
    globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "DELETE") {
            semesters = semesters.filter((s) => s.id !== 3);
            return Response.json({ success: true, data: { success: true } });
        }
        return Response.json({ success: true, data: semesters });
    }) as unknown as typeof fetch;

    const view = render(<SemesterManagement />);
    const del1 = (await view.findByTestId("semester-delete-1")) as HTMLButtonElement;
    const del2 = view.getByTestId("semester-delete-2") as HTMLButtonElement;
    const del3 = view.getByTestId("semester-delete-3") as HTMLButtonElement;

    expect(del1.disabled).toBe(true);
    expect(del1.parentElement?.tagName).toBe("SPAN");
    expect(del1.parentElement?.getAttribute("title")).toBe("该学期为当前学期且含 3 个班级，无法删除");

    expect(del2.disabled).toBe(true);
    expect(del2.parentElement?.getAttribute("title")).toBe("该学期含 2 个班级，无法删除");

    expect(del3.disabled).toBe(false);
    del3.focus();
    fireEvent.click(del3);

    const confirmBtn = await view.findByRole("button", { name: "删除学期" });
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(view.queryByTestId("semester-delete-3") === null).toBe(true));
    const createBtn = view.getByTestId("semester-create-open");
    await waitFor(() => expect(document.activeElement === createBtn).toBe(true));
});

test("ClassManagement wraps disabled delete button in hoverable span and restores focus to '创建班级' on deletion", async () => {
    dom = installDomGlobals("http://localhost/admin/class");
    let classes = [
        {
            id: 10,
            name: "2026级统计1班",
            semesterId: 1,
            semesterName: "2026-2027-1",
            teacherId: 1,
            teacherName: "张岚",
            studentCount: 25,
            taskCount: 2,
            deleteBlockers: ["25 名学生", "2 个任务"],
            createdAt: "2026-09-01T00:00:00Z",
        },
        {
            id: 11,
            name: "2026级预备空班",
            semesterId: 1,
            semesterName: "2026-2027-1",
            teacherId: 1,
            teacherName: "张岚",
            studentCount: 0,
            taskCount: 0,
            deleteBlockers: [],
            createdAt: "2026-09-02T00:00:00Z",
        },
    ];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === "DELETE") {
            classes = classes.filter((c) => c.id !== 11);
            return Response.json({ success: true, data: { success: true } });
        }
        if (url.includes("/semesters")) {
            return Response.json({ success: true, data: [{ id: 1, name: "2026-2027-1", isCurrent: 1, classCount: 2, createdAt: "2026-09-01T00:00:00Z" }] });
        }
        if (url.includes("/teachers")) {
            return Response.json({ success: true, data: [{ id: 1, employeeId: "T001", name: "张岚", classCount: 2, createdAt: "2026-09-01T00:00:00Z" }] });
        }
        return Response.json({ success: true, data: classes });
    }) as unknown as typeof fetch;

    const view = render(
        <MemoryRouter>
            <ClassManagement />
        </MemoryRouter>,
    );
    const blockedDel = (await view.findByTestId("class-delete-10")) as HTMLButtonElement;
    const emptyDel = view.getByTestId("class-delete-11") as HTMLButtonElement;

    expect(blockedDel.disabled).toBe(true);
    expect(blockedDel.parentElement?.tagName).toBe("SPAN");
    expect(blockedDel.parentElement?.getAttribute("title")).toBe("该班级已有 25 名学生、2 个任务，无法删除");

    expect(emptyDel.disabled).toBe(false);
    emptyDel.focus();
    fireEvent.click(emptyDel);

    const confirmBtn = await view.findByRole("button", { name: "删除班级" });
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(view.queryByTestId("class-delete-11") === null).toBe(true));
    const createClassBtn = view.getByTestId("class-create-open");
    await waitFor(() => expect(document.activeElement === createClassBtn).toBe(true));
});
