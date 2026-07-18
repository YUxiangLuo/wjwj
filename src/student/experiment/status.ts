export const ExperimentStatus = {
    IN_PROGRESS: "in_progress",
    SUBMITTED: "submitted",
    GRADED: "graded",
    REJECTED: "rejected",
} as const;

export type ExperimentStatusValue = (typeof ExperimentStatus)[keyof typeof ExperimentStatus];
