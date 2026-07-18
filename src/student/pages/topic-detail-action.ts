import type { TaskStatus } from "../api-client";

export interface TaskPrimaryAction {
    text: string;
    link: string | null;
    disabled: boolean;
}

export function getTaskPrimaryAction(taskId: number, status: TaskStatus, canStartExperiment: boolean): TaskPrimaryAction {
    switch (status) {
        case "not_started":
            return {
                text: "开始实验",
                link: `/task/${taskId}/experiment`,
                disabled: !canStartExperiment,
            };
        case "in_progress":
            return {
                text: "继续实验",
                link: `/task/${taskId}/experiment`,
                disabled: !canStartExperiment,
            };
        case "submitted":
            return {
                text: "查看提交内容",
                link: `/task/${taskId}/result`,
                disabled: false,
            };
        case "graded":
            return {
                text: "查看成绩",
                link: `/task/${taskId}/result`,
                disabled: false,
            };
        case "rejected":
            return {
                text: "继续修改",
                link: `/task/${taskId}/experiment`,
                disabled: !canStartExperiment,
            };
        default: {
            const _exhaustive: never = status;
            throw new Error(`Unknown task status: ${_exhaustive}`);
        }
    }
}

export function shouldShowTaskAvailabilityHint(status: TaskStatus, canStartExperiment: boolean) {
    return !canStartExperiment && ["not_started", "in_progress", "rejected"].includes(status);
}
