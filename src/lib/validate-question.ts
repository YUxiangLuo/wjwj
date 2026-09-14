import type { Question, QuestionSection, QuestionType } from "./questionnaire-types";
import { getDuplicateOptionIndexes } from "./questionnaire-options";

export interface QuestionValidationOptions {
    /** Only for already-persisted stage-1 work; new/edit saves must use strict validation. */
    allowLegacyDuplicateOptions?: boolean;
}

function toTrimmedString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function generateQuestionId(): string {
    return `q_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 只接受有限数字或可解析的数字文本；布尔、数组、对象、null 不得经 `Number()`
 * 静默变成 0/1。
 */
function isFiniteNumberOption(value: unknown): boolean {
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value === "string") return value.trim() !== "" && Number.isFinite(Number(value));
    return false;
}

const QUESTION_TYPES = new Set<string>(["boolean", "single", "multiple", "scale", "numeric"]);
const QUESTION_SECTIONS = new Set<QuestionSection>(["screening", "main", "background"]);

/**
 * Parse one payload object into {@link Question}, or return an error message (same rules as questionnaire submit).
 * @param index 1-based label for error messages
 */
export function parseRecommendQuestionFromPayload(rawQuestion: unknown, index: number, validationOptions: QuestionValidationOptions = {}): Question | string {
    if (!rawQuestion || typeof rawQuestion !== "object") {
        return `第${index}题配置无效`;
    }

    const question = rawQuestion as Record<string, unknown>;
    const typeRaw = toTrimmedString(question.type);
    const content = toTrimmedString(question.content);
    if (content.length < 1 || content.length > 500) {
        return `第${index}题题目内容长度需在1-500字之间`;
    }

    if (!QUESTION_TYPES.has(typeRaw)) {
        return `第${index}题题型无效`;
    }

    const type = typeRaw as QuestionType;
    const id = typeof question.id === "string" && question.id.trim() ? question.id.trim() : generateQuestionId();
    const base: Question = { id, type, content };
    if (question.section !== undefined) {
        if (typeof question.section !== "string" || !QUESTION_SECTIONS.has(question.section as QuestionSection)) {
            return `第${index}题所属部分无效`;
        }
        base.section = question.section as QuestionSection;
    }
    if (typeof question.recommendSourceId === "string") {
        const sid = question.recommendSourceId.trim();
        if (sid.length > 0 && sid.length <= 120) {
            base.recommendSourceId = sid;
        }
    }

    if (type === "boolean") {
        return base;
    }

    if (type === "single" || type === "multiple") {
        const options = Array.isArray(question.options)
            ? question.options.map((option) => toTrimmedString(option)).filter((option) => option.length > 0)
            : [];

        if (options.length < 2 || options.length > 10) {
            return `第${index}题选项数量需在2-10个之间`;
        }

        if (options.some((option) => option.length > 200)) {
            return `第${index}题选项内容不能超过200字`;
        }

        if (!validationOptions.allowLegacyDuplicateOptions && getDuplicateOptionIndexes(options).length > 0) {
            return `第${index}题选项内容重复，请修改后重试`;
        }

        const q: Question = { ...base, options };

        if (type === "multiple") {
            const minSelect = question.minSelect === undefined ? 1
                : isFiniteNumberOption(question.minSelect) ? Math.floor(Number(question.minSelect)) : Number.NaN;
            const maxSelect = question.maxSelect === undefined ? options.length
                : isFiniteNumberOption(question.maxSelect) ? Math.floor(Number(question.maxSelect)) : Number.NaN;
            if (!Number.isSafeInteger(minSelect) || !Number.isSafeInteger(maxSelect)
                || minSelect < 1 || maxSelect < minSelect || maxSelect > options.length) {
                return `第${index}题多选数量限制无效`;
            }
            q.minSelect = minSelect;
            q.maxSelect = maxSelect;
        }

        return q;
    }

    if (type === "scale") {
        const scaleMin = question.scaleMin === undefined ? 1
            : isFiniteNumberOption(question.scaleMin) ? Number(question.scaleMin) : Number.NaN;
        const scaleMax = question.scaleMax === undefined ? 10
            : isFiniteNumberOption(question.scaleMax) ? Number(question.scaleMax) : Number.NaN;
        if (!Number.isFinite(scaleMin) || !Number.isFinite(scaleMax)
            || scaleMin < 1 || scaleMax > 10 || scaleMin >= scaleMax) {
            return `第${index}题量表范围无效`;
        }

        const q: Question = { ...base, scaleMin, scaleMax };
        const minLabel = typeof question.scaleMinLabel === "string" ? question.scaleMinLabel.trim() : "";
        const maxLabel = typeof question.scaleMaxLabel === "string" ? question.scaleMaxLabel.trim() : "";
        if (minLabel) q.scaleMinLabel = minLabel;
        if (maxLabel) q.scaleMaxLabel = maxLabel;
        return q;
    }

    if (type === "numeric") {
        const unit = toTrimmedString(question.unit);
        if (question.decimalPlaces === undefined || !isFiniteNumberOption(question.decimalPlaces)) return `第${index}题小数位数需为0-10的整数`;
        const decimalPlaces = Number(question.decimalPlaces);
        if (!Number.isSafeInteger(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > 10) return `第${index}题小数位数需为0-10的整数`;
        const q: Question = { ...base, unit, decimalPlaces };
        if (question.numericMin !== undefined && question.numericMin !== "") {
            if (!isFiniteNumberOption(question.numericMin)) return `第${index}题数值下限无效`;
            q.numericMin = Number(question.numericMin);
        }
        if (question.numericMax !== undefined && question.numericMax !== "") {
            if (!isFiniteNumberOption(question.numericMax)) return `第${index}题数值上限无效`;
            q.numericMax = Number(question.numericMax);
        }
        if (q.numericMin !== undefined && q.numericMax !== undefined && q.numericMin > q.numericMax) return `第${index}题数值范围无效`;
        return q;
    }

    return `第${index}题题型无效`;
}

/**
 * Validates one question object (same rules as questionnaire submit per-question checks).
 * @param index 1-based label for error messages
 */
export function validateQuestionAtIndex(rawQuestion: unknown, index: number, validationOptions: QuestionValidationOptions = {}): string | null {
    const r = parseRecommendQuestionFromPayload(rawQuestion, index, validationOptions);
    return typeof r === "string" ? r : null;
}

export function parseRecommendQuestionsPayload(
    items: unknown
): { ok: true; questions: Question[] } | { ok: false; error: string } {
    if (!Array.isArray(items)) {
        return { ok: false, error: "题目列表格式无效" };
    }
    if (items.length > 30) {
        return { ok: false, error: "推荐题目数量不能超过30" };
    }

    const questions: Question[] = [];
    for (let i = 0; i < items.length; i += 1) {
        const r = parseRecommendQuestionFromPayload(items[i], i + 1);
        if (typeof r === "string") return { ok: false, error: r };
        questions.push(r);
    }
    return { ok: true, questions };
}

/** Teacher recommend-question list: max 30, each must pass {@link validateQuestionAtIndex}. */
export function validateRecommendQuestionsPayload(items: unknown): string | null {
    const r = parseRecommendQuestionsPayload(items);
    return r.ok ? null : r.error;
}
