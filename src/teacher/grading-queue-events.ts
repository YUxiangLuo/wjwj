export const TEACHER_GRADING_QUEUE_UPDATED_EVENT = "teacher:grading-queue-updated";

export function didPendingGradingCountChange(previousStatus: number | null | undefined, nextStatus: number) {
    const wasPending = previousStatus === 1;
    const isPending = nextStatus === 1;
    return wasPending !== isPending;
}

export function dispatchTeacherGradingQueueUpdated() {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(TEACHER_GRADING_QUEUE_UPDATED_EVENT));
}
