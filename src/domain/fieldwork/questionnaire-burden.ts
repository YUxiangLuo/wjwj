import type { Question, QuestionnaireData } from "../../lib/questionnaire-types";
import type { AnalysisTarget } from "../../lib/analysis-target";
import type { VariableDefinition, VariableDictionary } from "../variables/types";
import { bindingCategories, questionSignature } from "../variables/question-binding";

export interface QuestionnaireBurdenProfile {
    questionCount: number;
    estimatedDurationSec: number;
    estimatedMinutes: number;
    burdenLevel: "low" | "moderate" | "high";
    welcomeHasPurposeAndPrivacy: boolean;
    funnelOrderClean: boolean;
    boundFields: string[];
    unboundVariables: string[];
    primaryTargetBound: boolean;
    primaryTargetQuestionIndex: number | null;
    scaleOrSingleQuestionCount: number;
    /** 附加在初始单元无回答率上的惩罚项（0..0.15） */
    refusalPenalty: number;
    /** 题量过长引发的中途弃答基准概率（0..0.28） */
    totalBreakoffProbability: number;
    /** 闪电敷衍卷附加风险（0..0.12） */
    speederPenalty: number;
}

const SECTION_RANK: Record<string, number> = {
    screening: 0,
    main: 1,
    background: 2,
};

