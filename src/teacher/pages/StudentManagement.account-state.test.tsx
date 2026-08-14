import { afterAll, afterEach, beforeAll, expect, mock, test } from "bun:test";
import { cleanup, render, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { installDomGlobals } from "@/test-utils/dom";
import { StudentManagement } from "./StudentManagement";

let restoreDom: (() => void) | null = null;
const originalFetch = globalThis.fetch;

beforeAll(() => {
    restoreDom = installDomGlobals("http://localhost/teacher/class/1/students").restore;
});

afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
});

afterAll(() => {
    restoreDom?.();
    restoreDom = null;
});

test("teacher student management separates normal, locked, and disabled accounts", async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
        const url = String(input);
        const data = url.endsWith("/api/teacher/classes")
            ? [{ id: 1, name: "统计一班", semester: "2026-2027-1", studentCount: 3, createdAt: new Date().toISOString() }]
            : [
                { id: 1, studentId: "SNORMAL", name: "正常学生", email: null, status: 1, lockedUntil: null },
                { id: 2, studentId: "SLOCKED", name: "锁定学生", email: null, status: 1, lockedUntil: "2099-01-01T00:00:00.000Z" },
                { id: 3, studentId: "SDISABLED", name: "停用学生", email: null, status: 0, lockedUntil: "2099-01-01T00:00:00.000Z" },
            ];
        return new Response(JSON.stringify({ success: true, data }), {
            headers: { "Content-Type": "application/json" },
        });
    }) as unknown as typeof fetch;

    const view = render(
        <MemoryRouter initialEntries={["/class/1/students"]}>
            <Routes>
                <Route path="/class/:classId/students" element={<StudentManagement />} />
            </Routes>
        </MemoryRouter>,
    );

    await waitFor(() => expect(view.getByTestId("teacher-student-row-2")).toBeTruthy());
    expect(within(view.getByTestId("teacher-student-row-1")).getByText("正常")).toBeTruthy();
    expect(within(view.getByTestId("teacher-student-row-2")).getByText("已锁定")).toBeTruthy();
    expect(within(view.getByTestId("teacher-student-row-3")).getByText("已禁用")).toBeTruthy();

    expect(view.getByText("学生总数").parentElement?.textContent).toContain("3");
    expect(view.getByText("正常账号").parentElement?.textContent).toContain("1");
    expect(view.getAllByText("已锁定").find((item) => item.tagName === "P")?.parentElement?.textContent).toContain("1");
    expect(view.getAllByText("已禁用").find((item) => item.tagName === "P")?.parentElement?.textContent).toContain("1");
});
