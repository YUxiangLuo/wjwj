/**
 * Shared questionnaire / question shapes (student experiment & teacher recommend questions).
 */

export type QuestionType = "boolean" | "single" | "multiple" | "scale";

export interface Question {
    id: string;
    type: QuestionType;
    content: string;
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
