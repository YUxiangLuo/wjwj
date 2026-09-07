import { afterAll, afterEach, beforeAll, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { installDomGlobals } from "@/test-utils/dom";
import type { Announcement, StudentTask } from "../api-client";

mock.module("@/components/ui/dialog", () => ({
    Dialog: ({ children, open }: { children: ReactNode; open?: boolean }) => (open ? <div data-testid="mock-dialog">{children}</div> : null),
    DialogContent: ({ children, className }: { children: ReactNode; className?: string }) => <div className={className}>{children}</div>,
    DialogDescription: ({ children, className }: { children: ReactNode; className?: string }) => <div className={className}>{children}</div>,
    DialogFooter: ({ children, className }: { children: ReactNode; className?: string }) => <div className={className}>{children}</div>,
    DialogHeader: ({ children, className }: { children: ReactNode; className?: string }) => <div className={className}>{children}</div>,
    DialogTitle: ({ children, className }: { children: ReactNode; className?: string }) => <div className={className}>{children}</div>,
}));

const { TaskHall } = await import("./TaskHall");

function buildTask(overrides: Partial<StudentTask> = {}): StudentTask {
    return {
        id: 1,
        topicId: 10,
        name: "抽样任务",
        description: null,
        publishedAt: new Date(Date.now() - 60_000).toISOString(),
        deadline: new Date(Date.now() + 60_000).toISOString(),
        status: "not_started",
        progress: 0,
        currentStage: 0,
        ...overrides,
    };
}

function buildAnnouncement(overrides: Partial<Announcement> = {}): Announcement {
    return {
        id: 1,
        title: "系统维护通知",
        content: "<p>今晚 22:00 进行系统维护。</p>",
        createdAt: new Date(Date.now() - 60_000).toISOString(),
        ...overrides,
    };
}

let restoreDom: (() => void) | null = null;
const originalFetch = globalThis.fetch;

beforeAll(() => {
    const dom = installDomGlobals("http://localhost/student");
    restoreDom = dom.restore;
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

function LocationProbe() {
    const location = useLocation();
    return <div data-testid="location-probe">{location.pathname}</div>;
}

test("TaskHall renders tasks directly and filters by real task status", async () => {
    const tasks: StudentTask[] = [
        buildTask({ id: 1, status: "not_started", name: "未开始任务" }),
        buildTask({ id: 2, status: "in_progress", name: "进行中任务", progress: 50, currentStage: 2 }),
        buildTask({ id: 3, status: "rejected", name: "驳回任务", progress: 75, currentStage: 3, rejectReason: "请补充分析" }),
        buildTask({ id: 6, status: "rejected", name: "已截止驳回任务", progress: 75, currentStage: 4, rejectReason: "已截止", deadline: new Date(Date.now() - 60_000).toISOString() }),
        buildTask({ id: 4, status: "submitted", name: "已提交任务", progress: 100, currentStage: 4 }),
        buildTask({ id: 5, status: "graded", name: "已批改任务", progress: 100, currentStage: 4, score: 95 }),
    ];
    const announcements = [buildAnnouncement()];

    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.endsWith("/api/student/tasks")) {
            return new Response(JSON.stringify({ success: true, data: tasks }), {
                headers: { "Content-Type": "application/json" },
            });
        }

        if (url.endsWith("/api/student/announcements")) {
            return new Response(JSON.stringify({ success: true, data: announcements }), {
                headers: { "Content-Type": "application/json" },
            });
        }

        throw new Error(`Unhandled fetch: ${url} ${init?.method ?? "GET"}`);
    }) as unknown as typeof fetch;

    const view = render(
        <MemoryRouter>
            <LocationProbe />
            <TaskHall />
        </MemoryRouter>
    );

    await waitFor(() => {
        expect(view.getByTestId("student-task-card-1")).toBeTruthy();
    });

    expect(view.queryByTestId("student-stats-section")).toBeNull();

    fireEvent.click(view.getByTestId("student-filter-in-progress"));

    await waitFor(() => {
        expect(view.queryByTestId("student-task-card-1")).toBeNull();
        expect(view.getByTestId("student-task-card-2")).toBeTruthy();
        expect(view.getByTestId("student-task-card-3")).toBeTruthy();
        expect(view.queryByTestId("student-task-card-6")).toBeNull();
        expect(view.queryByTestId("student-task-card-4")).toBeNull();
        expect(view.queryByTestId("student-task-card-5")).toBeNull();
    });

    fireEvent.click(view.getByTestId("student-filter-graded"));

    await waitFor(() => {
        expect(view.queryByTestId("student-task-card-2")).toBeNull();
        expect(view.getByTestId("student-task-card-5")).toBeTruthy();
    });
});

