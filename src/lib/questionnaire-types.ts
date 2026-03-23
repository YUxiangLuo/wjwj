/**
 * Shared questionnaire / question shapes (student experiment & teacher recommend questions).
 */

export type QuestionType = "boolean" | "single" | "multiple" | "scale";

export interface Question {
    id: string;
    type: QuestionType;
    content: string;
    /** 来自教师推荐题目时的源 id，用于避免从推荐区重复添加同一题 */
    recommendSourceId?: string;
    options?: string[];
    minSelect?: number;
    maxSelect?: number;
    scaleMin?: number;
    scaleMax?: number;
    scaleMinLabel?: string;
    scaleMaxLabel?: string;
}

export interface QuestionnaireData {
    title: string;
    welcomeText: string;
    endingText: string;
    questions: Question[];
}
