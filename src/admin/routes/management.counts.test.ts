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
    expect(payload.data[0]).toMatchObject({ id: 4, classCount: 2 });
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
    expect(byId.get(1)).toMatchObject({ classCount: 3 });
    expect(operations.filter((item) => item.kind === "select")).toHaveLength(2);
});

test("class list includes active student counts", async () => {
    const { module } = await load([
        [{ id: 7, name: "统计一班", semesterId: 4, teacherId: 6, createdAt: new Date(), semesterName: "2026春", teacherName: "教师六" }],
        [{ key: 7, count: 15 }],
    ]);
    const payload = await (await module.classRoutes.GET!(new Request("https://example.com"))).json() as any;
    expect(payload.data[0]).toMatchObject({ id: 7, studentCount: 15 });
});
