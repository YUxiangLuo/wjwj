import { expect, test } from "bun:test";
import { ensureTaskSubmissionWindow } from "./task-timing";

test("ensureTaskSubmissionWindow allows submissions during grace period", () => {
    const deadline = "2026-03-20T12:00:00.000Z";
    const result = ensureTaskSubmissionWindow(deadline, 30_000, Date.parse(deadline) + 29_999);

    expect(result).toBeNull();
});

test("ensureTaskSubmissionWindow allows submissions at exact grace boundary", () => {
    const deadline = "2026-03-20T12:00:00.000Z";
    const result = ensureTaskSubmissionWindow(deadline, 30_000, Date.parse(deadline) + 30_000);

    expect(result).toBeNull();
});

test("ensureTaskSubmissionWindow blocks submissions after grace period", () => {
    const deadline = "2026-03-20T12:00:00.000Z";
    const result = ensureTaskSubmissionWindow(deadline, 30_000, Date.parse(deadline) + 30_001);

    expect(result).toEqual({
        code: "TASK_DEADLINE",
        message: "任务已截止，无法提交",
        status: 400,
    });
});

test("ensureTaskSubmissionWindow treats date-only deadlines as end of day", () => {
    const deadline = "2026-03-20";
    const endOfDay = new Date("2026-03-20T23:59:00").getTime();

    expect(ensureTaskSubmissionWindow(deadline, 30_000, endOfDay)).toBeNull();
    expect(ensureTaskSubmissionWindow(deadline, 30_000, endOfDay + 30_001)).toEqual({
        code: "TASK_DEADLINE",
        message: "任务已截止，无法提交",
        status: 400,
    });
});
