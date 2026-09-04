import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { installDomGlobals } from "@/test-utils/dom";
import { Dashboard } from "./Dashboard";

const originalFetch = globalThis.fetch;
let restoreDom: (() => void) | null = null;

beforeEach(() => {
    restoreDom = installDomGlobals("http://localhost/admin").restore;
});

afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    globalThis.fetch = originalFetch;
    restoreDom?.();
    restoreDom = null;
});

test("dashboard does not present placeholder zeroes or an empty announcement state while loading", () => {
    globalThis.fetch = mock(async () => await new Promise<Response>(() => undefined)) as unknown as typeof fetch;

    const view = render(<MemoryRouter><Dashboard /></MemoryRouter>);

    expect(view.container.firstElementChild?.getAttribute("aria-busy")).toBe("true");
    expect(view.getByTestId("admin-dashboard-stat-teachers").textContent).toBe("");
    expect(view.getByTestId("admin-dashboard-stat-students").textContent).toBe("");
    expect(view.queryByText("暂无已发布公告")).toBeNull();
    expect(view.getByText("正在加载最近公告")).toBeTruthy();
});

test("dashboard makes complete network failure explicit instead of showing empty data", async () => {
    globalThis.fetch = mock(async () => {
        throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;

    const view = render(<MemoryRouter><Dashboard /></MemoryRouter>);

    await waitFor(() => expect(view.getByRole("alert").textContent).toContain("统计数据、公告加载失败，请检查网络后重试"));
    expect(view.container.textContent).not.toContain("Failed to fetch");
    expect(view.getByTestId("admin-dashboard-stat-teachers").textContent).toBe("—");
    expect(view.getByTestId("admin-dashboard-stat-students").textContent).toBe("—");
    expect(view.getByText("公告数据暂不可用，请重试")).toBeTruthy();
    expect(view.queryByText("暂无已发布公告")).toBeNull();
});

test("dashboard preserves successful statistics when only announcements fail", async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/admin/stats")) {
            return Response.json({
                success: true,
                data: { currentSemester: "2026 秋季", teacherCount: 3, classCount: 5, studentCount: 48, pendingItems: 2 },
            });
        }
        if (url.endsWith("/api/admin/announcements")) {
            return Response.json({ success: false, error: { code: "FAILED", message: "公告服务不可用" } }, { status: 500 });
        }
        throw new Error(`Unhandled fetch: ${url}`);
    }) as unknown as typeof fetch;

    const view = render(<MemoryRouter><Dashboard /></MemoryRouter>);

    await waitFor(() => expect(view.getByRole("alert").textContent).toContain("公告加载失败，请稍后重试"));
    expect(view.getByTestId("admin-dashboard-stat-semester").textContent).toBe("2026 秋季");
    expect(view.getByTestId("admin-dashboard-stat-students").textContent).toBe("48");
    expect(view.getByText("公告数据暂不可用，请重试")).toBeTruthy();
});

test("dashboard retry replaces failure placeholders with freshly loaded data", async () => {
    let shouldFail = true;
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (shouldFail) {
            return Response.json({ success: false, error: { code: "FAILED", message: "暂时不可用" } }, { status: 500 });
        }
        if (url.endsWith("/api/admin/stats")) {
            return Response.json({
                success: true,
                data: { currentSemester: "2026 秋季", teacherCount: 3, classCount: 5, studentCount: 48, pendingItems: 2 },
            });
        }
        if (url.endsWith("/api/admin/announcements")) {
            return Response.json({
                success: true,
                data: [{
                    id: 1,
                    title: "实验课程安排",
                    content: "<p>请按时完成实验。</p>",
                    targetScope: "all",
                    status: 1,
                    createdAt: "2026-09-04T08:00:00.000Z",
                    updatedAt: "2026-09-04T08:00:00.000Z",
                }],
            });
        }
        throw new Error(`Unhandled fetch: ${url}`);
    }) as unknown as typeof fetch;

    const view = render(<MemoryRouter><Dashboard /></MemoryRouter>);
    await waitFor(() => expect(view.getByRole("alert")).toBeTruthy());

    shouldFail = false;
    fireEvent.click(view.getByRole("button", { name: "重新加载" }));

    await waitFor(() => expect(view.queryByRole("alert")).toBeNull());
    expect(view.getByTestId("admin-dashboard-stat-pending").textContent).toBe("2");
    expect(view.getByText("实验课程安排")).toBeTruthy();
    expect(view.queryByText("公告数据暂不可用，请重试")).toBeNull();
});

test("dashboard shows an empty announcement state only after a successful empty response", async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/admin/stats")) {
            return Response.json({
                success: true,
                data: { currentSemester: "2026 秋季", teacherCount: 0, classCount: 0, studentCount: 0, pendingItems: 0 },
            });
        }
        if (url.endsWith("/api/admin/announcements")) return Response.json({ success: true, data: [] });
        throw new Error(`Unhandled fetch: ${url}`);
    }) as unknown as typeof fetch;

    const view = render(<MemoryRouter><Dashboard /></MemoryRouter>);

    await waitFor(() => expect(view.getByText("暂无已发布公告")).toBeTruthy());
    expect(view.getByTestId("admin-dashboard-stat-teachers").textContent).toBe("0");
    expect(view.queryByRole("alert")).toBeNull();
});
