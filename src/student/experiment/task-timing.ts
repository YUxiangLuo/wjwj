interface TaskTimingFailure {
    code: string;
    message: string;
    status: number;
}

function fail(message: string, code: string, status = 400): TaskTimingFailure {
    return { message, code, status };
}

export function ensureTaskIsOpen(openTime: Date | string | null | undefined) {
    if (!openTime) return null;
    const openAt = new Date(openTime).getTime();
    // Fail-open: unparseable open time → treat as already open (preserves legacy NaN comparison behavior)
    if (!Number.isFinite(openAt)) return null;
    if (openAt > Date.now()) {
        return fail("任务尚未开放", "TASK_NOT_OPEN");
    }

    return null;
}

export function hasTaskDeadlinePassed(deadline: Date | string | null | undefined) {
    if (!deadline) return false;
    const deadlineAt = new Date(deadline).getTime();
    // Fail-open: unparseable deadline → treat as not yet passed
    if (!Number.isFinite(deadlineAt)) return false;
    return Date.now() > deadlineAt;
}

export function ensureTaskSubmissionWindow(deadline: Date | string | null | undefined, graceMs = 30_000) {
    if (!deadline) return null;

    const deadlineAt = new Date(deadline).getTime();
    // Fail-open: unparseable deadline → allow submission (preserves legacy NaN comparison behavior)
    if (!Number.isFinite(deadlineAt)) return null;
    if (Date.now() > deadlineAt + graceMs) {
        return fail("任务已截止，无法提交", "TASK_DEADLINE");
    }

    return null;
}
