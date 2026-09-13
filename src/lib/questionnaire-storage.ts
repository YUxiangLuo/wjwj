import type { Question } from "./questionnaire-types";
import { parseRecommendQuestionsPayload } from "./validate-question";

export class InvalidQuestionnaireStorageError extends Error {
    constructor() {
        super("推荐题目存储格式无效，请联系管理员检查；不会跳过或自动修复题目。");
        this.name = "InvalidQuestionnaireStorageError";
    }
}

/** Native JSONB only. A read never manufactures identities, coerces values or drops broken questions. */
export function readStoredRecommendQuestions(value: unknown): Question[] {
    if (value == null) return [];
    if (!Array.isArray(value) || value.some(question => !question || typeof question !== "object"
        || typeof question.id !== "string" || !question.id.trim() || question.id.length > 200 || question.id.includes("\0"))) {
        throw new InvalidQuestionnaireStorageError();
    }
    const parsed = parseRecommendQuestionsPayload(value);
    if (!parsed.ok) throw new InvalidQuestionnaireStorageError();
    return parsed.questions;
}
