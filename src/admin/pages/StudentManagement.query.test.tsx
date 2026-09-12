import { afterAll, afterEach, beforeAll, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { installDomGlobals } from "@/test-utils/dom";
const toastSpy = mock(() => undefined);
mock.module("sonner", () => ({ toast: { success: toastSpy, error: toastSpy, message: toastSpy } }));
let StudentManagement: typeof import("./StudentManagement").StudentManagement;

// Smoke coverage for admin student management: query initialization, roster
// rendering, and list refresh after a password reset.

let restoreDom: (() => void) | null = null;
const originalFetch = globalThis.fetch;

function LocationProbe() {
    const location = useLocation();
    return <output data-testid="location-search">{location.search}</output>;
}

beforeAll(async () => {
    restoreDom = installDomGlobals("http://localhost/admin/student?classId=7").restore;
    ({ StudentManagement } = await import("./StudentManagement"));
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
        return Response.json({ success: true, data });
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

    fireEvent.click(view.getByText("查看全部学生"));

    await waitFor(() => {
        expect(requestedUrls.some((url) => url.includes("/api/admin/students?page=1"))).toBe(true);
        expect(view.getByTestId("location-search").textContent).toBe("");
    });
});

test("resetting a student password refreshes the list without changing account status", async () => {
    let listRequests = 0;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/reset-password") && init?.method === "POST") {
            return Response.json({ success: true, data: { success: true } });
        }
        const data = url.includes("/api/admin/classes") ? [] : {
            items: [{
                id: 2,
                studentId: "SACTIVE",
                name: "正常学生",
                classId: 7,
                className: "统计一班",
                progress: 0,
                createdAt: new Date().toISOString(),
            }],
            total: 1,
            page: 1,
            pageSize: 20,
        };
        if (url.includes("/api/admin/students")) listRequests += 1;
        return Response.json({ success: true, data });
    }) as unknown as typeof fetch;

    const view = render(
        <MemoryRouter initialEntries={["/student"]}>
            <StudentManagement />
        </MemoryRouter>,
    );

    await waitFor(() => expect(view.getByText("SACTIVE")).toBeTruthy());
    const activeRow = view.getByText("SACTIVE").closest("tr")!;
    fireEvent.click(within(activeRow).getByRole("button", { name: "重置密码" }));

    await waitFor(() => {
        expect(listRequests).toBeGreaterThanOrEqual(2);
        expect(within(view.getByText("SACTIVE").closest("tr")!).getByRole("button", { name: "重置密码" })).toBeTruthy();
    });
});

test("closed experiment requests cannot replace another student's details and table columns align", async () => {
    const late = Promise.withResolvers<Response>();
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/1/experiments")) return late.promise;
        if (url.endsWith("/2/experiments")) return Response.json({ success: true, data: [{ id: 22, taskName: "乙的任务", currentStage: 4, statusText: "已批改", progress: 100, score: 90 }] });
        return Response.json({ success: true, data: url.includes("/classes") ? [] : {
            items: [{ id: 1, studentId: "A", name: "学生甲", progress: 0 }, { id: 2, studentId: "B", name: "学生乙", progress: 100 }],
            total: 2, page: 1, pageSize: 20,
        } });
    }) as unknown as typeof fetch;
    const view = render(<MemoryRouter><StudentManagement /></MemoryRouter>);
    await waitFor(() => expect(view.getByText("学生甲")).toBeTruthy());
    const open = (name: string) => fireEvent.click(within(view.getByText(name).closest("tr")!).getByRole("button", { name: "实验" }));
    open("学生甲");
    expect(view.getByText("正在加载实验记录…")).toBeTruthy();
    fireEvent.click(within(view.getByRole("dialog")).getByRole("button", { name: "关闭" }));
    open("学生乙");
    await waitFor(() => expect(view.getByText("乙的任务")).toBeTruthy());
    await act(async () => { late.resolve(Response.json({ success: true, data: [{ id: 11, taskName: "甲的任务", currentStage: 4, statusText: "已提交", progress: 100, score: null }] })); });
    expect(view.getByText("学生乙 的实验记录")).toBeTruthy();
    expect(view.queryByText("甲的任务")).toBeNull();
    const table = view.getByRole("table", { name: "该学生的实验记录" });
    expect(within(table).getAllByRole("columnheader")).toHaveLength(5);
    expect(within(table).getAllByRole("cell")).toHaveLength(5);
    expect(within(table).getByRole("columnheader", { name: "状态" })).toBeTruthy();
});
