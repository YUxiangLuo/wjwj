import type { TaskStatus } from "../api-client";

interface ExperimentRouteGuardInput {
    taskId: number;
    publishedAt: string;
    deadline: string | null;
    status: TaskStatus;
}

const EDITABLE_STATUSES: TaskStatus[] = ["not_started", "in_progress", "rejected"];
const COMPLETED_STATUSES: TaskStatus[] = ["submitted", "graded"];

export function isTaskNotOpenYet(publishedAt: string) {
    const publishedTime = new Date(publishedAt).getTime();
    return Number.isFinite(publishedTime) && publishedTime > Date.now();
}

export function isTaskDeadlinePassed(deadline: string | null) {
    if (!deadline) return false;
    const deadlineAt = new Date(deadline).getTime();
    return Number.isFinite(deadlineAt) && Date.now() > deadlineAt;
}

export function getExperimentRouteRedirect(input: ExperimentRouteGuardInput) {
    if (isTaskNotOpenYet(input.publishedAt)) {
        return `/task/${input.taskId}`;
    }

    if (COMPLETED_STATUSES.includes(input.status)) {
        return `/task/${input.taskId}/result`;
    }

    if (EDITABLE_STATUSES.includes(input.status) && isTaskDeadlinePassed(input.deadline)) {
        return `/task/${input.taskId}`;
    }

    return null;
}
