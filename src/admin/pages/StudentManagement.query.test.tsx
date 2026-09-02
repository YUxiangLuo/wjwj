import { afterAll, afterEach, beforeAll, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
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
