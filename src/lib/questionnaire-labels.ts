import type { QuestionType } from "./questionnaire-types";

export const questionTypeLabels: Record<QuestionType, string> = {
    boolean: "判断题",
    single: "单选题",
    multiple: "多选题",
    scale: "满意度量表",
};

export const questionTypeBadgeColors: Record<QuestionType, string> = {
    boolean: "bg-success/10 text-success border-success/20",
    single: "bg-info/10 text-info border-info/20",
    multiple: "bg-warning/10 text-warning border-warning/20",
    scale: "bg-auxiliary/10 text-auxiliary border-auxiliary/20",
};
