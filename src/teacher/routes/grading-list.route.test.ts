import { expect, mock, test } from "bun:test";
import { createTeacherAuthModuleMock } from "../../test-utils/mock-auth-modules";
import { createMockDb } from "../../test-utils/mock-db";

test("grading list reads current experiment statuses directly", async () => {
    const { db, operations } = createMockDb({ select: [
        [{ count: 1 }],
        [{
            id: 7,
            studentName: "当前学生名",
            studentId: "S001",
            topic: "当前课题名",
            className: "统计一班",
            submittedAt: new Date(),
            status: "submitted",
            score: null,
            gradedByName: null,
            gradedAt: null,
            submissionSnapshot: { studentName: "提交时学生名", topicName: "提交时课题名" },
        }],
    ] });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => createTeacherAuthModuleMock());
    const module = await import(`./grading.ts?list=${crypto.randomUUID()}`);
    const response = await module.gradingRoutes.GET!(new Request("https://example.com/api/teacher/grading?status=pending"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
        data: {
            total: 1,
            items: [{ id: 7, status: "submitted", studentName: "提交时学生名", topic: "提交时课题名" }],
        },
    });
    expect(operations.filter((item) => item.kind === "select")).toHaveLength(2);
});
