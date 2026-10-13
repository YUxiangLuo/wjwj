import { afterEach, expect, mock, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";
import { MemoryRouter } from "react-router-dom";

const bootstrap = installDomGlobals();
const { act, cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
bootstrap.restore();
const originalFetch = globalThis.fetch;
let dom: ReturnType<typeof installDomGlobals>;
afterEach(async () => {
    await act(async () => cleanup());
    await Bun.sleep(0);
    globalThis.fetch = originalFetch;
    dom?.restore();
});

test("password reset requires named confirmation, prevents duplicate writes and allows retry", async () => {
    dom = installDomGlobals();
    const writes: string[] = [];
    let response = Promise.withResolvers<Response>();
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === "POST") { writes.push(url); return response.promise; }
        return Response.json({ success: true, data: url.includes("/classes") ? [] : {
            items: [{ id: 7, studentId: "S0007", name: "学生甲", progress: 0 }], total: 1, page: 1, pageSize: 20,
        } });
    }) as unknown as typeof fetch;
    const { StudentManagement } = await import("./StudentManagement");
    const view = render(<MemoryRouter><StudentManagement /></MemoryRouter>);
    const reset = await view.findByRole("button", { name: "重置密码" });
    fireEvent.click(reset);
    expect(writes).toHaveLength(0);
    expect(view.getByRole("alertdialog").textContent).toContain("学生甲");
    expect(view.getByRole("alertdialog").textContent).toContain("S0007");
    fireEvent.click(view.getByRole("button", { name: "取消" }));
    expect(writes).toHaveLength(0);
    await waitFor(() => expect((reset as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(reset);
    fireEvent.click(view.getByRole("button", { name: "确认重置" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toContain("/7/reset-password");
    expect((reset as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(reset);
    expect(writes).toHaveLength(1);
    await act(async () => response.resolve(Response.json({ success: false, error: { message: "请重试" } }, { status: 500 })));
    await waitFor(() => expect((reset as HTMLButtonElement).disabled).toBe(false));
    response = Promise.withResolvers<Response>();
    fireEvent.click(reset);
    fireEvent.click(view.getByRole("button", { name: "确认重置" }));
    await waitFor(() => expect(writes).toHaveLength(2));
    await act(async () => response.resolve(Response.json({ success: true, data: {} })));
    await waitFor(() => expect((reset as HTMLButtonElement).disabled).toBe(false));
});

test("fresh student search refreshes class labels without losing the selected class or search", async () => {
    dom = installDomGlobals();
    let className = "旧班名";
    const queries: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/classes")) return Response.json({ success: true, data: [{ id: 5, name: className }] });
        queries.push(url);
        return Response.json({ success: true, data: {
            items: [{ id: 7, studentId: "S0007", name: "学生甲", className, progress: 0 }], total: 1, page: 1, pageSize: 20,
        } });
    }) as unknown as typeof fetch;
    const { StudentManagement } = await import("./StudentManagement");
    const view = render(<MemoryRouter initialEntries={["/student?classId=5"]}><StudentManagement /></MemoryRouter>);
    await view.findByRole("button", { name: "实验" });
    expect(view.getByRole("combobox").textContent).toContain("旧班名");
    className = "新班名";
    fireEvent.change(view.getByLabelText("搜索学号或姓名"), { target: { value: "S0007" } });
    fireEvent.click(view.getByRole("button", { name: "搜索" }));
    await waitFor(() => expect(view.getByRole("combobox").textContent).toContain("新班名"));
    expect((view.getByLabelText("搜索学号或姓名") as HTMLInputElement).value).toBe("S0007");
    expect(queries.at(-1)).toContain("class_id=5");
    expect(queries.at(-1)).toContain("search=S0007");
});

test("late student and class responses cannot overwrite a newer search", async () => {
    dom = installDomGlobals();
    const lateStudents = Promise.withResolvers<Response>();
    const lateClasses = Promise.withResolvers<Response>();
    let classReads = 0;
    const list = (name: string) => Response.json({ success: true, data: {
        items: [{ id: 7, studentId: "S0007", name, progress: 0 }], total: 1, page: 1, pageSize: 20,
    } });
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/classes")) {
            if (++classReads === 2) return lateClasses.promise;
            return Response.json({ success: true, data: [{ id: 5, name: classReads > 2 ? "最新班名" : "初始班名" }] });
        }
        return url.includes("search=old") ? lateStudents.promise : list(url.includes("search=new") ? "最新学生" : "初始学生");
    }) as unknown as typeof fetch;
    const { StudentManagement } = await import("./StudentManagement");
    const view = render(<MemoryRouter initialEntries={["/student?classId=5"]}><StudentManagement /></MemoryRouter>);
    await view.findByText("初始学生");
    const search = view.getByLabelText("搜索学号或姓名");
    fireEvent.change(search, { target: { value: "old" } });
    fireEvent.click(view.getByRole("button", { name: "搜索" }));
    fireEvent.change(search, { target: { value: "new" } });
    fireEvent.click(view.getByRole("button", { name: "搜索" }));
    await view.findByText("最新学生");
    await act(async () => {
        lateStudents.resolve(list("过期学生"));
        lateClasses.resolve(Response.json({ success: true, data: [{ id: 5, name: "过期班名" }] }));
    });
    expect(view.queryByText("过期学生")).toBeNull();
    expect(view.getByRole("combobox").textContent).toContain("最新班名");
    expect((search as HTMLInputElement).value).toBe("new");
});

test("experiment retry recovers records without closing the selected student's dialog", async () => {
    dom = installDomGlobals();
    let reads = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/experiments")) return ++reads === 1
            ? Response.json({ success: false, error: { message: "记录请求失败" } }, { status: 500 })
            : Response.json({ success: true, data: [{ id: 10, taskName: "恢复任务", currentStage: 2, progress: 25, score: 0 }] });
        return Response.json({ success: true, data: url.includes("/classes") ? [] : {
            items: [{ id: 7, studentId: "S0007", name: "学生甲", progress: 0 }], total: 1, page: 1, pageSize: 20,
        } });
    }) as unknown as typeof fetch;
    const { StudentManagement } = await import("./StudentManagement");
    const view = render(<MemoryRouter><StudentManagement /></MemoryRouter>);
    fireEvent.click(await view.findByRole("button", { name: "实验" }));
    fireEvent.click(await view.findByRole("button", { name: "重试加载实验记录" }));
    await view.findByText("恢复任务");
    expect(view.getByRole("dialog").textContent).toContain("学生甲 的实验记录");
    expect(reads).toBe(2);
});

