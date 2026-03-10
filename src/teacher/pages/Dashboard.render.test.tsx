import { afterAll, afterEach, beforeAll, expect, mock, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { installDomGlobals } from "@/test-utils/dom";
import type { TeacherAnnouncement, TeacherStats } from "../api-client";

type TeacherStatsResponse = { success: boolean; data: TeacherStats };
type TeacherAnnouncementsResponse = {
    success: boolean;
    data: {
        announcements: TeacherAnnouncement[];
        unreadCount: number;
    };
};

const teacherApi = {
    getStats: mock(async (): Promise<TeacherStatsResponse> => ({
        success: true,
        data: {
            stats: [],
            recentSubmissions: [],
            recentGradings: [],
        },
    })),
    getAnnouncements: mock(async (): Promise<TeacherAnnouncementsResponse> => ({
        success: true,
        data: {
            announcements: [],
            unreadCount: 0,
        },
    })),
    markAnnouncementRead: mock(async () => ({
        success: true,
        data: { success: true },
    })),
};

mock.module("@/components/ui/dialog", () => ({
    Dialog: ({ children, open }: { children: ReactNode; open?: boolean }) => (open ? <div>{children}</div> : null),
    DialogContent: ({ children, className }: { children: ReactNode; className?: string }) => <div className={className}>{children}</div>,
    DialogDescription: ({ children, className }: { children: ReactNode; className?: string }) => <div className={className}>{children}</div>,
    DialogHeader: ({ children, className }: { children: ReactNode; className?: string }) => <div className={className}>{children}</div>,
    DialogTitle: ({ children, className }: { children: ReactNode; className?: string }) => <div className={className}>{children}</div>,
}));

mock.module("@/components/RichTextContent", () => ({
    RichTextContent: ({ html, className }: { html: string; className?: string }) => <div className={className}>{html}</div>,
}));

mock.module("../api-client", () => ({
    teacherApi,
}));

const { Dashboard } = await import("./Dashboard");

let restoreDom: (() => void) | null = null;

beforeAll(() => {
    const dom = installDomGlobals("http://localhost/teacher");
    restoreDom = dom.restore;
});

afterEach(async () => {
    cleanup();
    teacherApi.getStats.mockClear();
    teacherApi.getAnnouncements.mockClear();
    teacherApi.markAnnouncementRead.mockClear();
    await new Promise((resolve) => setTimeout(resolve, 0));
});

afterAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    restoreDom?.();
    restoreDom = null;
});

test("Dashboard stacks recent submission and grading rows vertically to avoid compressed text", async () => {
    teacherApi.getStats.mockImplementation(async (): Promise<TeacherStatsResponse> => ({
        success: true,
        data: {
            stats: [
                { label: "我的班级", value: 2 },
                { label: "我的课题", value: 3 },
                { label: "待批改作业", value: 4 },
                { label: "进行中任务", value: 5 },
            ],
            recentSubmissions: [
                {
                    student: "陈十",
                    class: "统计学原理 A班",
                    topic: "消费者行为分析实验",
                    time: "2026/03/07 12:00:00",
                },
            ],
            recentGradings: [
                {
                    student: "孙三",
                    class: "统计学原理 A班",
                    topic: "消费者行为分析实验",
                    score: "92.10",
                    rejected: false,
                    time: "2026/03/08 12:00:00",
                },
            ],
        },
    }));
    teacherApi.getAnnouncements.mockImplementation(async (): Promise<TeacherAnnouncementsResponse> => ({
        success: true,
        data: {
            announcements: [],
            unreadCount: 0,
        },
    }));

    const view = render(
        <MemoryRouter>
            <Dashboard />
        </MemoryRouter>
    );

    await waitFor(() => {
        expect(view.getByText("陈十")).toBeTruthy();
        expect(view.getByText("孙三")).toBeTruthy();
    });

    const submissionRow = view.getByTestId("teacher-dashboard-submission-0");
    const gradingRow = view.getByTestId("teacher-dashboard-grading-0");

    expect(submissionRow.className).toContain("flex-col");
    expect(submissionRow.className).not.toContain("sm:flex-row");
    expect(gradingRow.className).toContain("flex-col");
    expect(gradingRow.className).not.toContain("sm:flex-row");
    expect(submissionRow.textContent).toContain("统计学原理 A班");
    expect(submissionRow.textContent).toContain("消费者行为分析实验");
    expect(gradingRow.textContent).toContain("92.10");
    expect(gradingRow.textContent).toContain("2026/03/08 12:00:00");
});
