import { QUESTION_CONFIG_FIELDS, QUESTIONNAIRE_CONFIG_FIELDS } from "./questionnaire-types";

/** One-based positions of repeated labels. Keep case distinctions for symbols such as X/x. */
export function getDuplicateOptionIndexes(options: readonly string[]): number[] {
    const first = new Map<string, number>();
    const duplicates = new Set<number>();
    options.forEach((option, index) => {
        // Fold full-width ASCII only: NFKC would incorrectly merge 10² with 102.
        const key = option.replace(/[\uFF01-\uFF5E]/gu, character => String.fromCharCode(character.charCodeAt(0) - 0xFEE0))
            .trim().replace(/\s+/gu, " ");
        if (!key) return;
        const previous = first.get(key);
        if (previous === undefined) {
            first.set(key, index + 1);
        } else {
            duplicates.add(previous);
            duplicates.add(index + 1);
        }
    });
    return [...duplicates].sort((a, b) => a - b);
}

/** getRandomValues also works on ordinary intranet HTTP; randomUUID requires a secure context. */
export function generateOptionIdentity(): string {
    return `o_${Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

/** Guard untrusted saved/browser documents before any editor or scoring state is mounted. */
export function questionnaireOptionFormatError(raw: unknown): string | null {
    if (raw === undefined || raw === null) return null;
    if (typeof raw !== "object" || Array.isArray(raw)) return "问卷必须为原生对象";
    const doc = raw as Record<string, unknown>;
    if (Object.keys(doc).some(key => !(QUESTIONNAIRE_CONFIG_FIELDS as readonly string[]).includes(key))) return "问卷包含未知配置，不接受作答数据";
    if (["title", "welcomeText", "endingText"].some(key => doc[key] !== undefined && typeof doc[key] !== "string")) return "问卷文本格式无效";
    if (doc.questions === undefined) return null;
    if (!Array.isArray(doc.questions)) return "题目必须为对象数组";
    for (const [index, question] of doc.questions.entries()) {
        if (!question || typeof question !== "object" || Array.isArray(question)) return `第${index + 1}题格式无效`;
        if (Object.hasOwn(question, "optionIds")) return `第${index + 1}题仍使用平行选项身份字段`;
        if (Object.keys(question).some(key => !(QUESTION_CONFIG_FIELDS as readonly string[]).includes(key))) return `第${index + 1}题包含未知配置，不接受作答数据`;
        if (typeof question.id !== "string" || typeof question.content !== "string" || !["boolean", "single", "multiple", "scale", "numeric"].includes(question.type)) return `第${index + 1}题基本格式无效`;
        if (question.type === "single" || question.type === "multiple") {
            const error = validateOptionStructure(question.options);
            if (error) return `第${index + 1}题：${error}`;
        } else if (Object.hasOwn(question, "options")) return `第${index + 1}题不是单选或多选，不能配置选项对象`;
    }
    return null;
}

export function validateOptionStructure(options: unknown): string | null {
    if (!Array.isArray(options)) return "选项必须为包含 id 和 label 的对象数组";
    const ids = new Set<string>();
    for (const option of options) {
        if (!option || typeof option !== "object" || Array.isArray(option)
            || Object.keys(option).length !== 2 || !Object.hasOwn(option, "id") || !Object.hasOwn(option, "label")
            || typeof option.label !== "string") return "选项必须为仅包含 id 和 label 的对象，不接受旧文本数组或额外配置";
        if (typeof option.id !== "string" || !option.id.trim() || option.id.length > 200 || option.id.includes("\0") || ids.has(option.id)) return "选项身份无效或重复，请重新编辑题目";
        ids.add(option.id);
    }
    return null;
}
