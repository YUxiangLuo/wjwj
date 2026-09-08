import { afterAll, afterEach, beforeAll, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { installDomGlobals } from "@/test-utils/dom";
import { StudentManagement } from "./StudentManagement";

let restoreDom: (() => void) | null = null;
const originalFetch = globalThis.fetch;

function LocationProbe() {
    const location = useLocation();
    return <output data-testid="location-search">{location.search}</output>;
}

beforeAll(() => {
    restoreDom = installDomGlobals("http://localhost/admin/student?classId=7").restore;
});

afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    globalThis.fetch = originalFetch;
});

afterAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    restoreDom?.();
    restoreDom = null;
});

test("student management initializes its request from the classId query", async () => {
    const requestedUrls: string[] = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
        const url = String(input);
        requestedUrls.push(url);
        const data = url.includes("/api/admin/classes")
            ? [{ id: 7, name: "统计一班", semesterId: 1, semesterName: "本学期", teacherId: 9, teacherName: "教师", studentCount: 0, createdAt: new Date().toISOString() }]
            : { items: [], total: 0, page: 1, pageSize: 20 };
        return new Response(JSON.stringify({ success: true, data }), {
            headers: { "Content-Type": "application/json" },
        });
    }) as unknown as typeof fetch;

    const view = render(
        <MemoryRouter initialEntries={["/student?classId=7"]}>
            <StudentManagement />
            <LocationProbe />
        </MemoryRouter>,
    );

    await waitFor(() => {
        expect(requestedUrls.some((url) => url.includes("/api/admin/students?class_id=7"))).toBe(true);
    });

    expect(view.getByText("统计一班暂无学生")).toBeTruthy();
    expect(view.getByTestId("location-search").textContent).toBe("?classId=7");
    fireEvent.click(view.getByText("查看全部学生"));

    await waitFor(() => {
        expect(requestedUrls.some((url) => url.includes("/api/admin/students?page=1"))).toBe(true);
        expect(view.getByTestId("location-search").textContent).toBe("");
    });
});

test("student management distinguishes active and disabled accounts", async () => {
    const students = [
        { id: 1, studentId: "SNORMAL", name: "正常学生", classId: 7, className: "统计一班", status: 1, progress: 0, createdAt: new Date().toISOString() },
        { id: 2, studentId: "SACTIVE", name: "另一学生", classId: 7, className: "统计一班", status: 1, progress: 0, createdAt: new Date().toISOString() },
        { id: 3, studentId: "SDISABLED", name: "停用学生", classId: 7, className: "统计一班", status: 0, progress: 0, createdAt: new Date().toISOString() },
    ];
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
        const url = String(input);
        const data = url.includes("/api/admin/classes")
            ? []
            : { items: students, total: students.length, page: 1, pageSize: 20 };
        return new Response(JSON.stringify({ success: true, data }), {
            headers: { "Content-Type": "application/json" },
        });
    }) as unknown as typeof fetch;

    const view = render(
        <MemoryRouter initialEntries={["/student"]}>
            <StudentManagement />
        </MemoryRouter>,
    );

    await waitFor(() => expect(view.getByText("SACTIVE")).toBeTruthy());
    const normalRow = view.getByText("SNORMAL").closest("tr");
    const activeRow = view.getByText("SACTIVE").closest("tr");
    const disabledRow = view.getByText("SDISABLED").closest("tr");
    expect(normalRow).not.toBeNull();
    expect(activeRow).not.toBeNull();
    expect(disabledRow).not.toBeNull();
    expect(within(normalRow!).getByText("正常")).toBeTruthy();
    expect(within(activeRow!).getByText("正常")).toBeTruthy();
    expect(within(disabledRow!).getByText("停用")).toBeTruthy();
});

test("resetting a student password refreshes the list without changing account status", async () => {
    let listRequests = 0;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/reset-password") && init?.method === "POST") {
            return new Response(JSON.stringify({ success: true, data: { success: true } }), {
                headers: { "Content-Type": "application/json" },
            });
        }
        const data = url.includes("/api/admin/classes") ? [] : {
            items: [{
                id: 2,
                studentId: "SACTIVE",
                name: "正常学生",
                classId: 7,
                className: "统计一班",
                status: 1,
                progress: 0,
                createdAt: new Date().toISOString(),
            }],
            total: 1,
            page: 1,
            pageSize: 20,
        };
        if (url.includes("/api/admin/students")) listRequests += 1;
        return new Response(JSON.stringify({ success: true, data }), {
            headers: { "Content-Type": "application/json" },
        });
    }) as unknown as typeof fetch;

    const view = render(
        <MemoryRouter initialEntries={["/student"]}>
            <StudentManagement />
        </MemoryRouter>,
    );

    await waitFor(() => {
        const row = view.getByText("SACTIVE").closest("tr");
        expect(row).not.toBeNull();
        expect(within(row!).getByText("正常")).toBeTruthy();
    });
    const activeRow = view.getByText("SACTIVE").closest("tr");
    expect(activeRow).not.toBeNull();
    fireEvent.click(within(activeRow!).getByRole("button", { name: "重置密码" }));

    await waitFor(() => {
        expect(listRequests).toBeGreaterThanOrEqual(2);
        const refreshedRow = view.getByText("SACTIVE").closest("tr");
        expect(refreshedRow).not.toBeNull();
        expect(within(refreshedRow!).getByText("正常")).toBeTruthy();
    });
});

