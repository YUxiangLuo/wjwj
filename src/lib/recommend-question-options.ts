/**
 * 课题推荐题目（DB 显式列）与学生端问卷 Question 的映射。
 */

import type { Question, QuestionType } from "../student/api-client";

/** 与 topic_recommend_question 表列一致（可含 id/topicId） */
export interface RecommendQuestionRow {
    questionType: number;
    content: string;
    choiceOptions?: string[] | null;
    minSelect?: number | null;
    maxSelect?: number | null;
    scaleMin?: number | null;
    scaleMax?: number | null;
    scaleMinLabel?: string | null;
    scaleMaxLabel?: string | null;
}

export function recommendQuestionToStudentQuestion(rq: RecommendQuestionRow): Omit<Question, "id"> {
    const typeMap: Record<number, QuestionType> = {
        1: "boolean",
        2: "single",
        3: "multiple",
        4: "scale",
    };
    const mappedType = typeMap[rq.questionType] ?? "single";

    if (mappedType === "boolean") {
        return { type: "boolean", content: rq.content };
    }

    if (mappedType === "single") {
        const options = (rq.choiceOptions ?? []).map((s) => s.trim()).filter(Boolean);
        return { type: "single", content: rq.content, options: options.length >= 2 ? options : undefined };
    }

    if (mappedType === "multiple") {
        const choices = (rq.choiceOptions ?? []).map((s) => s.trim()).filter(Boolean);
        const minSelect = rq.minSelect ?? 1;
        const maxSelect = rq.maxSelect ?? choices.length;
        return {
            type: "multiple",
            content: rq.content,
            options: choices,
            minSelect,
            maxSelect,
        };
    }

    return {
        type: "scale",
        content: rq.content,
        scaleMin: rq.scaleMin ?? 1,
        scaleMax: rq.scaleMax ?? 5,
        scaleMinLabel: rq.scaleMinLabel ?? "非常不同意",
        scaleMaxLabel: rq.scaleMaxLabel ?? "非常同意",
    };
}

/** 列表/查看：一行摘要 */
export function formatRecommendOptionsSummary(row: RecommendQuestionRow): string {
    const qt = row.questionType;
    if (qt === 1) return "";
    if (qt === 2) {
        const s = (row.choiceOptions ?? []).map((x) => x.trim()).filter(Boolean).join("；");
        return s ? `选项：${s}` : "";
    }
    if (qt === 3) {
        const choices = (row.choiceOptions ?? []).map((x) => x.trim()).filter(Boolean);
        const s = choices.join("；");
        const min = row.minSelect ?? 1;
        const max = row.maxSelect ?? choices.length;
        return s ? `选项：${s}（选 ${min}–${max} 项）` : "";
    }
    if (qt === 4) {
        const a = row.scaleMin ?? 1;
        const b = row.scaleMax ?? 5;
        const l = row.scaleMinLabel ?? "";
        const r = row.scaleMaxLabel ?? "";
        return `${a}–${b} 分 · ${l} ~ ${r}`;
    }
    return "";
}

/** 教师端步骤列表：多选解析为展示用 */
export function getChoiceListForDisplay(row: RecommendQuestionRow): string[] {
    return (row.choiceOptions ?? []).map((s) => String(s ?? ""));
}
