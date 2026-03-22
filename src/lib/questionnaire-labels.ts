import type { QuestionType } from "./questionnaire-types";

export const questionTypeLabels: Record<QuestionType, string> = {
    boolean: "判断题",
    single: "单选题",
    multiple: "多选题",
    scale: "满意度量表",
};

export const questionTypeBadgeColors: Record<QuestionType, string> = {
    boolean: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    single: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    multiple: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    scale: "bg-purple-500/10 text-purple-500 border-purple-500/20",
};
