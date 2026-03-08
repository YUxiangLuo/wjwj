import { describe, expect, test } from "bun:test";
import { getNextActionableTask, isTaskActionable, type StudentTask } from "./TaskHall";

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
});
