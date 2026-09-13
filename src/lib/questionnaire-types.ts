/**
 * Shared questionnaire / question shapes (student experiment & teacher recommend questions).
 */

import type { RawValue } from "@/domain/variables/types";

export type QuestionType = "boolean" | "single" | "multiple" | "scale" | "numeric";
export type QuestionSection = "screening" | "main" | "background";

export interface Question {
    id: string;
    type: QuestionType;
    content: string;
    /** 标准问卷结构中的固定部分；历史题目缺省时按主体题处理。 */
    section?: QuestionSection;
    /** 来自教师推荐题目时的源 id，用于避免从推荐区重复添加同一题 */
    recommendSourceId?: string;
    options?: string[];
    minSelect?: number;
    maxSelect?: number;
    scaleMin?: number;
    scaleMax?: number;
    scaleMinLabel?: string;
    scaleMaxLabel?: string;
    unit?: string;
    numericMin?: number;
    numericMax?: number;
    decimalPlaces?: number;
    variableBinding?: {
        taskId: number;
        source: string;
        revision: number;
        signature: string;
        mappings: Array<{
            field: string;
            option?: string;
            answers: Array<{ answer: string; value: RawValue }>;
        }>;
    };
}

export interface QuestionnaireData {
    title: string;
    welcomeText: string;
    endingText: string;
    questions: Question[];
}
