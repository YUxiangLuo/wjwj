import { afterAll, afterEach, beforeAll, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { installDomGlobals } from "@/test-utils/dom";
import { StudentManagement } from "./StudentManagement";

// Smoke coverage for admin student management: query initialization, account
// status display, and list refresh after a password reset.

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

test("student management distinguishes active and disabled accounts", async () => {
    const students = [
        { id: 1, studentId: "SNORMAL", name: "正常学生", classId: 7, className: "统计一班", status: 1, progress: 0, createdAt: new Date().toISOString() },
        { id: 3, studentId: "SDISABLED", name: "停用学生", classId: 7, className: "统计一班", status: 0, progress: 0, createdAt: new Date().toISOString() },
    ];
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
        const url = String(input);
        const data = url.includes("/api/admin/classes")
            ? []
            : { items: students, total: students.length, page: 1, pageSize: 20 };
        return Response.json({ success: true, data });
    }) as unknown as typeof fetch;

    const view = render(
        <MemoryRouter initialEntries={["/student"]}>
            <StudentManagement />
        </MemoryRouter>,
    );

    await waitFor(() => expect(view.getByText("SNORMAL")).toBeTruthy());
    const normalRow = view.getByText("SNORMAL").closest("tr")!;
    const disabledRow = view.getByText("SDISABLED").closest("tr")!;
    expect(within(normalRow).getByText("正常")).toBeTruthy();
    expect(within(disabledRow).getByText("停用")).toBeTruthy();
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
                status: 1,
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
        expect(within(view.getByText("SACTIVE").closest("tr")!).getByText("正常")).toBeTruthy();
    });
});
