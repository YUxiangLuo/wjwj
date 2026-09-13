/**
 * Shared questionnaire / question shapes (student experiment & teacher recommend questions).
 */

import type { QuestionVariableBindingV1 } from "@/domain/experiment/question-variable-binding";

export type QuestionType = "boolean" | "single" | "multiple" | "scale" | "numeric";
export type QuestionSection = "screening" | "main" | "background";

export const QUESTION_CONFIG_FIELDS = ["id", "type", "content", "section", "recommendSourceId", "options", "variableBinding", "minSelect", "maxSelect", "scaleMin", "scaleMax", "scaleMinLabel", "scaleMaxLabel", "numberRule"] as const;
export const QUESTIONNAIRE_CONFIG_FIELDS = ["title", "welcomeText", "endingText", "questions"] as const;

export interface QuestionOption { id: string; label: string }

export interface Question {
    id: string;
    type: QuestionType;
    content: string;
    /** 标准问卷结构中的部分；未指定时默认主体题。 */
    section?: QuestionSection;
    /** 来自教师推荐题目时的源 id，用于避免从推荐区重复添加同一题 */
    recommendSourceId?: string;
    /** Stable identities and labels travel together; required for single/multiple choice. */
    options?: QuestionOption[];
    /** Semantic correspondence only; absence means cognitive pretest without a data link. */
    variableBinding?: QuestionVariableBindingV1;
    minSelect?: number;
    maxSelect?: number;
    scaleMin?: number;
    scaleMax?: number;
    scaleMinLabel?: string;
    scaleMaxLabel?: string;
    /** Required for numeric questions; never treated as an ordinal score. */
    numberRule?: import("./numeric-question").NumericQuestionRule;
}

export interface QuestionnaireData {
    title: string;
    welcomeText: string;
    endingText: string;
    questions: Question[];
}
