interface TaskTimingFailure {
    code: string;
    message: string;
    status: number;
}

function fail(message: string, code: string, status = 400): TaskTimingFailure {
    return { message, code, status };
}

export function getTaskDeadlineTimestamp(deadline: Date | string | null | undefined) {
    if (!deadline) return Number.NaN;
    if (deadline instanceof Date) return deadline.getTime();

    const normalizedDeadline = deadline.includes("T") ? deadline : `${deadline}T23:59:00`;
    return new Date(normalizedDeadline).getTime();
}

export function ensureTaskIsOpen(openTime: Date | string | null | undefined) {
    if (openTime && new Date(openTime) > new Date()) {
        return fail("任务尚未开放", "TASK_NOT_OPEN");
    }

    return null;
}

export function hasTaskDeadlinePassed(deadline: Date | string | null | undefined) {
    if (!deadline) return false;
    return Date.now() > getTaskDeadlineTimestamp(deadline);
}

export function ensureTaskSubmissionWindow(
    deadline: Date | string | null | undefined,
    graceMs = 30_000,
    now = Date.now(),
) {
    if (!deadline) return null;

    const deadlineAt = getTaskDeadlineTimestamp(deadline);
    if (now > deadlineAt + graceMs) {
        return fail("任务已截止，无法提交", "TASK_DEADLINE");
    }

    return null;
}
