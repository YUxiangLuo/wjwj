import { afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
const originalFetch = globalThis.fetch;
let dom: ReturnType<typeof installDomGlobals>;
afterEach(async () => {
    await act(async () => cleanup());
    // Radix restores focus on a timer; keep this window's Event constructors alive.
    await new Promise(resolve => setTimeout(resolve, 0));
    globalThis.fetch = originalFetch;
    dom?.restore();
});
const rows = [1, 2].map(id => ({ id, employeeId: `T00${id}`, name: `教师${id}`, status: 1, classCount: 0, createdAt: "2026-01-01" }));
test("pending save prevents duplicates; late completion cannot close a later editor", async () => {
    dom = installDomGlobals(); let writes = 0; let resolve!: (response: Response) => void;
    globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => init?.method === "PUT" ? (writes++, await new Promise<Response>(r => { resolve = r; })) : Response.json({ success: true, data: rows })) as unknown as typeof fetch;
    const { TeacherManagement } = await import("./TeacherManagement");
    const view = render(<TeacherManagement />);
    await waitFor(() => expect(view.getAllByRole("button", { name: "编辑" })).toHaveLength(2));
    fireEvent.click(view.getAllByRole("button", { name: "编辑" })[0]!);
    fireEvent.change(view.getByLabelText("姓名"), { target: { value: "第一份修改" } });
    fireEvent.click(view.getByRole("button", { name: "保存" }));
    const saving = view.getByRole("button", { name: "保存中..." }) as HTMLButtonElement;
    expect(saving.disabled).toBe(true);
    fireEvent.click(saving); expect(writes).toBe(1);
    fireEvent.click(view.getByRole("button", { name: "取消" }));
    fireEvent.click(view.getAllByRole("button", { name: "编辑" })[1]!);
    fireEvent.change(view.getByLabelText("姓名"), { target: { value: "第二份未提交输入" } });
    await act(async () => resolve(Response.json({ success: true, data: { success: true } })));
    expect((view.getByLabelText("姓名") as HTMLInputElement).value).toBe("第二份未提交输入");
    expect(view.getByRole("dialog")).toBeTruthy();
});

test("teacher removal is disabled while classes or templates still reference the account", async () => {
    dom = installDomGlobals();
    const data = [
        { id: 1, employeeId: "T001", name: "在职教师", classCount: 2, topicCount: 3, deleteBlockers: ["2 个班级", "3 个实验模板"], createdAt: "2026-01-01" },
        { id: 2, employeeId: "T002", name: "离职教师", classCount: 0, topicCount: 0, deleteBlockers: [], createdAt: "2026-01-02" },
    ];
    globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => init?.method === "DELETE"
        ? Response.json({ success: true, data: { success: true } })
        : Response.json({ success: true, data })) as unknown as typeof fetch;
    const { TeacherManagement } = await import("./TeacherManagement");
    const view = render(<TeacherManagement />);
    await waitFor(() => expect(view.getByTestId("admin-teacher-delete-1")).toBeTruthy());

    expect((view.getByTestId("admin-teacher-delete-1") as HTMLButtonElement).disabled).toBe(true);
    expect((view.getByTestId("admin-teacher-delete-2") as HTMLButtonElement).disabled).toBe(false);
});
