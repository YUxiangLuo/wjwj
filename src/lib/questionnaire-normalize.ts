import type { Question, QuestionSection, QuestionType } from "./questionnaire-types";

const QUESTION_TYPES = new Set<QuestionType>(["boolean", "single", "multiple", "scale"]);
const QUESTION_SECTIONS = new Set<QuestionSection>(["screening", "main", "background"]);

const logNormalizeSkips = process.env.NODE_ENV !== "production";

function warnSkipped(reason: string, detail?: unknown) {
    if (!logNormalizeSkips) return;
    if (detail !== undefined) {
        console.warn(`[normalizeRecommendQuestionsFromDb] ${reason}`, detail);
    } else {
        console.warn(`[normalizeRecommendQuestionsFromDb] ${reason}`);
    }
}

function generateId(): string {
    return `q_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/** Parse DB JSON into Question list; drops invalid entries. */
export function normalizeRecommendQuestionsFromDb(value: unknown): Question[] {
    if (value == null) return [];

    let raw: unknown = value;
    if (typeof raw === "string") {
        try {
            raw = JSON.parse(raw);
        } catch (e) {
            warnSkipped("invalid JSON string", e);
            return [];
        }
    }

    if (!Array.isArray(raw)) {
        warnSkipped("root value is not an array", raw);
        return [];
    }

    const out: Question[] = [];
    for (const item of raw) {
        if (!item || typeof item !== "object") {
            warnSkipped("entry is not a non-null object", item);
            continue;
        }
        const o = item as Record<string, unknown>;
        const type = o.type;
        const content = o.content;
        if (typeof type !== "string" || !QUESTION_TYPES.has(type as QuestionType)) {
            warnSkipped("invalid or missing question type", item);
            continue;
        }
        if (typeof content !== "string" || !content.trim()) {
            warnSkipped("invalid or empty content", item);
            continue;
        }

        const id = typeof o.id === "string" && o.id.trim() ? o.id : generateId();
        const q: Question = { id, type: type as QuestionType, content: content.trim() };
        if (typeof o.section === "string" && QUESTION_SECTIONS.has(o.section as QuestionSection)) {
            q.section = o.section as QuestionSection;
        }

        if (type === "single" || type === "multiple") {
            if (!Array.isArray(o.options)) {
                warnSkipped("single/multiple missing options array", item);
                continue;
            }
            const opts = o.options.map((x) => (typeof x === "string" ? x : String(x ?? ""))).filter((s) => s.trim());
            if (opts.length < 2) {
                warnSkipped("single/multiple needs at least 2 non-empty options", item);
                continue;
            }
            q.options = opts;
        }
        if (type === "multiple") {
            if (typeof o.minSelect === "number") q.minSelect = o.minSelect;
            if (typeof o.maxSelect === "number") q.maxSelect = o.maxSelect;
        }
        if (type === "scale") {
            if (typeof o.scaleMin === "number") q.scaleMin = o.scaleMin;
            if (typeof o.scaleMax === "number") q.scaleMax = o.scaleMax;
            if (typeof o.scaleMinLabel === "string") q.scaleMinLabel = o.scaleMinLabel;
            if (typeof o.scaleMaxLabel === "string") q.scaleMaxLabel = o.scaleMaxLabel;
        }
        out.push(q);
    }
    return out;
}
