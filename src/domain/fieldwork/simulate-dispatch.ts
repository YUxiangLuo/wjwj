import { createSeededRandom, stratumKey } from "../statistics/sampling";
import { parseNumericText } from "../../lib/numeric-text";
import type { AnalysisTarget } from "../../lib/analysis-target";
import type { Question, QuestionnaireData } from "../../lib/questionnaire-types";
import type { SamplingMethod } from "../../lib/sampling-policy";
import { valueKey } from "../variables/dictionary";
import type { RawValue, VariableDictionary } from "../variables/types";
import { bindingCategories } from "../variables/question-binding";
import {
    checkNumericQuestionRangeConflict,
    evaluateQuestionnaireBurden,
    resolveQuestionBoundFields,
} from "./questionnaire-burden";
import {
    resolveCleaningConfig,
    resolveFieldworkConfig,
    type CleaningConfig,
    type FieldworkSimulationConfig,
    type MethodFieldworkResult,
    type RespondentDisposition,
    type UnitFieldworkRecord,
} from "./types";

const VALID_SAMPLING_METHODS = new Set<SamplingMethod>(["simple", "systematic", "pps", "stratified"]);

function clamp(val: number, min: number, max: number) {
    return Math.min(max, Math.max(min, val));
}

function normalizeZero(val: number): number {
    return Object.is(val, -0) ? 0 : val;
}

function safeValueKey(value: unknown): string | null {
    try {
        return valueKey(value);
    } catch {
        return null;
    }
}

export function buildDictionaryMissingKeyMap(dictionary: VariableDictionary | null | undefined): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();
    for (const variable of dictionary?.variables ?? []) {
        const keys = new Set<string>();
        for (const item of variable.missing) {
            const k = safeValueKey(item);
            if (k !== null) keys.add(k);
        }
        map.set(variable.field, keys);
    }
    return map;
}

export function isValueMissingForField(
    value: unknown,
    field: string,
    missingMap: Map<string, Set<string>>,
): boolean {
    if (value === undefined) return true;
    const declaredMissing = missingMap.get(field);
    if (declaredMissing) {
        const key = safeValueKey(value);
        if (key !== null && declaredMissing.has(key)) return true;
        return value === null || (typeof value === "string" && value.trim() === "");
    }
    return value === null || (typeof value === "string" && value.trim() === "");
}

