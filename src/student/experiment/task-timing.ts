interface TaskTimingFailure {
    code: string;
    message: string;
    status: number;
}

function fail(message: string, code: string, status = 400): TaskTimingFailure {
    return { message, code, status };
}

export function ensureTaskIsOpen(openTime: Date | string | null | undefined) {
    if (openTime && new Date(openTime) > new Date()) {
        return fail("任务尚未开放", "TASK_NOT_OPEN");
    }

    return null;
}

export function hasTaskDeadlinePassed(deadline: Date | string | null | undefined) {
    if (!deadline) return false;
    return Date.now() > new Date(deadline).getTime();
}

export function ensureTaskSubmissionWindow(deadline: Date | string | null | undefined, graceMs = 30_000) {
    if (!deadline) return null;

    const deadlineAt = new Date(deadline).getTime();
    if (Date.now() > deadlineAt + graceMs) {
        return fail("任务已截止，无法提交", "TASK_DEADLINE");
    }

    return null;
}
