import { expect, mock, test } from "bun:test";
import { createMockDb } from "../../test-utils/mock-db";

test("grading list reads current experiment statuses directly", async () => {
    const { db, operations } = createMockDb({ select: [
        [{ count: 1 }],
        [{ id: 7, studentName: "学生一", studentId: "S001", topic: "抽样实验", className: "统计一班", submittedAt: new Date(), status: "submitted", score: null, gradedByName: null, gradedAt: null }],
    ] });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => ({ getTeacherUser: () => ({ id: 9, type: "teacher", name: "教师", employeeId: "T001" }) }));
    const module = await import(`./grading.ts?list=${crypto.randomUUID()}`);
    const response = await module.gradingRoutes.GET!(new Request("https://example.com/api/teacher/grading?status=pending"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { total: 1, items: [{ id: 7, status: "submitted" }] } });
    expect(operations.filter((item) => item.kind === "select")).toHaveLength(2);
});
