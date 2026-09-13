/**
 * Shared questionnaire / question shapes (student experiment & teacher recommend questions).
 */

import type { QuestionVariableBindingV1 } from "@/domain/experiment/question-variable-binding";

export type QuestionType = "boolean" | "single" | "multiple" | "scale";
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
    /** Optional stable identities, scoped to this question. Legacy labels remain unchanged. */
    optionIds?: string[];
    /** Semantic correspondence only; absence means cognitive pretest without a data link. */
    variableBinding?: QuestionVariableBindingV1;
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
