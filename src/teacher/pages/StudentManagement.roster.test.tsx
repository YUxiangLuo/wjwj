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

afterEach(async () => {
    cleanup();
    // Let React's queued scheduler callback finish before afterAll removes window.
    await new Promise((resolve) => setTimeout(resolve, 0));
    globalThis.fetch = originalFetch;
});

afterAll(() => {
    restoreDom?.();
    restoreDom = null;
});

test("teacher student management lists the whole roster with reset and delete only", async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
        const url = String(input);
        const data = url.endsWith("/api/teacher/classes")
            ? [{ id: 1, name: "统计一班", semester: "2026-2027-1", studentCount: 2, createdAt: new Date().toISOString() }]
            : [
                { id: 1, studentId: "SNORMAL", name: "学生甲", email: null },
                { id: 2, studentId: "SACTIVE", name: "学生乙", email: null },
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
    expect(view.getByTestId("teacher-student-row-1")).toBeTruthy();
    for (const row of [1, 2]) {
        expect(within(view.getByTestId(`teacher-student-row-${row}`)).getByTestId(`teacher-student-reset-${row}`)).toBeTruthy();
        expect(within(view.getByTestId(`teacher-student-row-${row}`)).getByTestId(`teacher-student-delete-${row}`)).toBeTruthy();
    }
    // The account status toggle is gone: every roster row is an active account.
    expect(view.queryByTestId("teacher-student-toggle-1")).toBeNull();
});