test("experiment failure retries in the selected dialog and ignores a response after cancellation", async () => {
    dom = installDomGlobals();
    let detailReads = 0;
    const late = Promise.withResolvers<Response>();
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/experiments")) {
            detailReads++;
            if (detailReads === 1) return Response.json({ success: false, error: { message: "记录请求失败" } }, { status: 500 });
            if (detailReads === 2) return late.promise;
            return Response.json({ success: true, data: [] });
        }
        return Response.json({ success: true, data: url.includes("/classes") ? [] : {
            items: [7, 8].map(id => ({ id, studentId: `S000${id}`, name: `学生${id}`, progress: 0 })), total: 2, page: 1, pageSize: 20,
        } });
    }) as unknown as typeof fetch;
    const { StudentManagement } = await import("./StudentManagement");
    const view = render(<MemoryRouter><StudentManagement /></MemoryRouter>);
    await waitFor(() => expect(view.getAllByRole("button", { name: "实验" })).toHaveLength(2));
    fireEvent.click(view.getAllByRole("button", { name: "实验" })[0]!);
    const retry = await view.findByRole("button", { name: "重试加载实验记录" });
    expect(view.getByRole("dialog").textContent).toContain("学生7 的实验记录");
    fireEvent.click(retry);
    await waitFor(() => expect(detailReads).toBe(2));
    fireEvent.click(view.getByRole("button", { name: "关闭" }));
    await waitFor(() => expect(view.queryByRole("dialog")).toBeNull());
    fireEvent.click(view.getAllByRole("button", { name: "实验" })[1]!);
    await view.findByText("暂无实验记录");
    await act(async () => late.resolve(Response.json({ success: true, data: [{ id: 99, taskName: "过期任务", currentStage: 1, progress: 0 }] })));
    expect(view.getByRole("dialog").textContent).toContain("学生8 的实验记录");
    expect(view.queryByText("过期任务")).toBeNull();
});