test("TaskHall opens a simple read-only announcement", async () => {
    const tasks: StudentTask[] = [buildTask({ id: 1, status: "in_progress", name: "进行中任务" })];
    const announcements = [
        buildAnnouncement({ id: 11, title: "系统维护通知", content: "<p>今晚 22:00 维护。</p>" }),
        buildAnnouncement({ id: 12, title: "课程安排更新", content: "<p>下周实验时间调整。</p>" }),
    ];

    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.endsWith("/api/student/tasks")) {
            return new Response(JSON.stringify({ success: true, data: tasks }), {
                headers: { "Content-Type": "application/json" },
            });
        }

        if (url.endsWith("/api/student/announcements")) {
            return new Response(JSON.stringify({ success: true, data: announcements }), {
                headers: { "Content-Type": "application/json" },
            });
        }

        throw new Error(`Unhandled fetch: ${url} ${init?.method ?? "GET"}`);
    }) as unknown as typeof fetch;

    const view = render(
        <MemoryRouter>
            <LocationProbe />
            <TaskHall />
        </MemoryRouter>
    );

    await waitFor(() => {
        expect(view.getByText("系统维护通知")).toBeTruthy();
    });

    fireEvent.click(view.getByText("查看详情"));

    await waitFor(() => {
        expect(view.getByText("系统公告")).toBeTruthy();
        expect(view.getByText("请选择左侧公告查看详情")).toBeTruthy();
    });

    fireEvent.click(view.getAllByText("系统维护通知")[1]!);

    await waitFor(() => {
        expect(view.getByText("今晚 22:00 维护。")).toBeTruthy();
    });

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof mock>;
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("announcements")).length).toBe(1);
});

test("TaskHall rejected task continues the same experiment", async () => {
    const tasks: StudentTask[] = [
        buildTask({
            id: 7,
            status: "rejected",
            name: "被驳回任务",
            progress: 100,
            currentStage: 4,
            rejectReason: "请补充数据分析",
        }),
    ];

    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.endsWith("/api/student/tasks")) {
            return new Response(JSON.stringify({ success: true, data: tasks }), {
                headers: { "Content-Type": "application/json" },
            });
        }

        if (url.endsWith("/api/student/announcements")) {
            return new Response(JSON.stringify({ success: true, data: [] }), {
                headers: { "Content-Type": "application/json" },
            });
        }

        throw new Error(`Unhandled fetch: ${url} ${init?.method ?? "GET"}`);
    }) as unknown as typeof fetch;

    const view = render(
        <MemoryRouter>
            <LocationProbe />
            <TaskHall />
        </MemoryRouter>
    );

    await waitFor(() => {
        expect(view.getByTestId("student-task-primary-7")).toBeTruthy();
    });

    fireEvent.click(view.getByTestId("student-task-primary-7"));

    await waitFor(() => {
        const fetchMock = globalThis.fetch as unknown as ReturnType<typeof mock>;
        expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/api/student/tasks/7/reset"))).toBe(false);
        expect(view.getByTestId("location-probe").textContent).toBe("/task/7/experiment");
    });
});