function SwitchClass() {
    const navigate = useNavigate();
    return <button onClick={() => navigate("/student?classId=8")}>切换到另一班</button>;
}

for (const action of ["重置密码", "停用"] as const) {
    test(`${action} completion refreshes the current class rather than the initiating render's class`, async () => {
        const pending = Promise.withResolvers<Response>();
        const listUrls: string[] = [];
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (init?.method === "POST" || init?.method === "PUT") return pending.promise;
            if (url.includes("/classes")) return Response.json({ success: true, data: [] });
            listUrls.push(url);
            const classId = Number(new URL(url, "http://localhost").searchParams.get("class_id"));
            return Response.json({ success: true, data: { items: [{ id: classId, studentId: `S${classId}`, name: `班级${classId}学生`, classId, className: `班级${classId}`, status: 1, progress: 0 }], total: 1, page: 1, pageSize: 20 } });
        }) as typeof fetch;
        const view = render(<MemoryRouter initialEntries={["/student?classId=7"]}><StudentManagement /><SwitchClass /><LocationProbe /></MemoryRouter>);
        await waitFor(() => expect(view.getByText("S7")).toBeTruthy());
        fireEvent.click(view.getByRole("button", { name: action }));
        fireEvent.click(view.getByRole("button", { name: "切换到另一班" }));
        await waitFor(() => expect(view.getByText("S8")).toBeTruthy());
        const beforeRefresh = listUrls.length;
        await act(async () => { pending.resolve(Response.json({ success: true, data: { success: true } })); await new Promise(resolve => setTimeout(resolve, 0)); });
        await waitFor(() => expect(listUrls.length).toBeGreaterThan(beforeRefresh));
        expect(listUrls.at(-1)).toContain("class_id=8");
        expect(view.getByTestId("location-search").textContent).toBe("?classId=8");
        await waitFor(() => expect(view.getByText("S8")).toBeTruthy());
        expect(view.queryByText("S7")).toBeNull();
    });
}

test("a password reset finishing after unmount does not start another list request", async () => {
    const pending = Promise.withResolvers<Response>();
    let listRequests = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") return pending.promise;
        if (String(input).includes("/classes")) return Response.json({ success: true, data: [] });
        listRequests += 1;
        return Response.json({ success: true, data: { items: [{ id: 7, studentId: "S7", name: "学生", classId: 7, status: 1, progress: 0 }], total: 1, page: 1, pageSize: 20 } });
    }) as typeof fetch;
    const view = render(<MemoryRouter><StudentManagement /></MemoryRouter>);
    await waitFor(() => expect(view.getByText("S7")).toBeTruthy());
    fireEvent.click(view.getByRole("button", { name: "重置密码" }));
    view.unmount();
    await act(async () => { pending.resolve(Response.json({ success: true, data: { success: true } })); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(listRequests).toBe(1);
});

test("student list ignores stale requests and retries failures instead of showing an empty result", async () => {
    const pending: Array<(r: Response) => void> = [];
    globalThis.fetch = ((input: RequestInfo | URL) => String(input).includes("/classes")
        ? Promise.resolve(Response.json({ success: true, data: [] }))
        : new Promise<Response>(resolve => pending.push(resolve))) as unknown as typeof fetch;
    const response = (name: string) => Response.json({ success: true, data: {
        items: [{ id: 1, studentId: "S1", name, classId: 7, className: "班级", status: 1, progress: 0, createdAt: new Date().toISOString() }], total: 1, page: 1, pageSize: 20,
    } });
    const view = render(<MemoryRouter><StudentManagement /></MemoryRouter>);
    await waitFor(() => expect(pending.length).toBe(1));
    fireEvent.click(view.getByRole("button", { name: "搜索" }));
    pending[1]!(response("最新学生"));
    await waitFor(() => expect(view.getByText("最新学生")).toBeTruthy());
    pending[0]!(response("旧学生"));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(view.queryByText("旧学生")).toBeNull();
    fireEvent.click(view.getByRole("button", { name: "搜索" }));
    pending[2]!(Response.json({ success: false, error: { code: "FAILED", message: "学生查询失败" } }));
    await waitFor(() => expect(view.getByRole("alert").textContent).toContain("学生查询失败"));
    expect(view.queryByText("暂无学生")).toBeNull();
    fireEvent.click(view.getByRole("button", { name: "重试加载" }));
    pending[3]!(response("重试学生"));
    await waitFor(() => expect(view.getByText("重试学生")).toBeTruthy());
});
