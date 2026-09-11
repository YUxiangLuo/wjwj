import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import type { TeacherClass } from "../api-client";
import { installDomGlobals } from "@/test-utils/dom";

const bootstrapDom = installDomGlobals();
const { cleanup, fireEvent, render, waitFor, within } = await import("@testing-library/react");
const { MemoryRouter } = await import("react-router-dom");

const getClasses = mock(async () => ({ success: true, data: [] as TeacherClass[] }));
mock.module("../api-client", () => ({ teacherApi: { getClasses } }));

const { ClassManagement } = await import("./ClassManagement");
bootstrapDom.restore();

const classes: TeacherClass[] = [
    { id: 1, name: "统计一班", semester: "2026 秋", studentCount: 9, createdAt: "2026-09-01T00:00:00.000Z" },
    { id: 2, name: "公共管理班", semester: "2026 秋", studentCount: 6, createdAt: "2026-09-02T00:00:00.000Z" },
    { id: 3, name: "数据科学班", semester: "2025 春", studentCount: 0, createdAt: "2025-02-01T00:00:00.000Z" },
];

let restoreDom: (() => void) | null = null;

beforeEach(() => {
    restoreDom = installDomGlobals("http://localhost/teacher").restore;
    getClasses.mockClear();
});

afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    restoreDom?.();
    restoreDom = null;
});

function renderPage() {
    return render(
        <MemoryRouter initialEntries={["/class"]}>
            <ClassManagement />
        </MemoryRouter>,
    );
}

test("summarises classes, active students and semesters", async () => {
    getClasses.mockResolvedValueOnce({ success: true, data: classes });
    const view = renderPage();

    await waitFor(() => expect(view.getByText("统计一班")).toBeTruthy());
    expect(view.getByText("班级总数").parentElement?.textContent).toContain("3");
    expect(view.getByText("学生总数").parentElement?.textContent).toContain("15");
    expect(view.getByText("学期数量").parentElement?.textContent).toContain("2");
    expect(view.getByText("共 3 条数据")).toBeTruthy();
});

test("search filters classes and shows an explicit empty state", async () => {
    getClasses.mockResolvedValueOnce({ success: true, data: classes });
    const view = renderPage();
    await waitFor(() => expect(view.getByText("统计一班")).toBeTruthy());

    fireEvent.change(view.getByLabelText("搜索班级名称"), { target: { value: "公共" } });
    expect(view.queryByText("统计一班")).toBeNull();
    expect(view.getByText("公共管理班")).toBeTruthy();

    fireEvent.change(view.getByLabelText("搜索班级名称"), { target: { value: "不存在" } });
    expect(view.getByText("暂无符合条件的数据")).toBeTruthy();
});

test("each row links to that class's student management", async () => {
    getClasses.mockResolvedValueOnce({ success: true, data: classes });
    const view = renderPage();

    await waitFor(() => expect(view.getByTestId("teacher-class-row-1")).toBeTruthy());
    const row = within(view.getByTestId("teacher-class-row-1"));
    expect(row.getByRole("link", { name: /管理学生/ }).getAttribute("href")).toBe("/class/1/students");
    expect(view.getByTestId("teacher-class-row-3").textContent).toContain("0 人");
});

test("a failed load shows a retry that refetches", async () => {
    getClasses
        .mockResolvedValueOnce({ success: false, error: { message: "班级列表加载失败" } } as never)
        .mockResolvedValueOnce({ success: true, data: classes });

    const view = renderPage();
    await waitFor(() => expect(view.getByRole("alert").textContent).toContain("班级列表加载失败"));
    expect(view.getByText("班级总数").parentElement?.textContent).toContain("-");

    fireEvent.click(view.getByRole("button", { name: "重试加载" }));
    await waitFor(() => expect(view.getByText("统计一班")).toBeTruthy());
    expect(getClasses).toHaveBeenCalledTimes(2);
});
