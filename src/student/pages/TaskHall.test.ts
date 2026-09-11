import { describe, expect, test } from "bun:test";
import { getNextActionableTask, isTaskActionable, isTaskOngoing, sortStudentHallTasks, type StudentTask } from "./TaskHall";

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

describe("TaskHall task selection", () => {
    test("hero CTA skips unopened and expired editable tasks", () => {
        const tasks: StudentTask[] = [
            buildTask({
                id: 1,
                publishedAt: new Date(Date.now() + 60_000).toISOString(),
            }),
            buildTask({
                id: 2,
                status: "in_progress",
                deadline: new Date(Date.now() - 60_000).toISOString(),
            }),
            buildTask({
                id: 3,
                status: "rejected",
                progress: 50,
                currentStage: 2,
            }),
        ];

        expect(isTaskActionable(tasks[0]!)).toBe(false);
        expect(isTaskActionable(tasks[1]!)).toBe(false);
        expect(isTaskActionable(tasks[2]!)).toBe(true);
        expect(getNextActionableTask(tasks)?.id).toBe(3);
    });

    test("hero CTA returns null when no editable task remains actionable", () => {
        const tasks: StudentTask[] = [
            buildTask({
                id: 1,
                publishedAt: new Date(Date.now() + 60_000).toISOString(),
            }),
            buildTask({
                id: 2,
                deadline: new Date(Date.now() - 60_000).toISOString(),
            }),
            buildTask({
                id: 3,
                status: "graded",
                deadline: new Date(Date.now() - 60_000).toISOString(),
                score: 92,
            }),
        ];

        expect(getNextActionableTask(tasks)).toBeNull();
    });

    test("in-progress filter semantics only include actionable in-progress and rejected tasks", () => {
        expect(isTaskOngoing(buildTask({ status: "not_started" }))).toBe(false);
        expect(isTaskOngoing(buildTask({ status: "in_progress" }))).toBe(true);
        expect(isTaskOngoing(buildTask({ status: "rejected" }))).toBe(true);
        expect(isTaskOngoing(buildTask({ status: "submitted" }))).toBe(false);
        expect(isTaskOngoing(buildTask({ status: "in_progress", deadline: new Date(Date.now() - 60_000).toISOString() }))).toBe(false);
        expect(isTaskOngoing(buildTask({ status: "rejected", deadline: new Date(Date.now() - 60_000).toISOString() }))).toBe(false);
        expect(isTaskOngoing(buildTask({ status: "rejected", publishedAt: new Date(Date.now() + 60_000).toISOString() }))).toBe(false);
    });

    test("hall sort puts actionable work before unopened tasks even if those were created later", () => {
        const laterOpen = new Date(Date.now() + 86_400_000).toISOString();
        const soonDeadline = new Date(Date.now() + 3_600_000).toISOString();
        const laterDeadline = new Date(Date.now() + 86_400_000).toISOString();
        const sorted = sortStudentHallTasks([
            buildTask({ id: 4, name: "即将开放", publishedAt: laterOpen }),
            buildTask({ id: 5, name: "已截止", deadline: new Date(Date.now() - 60_000).toISOString() }),
            buildTask({ id: 1, name: "未开始较晚截止", deadline: laterDeadline }),
            buildTask({ id: 2, status: "in_progress", name: "进行中较早截止", deadline: soonDeadline, progress: 50, currentStage: 2 }),
            buildTask({ id: 3, status: "submitted", name: "已提交", progress: 100, currentStage: 4 }),
            buildTask({ id: 6, status: "graded", name: "已批改", progress: 100, currentStage: 4, score: 90 }),
            buildTask({ id: 7, status: "rejected", name: "被驳回", progress: 90, currentStage: 4, rejectReason: "请补充" }),
        ]);
        expect(sorted.map((task) => task.id)).toEqual([7, 2, 1, 3, 6, 4, 5]);
    });

    test("hall sort tie-breaks by id when two same-rank tasks have no deadline", () => {
        const sorted = sortStudentHallTasks([
            buildTask({ id: 12, name: "后创建无截止", deadline: null }),
            buildTask({ id: 11, name: "先创建无截止", deadline: null }),
            buildTask({ id: 13, name: "无效截止", deadline: "not-a-date" }),
        ]);
        expect(sorted.map((task) => task.id)).toEqual([11, 12, 13]);
    });
});
