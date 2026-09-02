import type { QuestionType } from "./questionnaire-types";

export const questionTypeLabels: Record<QuestionType, string> = {
    boolean: "是/否题",
    single: "单选题",
    multiple: "多选题",
    scale: "评分题",
};

export const questionTypeBadgeColors: Record<QuestionType, string> = {
    boolean: "bg-success-muted text-success border-success-border",
    single: "bg-info-muted text-info border-info-border",
    multiple: "bg-warning-muted text-warning border-warning-border",
    scale: "bg-auxiliary-muted text-auxiliary border-auxiliary-border",
};
