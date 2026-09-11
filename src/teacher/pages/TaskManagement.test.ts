import { describe, expect, test } from "bun:test";
import type { Task } from "../api-client";
import { compareTeacherTasks } from "./TaskManagement";

function task(overrides: Partial<Task>): Task {
    return {
        id: 1,
        topicId: 1,
        classId: 1,
        topic: "任务",
        className: "班级",
        publishedAt: new Date(Date.now() - 60_000).toISOString(),
        deadline: new Date(Date.now() + 86_400_000).toISOString(),
        total: 10,
        completed: 0,
        pending: 0,
        ...overrides,
    };
}

describe("teacher task hall ranking", () => {
    test("pending and open tasks precede unopened and expired ones", () => {
        const sorted = [
            task({ id: 4, topic: "即将开放", publishedAt: new Date(Date.now() + 86_400_000).toISOString() }),
            task({ id: 5, topic: "已截止", deadline: new Date(Date.now() - 60_000).toISOString() }),
            task({ id: 1, topic: "进行中无待批改" }),
            task({ id: 2, topic: "有待批改", pending: 2, deadline: new Date(Date.now() + 3_600_000).toISOString() }),
        ].sort(compareTeacherTasks);
        expect(sorted.map((item) => item.id)).toEqual([2, 1, 4, 5]);
    });

    test("expired tasks with pending grades still rank above unopened tasks", () => {
        const sorted = [
            task({ id: 4, topic: "即将开放", publishedAt: new Date(Date.now() + 86_400_000).toISOString() }),
            task({
                id: 5,
                topic: "已截止仍待批改",
                deadline: new Date(Date.now() - 60_000).toISOString(),
                pending: 2,
            }),
            task({ id: 1, topic: "进行中无待批改" }),
        ].sort(compareTeacherTasks);
        expect(sorted.map((item) => item.id)).toEqual([5, 1, 4]);
    });
});
