import { expect, mock, test } from "bun:test";
import { createMockDb } from "../../test-utils/mock-db";

async function loadManagementModule(options: {
    select?: unknown[];
    insert?: unknown[];
    update?: unknown[];
    delete?: unknown[];
} = {}) {
    const { db, operations } = createMockDb(options);

    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => ({
        ADMIN_USER_TYPE: 1,
        ADMIN_SESSION_COOKIE: "admin_session",
        getAdminUser: () => ({ id: 1, username: "admin", isFirstLogin: 0 }),
    }));

    const module = await import(`./management?management-counts-test=${Math.random()}`);
    return { module, operations };
}

test("semester list merges grouped class counts and defaults missing counts to zero", async () => {
    const { module, operations } = await loadManagementModule({
        select: [
            [
                { id: 4, name: "2098-Spring", isCurrent: 0, createdAt: new Date("2026-03-07T00:24:58.000Z") },
                { id: 2, name: "2024-2025学年 第一学期", isCurrent: 1, createdAt: new Date("2026-03-06T20:49:24.000Z") },
            ],
            [{ key: 2, count: 4 }],
        ],
    });

    const response = await module.semesterRoutes.GET!(new Request("https://example.com/api/admin/semesters"));
    const payload = await response.json() as any;
    const byId = new Map(payload.data.map((row: any) => [row.id, row]));

    expect(response.status).toBe(200);
    expect(byId.get(4)).toMatchObject({ name: "2098-Spring", classCount: 0 });
    expect(byId.get(2)).toMatchObject({ name: "2024-2025学年 第一学期", classCount: 4 });
    expect(operations.filter((operation) => operation.kind === "select")).toHaveLength(2);
});

test("teacher list merges grouped class counts without leaking another teacher's count", async () => {
    const { module, operations } = await loadManagementModule({
        select: [
            [
                {
                    id: 6,
                    employeeId: "TCX0307",
                    name: "测试教师更新0307",
                    status: 1,
                    isFirstLogin: 1,
                    lockedUntil: null,
                    createdAt: new Date("2026-03-07T00:26:32.000Z"),
                },
                {
                    id: 1,
                    employeeId: "teacher",
                    name: "张教授（演示）",
                    status: 1,
                    isFirstLogin: 0,
                    lockedUntil: null,
                    createdAt: new Date("2026-03-06T20:49:24.000Z"),
                },
            ],
            [{ key: 1, count: 3 }],
            [{ userId: 1, lastLogin: new Date("2026-03-06T12:49:25.000Z") }],
        ],
    });

    const response = await module.teacherRoutes.GET!(new Request("https://example.com/api/admin/teachers"));
    const payload = await response.json() as any;
    const byId = new Map(payload.data.map((row: any) => [row.id, row]));

    expect(response.status).toBe(200);
    expect(byId.get(6)).toMatchObject({ employeeId: "TCX0307", classCount: 0, lastLogin: null });
    expect(byId.get(1)).toMatchObject({ employeeId: "teacher", classCount: 3 });
    expect(operations.filter((operation) => operation.kind === "select")).toHaveLength(3);
});

test("assistant list merges grouped class counts and last login data", async () => {
    const { module, operations } = await loadManagementModule({
        select: [
            [
                {
                    id: 1,
                    account: "assistant",
                    name: "演示助教",
                    creatorTeacherId: 1,
                    status: 1,
                    lockedUntil: null,
                    createdAt: new Date("2026-03-06T20:49:24.000Z"),
                    teacherName: "张教授（演示）",
                },
                {
                    id: 4,
                    account: "A004",
                    name: "助教小周（首次登录）",
                    creatorTeacherId: 3,
                    status: 1,
                    lockedUntil: null,
                    createdAt: new Date("2026-03-06T20:49:24.000Z"),
                    teacherName: "王讲师",
                },
            ],
            [
                { key: 1, count: 2 },
                { key: 4, count: 1 },
            ],
            [{ userId: 1, lastLogin: new Date("2026-03-06T12:49:25.000Z") }],
        ],
    });

    const response = await module.assistantRoutes.GET!(new Request("https://example.com/api/admin/assistants"));
    const payload = await response.json() as any;
    const byId = new Map(payload.data.map((row: any) => [row.id, row]));

    expect(response.status).toBe(200);
    expect(byId.get(1)).toMatchObject({ account: "assistant", classCount: 2 });
    expect(byId.get(4)).toMatchObject({ account: "A004", classCount: 1, lastLogin: null });
    expect(operations.filter((operation) => operation.kind === "select")).toHaveLength(3);
});

test("class list merges grouped student counts and defaults empty classes to zero", async () => {
    const { module, operations } = await loadManagementModule({
        select: [
            [
                {
                    id: 7,
                    name: "空班级",
                    semesterId: 4,
                    teacherId: 6,
                    createdAt: new Date("2026-03-07T00:30:00.000Z"),
                    semesterName: "2098-Spring",
                    teacherName: "测试教师更新0307",
                },
                {
                    id: 1,
                    name: "统计学原理 A班",
                    semesterId: 2,
                    teacherId: 1,
                    createdAt: new Date("2026-03-06T20:49:24.000Z"),
                    semesterName: "2024-2025学年 第一学期",
                    teacherName: "张教授（演示）",
                },
            ],
            [{ key: 1, count: 15 }],
        ],
    });

    const response = await module.classRoutes.GET!(new Request("https://example.com/api/admin/classes"));
    const payload = await response.json() as any;
    const byId = new Map(payload.data.map((row: any) => [row.id, row]));

    expect(response.status).toBe(200);
    expect(byId.get(7)).toMatchObject({ name: "空班级", studentCount: 0 });
    expect(byId.get(1)).toMatchObject({ name: "统计学原理 A班", studentCount: 15 });
    expect(operations.filter((operation) => operation.kind === "select")).toHaveLength(2);
});

test("announcement stats rejects draft announcements before loading audience counts", async () => {
    const { module, operations } = await loadManagementModule({
        select: [
            [{ id: 47, status: 0, targetScope: "all" }],
        ],
    });

    const req = Object.assign(new Request("https://example.com/api/admin/announcements/47/stats"), {
        params: { id: "47" },
    });
    const response = await module.announcementStatsRoutes.GET!(req);
    const payload = await response.json() as any;

    expect(response.status).toBe(400);
    expect(payload).toEqual({
        success: false,
        error: {
            code: "ANNOUNCEMENT_NOT_PUBLISHED",
            message: "草稿公告暂无阅读统计",
        },
    });
    expect(operations.filter((operation) => operation.kind === "select")).toHaveLength(1);
});
