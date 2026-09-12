import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";

const bootstrap = installDomGlobals();
const { cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const { MemoryRouter, Route, Routes } = await import("react-router-dom");
const getStudents = mock(async (_classId: number, query: { search?: string; page?: number; pageSize?: number }) => ({
    success: true, data: {
        items: [{ id: 1, studentId: "S001", name: query.search || "学生甲", email: null }],
        total: query.search ? 1 : 41,
    },
}));
mock.module("../api-client", () => ({ teacherApi: {
    getClasses: async () => ({ success: true, data: [{ id: 1, name: "统计一班", semester: "2026-2027-1", studentCount: 41 }] }),
    getStudents,
} }));
const { StudentManagement } = await import("./StudentManagement");
bootstrap.restore();
let restore: () => void;
beforeEach(() => { restore = installDomGlobals("http://localhost/teacher/class/1/students").restore; getStudents.mockClear(); });
afterEach(async () => { cleanup(); await new Promise(resolve => setTimeout(resolve, 0)); restore(); });

function renderPage() {
    return render(<MemoryRouter initialEntries={["/class/1/students"]}><Routes>
        <Route path="/class/:classId/students" element={<StudentManagement />} />
    </Routes></MemoryRouter>);
}

test("visible search button submits the trimmed query and resets pagination", async () => {
    const view = renderPage();
    await view.findByTestId("teacher-student-row-1");
    fireEvent.click(view.getByRole("button", { name: "下一页" }));
    await waitFor(() => expect(getStudents).toHaveBeenLastCalledWith(1, { search: undefined, page: 2, pageSize: 20 }));
    const input = view.getByRole("textbox", { name: "搜索学生" });
    fireEvent.change(input, { target: { value: "  李闻溪  " } });
    expect(getStudents.mock.calls).toHaveLength(2);
    fireEvent.click(view.getByRole("button", { name: /^搜索$/ }));
    await waitFor(() => expect(getStudents).toHaveBeenLastCalledWith(1, { search: "李闻溪", page: 1, pageSize: 20 }));
    await waitFor(() => expect(view.getByText("共 1 人（筛选：李闻溪）")).toBeTruthy());
});

test("native search form supports keyboard submission and clearing the applied filter", async () => {
    const view = renderPage();
    await view.findByTestId("teacher-student-row-1");
    const form = view.getByRole("search", { name: "学生搜索" });
    const input = view.getByRole("textbox", { name: "搜索学生" });
    expect(form.tagName).toBe("FORM");
    expect(input.closest("form")?.getAttribute("aria-label")).toBe("学生搜索");
    expect(view.getByRole("button", { name: /^搜索$/ }).getAttribute("type")).toBe("submit");
    fireEvent.change(input, { target: { value: "S001" } });
    fireEvent.submit(form);
    await waitFor(() => expect(getStudents).toHaveBeenLastCalledWith(1, { search: "S001", page: 1, pageSize: 20 }));
    fireEvent.change(input, { target: { value: "  " } });
    fireEvent.submit(form);
    await waitFor(() => expect(getStudents).toHaveBeenLastCalledWith(1, { search: undefined, page: 1, pageSize: 20 }));
    await waitFor(() => expect(view.queryByText(/（筛选：/)).toBeNull());
});