function stripHtmlPlain(text: string | undefined | null): string {
    if (!text) return "";
    return text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function resolveQuestionBoundFields(question: Question | null | undefined): string[] {
    if (!question || !Array.isArray(question.variableBinding?.mappings) || question.variableBinding.mappings.length === 0) {
        return [];
    }
    const fields: string[] = [];
    for (const mapping of question.variableBinding.mappings) {
        // Spreadsheet column names are exact keys (may carry leading/trailing spaces); check non-blank without trimming.
        if (mapping && typeof mapping.field === "string" && mapping.field.trim()) {
            fields.push(mapping.field);
        }
    }
    return [...new Set(fields)];
}

/**
 * 判断题目是否覆盖某个总体字段：优先严格使用显式 variableBinding；
 * 若当前课题无变量字典，回退按题目文本包含字段名作宽松匹配。
 */
export function findQuestionIndexForField(
    questionnaire: QuestionnaireData | null | undefined,
    field: string,
    hasDictionary: boolean,
): number | null {
    if (!questionnaire || !Array.isArray(questionnaire.questions) || questionnaire.questions.length === 0 || !field) {
        return null;
    }
    for (let index = 0; index < questionnaire.questions.length; index += 1) {
        const q = questionnaire.questions[index];
        if (q && resolveQuestionBoundFields(q).includes(field)) return index;
    }
    if (!hasDictionary) {
        for (let index = 0; index < questionnaire.questions.length; index += 1) {
            const content = questionnaire.questions[index]?.content;
            if (typeof content === "string" && content.includes(field)) return index;
        }
    }
    return null;
}

export function evaluateQuestionnaireBurden(
    questionnaire: QuestionnaireData | null | undefined,
    dictionary: VariableDictionary | null | undefined,
    target?: AnalysisTarget | null,
): QuestionnaireBurdenProfile {
    const questions = Array.isArray(questionnaire?.questions) ? questionnaire.questions : [];
    const questionCount = questions.length;

    const identifierFieldSet = new Set(
        (dictionary?.variables ?? [])
            .filter((v) => v.kind === "identifier")
            .map((v) => v.field),
    );

    let estimatedDurationSec = questionCount > 0 ? 18 : 0;
    let scaleOrSingleQuestionCount = 0;
    let funnelOrderClean = true;
    let maxRankSeen = 0;
    const boundFieldSet = new Set<string>();

    for (const q of questions) {
        if (!q) continue;
        const rank = SECTION_RANK[q.section ?? "main"] ?? 1;
        if (rank < maxRankSeen) funnelOrderClean = false;
        if (rank > maxRankSeen) maxRankSeen = rank;

        if (q.type === "multiple") estimatedDurationSec += 24;
        else if (q.type === "numeric") estimatedDurationSec += 20;
        else if (q.type === "scale") {
            estimatedDurationSec += 16;
            scaleOrSingleQuestionCount += 1;
        } else if (q.type === "single") {
            estimatedDurationSec += 15;
            scaleOrSingleQuestionCount += 1;
        } else {
            estimatedDurationSec += 12;
        }

        for (const field of resolveQuestionBoundFields(q)) {
            if (!identifierFieldSet.has(field)) {
                boundFieldSet.add(field);
            }
        }
    }

    const substantiveVars = (dictionary?.variables ?? []).filter((v) => v.kind !== "identifier");
    const boundFields = [...boundFieldSet];
    const unboundVariables = substantiveVars
        .map((v) => v.field)
        .filter((field) => !boundFieldSet.has(field));

    const hasDictionary = Boolean(dictionary && substantiveVars.length > 0);
    const primaryTargetQuestionIndex = target
        ? findQuestionIndexForField(questionnaire, target.field, hasDictionary)
        : (questionCount > 0 ? 0 : null);
    const primaryTargetBound = target ? primaryTargetQuestionIndex !== null : true;

    // 核心研究指标题置后或误放背景区时，更容易受中途弃答与疲劳作答影响
    const primaryTargetQuestion = primaryTargetQuestionIndex !== null ? questions[primaryTargetQuestionIndex] : undefined;
    const hasNonBackgroundQuestions = questions.some((q) => (q?.section ?? "main") !== "background");
    const coreTargetBuried = Boolean(
        target
        && primaryTargetQuestionIndex !== null
        && (
            (primaryTargetQuestion?.section === "background" && hasNonBackgroundQuestions)
            || (questionCount >= 8 && primaryTargetQuestionIndex >= Math.max(7, Math.floor(questionCount * 0.75)))
        ),
    );

    const welcomePlain = stripHtmlPlain(questionnaire?.welcomeText);
    const welcomeHasPurposeAndPrivacy =
        welcomePlain.length >= 30
        && /(匿名|保密|隐私|自愿|仅用于|仅作|不记名|脱敏)/.test(welcomePlain);

    const refusalPenalty =
        (welcomePlain.length < 25 ? 0.06 : 0)
        + (!welcomeHasPurposeAndPrivacy ? 0.04 : 0)
        + (!funnelOrderClean ? 0.02 : 0);

    const excessQuestions = Math.max(0, questionCount - 12);
    const totalBreakoffProbability = Math.min(
        0.28,
        excessQuestions * 0.018 + (funnelOrderClean ? 0 : 0.03) + (coreTargetBuried ? 0.025 : 0),
    );
    const speederPenalty = Math.min(
        0.12,
        Math.max(0, questionCount - 14) * 0.01 + (!welcomeHasPurposeAndPrivacy ? 0.02 : 0),
    );

    const burdenLevel: "low" | "moderate" | "high" =
        questionCount <= 10 && totalBreakoffProbability <= 0.03
            ? "low"
            : questionCount <= 16 && totalBreakoffProbability <= 0.1
                ? "moderate"
                : "high";

    return {
        questionCount,
        estimatedDurationSec,
        estimatedMinutes: questionCount > 0 ? Math.max(1, Math.ceil(estimatedDurationSec / 60)) : 0,
        burdenLevel,
        welcomeHasPurposeAndPrivacy,
        funnelOrderClean,
        boundFields,
        unboundVariables,
        primaryTargetBound,
        primaryTargetQuestionIndex,
        scaleOrSingleQuestionCount,
        refusalPenalty: Math.min(0.15, refusalPenalty),
        totalBreakoffProbability,
        speederPenalty,
    };
}

export function checkNumericQuestionRangeConflict(question: Question, numericValue: number): boolean {
    if (!question || question.type !== "numeric") return false;
    if (!Number.isFinite(numericValue)) return false;
    const min = typeof question.numericMin === "number" && Number.isFinite(question.numericMin)
        ? question.numericMin
        : undefined;
    const max = typeof question.numericMax === "number" && Number.isFinite(question.numericMax)
        ? question.numericMax
        : undefined;
    if (min !== undefined && max !== undefined && min > max) return true;
    if (min !== undefined && numericValue < min) return true;
    if (max !== undefined && numericValue > max) return true;
    return false;
}

const MISSING_OPTION_KEYWORD_RE = /(未使用|不适用|不愿|拒绝|不清楚|不知道|无此|未参加|未体验|缺失|跳过)/;

function normalizeMatchToken(value: unknown): string {
    if (value === null || value === undefined) return "";
    return String(value).trim().normalize("NFKC").toLowerCase();
}

function resolveBinaryYesNoCategories(validCats: Array<{ value: VariableDefinition["categories"][number]["value"]; label: string }>) {
    const isYes = (cat: (typeof validCats)[number]) => {
        if (cat.value === true || cat.value === 1) return true;
        const tok = normalizeMatchToken(cat.label) || normalizeMatchToken(cat.value);
        return tok === "是" || tok === "yes" || tok === "y" || tok === "true" || tok === "1" || tok === "有";
    };
    const isNo = (cat: (typeof validCats)[number]) => {
        if (cat.value === false || cat.value === 0) return true;
        const tok = normalizeMatchToken(cat.label) || normalizeMatchToken(cat.value);
        return tok === "否" || tok === "no" || tok === "n" || tok === "false" || tok === "0" || tok === "无";
    };
    const c0 = validCats[0]!;
    const c1 = validCats[1]!;
    if ((isYes(c1) && !isYes(c0)) || (isNo(c0) && !isNo(c1))) {
        return { yes: c1, no: c0 };
    }
    return { yes: c0, no: c1 };
}

function matchNominalOptionsToCategories(
    options: string[],
    validCats: Array<{ value: VariableDefinition["categories"][number]["value"]; label: string }>,
) {
    const usedCatIndices = new Set<number>();
    const matched = options.map((opt) => {
        const optTok = normalizeMatchToken(opt);
        const idx = validCats.findIndex((cat, cIdx) => (
            !usedCatIndices.has(cIdx)
            && (normalizeMatchToken(cat.label) === optTok || normalizeMatchToken(cat.value) === optTok)
        ));
        if (idx === -1) return null;
        usedCatIndices.add(idx);
        return { answer: opt, value: validCats[idx]!.value };
    });
    if (matched.every((item) => item !== null)) {
        return matched as Array<{ answer: string; value: VariableDefinition["categories"][number]["value"] }>;
    }
    return options.map((opt, idx) => ({ answer: opt, value: validCats[idx]!.value }));
}

function pickMissingOptionIndex(
    options: string[],
    variable: VariableDefinition,
    validCats: Array<{ value: VariableDefinition["categories"][number]["value"]; label: string }>,
): number {
    // 1. Check if removing exactly one option leaves remaining options matching validCats labels
    const exactCandidates: number[] = [];
    for (let k = 0; k < options.length; k += 1) {
        const remaining = options.filter((_, idx) => idx !== k);
        if (variable.kind === "ordinal") {
            const matchesInOrder = remaining.every((opt, idx) => {
                const optTok = normalizeMatchToken(opt);
                const cat = validCats[idx]!;
                return optTok === normalizeMatchToken(cat.label) || optTok === normalizeMatchToken(cat.value);
            });
            if (matchesInOrder) exactCandidates.push(k);
        } else {
            const catTokens = new Set(validCats.map((cat) => normalizeMatchToken(cat.label)));
            if (remaining.every((opt) => catTokens.has(normalizeMatchToken(opt)))) {
                exactCandidates.push(k);
            }
        }
    }
    if (exactCandidates.length === 1) return exactCandidates[0]!;

    // 2. Check if exactly one option matches missing-like wording
    const keywordCandidates = options
        .map((opt, idx) => (MISSING_OPTION_KEYWORD_RE.test(opt) ? idx : -1))
        .filter((idx) => idx >= 0);
    if (keywordCandidates.length === 1) return keywordCandidates[0]!;

    // 3. Default to trailing option
    return validCats.length;
}

/**
 * 为与变量字典题型/量纲/选项匹配的题目自动构建合规 variableBinding，
 * 支撑学生端“一键智能匹配并绑定推荐题”及内置种子初始化。
 */
export function buildAutoVariableBindingForQuestion(params: {
    question: Question;
    dictionary: VariableDictionary;
    taskId: number;
    preferredField?: string;
    excludeFields?: ReadonlySet<string>;
}): Question["variableBinding"] | null {
    const { question, dictionary, taskId, preferredField, excludeFields } = params;
    const questionContent = typeof question.content === "string" ? question.content : "";

    if (question.type === "multiple") {
        const options = Array.isArray(question.options) ? question.options : [];
        if (options.length === 0 || new Set(options).size !== options.length) return null;
        if (preferredField && options.length !== 1) return null;

        const availableBinary = dictionary.variables.filter((v) => (
            v.kind === "nominal"
            && !excludeFields?.has(v.field)
            && (!preferredField || v.field === preferredField)
            && bindingCategories(v).length === 2
        ));
        if (availableBinary.length < options.length) return null;

        const chosenFields = new Set<string>();
        const mappings: NonNullable<Question["variableBinding"]>["mappings"] = [];
        for (const opt of options) {
            const optTok = normalizeMatchToken(opt);
            const matchedVar = availableBinary.find((v) => {
                if (chosenFields.has(v.field)) return false;
                if (preferredField && v.field === preferredField) return true;
                const labelTok = normalizeMatchToken(v.label);
                const fieldTok = normalizeMatchToken(v.field);
                return Boolean(
                    optTok
                    && (optTok === labelTok || optTok === fieldTok || labelTok.includes(optTok) || optTok.includes(labelTok)),
                );
            });
            if (!matchedVar) return null;
            chosenFields.add(matchedVar.field);
            const { yes, no } = resolveBinaryYesNoCategories(bindingCategories(matchedVar));
            mappings.push({
                field: matchedVar.field,
                option: opt,
                answers: [
                    { answer: "是", value: yes.value },
                    { answer: "否", value: no.value },
                ],
            });
        }

        return {
            taskId,
            source: dictionary.source,
            revision: dictionary.revision,
            signature: questionSignature(question),
            mappings,
        };
    }

    const candidates = preferredField
        ? dictionary.variables.filter((v) => v.field === preferredField)
        : dictionary.variables.filter((v) => v.kind !== "identifier");

    for (const variable of candidates) {
        if (variable.kind === "identifier" || excludeFields?.has(variable.field)) continue;
        if (!preferredField && !questionContent.includes(variable.label) && !questionContent.includes(variable.field)) {
            continue;
        }

        if (question.type === "numeric" && variable.kind === "continuous") {
            if ((question.unit ?? "") !== variable.unit) continue;
            return {
                taskId,
                source: dictionary.source,
                revision: dictionary.revision,
                signature: questionSignature(question),
                mappings: [{ field: variable.field, answers: [] }],
            };
        }

        if (question.type === "scale" && variable.kind === "ordinal") {
            const min = question.scaleMin ?? 1;
            const max = question.scaleMax ?? 10;
            if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) continue;
            const validCats = bindingCategories(variable);
            if (validCats.length !== max - min + 1) continue;
            return {
                taskId,
                source: dictionary.source,
                revision: dictionary.revision,
                signature: questionSignature(question),
                mappings: [{
                    field: variable.field,
                    answers: validCats.map((cat, idx) => ({
                        answer: String(min + idx),
                        value: cat.value,
                    })),
                }],
            };
        }

        if (question.type === "boolean" && variable.kind === "nominal") {
            const validCats = bindingCategories(variable);
            if (validCats.length !== 2) continue;
            const { yes, no } = resolveBinaryYesNoCategories(validCats);
            return {
                taskId,
                source: dictionary.source,
                revision: dictionary.revision,
                signature: questionSignature(question),
                mappings: [{
                    field: variable.field,
                    answers: [
                        { answer: "是", value: yes.value },
                        { answer: "否", value: no.value },
                    ],
                }],
            };
        }

        if (question.type === "single" && (variable.kind === "nominal" || variable.kind === "ordinal")) {
            const options = Array.isArray(question.options) ? question.options : [];
            if (options.length === 0 || new Set(options).size !== options.length) continue;
            const validCats = bindingCategories(variable);
            if (options.length === validCats.length) {
                const answers = variable.kind === "nominal"
                    ? matchNominalOptionsToCategories(options, validCats)
                    : options.map((opt, idx) => ({
                        answer: opt,
                        value: validCats[idx]!.value,
                    }));
                return {
                    taskId,
                    source: dictionary.source,
                    revision: dictionary.revision,
                    signature: questionSignature(question),
                    mappings: [{
                        field: variable.field,
                        answers,
                    }],
                };
            }
            if (options.length === validCats.length + 1 && variable.missing.length > 0) {
                const missingIdx = pickMissingOptionIndex(options, variable, validCats);
                const validOptions = options.filter((_, idx) => idx !== missingIdx);
                const validAnswers = variable.kind === "nominal"
                    ? matchNominalOptionsToCategories(validOptions, validCats)
                    : validCats.map((cat, idx) => ({
                        answer: validOptions[idx]!,
                        value: cat.value,
                    }));
                const answerByOption = new Map(validAnswers.map((item) => [item.answer, item.value]));
                answerByOption.set(options[missingIdx]!, variable.missing[0]!);
                return {
                    taskId,
                    source: dictionary.source,
                    revision: dictionary.revision,
                    signature: questionSignature(question),
                    mappings: [{
                        field: variable.field,
                        answers: options.map((opt) => ({
                            answer: opt,
                            value: answerByOption.get(opt)!,
                        })),
                    }],
                };
            }
        }
    }
    return null;
}