function normalizeDispatchSeed(seed: number): number {
    if (typeof seed === "number" && Number.isSafeInteger(seed)) {
        return normalizeZero(seed);
    }
    if (typeof seed !== "number" || !Number.isFinite(seed)) {
        return 0;
    }
    const text = String(seed);
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function hasInvertedNumericRange(question: Question): boolean {
    if (question.type !== "numeric") return false;
    const min = typeof question.numericMin === "number" && Number.isFinite(question.numericMin) ? question.numericMin : undefined;
    const max = typeof question.numericMax === "number" && Number.isFinite(question.numericMax) ? question.numericMax : undefined;
    return min !== undefined && max !== undefined && min > max;
}

function formatClampedDecimal(value: number, min: number, max: number, places: number): number {
    const fixedVal = Number(value.toFixed(places));
    if (places === 0) {
        const intMin = Math.ceil(min);
        const intMax = Math.floor(max);
        if (intMin <= intMax) {
            return normalizeZero(clamp(fixedVal, intMin, intMax));
        }
    } else {
        const factor = 10 ** places;
        const gridMin = Math.ceil(min * factor - 1e-9) / factor;
        const gridMax = Math.floor(max * factor + 1e-9) / factor;
        if (gridMin <= gridMax && Number.isFinite(gridMin) && Number.isFinite(gridMax)) {
            return normalizeZero(Number(clamp(fixedVal, gridMin, gridMax).toFixed(places)));
        }
    }
    return normalizeZero(clamp(fixedVal, min, max));
}

function buildCarelessOverrideValue(params: {
    field: string;
    trueValue: unknown;
    disposition: "careless_speeder" | "careless_straightliner";
    dictionary: VariableDictionary | null | undefined;
    questionnaire: QuestionnaireData;
    rng: () => number;
}): RawValue | undefined {
    const variable = params.dictionary?.variables.find((v) => v.field === params.field);
    const matchingQuestion = params.questionnaire.questions.find((q) => resolveQuestionBoundFields(q).includes(params.field));

    if (variable?.kind === "continuous" || matchingQuestion?.type === "numeric") {
        const parsed = parseNumericText(params.trueValue);
        if (parsed === null) return undefined;
        const rawMin = typeof matchingQuestion?.numericMin === "number" && Number.isFinite(matchingQuestion.numericMin)
            ? matchingQuestion.numericMin
            : undefined;
        const rawMax = typeof matchingQuestion?.numericMax === "number" && Number.isFinite(matchingQuestion.numericMax)
            ? matchingQuestion.numericMax
            : undefined;
        if (rawMin !== undefined && rawMax !== undefined && rawMin > rawMax) {
            return undefined;
        }

        let min: number;
        let max: number;
        if (rawMin !== undefined && rawMax !== undefined) {
            min = rawMin;
            max = rawMax;
        } else if (rawMin !== undefined) {
            min = rawMin;
            const span = Math.max(10, Math.abs(parsed - rawMin) * 2 + 10, Math.abs(rawMin) * 0.5 + 10);
            max = rawMin + span;
        } else if (rawMax !== undefined) {
            max = rawMax;
            const defaultLower = rawMax >= 0 && parsed >= 0
                ? 0
                : rawMax - Math.max(10, Math.abs(rawMax - parsed) * 2 + 10, Math.abs(rawMax) * 0.5 + 10);
            min = Math.min(rawMax, defaultLower);
        } else {
            min = parsed < 0 ? Math.min(parsed * 2 - 10, -10) : 0;
            max = Math.max(min + 10, 100, Math.abs(parsed) * 3 + 10);
        }

        const rawPlaces = matchingQuestion?.decimalPlaces;
        const places = typeof rawPlaces === "number" && Number.isFinite(rawPlaces)
            ? clamp(Math.trunc(rawPlaces), 0, 10)
            : (Number.isInteger(parsed) ? 0 : 1);

        if (params.disposition === "careless_speeder") {
            // 闪电敷衍卷偏爱填极端凑整数字（如上限或固定偏高/偏低噪声值），显著污染未洗卷估计
            const rawDistorted = rngPickExtremeNumeric(min, max, params.rng);
            return formatClampedDecimal(rawDistorted, min, max, places);
        }
        const mid = (min + max) / 2;
        return formatClampedDecimal(mid, min, max, places);
    }

    if (variable && (variable.kind === "nominal" || variable.kind === "ordinal")) {
        const cats = bindingCategories(variable);
        if (cats.length === 0) return undefined;
        if (params.disposition === "careless_straightliner") {
            // 直线敷衍卷固定勾选第一项或中间刻度
            return cats[0]!.value;
        }
        const idx = Math.min(cats.length - 1, Math.floor(params.rng() * cats.length));
        return cats[idx]!.value;
    }

    return undefined;
}

function rngPickExtremeNumeric(min: number, max: number, rng: () => number): number {
    const span = Math.max(0, max - min);
    // 70% 概率偏向高端异常值，30% 偏向低端值，形成可检验的系统性废卷污染
    return rng() < 0.7
        ? clamp(min + span * (0.78 + rng() * 0.2), min, max)
        : clamp(min + span * (rng() * 0.08), min, max);
}

export function simulateMethodFieldwork(params: {
    method: SamplingMethod;
    population: Array<Record<string, unknown>>;
    indices: number[];
    questionnaire: QuestionnaireData;
    dictionary?: VariableDictionary | null;
    analysisTarget?: AnalysisTarget | null;
    fieldworkConfig?: FieldworkSimulationConfig | unknown;
    dispatchSeed: number;
    dispatchedAt?: string;
}): MethodFieldworkResult {
    const config = resolveFieldworkConfig(params.fieldworkConfig);
    const burden = evaluateQuestionnaireBurden(params.questionnaire, params.dictionary, params.analysisTarget);
    const questions = Array.isArray(params.questionnaire?.questions) ? params.questionnaire.questions : [];
    const rawQuestionCount = questions.length;
    const effectiveQuestionCount = Math.max(1, rawQuestionCount);
    const dispatchSeed = normalizeDispatchSeed(params.dispatchSeed);
    const hasDictionary = Boolean(params.dictionary && params.dictionary.variables.some((v) => v.kind !== "identifier"));
    const missingMap = buildDictionaryMissingKeyMap(params.dictionary);

    const records: UnitFieldworkRecord[] = params.indices.map((populationIndex, sampleOrder) => {
        const row = params.population[populationIndex] ?? {};
        const rng = createSeededRandom(`${dispatchSeed}:${params.method}:${populationIndex}:${sampleOrder}`);

        // 1. 计算该单位的单元无回答概率（结合框内分层应答差异 + 问卷开场/规范惩罚）
        let unitNonResponseProb = config.baseUnitNonResponseRate;
        if (config.stratumField && config.stratumNonResponseRates) {
            const sKey = stratumKey(row[config.stratumField]);
            if (sKey && Object.hasOwn(config.stratumNonResponseRates, sKey)) {
                const stratumRate = config.stratumNonResponseRates[sKey];
                if (typeof stratumRate === "number" && Number.isFinite(stratumRate)) {
                    unitNonResponseProb = stratumRate;
                }
            }
        }
        if (config.preset === "peak_congestion") {
            unitNonResponseProb += 0.04;
        }
        unitNonResponseProb = clamp(unitNonResponseProb + burden.refusalPenalty, 0, 0.88);

        const contactRoll = rng();
        if (contactRoll < unitNonResponseProb) {
            const isNotContacted = rng() < 0.36;
            return {
                populationIndex,
                disposition: isNotContacted ? "not_contacted" : "refused",
                durationSec: 0,
                answeredQuestionCount: 0,
            };
        }

        // 2. 已接触并开始作答：判定中途弃答（Break-off）
        const presetBreakoffBoost = config.preset === "high_burden_sensitive" ? 1.35 : 1.0;
        const breakoffProb = clamp(burden.totalBreakoffProbability * presetBreakoffBoost, 0, 0.42);
        if (rawQuestionCount >= 4 && rng() < breakoffProb) {
            // 弃答通常发生在后半程题目
            const minBreakIdx = Math.max(1, Math.floor(rawQuestionCount * 0.35));
            const breakoffAtQuestion = Math.min(
                rawQuestionCount - 1,
                minBreakIdx + Math.floor(rng() * Math.max(1, rawQuestionCount - minBreakIdx)),
            );
            const partialDuration = Math.max(
                12,
                Math.round((burden.estimatedDurationSec * (breakoffAtQuestion / effectiveQuestionCount)) * (0.75 + rng() * 0.45)),
            );
            return {
                populationIndex,
                disposition: "breakoff",
                durationSec: partialDuration,
                answeredQuestionCount: breakoffAtQuestion,
                breakoffAtQuestion,
            };
        }

        // 3. 完答受访者：判定是否为闪电敷衍卷（Speeder）或直线作答卷（Straight-liner）
        const speederProb = clamp(config.baseSpeederRate + burden.speederPenalty, 0, 0.38);
        const straightlinerProb = burden.scaleOrSingleQuestionCount >= 2
            ? clamp(config.baseStraightlinerRate + (burden.burdenLevel === "high" ? 0.04 : 0), 0, 0.32)
            : 0;

        const qualityRoll = rng();
        let disposition: RespondentDisposition = "valid_complete";
        let durationSec = Math.max(
            20,
            Math.round(burden.estimatedDurationSec * (0.82 + rng() * 0.52)),
        );

        if (qualityRoll < speederProb) {
            disposition = "careless_speeder";
            durationSec = Math.max(5, Math.round(burden.estimatedDurationSec * (0.12 + rng() * 0.14)));
        } else if (qualityRoll < speederProb + straightlinerProb) {
            disposition = "careless_straightliner";
            durationSec = Math.max(12, Math.round(burden.estimatedDurationSec * (0.35 + rng() * 0.2)));
        }

        // 4. 逐题检查量程受阻（如 0 值被 numericMin > 0 拦截或上下限倒置）与普通漏答
        const rangeBlockedFields: string[] = [];
        const skippedFields: string[] = [];
        const carelessOverrides: Record<string, RawValue> = {};

        for (const question of questions) {
            const fields = resolveQuestionBoundFields(question);
            const invertedRange = hasInvertedNumericRange(question);
            for (const field of fields) {
                const rawVal = row[field];
                if (invertedRange) {
                    if (!rangeBlockedFields.includes(field)) rangeBlockedFields.push(field);
                    continue;
                }
                if (!isValueMissingForField(rawVal, field, missingMap)) {
                    const numVal = parseNumericText(rawVal);
                    if (numVal !== null && checkNumericQuestionRangeConflict(question, numVal)) {
                        if (!rangeBlockedFields.includes(field)) rangeBlockedFields.push(field);
                        continue;
                    }
                }
                if (disposition === "valid_complete") {
                    const isPrimary = params.analysisTarget?.field === field;
                    const skipProb = isPrimary ? config.baseItemSkipRate * 0.25 : config.baseItemSkipRate;
                    if (skipProb > 0 && rng() < skipProb && !skippedFields.includes(field)) {
                        skippedFields.push(field);
                    }
                } else {
                    const override = buildCarelessOverrideValue({
                        field,
                        trueValue: rawVal,
                        disposition,
                        dictionary: params.dictionary,
                        questionnaire: params.questionnaire,
                        rng,
                    });
                    if (override !== undefined) {
                        carelessOverrides[field] = override;
                    }
                }
            }
        }

        // 无字典兼容回退：仅当课题无变量字典且主目标未被量程拦截时，为敷衍卷生成主目标扰动
        if (
            !hasDictionary
            && (disposition === "careless_speeder" || disposition === "careless_straightliner")
            && params.analysisTarget
            && !rangeBlockedFields.includes(params.analysisTarget.field)
            && !(params.analysisTarget.field in carelessOverrides)
        ) {
            const targetField = params.analysisTarget.field;
            const rawTarget = row[targetField];
            if (params.analysisTarget.kind === "mean") {
                const num = parseNumericText(rawTarget);
                if (num !== null) {
                    carelessOverrides[targetField] = normalizeZero(Number((num * (1.45 + rng() * 0.5) + 4).toFixed(1)));
                }
            } else {
                const matchesTarget = String(rawTarget ?? "").trim().normalize("NFKC")
                    === params.analysisTarget.value.trim().normalize("NFKC");
                carelessOverrides[targetField] = matchesTarget
                    ? "__NON_TARGET__"
                    : params.analysisTarget.value;
            }
        }

        return {
            populationIndex,
            disposition,
            durationSec,
            answeredQuestionCount: rawQuestionCount,
            ...(rangeBlockedFields.length > 0 ? { rangeBlockedFields } : {}),
            ...(skippedFields.length > 0 ? { skippedFields } : {}),
            ...(Object.keys(carelessOverrides).length > 0 ? { carelessOverrides } : {}),
        };
    });

    return {
        method: params.method,
        dispatchSeed,
        dispatchedAt: params.dispatchedAt ?? new Date().toISOString(),
        invitedCount: params.indices.length,
        records,
    };
}

function containsInvalidJsonScalar(value: unknown): boolean {
    if (typeof value === "number") return !Number.isFinite(value);
    if (Array.isArray(value)) return value.some(containsInvalidJsonScalar);
    if (value && typeof value === "object") {
        return Object.values(value as Record<string, unknown>).some(containsInvalidJsonScalar);
    }
    return false;
}

function canonicalFieldworkJson(value: unknown): string {
    if (typeof value === "number") {
        return Number.isFinite(value) ? String(normalizeZero(value)) : "null";
    }
    if (Array.isArray(value)) return `[${value.map(canonicalFieldworkJson).join(",")}]`;
    if (value && typeof value === "object") {
        const entries = Object.entries(value as Record<string, unknown>)
            .filter(([, item]) => item !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
        return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalFieldworkJson(item)}`).join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
}

export function verifyMethodFieldworkReplay(params: {
    stored: MethodFieldworkResult;
    expectedMethod?: SamplingMethod;
    population: Array<Record<string, unknown>>;
    indices: number[];
    questionnaire: QuestionnaireData;
    dictionary?: VariableDictionary | null;
    analysisTarget?: AnalysisTarget | null;
    fieldworkConfig?: FieldworkSimulationConfig | unknown;
}): boolean {
    const stored = params.stored;
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return false;
    if (!VALID_SAMPLING_METHODS.has(stored.method)) return false;
    if (params.expectedMethod !== undefined && stored.method !== params.expectedMethod) return false;
    if (typeof stored.dispatchSeed !== "number" || !Number.isSafeInteger(stored.dispatchSeed)) return false;
    if (typeof stored.dispatchedAt !== "string" || stored.dispatchedAt.trim().length === 0) return false;
    if (!Array.isArray(params.indices)) return false;
    if (params.indices.some((idx) => !Number.isSafeInteger(idx) || idx < 0 || idx >= params.population.length)) {
        return false;
    }
    if (stored.invitedCount !== params.indices.length) return false;
    if (!Array.isArray(stored.records) || stored.records.length !== params.indices.length) return false;
    if (containsInvalidJsonScalar(stored.records)) return false;

    const replayed = simulateMethodFieldwork({
        method: stored.method,
        population: params.population,
        indices: params.indices,
        questionnaire: params.questionnaire,
        dictionary: params.dictionary,
        analysisTarget: params.analysisTarget,
        fieldworkConfig: params.fieldworkConfig,
        dispatchSeed: stored.dispatchSeed,
        dispatchedAt: stored.dispatchedAt,
    });
    return canonicalFieldworkJson(replayed.records) === canonicalFieldworkJson(stored.records);
}

export interface MaterializedRespondentDataset {
    /** 质检清洗后保留的有效受访者行（仅暴露抽样框先验列 + 问卷已绑定列） */
    cleanedRows: Array<Record<string, unknown>>;
    cleanedIndices: number[];
    cleanedInclusionProbabilities?: number[];
    /** 清洗前所有完答行（含闪电卷与直线作答失真值，用于对比洗卷前后的估计污染） */
    uncleanedRows: Array<Record<string, unknown>>;
    uncleanedIndices: number[];
    uncleanedInclusionProbabilities?: number[];
}

export function materializeFieldworkSample(params: {
    population: Array<Record<string, unknown>>;
    samplingIndices: number[];
    inclusionProbabilities?: number[];
    fieldworkResult: MethodFieldworkResult;
    cleaningConfig?: CleaningConfig | unknown;
    questionnaire: QuestionnaireData;
    dictionary?: VariableDictionary | null;
    frameFields: string[];
    analysisTarget?: AnalysisTarget | null;
}): MaterializedRespondentDataset {
    const cleaning = resolveCleaningConfig(params.cleaningConfig);
    const hasDictionary = Boolean(params.dictionary && params.dictionary.variables.some((v) => v.kind !== "identifier"));
    const missingMap = buildDictionaryMissingKeyMap(params.dictionary);
    const boundFields = new Set<string>(params.frameFields);
    for (const q of params.questionnaire?.questions ?? []) {
        for (const f of resolveQuestionBoundFields(q)) boundFields.add(f);
    }
    if (!hasDictionary && params.analysisTarget) {
        boundFields.add(params.analysisTarget.field);
    }

    const cleanedRows: Array<Record<string, unknown>> = [];
    const cleanedIndices: number[] = [];
    const cleanedProbs: number[] = [];

    const uncleanedRows: Array<Record<string, unknown>> = [];
    const uncleanedIndices: number[] = [];
    const uncleanedProbs: number[] = [];

    const records = Array.isArray(params.fieldworkResult?.records) ? params.fieldworkResult.records : [];
    const hasAlignedIndices = Array.isArray(params.samplingIndices) && params.samplingIndices.length === records.length;
    const hasAlignedProbs = params.inclusionProbabilities === undefined
        || (Array.isArray(params.inclusionProbabilities) && params.inclusionProbabilities.length === records.length);
    const hasExactPositionMatch = hasAlignedIndices && records.every(
        (rec, idx) => Boolean(rec) && Number.isSafeInteger(rec.populationIndex) && params.samplingIndices[idx] === rec.populationIndex,
    );

    if (!hasAlignedIndices || !hasAlignedProbs || !hasExactPositionMatch) {
        return {
            cleanedRows: [],
            cleanedIndices: [],
            ...(params.inclusionProbabilities !== undefined ? { cleanedInclusionProbabilities: [] } : {}),
            uncleanedRows: [],
            uncleanedIndices: [],
            ...(params.inclusionProbabilities !== undefined ? { uncleanedInclusionProbabilities: [] } : {}),
        };
    }

    records.forEach((rec, idx) => {
        const popIdx = rec.populationIndex;
        const sourceRow = params.population[popIdx];
        if (!sourceRow) return;
        const prob = params.inclusionProbabilities?.[idx];

        const isCompleted =
            rec.disposition === "valid_complete"
            || rec.disposition === "careless_speeder"
            || rec.disposition === "careless_straightliner";
        if (!isCompleted) return;

        const maskedRow: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(sourceRow)) {
            if (!hasDictionary || boundFields.has(key)) {
                maskedRow[key] = val;
            } else {
                maskedRow[key] = null;
            }
        }
        for (const blocked of rec.rangeBlockedFields ?? []) {
            maskedRow[blocked] = null;
        }
        for (const skipped of rec.skippedFields ?? []) {
            maskedRow[skipped] = null;
        }

        const dirtyRow: Record<string, unknown> = { ...maskedRow, ...(rec.carelessOverrides ?? {}) };
        uncleanedRows.push(dirtyRow);
        uncleanedIndices.push(popIdx);
        if (prob !== undefined) uncleanedProbs.push(prob);

        if (cleaning.removeSpeeders && rec.disposition === "careless_speeder") return;
        if (cleaning.removeStraightliners && rec.disposition === "careless_straightliner") return;

        const candidateRow =
            (!cleaning.removeSpeeders && rec.disposition === "careless_speeder")
            || (!cleaning.removeStraightliners && rec.disposition === "careless_straightliner")
                ? dirtyRow
                : maskedRow;

        if (cleaning.requirePrimaryTargetValid && params.analysisTarget) {
            const targetField = params.analysisTarget.field;
            const targetVal = candidateRow[targetField];
            if (isValueMissingForField(targetVal, targetField, missingMap)) return;
            if (params.analysisTarget.kind === "mean" && parseNumericText(targetVal) === null) return;
        }

        cleanedRows.push(candidateRow);
        cleanedIndices.push(popIdx);
        if (prob !== undefined) cleanedProbs.push(prob);
    });

    return {
        cleanedRows,
        cleanedIndices,
        ...(params.inclusionProbabilities ? { cleanedInclusionProbabilities: cleanedProbs } : {}),
        uncleanedRows,
        uncleanedIndices,
        ...(params.inclusionProbabilities ? { uncleanedInclusionProbabilities: uncleanedProbs } : {}),
    };
}
