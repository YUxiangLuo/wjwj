import { afterAll, afterEach, beforeAll, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { installDomGlobals } from "@/test-utils/dom";
let StudentManagement: typeof import("./StudentManagement").StudentManagement;

const originalFetch = globalThis.fetch;
let restore: () => void;
beforeAll(async () => {
    restore = installDomGlobals("http://localhost/teacher/class/1/students").restore;
    ({ StudentManagement } = await import("./StudentManagement"));
});
afterEach(async () => { cleanup(); await Bun.sleep(0); globalThis.fetch = originalFetch; });
afterAll(() => restore());
const success = (data: unknown) => Response.json({ success: true, data });
function mount(intercept: (url: string, init?: RequestInit) => Promise<Response> | undefined) {
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const intercepted = intercept(url, init);
        if (intercepted) return intercepted;
        return success(url.endsWith("/classes")
            ? [{ id: 1, name: "测试班", studentCount: 2 }]
            : [{ id: 1, studentId: "A", name: "学生甲" }, { id: 2, studentId: "B", name: "学生乙" }]);
    }) as unknown as typeof fetch;
    return render(<MemoryRouter initialEntries={["/class/1/students"]}><Routes>
        <Route path="/class/:classId/students" element={<StudentManagement />} />
    </Routes></MemoryRouter>);
}

test("a cancelled student's late deletion preview cannot overwrite the next dialog", async () => {
    const late = Promise.withResolvers<Response>();
    const view = mount(url => url.endsWith("/1/deletion-preview") ? late.promise : url.endsWith("/2/deletion-preview")
        ? Promise.resolve(success({ requiresConfirmation: true, impact: { experiments: 3, submitted: 3, graded: 0 } })) : undefined);
    await waitFor(() => expect(view.getByTestId("teacher-student-delete-1")).toBeTruthy());
    fireEvent.click(view.getByTestId("teacher-student-delete-1"));
    expect((view.getByTestId("teacher-student-confirm-submit") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(view.getByRole("button", { name: "取消" }));
    fireEvent.click(view.getByTestId("teacher-student-delete-2"));
    await waitFor(() => expect(view.getByTestId("teacher-student-delete-impact").textContent).toContain("已提交 3 条"));
    await act(async () => { late.resolve(success({ requiresConfirmation: false, impact: { experiments: 2, submitted: 0, graded: 0 } })); });
    expect(view.getByTestId("teacher-student-delete-impact").textContent).toContain("已提交 3 条");
});

test("a 409 keeps the dialog open and only the second click confirms; pending clicks do not duplicate writes", async () => {
    const first = Promise.withResolvers<Response>();
    const second = Promise.withResolvers<Response>();
    const deletions: string[] = [];
    const view = mount((url, init) => {
        if (url.endsWith("/deletion-preview")) return Promise.resolve(Response.json({ success: false, error: { code: "INTERNAL_ERROR", message: "预览暂不可用" } }, { status: 500 }));
        if (init?.method === "DELETE") { deletions.push(url); return deletions.length === 1 ? first.promise : second.promise; }
    });
    await waitFor(() => expect(view.getByTestId("teacher-student-delete-1")).toBeTruthy());
    fireEvent.click(view.getByTestId("teacher-student-delete-1"));
    await waitFor(() => expect((view.getByTestId("teacher-student-confirm-submit") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(view.getByTestId("teacher-student-confirm-submit"));
    fireEvent.click(view.getByTestId("teacher-student-confirm-submit"));
    expect(deletions).toHaveLength(1);
    expect(deletions[0]).not.toContain("confirm=1");
    expect(view.getByRole("alertdialog")).toBeTruthy();
    await act(async () => { first.resolve(Response.json({ success: false, error: { code: "SUBMISSIONS_EXIST", message: "该学生存在 3 条已提交实验，请再次确认" } }, { status: 409 })); });
    await waitFor(() => expect(view.getByTestId("teacher-student-delete-impact").textContent).toContain("请再次确认"));
    fireEvent.click(view.getByTestId("teacher-student-confirm-submit"));
    expect(deletions).toHaveLength(2);
    expect(deletions[1]).toContain("confirm=1");
    await act(async () => { second.resolve(success({ success: true })); });
    await waitFor(() => expect(view.queryByRole("alertdialog")).toBeNull());
});