export function autoBindQuestionnaireVariables(params: {
    questionnaire: QuestionnaireData;
    dictionary: VariableDictionary;
    taskId: number;
    targetField?: string;
}): { questionnaire: QuestionnaireData; newlyBoundCount: number } {
    const usedFields = new Set<string>();
    for (const q of params.questionnaire.questions) {
        for (const f of resolveQuestionBoundFields(q)) usedFields.add(f);
    }

    let newlyBoundCount = 0;
    const nextQuestions = params.questionnaire.questions.map((question) => {
        if (question.variableBinding?.mappings?.length) return question;
        // Try exact label/field match first, then primary target match if compatible
        let binding = buildAutoVariableBindingForQuestion({
            question,
            dictionary: params.dictionary,
            taskId: params.taskId,
            excludeFields: usedFields,
        });
        if (!binding && params.targetField && !usedFields.has(params.targetField)) {
            binding = buildAutoVariableBindingForQuestion({
                question,
                dictionary: params.dictionary,
                taskId: params.taskId,
                preferredField: params.targetField,
                excludeFields: usedFields,
            });
        }
        if (!binding) return question;
        const fields = binding.mappings.map((m) => m.field);
        if (fields.some((f) => usedFields.has(f))) return question;
        for (const f of fields) usedFields.add(f);
        newlyBoundCount += 1;
        return { ...question, variableBinding: binding };
    });

    return {
        questionnaire: { ...params.questionnaire, questions: nextQuestions },
        newlyBoundCount,
    };
}

export function findCompatibleDictionaryField(question: Question, variables: VariableDefinition[]): VariableDefinition | null {
    for (const v of variables) {
        if (v.kind === "identifier") continue;
        if (question.type === "numeric" && v.kind === "continuous" && (question.unit ?? "") === v.unit) return v;
        if (question.type === "scale" && v.kind === "ordinal") return v;
        if (question.type === "boolean" && v.kind === "nominal" && bindingCategories(v).length === 2) return v;
        if (question.type === "multiple" && v.kind === "nominal" && bindingCategories(v).length === 2) return v;
        if (question.type === "single" && (v.kind === "nominal" || v.kind === "ordinal")) return v;
    }
    return null;
}
