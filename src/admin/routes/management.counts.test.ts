import { expect, mock, test } from "bun:test";
import { createMockDb } from "../../test-utils/mock-db";

async function load(select: unknown[]) {
    const { db, operations } = createMockDb({ select });
    mock.module("../../db", () => ({ db }));
    const module = await import(`./management.ts?counts=${crypto.randomUUID()}`);
    return { module, operations };
}

test("semester list includes class counts", async () => {
    const { module } = await load([
        [{ id: 4, name: "2026春", isCurrent: 1, createdAt: new Date() }],
        [{ key: 4, count: 2 }],
    ]);
    const payload = await (await module.semesterRoutes.GET!(new Request("https://example.com"))).json() as any;
    // The current semester cannot be deleted, so the blocker travels with the list.
    expect(payload.data[0]).toMatchObject({ id: 4, classCount: 2, deleteBlockers: ["当前学期", "2 个班级"] });
});

test("teacher list includes only its grouped class count", async () => {
    const { module, operations } = await load([
        [
            { id: 6, employeeId: "T006", name: "教师六", status: 1, createdAt: new Date() },
            { id: 1, employeeId: "T001", name: "教师一", status: 1, createdAt: new Date() },
        ],
        [{ key: 1, count: 3 }],
    ]);
    const payload = await (await module.teacherRoutes.GET!(new Request("https://example.com"))).json() as any;
    const byId = new Map(payload.data.map((row: any) => [row.id, row]));
    expect(byId.get(6)).toMatchObject({ classCount: 0 });
    expect(byId.get(1)).toMatchObject({ classCount: 3, topicCount: 0, deleteBlockers: ["3 个班级"] });
    expect(byId.get(6)).toMatchObject({ deleteBlockers: [] });
    expect(operations.filter((item) => item.kind === "select")).toHaveLength(3);
});

test("class list reports students, tasks and the delete blockers", async () => {
    const { module } = await load([
        [{ id: 7, name: "统计一班", semesterId: 4, teacherId: 6, createdAt: new Date(), semesterName: "2026春", teacherName: "教师六" }],
        [{ key: 7, count: 15 }],
        [{ key: 7, count: 2 }],
    ]);
    const payload = await (await module.classRoutes.GET!(new Request("https://example.com"))).json() as any;
    expect(payload.data[0]).toMatchObject({ id: 7, studentCount: 15, taskCount: 2, deleteBlockers: ["15 名学生", "2 个任务"] });
});

test("class list leaves deleteBlockers empty for an empty class", async () => {
    const { module } = await load([
        [{ id: 8, name: "空班级", semesterId: 4, teacherId: 6, createdAt: new Date(), semesterName: "2026春", teacherName: "教师六" }],
        [],
        [],
    ]);
    const payload = await (await module.classRoutes.GET!(new Request("https://example.com"))).json() as any;
    expect(payload.data[0]).toMatchObject({ id: 8, studentCount: 0, taskCount: 0, deleteBlockers: [] });
});

test("teacher list exposes template blockers so removal can be disabled", async () => {
    const { module } = await load([
        [{ id: 6, employeeId: "T006", name: "教师六", createdAt: new Date() }],
        [],
        [{ key: 6, count: 2 }],
    ]);
    const payload = await (await module.teacherRoutes.GET!(new Request("https://example.com"))).json() as any;
    expect(payload.data[0]).toMatchObject({ classCount: 0, topicCount: 2, deleteBlockers: ["2 个实验模板"] });
});
