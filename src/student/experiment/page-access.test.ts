import { expect, test } from "bun:test";
import { getExperimentRouteRedirect, isTaskDeadlinePassed, isTaskNotOpenYet } from "./page-access";

test("experiment route guard redirects unopened tasks back to detail page", () => {
    const publishedAt = new Date(Date.now() + 60_000).toISOString();

    expect(isTaskNotOpenYet(publishedAt)).toBe(true);
    expect(getExperimentRouteRedirect({
        taskId: 4,
        publishedAt,
        deadline: new Date(Date.now() + 3600_000).toISOString(),
        status: "not_started",
    })).toBe("/task/4");
});

test("experiment route guard redirects submitted tasks to history page", () => {
    expect(getExperimentRouteRedirect({
        taskId: 3,
        publishedAt: new Date(Date.now() - 3600_000).toISOString(),
        deadline: new Date(Date.now() - 60_000).toISOString(),
        status: "submitted",
    })).toBe("/task/3/history");
});

test("experiment route guard redirects editable tasks back to detail page after deadline", () => {
    const deadline = new Date(Date.now() - 60_000).toISOString();

    expect(isTaskDeadlinePassed(deadline)).toBe(true);
    expect(getExperimentRouteRedirect({
        taskId: 2,
        publishedAt: new Date(Date.now() - 3600_000).toISOString(),
        deadline,
        status: "in_progress",
    })).toBe("/task/2");
});

test("experiment route guard allows active in-progress tasks", () => {
    expect(getExperimentRouteRedirect({
        taskId: 1,
        publishedAt: new Date(Date.now() - 3600_000).toISOString(),
        deadline: new Date(Date.now() + 3600_000).toISOString(),
        status: "in_progress",
    })).toBeNull();
});

test("experiment route guard treats date-only deadlines as end of day", () => {
    const realNow = Date.now;

    try {
        Date.now = () => new Date("2026-03-20T23:58:30").getTime();
        expect(isTaskDeadlinePassed("2026-03-20")).toBe(false);
        expect(getExperimentRouteRedirect({
            taskId: 5,
            publishedAt: "2026-03-19T08:00:00.000Z",
            deadline: "2026-03-20",
            status: "in_progress",
        })).toBeNull();

        Date.now = () => new Date("2026-03-21T00:00:01").getTime();
        expect(isTaskDeadlinePassed("2026-03-20")).toBe(true);
        expect(getExperimentRouteRedirect({
            taskId: 5,
            publishedAt: "2026-03-19T08:00:00.000Z",
            deadline: "2026-03-20",
            status: "in_progress",
        })).toBe("/task/5");
    } finally {
        Date.now = realNow;
    }
});
