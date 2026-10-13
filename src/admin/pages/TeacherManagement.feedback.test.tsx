import { afterEach, expect, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";

const bootstrapDom = installDomGlobals();
const { act, cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
bootstrapDom.restore();

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
test("teacher reset names the target, warns about sessions, allows cancellation and blocks duplicate writes", async () => {
    dom = installDomGlobals();
    let writes = 0;
    const response = Promise.withResolvers<Response>();
    globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") { writes++; return response.promise; }
        return Response.json({ success: true, data: rows });
    }) as unknown as typeof fetch;
    const { TeacherManagement } = await import("./TeacherManagement");
    const view = render(<TeacherManagement />);
    await waitFor(() => expect(view.getAllByRole("button", { name: "重置密码" })).toHaveLength(2));
    const reset = view.getAllByRole("button", { name: "重置密码" })[0]!;
    fireEvent.click(reset);
    expect(writes).toBe(0);
    const confirmation = view.getByRole("alertdialog");
    expect(confirmation.textContent).toContain("教师1");
    expect(confirmation.textContent).toContain("T001");
    expect(confirmation.textContent).toContain("全部登录会话");
    fireEvent.click(view.getByRole("button", { name: "取消" }));
    await waitFor(() => expect((reset as HTMLButtonElement).disabled).toBe(false));
    expect(writes).toBe(0);
    fireEvent.click(reset);
    fireEvent.click(view.getByRole("button", { name: "确认重置" }));
    await waitFor(() => expect(writes).toBe(1));
    expect((reset as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(reset);
    expect(writes).toBe(1);
    await act(async () => response.resolve(Response.json({ success: true, data: {} })));
    await waitFor(() => expect((reset as HTMLButtonElement).disabled).toBe(false));
});

test("pending save prevents duplicates and keeps the editor locked until completion", async () => {
    dom = installDomGlobals(); let writes = 0; let resolve!: (response: Response) => void;
    globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => init?.method === "PUT" ? (writes++, await new Promise<Response>(r => { resolve = r; })) : Response.json({ success: true, data: rows })) as unknown as typeof fetch;
    const { TeacherManagement } = await import("./TeacherManagement");
    const view = render(<TeacherManagement />);
    await waitFor(() => expect(view.getAllByRole("button", { name: "编辑" })).toHaveLength(2));
    fireEvent.click(view.getAllByRole("button", { name: "编辑" })[0]!);
    await act(async () => fireEvent.change(view.getByLabelText("姓名"), { target: { value: "第一份修改" } }));
    fireEvent.click(view.getByRole("button", { name: "保存" }));
    const saving = view.getByRole("button", { name: "保存中..." }) as HTMLButtonElement;
    expect(saving.disabled).toBe(true);
    fireEvent.click(saving); expect(writes).toBe(1);
    const cancel = view.getByRole("button", { name: "取消" }) as HTMLButtonElement;
    expect(cancel.disabled).toBe(true);
    fireEvent.click(cancel);
    expect((view.getByLabelText("姓名") as HTMLInputElement).value).toBe("第一份修改");
    expect(view.getByRole("dialog")).toBeTruthy();
    await act(async () => resolve(Response.json({ success: true, data: { success: true } })));
    await waitFor(() => expect(view.queryByRole("dialog")).toBeNull());
});

test("save completion after unmount does not reload the teacher list", async () => {
    dom = installDomGlobals();
    let reads = 0;
    let resolveWrite!: (response: Response) => void;
    globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PUT") return await new Promise<Response>(resolve => { resolveWrite = resolve; });
        reads += 1;
        return Response.json({ success: true, data: rows });
    }) as unknown as typeof fetch;
    const { TeacherManagement } = await import("./TeacherManagement");
    const view = render(<TeacherManagement />);
    await waitFor(() => expect(view.getAllByRole("button", { name: "编辑" })).toHaveLength(2));
    fireEvent.click(view.getAllByRole("button", { name: "编辑" })[0]!);
    fireEvent.click(view.getByRole("button", { name: "保存" }));
    view.unmount();

    await act(async () => resolveWrite(Response.json({ success: true, data: { success: true } })));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(reads).toBe(1);
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
