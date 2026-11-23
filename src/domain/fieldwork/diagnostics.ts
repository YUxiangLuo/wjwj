import { parseNumericText } from "../../lib/numeric-text";
import type { AnalysisTarget } from "../../lib/analysis-target";
import type { Question, QuestionnaireData } from "../../lib/questionnaire-types";
import type { SamplingMethod } from "../../lib/sampling-policy";
import { normalizeConfidenceLevel, zForConfidenceLevel } from "../statistics/confidence-level";
import { buildPpsStandardErrorContext, estimateWeightedValue } from "../statistics/pps";
import { stratumKey } from "../statistics/sampling";
import { computeSimpleRandomValueSe } from "../statistics/srs";
import { StableSum } from "../statistics/stable-sum";
import { computeStratifiedValueEstimate, computeStratifiedValueSe } from "../statistics/stratified";
import { computeSystematicExactValueSe } from "../statistics/systematic";
import { type NumericAccessor, sampleStandardDeviation, scaledMean } from "../statistics/values";
import type { VariableDictionary } from "../variables/types";
import {
    checkNumericQuestionRangeConflict,
    evaluateQuestionnaireBurden,
    resolveQuestionBoundFields,
    type QuestionnaireBurdenProfile,
} from "./questionnaire-burden";
import {
    buildDictionaryMissingKeyMap,
    isValueMissingForField,
    materializeFieldworkSample,
} from "./simulate-dispatch";
import {
    resolveCleaningConfig,
    resolveFieldworkConfig,
    type CleaningConfig,
    type FieldworkSimulationConfig,
    type MethodFieldworkResult,
} from "./types";

export interface QuestionQualityDiagnostic {
    questionIndex: number;
    questionId: string;
    title: string;
    type: string;
    boundFields: string[];
    answeredCount: number;
    answerRatePct: number;
    breakoffHereCount: number;
    rangeBlockedCount: number;
    warnings: string[];
}

export interface StratumDiagnosticRow {
    stratum: string;
    frameCount: number;
    frameSharePct: number;
    invitedCount: number;
    validCount: number;
    validSharePct: number;
    responseRatePct: number;
}

export interface EstimateComparisonItem {
    key: "cleaned_design" | "uncleaned_raw" | "nonresponse_calibrated" | "full_invited_benchmark";
    label: string;
    description: string;
    sampleSize: number;
    estimate: number | null;
    standardError: number | null;
    halfWidth: number | null;
}

export interface MethodFieldworkDiagnostics {
    method: SamplingMethod;
    invitedCount: number;
    contactedCount: number;
    notContactedCount: number;
    refusedCount: number;
    breakoffCount: number;
    completedRawCount: number;
    speederCount: number;
    straightlinerCount: number;
    cleanedValidCount: number;
    effectiveRatePct: number;
    empiricalNonResponseRatePct: number;
    empiricalTargetVariance: number | null;
    empiricalTargetStdDev: number | null;
    totalEstimatedCost: number;
    unitEffectiveCost: number | null;
    stratumField: string | null;
    strata: StratumDiagnosticRow[];
    maxStratumBiasPp: number | null;
    questionDiagnostics: QuestionQualityDiagnostic[];
    burden: QuestionnaireBurdenProfile;
    populationTruth: number | null;
    estimates: EstimateComparisonItem[];
    sampleAnomalies: Array<{
        populationIndex: number;
        unitId: string;
        disposition: string;
        durationSec: number;
        reason: string;
    }>;
}

function normalizeZero(value: number): number {
    return Object.is(value, -0) ? 0 : value;
}

function clampProportionIfNeeded(value: number | null, target: AnalysisTarget): number | null {
    if (value === null || !Number.isFinite(value)) return null;
    if (target.kind === "proportion") {
        return normalizeZero(Math.min(1, Math.max(0, value)));
    }
    return normalizeZero(value);
}

function readTargetIndicatorOrNumeric(
    row: Record<string, unknown>,
    target: AnalysisTarget,
    missingMap: Map<string, Set<string>>,
): number | null {
    const raw = row[target.field];
    if (isValueMissingForField(raw, target.field, missingMap)) return null;
    if (target.kind === "mean") {
        return parseNumericText(raw);
    }
    if (raw === "__NON_TARGET__") return 0;
    return String(raw).trim().normalize("NFKC") === target.value.trim().normalize("NFKC") ? 1 : 0;
}

function computeStableWeightedMean(values: number[], weights: number[]): number | null {
    if (values.length === 0 || values.length !== weights.length) return null;
    let weightScale = 0;
    for (const w of weights) {
        if (!Number.isFinite(w) || w < 0) return null;
        if (w > weightScale) weightScale = w;
    }
    if (!(weightScale > 0)) return null;

    let minimum = Infinity;
    let maximum = -Infinity;
    let valueScale = 0;
    for (const v of values) {
        if (!Number.isFinite(v)) return null;
        if (v < minimum) minimum = v;
        if (v > maximum) maximum = v;
        const abs = Math.abs(v);
        if (abs > valueScale) valueScale = abs;
    }
    if (valueScale === 0) return 0;

    const sterbenzCenter =
        (minimum > 0 && maximum <= 2 * minimum) || (maximum < 0 && minimum >= 2 * maximum)
            ? minimum
            : 0;

    let shiftedScale = 0;
    for (const v of values) {
        shiftedScale = Math.max(shiftedScale, Math.abs(v - sterbenzCenter));
    }
    if (shiftedScale === 0) return normalizeZero(sterbenzCenter);

    const numerator = new StableSum();
    const unscaledNumerator = new StableSum();
    const denominator = new StableSum();
    let productUnderflow = false;

    for (let i = 0; i < values.length; i += 1) {
        const w = weights[i]! / weightScale;
        if (w <= 0) continue;
        const shifted = values[i]! - sterbenzCenter;
        const product = w * shifted;
        if (shifted !== 0 && Math.abs(product) < 2 ** -1022) productUnderflow = true;
        unscaledNumerator.add(product);
        numerator.add(w * (shifted / shiftedScale));
        denominator.add(w);
    }

    if (!(denominator.value > 0)) return null;
    const offset = !productUnderflow && Number.isFinite(unscaledNumerator.value)
        ? unscaledNumerator.value / denominator.value
        : (numerator.value / denominator.value) * shiftedScale;
    const result = sterbenzCenter + offset;
    return Number.isFinite(result) ? normalizeZero(result) : null;
}

/**
 * Single-stage Hájek / SRS respondent point estimate and Taylor-linearized SE
 * with finite-population correction and certainty-unit awareness.
 */
function computeRespondentHajekEstimateAndSe(params: {
    rows: Array<Record<string, unknown>>;
    popIndices: number[];
    inclusionProbabilities?: number[];
    requireInclusionProbabilities?: boolean;
    invitedCount: number;
    target: AnalysisTarget;
    missingMap: Map<string, Set<string>>;
    populationSize: number;
    z: number;
}): { estimate: number | null; standardError: number | null; halfWidth: number | null; n: number } {
    if (params.requireInclusionProbabilities) {
        if (!params.inclusionProbabilities || params.inclusionProbabilities.length !== params.rows.length) {
            return { estimate: null, standardError: null, halfWidth: null, n: 0 };
        }
    }

    const valid: Array<{ value: number; popIdx: number; prob: number | null }> = [];
    for (let idx = 0; idx < params.rows.length; idx += 1) {
        const row = params.rows[idx]!;
        const val = readTargetIndicatorOrNumeric(row, params.target, params.missingMap);
        if (val === null || !Number.isFinite(val)) continue;
        let prob: number | null = null;
        if (params.inclusionProbabilities) {
            const rawProb = Number(params.inclusionProbabilities[idx]);
            if (!Number.isFinite(rawProb) || rawProb <= 0 || rawProb > 1) {
                return { estimate: null, standardError: null, halfWidth: null, n: 0 };
            }
            prob = rawProb;
        }
        valid.push({
            value: val,
            popIdx: params.popIndices[idx] ?? idx,
            prob,
        });
    }

    const n = valid.length;
    if (n === 0 || params.populationSize < 1) {
        return { estimate: null, standardError: null, halfWidth: null, n: 0 };
    }

    let minProb = 1;
    if (params.inclusionProbabilities) {
        minProb = valid.reduce((acc, item) => Math.min(acc, item.prob!), Infinity);
        if (!(minProb > 0) || !Number.isFinite(minProb)) {
            return { estimate: null, standardError: null, halfWidth: null, n };
        }
    }

    const weights = valid.map((item) => (item.prob !== null ? minProb / item.prob : 1));
    if (weights.some((w) => !Number.isFinite(w) || w <= 0)) {
        return { estimate: null, standardError: null, halfWidth: null, n };
    }

    const rawEstimate = computeStableWeightedMean(
        valid.map((item) => item.value),
        weights,
    );
    const estimate = clampProportionIfNeeded(rawEstimate, params.target);
    if (estimate === null) {
        return { estimate: null, standardError: null, halfWidth: null, n };
    }

    const uniquePopCount = new Set(valid.map((item) => item.popIdx)).size;
    if (uniquePopCount >= params.populationSize && n === uniquePopCount) {
        return { estimate, standardError: 0, halfWidth: 0, n };
    }

    if (n <= 1) {
        return { estimate, standardError: null, halfWidth: null, n };
    }

    let devScale = 0;
    for (const item of valid) {
        devScale = Math.max(devScale, Math.abs(item.value - estimate));
    }
    if (devScale === 0) {
        return { estimate, standardError: 0, halfWidth: 0, n };
    }

    const weightTotal = new StableSum();
    for (const w of weights) weightTotal.add(w);
    if (!(weightTotal.value > 0) || !Number.isFinite(weightTotal.value)) {
        return { estimate, standardError: null, halfWidth: null, n };
    }

    const globalFpc = Math.max(0, 1 - uniquePopCount / params.populationSize);
    const responseRatio = params.invitedCount > 0 ? Math.min(1, n / Math.max(n, params.invitedCount)) : 1;
    const dfFactor = n / (n - 1);

    let rootNorm = 0;
    for (let i = 0; i < n; i += 1) {
        const item = valid[i]!;
        const unitFpc = item.prob !== null
            ? Math.max(0, 1 - Math.min(1, item.prob * responseRatio))
            : globalFpc;
        if (unitFpc <= 0) continue;
        const wNorm = weights[i]! / weightTotal.value;
        const devNorm = (item.value - estimate) / devScale;
        const term = Math.sqrt(dfFactor * unitFpc) * wNorm * devNorm;
        rootNorm = Math.hypot(rootNorm, term);
    }

    const standardError = normalizeZero(rootNorm * devScale);
    if (!Number.isFinite(standardError)) {
        return { estimate, standardError: null, halfWidth: null, n };
    }
    const rawHalfWidth = normalizeZero(params.z * standardError);
    const halfWidth = Number.isFinite(rawHalfWidth) ? rawHalfWidth : null;
    return { estimate, standardError, halfWidth, n };
}

/**
 * Stratified / Post-stratified respondent estimator:
 * Calibration weights w_i^* = d_i * N_h / (sum_{j in R_h} d_j) = d_i / \hat{\phi}_{h(i)}.
 * Fails closed (`estimate: null`) if any non-empty population stratum has 0 valid target observations (\hat{\phi}_h = 0).
 * Variance is computed strictly within strata around each stratum mean \hat{\mu}_h with stratum-specific FPC (1 - m_h / N_h).
 */
function computeStratifiedRespondentEstimateAndSe(params: {
    rows: Array<Record<string, unknown>>;
    popIndices: number[];
    baseWeights?: number[];
    stratumField: string;
    strataSpecs: Array<{ key: string; frameCount: number }>;
    target: AnalysisTarget;
    missingMap: Map<string, Set<string>>;
    populationSize: number;
    z: number;
}): {
    estimate: number | null;
    standardError: number | null;
    halfWidth: number | null;
    n: number;
    hasEmptyStratum: boolean;
} {
    const activeSpecs = params.strataSpecs.filter((s) => s.frameCount > 0);
    const coveredTotal = activeSpecs.reduce((acc, s) => acc + s.frameCount, 0);
    if (
        activeSpecs.length === 0
        || params.populationSize < 1
        || coveredTotal !== params.populationSize
        || (params.baseWeights && params.baseWeights.length !== params.rows.length)
    ) {
        return { estimate: null, standardError: null, halfWidth: null, n: 0, hasEmptyStratum: false };
    }

    const buckets = new Map<string, Array<{ value: number; popIdx: number; weight: number }>>();
    for (const spec of activeSpecs) {
        buckets.set(spec.key, []);
    }

    let totalValidN = 0;
    for (let idx = 0; idx < params.rows.length; idx += 1) {
        const row = params.rows[idx]!;
        const sKey = stratumKey(row[params.stratumField]);
        const bucket = buckets.get(sKey);
        if (!bucket) continue;

        const val = readTargetIndicatorOrNumeric(row, params.target, params.missingMap);
        if (val === null || !Number.isFinite(val)) continue;

        const dWeight = params.baseWeights ? Number(params.baseWeights[idx]) : 1;
        if (!Number.isFinite(dWeight) || dWeight <= 0) {
            return { estimate: null, standardError: null, halfWidth: null, n: 0, hasEmptyStratum: false };
        }
        bucket.push({
            value: val,
            popIdx: params.popIndices[idx] ?? idx,
            weight: dWeight,
        });
        totalValidN += 1;
    }

    if (totalValidN === 0) {
        return { estimate: null, standardError: null, halfWidth: null, n: 0, hasEmptyStratum: true };
    }

    const overallEstimate = new StableSum();
    let totalSe = 0;
    let seAvailable = true;

    for (const spec of activeSpecs) {
        const items = buckets.get(spec.key) ?? [];
        const mh = items.length;
        if (mh === 0) {
            // \hat{\phi}_h = 0: empty respondent stratum cannot be post-stratified / weighted
            return { estimate: null, standardError: null, halfWidth: null, n: totalValidN, hasEmptyStratum: true };
        }

        const stratumMean = computeStableWeightedMean(
            items.map((it) => it.value),
            items.map((it) => it.weight),
        );
        if (stratumMean === null) {
            return { estimate: null, standardError: null, halfWidth: null, n: totalValidN, hasEmptyStratum: true };
        }

        const Wh = spec.frameCount / params.populationSize;
        overallEstimate.add(Wh * stratumMean);

        const uniqueInStratum = new Set(items.map((it) => it.popIdx)).size;
        if (uniqueInStratum >= spec.frameCount && mh === uniqueInStratum) {
            // Complete census of stratum h (including N_h = 1, m_h = 1): zero within-stratum sampling variance
            continue;
        }
        if (mh < 2) {
            // Sample variance s_h^2 requires m_h >= 2 when m_h < N_h
            seAvailable = false;
            continue;
        }

        const fpcH = Math.max(0, 1 - uniqueInStratum / spec.frameCount);
        if (fpcH <= 0) continue;

        let devScale = 0;
        for (const it of items) {
            devScale = Math.max(devScale, Math.abs(it.value - stratumMean));
        }
        if (devScale === 0) continue;

        const wScale = items.reduce((acc, it) => Math.max(acc, it.weight), 0);
        const wTotal = new StableSum();
        const scaledWeights = items.map((it) => {
            const sw = it.weight / wScale;
            wTotal.add(sw);
            return sw;
        });
        if (!(wTotal.value > 0)) {
            seAvailable = false;
            continue;
        }

        const dfH = mh / (mh - 1);
        let rootH = 0;
        for (let i = 0; i < mh; i += 1) {
            const wNorm = scaledWeights[i]! / wTotal.value;
            const devNorm = (items[i]!.value - stratumMean) / devScale;
            rootH = Math.hypot(rootH, Math.sqrt(dfH * fpcH) * wNorm * devNorm);
        }
        const seH = rootH * devScale;
        if (!Number.isFinite(seH)) {
            seAvailable = false;
            continue;
        }
        totalSe = Math.hypot(totalSe, Wh * seH);
    }

    const estimate = clampProportionIfNeeded(overallEstimate.value, params.target);
    if (estimate === null) {
        return { estimate: null, standardError: null, halfWidth: null, n: totalValidN, hasEmptyStratum: false };
    }

    if (!seAvailable || !Number.isFinite(totalSe)) {
        return { estimate, standardError: null, halfWidth: null, n: totalValidN, hasEmptyStratum: false };
    }
    const standardError = normalizeZero(totalSe);
    const rawHalfWidth = normalizeZero(params.z * standardError);
    const halfWidth = Number.isFinite(rawHalfWidth) ? rawHalfWidth : null;
    return { estimate, standardError, halfWidth, n: totalValidN, hasEmptyStratum: false };
}

function hasInvertedRange(question: Question): boolean {
    if (question.type !== "numeric") return false;
    const min = typeof question.numericMin === "number" && Number.isFinite(question.numericMin) ? question.numericMin : undefined;
    const max = typeof question.numericMax === "number" && Number.isFinite(question.numericMax) ? question.numericMax : undefined;
    return min !== undefined && max !== undefined && min > max;
}

export function buildMethodFieldworkDiagnostics(params: {
    method: SamplingMethod;
    population: Array<Record<string, unknown>>;
    samplingIndices: number[];
    inclusionProbabilities?: number[];
    sizeField?: string;
    stratifyBy?: string;
    layers?: Array<{ name: string; count: number; sampleCount: number }>;
    fieldworkResult: MethodFieldworkResult;
    cleaningConfig?: CleaningConfig | unknown;
    fieldworkConfig?: FieldworkSimulationConfig | unknown;
    questionnaire: QuestionnaireData;
    dictionary?: VariableDictionary | null;
    frameFields: string[];
    identifierField?: string;
    analysisTarget?: AnalysisTarget | null;
    confidenceLevel?: string;
}): MethodFieldworkDiagnostics {
    const config = resolveFieldworkConfig(params.fieldworkConfig);
    const cleaning = resolveCleaningConfig(params.cleaningConfig);
    const burden = evaluateQuestionnaireBurden(params.questionnaire, params.dictionary, params.analysisTarget);
    const missingMap = buildDictionaryMissingKeyMap(params.dictionary);
    const records = Array.isArray(params.fieldworkResult?.records) ? params.fieldworkResult.records : [];

    let notContactedCount = 0;
    let refusedCount = 0;
    let breakoffCount = 0;
    let speederCount = 0;
    let straightlinerCount = 0;
    let validCompleteRaw = 0;

    for (const r of records) {
        if (!r) continue;
        if (r.disposition === "not_contacted") notContactedCount += 1;
        else if (r.disposition === "refused") refusedCount += 1;
        else if (r.disposition === "breakoff") breakoffCount += 1;
        else if (r.disposition === "careless_speeder") speederCount += 1;
        else if (r.disposition === "careless_straightliner") straightlinerCount += 1;
        else if (r.disposition === "valid_complete") validCompleteRaw += 1;
    }

    const invitedCount = records.length;
    const contactedCount = Math.max(0, invitedCount - notContactedCount);
    const completedRawCount = validCompleteRaw + speederCount + straightlinerCount;

    const materialized = materializeFieldworkSample({
        population: params.population,
        samplingIndices: params.samplingIndices,
        inclusionProbabilities: params.inclusionProbabilities,
        fieldworkResult: params.fieldworkResult,
        cleaningConfig: cleaning,
        questionnaire: params.questionnaire,
        dictionary: params.dictionary,
        frameFields: params.frameFields,
        analysisTarget: params.analysisTarget,
    });

    const cleanedValidCount = materialized.cleanedRows.length;
    const effectiveRatePct = invitedCount > 0 ? normalizeZero((cleanedValidCount / invitedCount) * 100) : 0;
    const empiricalNonResponseRatePct = invitedCount > 0
        ? Math.min(50, Math.max(0, Math.round((1 - cleanedValidCount / invitedCount) * 100)))
        : 20;

    const rawTotalCost =
        invitedCount * config.contactCostPerUnit
        + completedRawCount * config.incentiveCostPerComplete;
    const totalEstimatedCost = Number.isFinite(rawTotalCost) ? normalizeZero(Math.max(0, rawTotalCost)) : 0;
    const rawUnitCost = cleanedValidCount > 0 ? totalEstimatedCost / cleanedValidCount : null;
    const unitEffectiveCost = rawUnitCost !== null && Number.isFinite(rawUnitCost) ? normalizeZero(rawUnitCost) : null;

    // Empirical sample variance on cleaned respondent set (requires n >= 2!)
    let empiricalTargetVariance: number | null = null;
    let empiricalTargetStdDev: number | null = null;
    if (params.analysisTarget?.kind === "mean") {
        const vals: number[] = [];
        for (const row of materialized.cleanedRows) {
            const v = readTargetIndicatorOrNumeric(row, params.analysisTarget, missingMap);
            if (v !== null && Number.isFinite(v)) vals.push(v);
        }
        if (vals.length >= 2) {
            const sd = sampleStandardDeviation(vals);
            if (Number.isFinite(sd) && sd >= 0) {
                empiricalTargetStdDev = normalizeZero(sd);
                const variance = sd * sd;
                if (Number.isFinite(variance) && (sd === 0 || variance > 0)) {
                    empiricalTargetVariance = normalizeZero(variance);
                }
            }
        }
    }

    // Subgroup / Stratum response diagnostics (preserve exact spreadsheet column keys; ignore blank strings)
    const normalizedStratifyBy = typeof params.stratifyBy === "string" && params.stratifyBy.trim()
        ? params.stratifyBy
        : undefined;
    const normalizedSizeField = typeof params.sizeField === "string" && params.sizeField.trim()
        ? params.sizeField
        : undefined;
    const normalizedIdentifierField = typeof params.identifierField === "string" && params.identifierField.trim()
        ? params.identifierField
        : undefined;
    const fallbackFrameStratum = params.frameFields
        .filter((f): f is string => typeof f === "string" && f.trim().length > 0)
        .find((f) => f !== normalizedIdentifierField);

    const chosenStratumField =
        normalizedStratifyBy
        ?? config.stratumField
        ?? fallbackFrameStratum
        ?? null;
    const strata: StratumDiagnosticRow[] = [];
    let maxStratumBiasPp: number | null = null;
    let frameCoveredCount = 0;

    if (chosenStratumField && params.population.length > 0) {
        const frameMap = new Map<string, number>();
        for (const row of params.population) {
            const key = stratumKey(row[chosenStratumField]);
            if (!key) continue;
            frameMap.set(key, (frameMap.get(key) ?? 0) + 1);
            frameCoveredCount += 1;
        }
        const invitedMap = new Map<string, number>();
        const activeInviteIndices = records.length > 0
            ? records.map((r) => r.populationIndex)
            : params.samplingIndices;
        for (const idx of activeInviteIndices) {
            const key = stratumKey(params.population[idx]?.[chosenStratumField]);
            if (key) invitedMap.set(key, (invitedMap.get(key) ?? 0) + 1);
        }
        const validMap = new Map<string, number>();
        for (const row of materialized.cleanedRows) {
            const key = stratumKey(row[chosenStratumField]);
            if (key) validMap.set(key, (validMap.get(key) ?? 0) + 1);
        }

        if (frameMap.size >= 2 && frameMap.size <= 25 && frameCoveredCount > 0) {
            let biasMax = 0;
            for (const [sName, fCount] of frameMap.entries()) {
                const inv = invitedMap.get(sName) ?? 0;
                const val = validMap.get(sName) ?? 0;
                const frameSharePct = normalizeZero((fCount / frameCoveredCount) * 100);
                const validSharePct = cleanedValidCount > 0 ? normalizeZero((val / cleanedValidCount) * 100) : 0;
                const responseRatePct = inv > 0 ? normalizeZero((val / inv) * 100) : 0;
                if (cleanedValidCount > 0) {
                    biasMax = Math.max(biasMax, Math.abs(validSharePct - frameSharePct));
                }
                strata.push({
                    stratum: sName,
                    frameCount: fCount,
                    frameSharePct,
                    invitedCount: inv,
                    validCount: val,
                    validSharePct,
                    responseRatePct,
                });
            }
            maxStratumBiasPp = cleanedValidCount > 0 ? normalizeZero(biasMax) : null;
        }
    }

    const questions = Array.isArray(params.questionnaire?.questions) ? params.questionnaire.questions : [];
    const hasNonBackgroundQuestions = questions.some((q) => (q?.section ?? "main") !== "background");

    // Question-by-question diagnostics
    const questionDiagnostics: QuestionQualityDiagnostic[] = questions.map((q, qIdx) => {
        const boundFields = resolveQuestionBoundFields(q);
        let breakoffHereCount = 0;
        let rangeBlockedCount = 0;
        let answeredCount = 0;

        for (const rec of records) {
            if (!rec || rec.disposition === "not_contacted" || rec.disposition === "refused") continue;
            if (rec.disposition === "breakoff") {
                if (rec.breakoffAtQuestion === qIdx) breakoffHereCount += 1;
                if ((rec.answeredQuestionCount ?? 0) > qIdx) answeredCount += 1;
                continue;
            }
            const blocked = boundFields.some((f) => rec.rangeBlockedFields?.includes(f));
            const skipped = boundFields.some((f) => rec.skippedFields?.includes(f));
            if (blocked) rangeBlockedCount += 1;
            else if (!skipped) answeredCount += 1;
        }

        // Also detect potential population range conflict even if sampled subset missed a rare 0
        let populationRangeConflictCount = 0;
        const invertedRange = hasInvertedRange(q);
        if (q.type === "numeric" && boundFields.length > 0 && !invertedRange) {
            const f = boundFields[0]!;
            for (const pRow of params.population) {
                const rawCell = pRow[f];
                if (isValueMissingForField(rawCell, f, missingMap)) continue;
                const v = parseNumericText(rawCell);
                if (v !== null && checkNumericQuestionRangeConflict(q, v)) populationRangeConflictCount += 1;
            }
        }

        const warnings: string[] = [];
        if (boundFields.length === 0 && q.section !== "screening") {
            warnings.push("未绑定课题变量字典，仅作问卷体验题，不产出可量化分析字段");
        }
        if (invertedRange || rangeBlockedCount > 0 || populationRangeConflictCount > 0) {
            warnings.push(`数值上下限拦截了有效真实值（本轮受阻 ${rangeBlockedCount} 份），请检查最小值/最大值边界（如是否允许 0）`);
        }
        if (breakoffHereCount >= 2) {
            warnings.push(`有 ${breakoffHereCount} 名受访者在此题处中途弃答，建议精简前置冗余题目或前移核心题`);
        }
        if (
            params.analysisTarget
            && burden.primaryTargetQuestionIndex === qIdx
            && (
                (q.section === "background" && hasNonBackgroundQuestions)
                || (questions.length >= 8 && qIdx >= Math.max(7, Math.floor(questions.length * 0.75)))
            )
        ) {
            warnings.push("核心研究指标题位置偏后或置于背景区，易受中途弃答损耗，建议前移至主体区前段");
        }

        const startedCount = completedRawCount + breakoffCount;
        return {
            questionIndex: qIdx,
            questionId: q.id,
            title: q.content,
            type: q.type,
            boundFields,
            answeredCount,
            answerRatePct: startedCount > 0 ? normalizeZero((answeredCount / startedCount) * 100) : 0,
            breakoffHereCount,
            rangeBlockedCount,
            warnings,
        };
    });

    // Sample anomaly preview list for the QC Cleaning Workbench
    const sampleAnomalies = records
        .filter((r) => r && r.disposition !== "valid_complete")
        .slice(0, 12)
        .map((r) => {
            const row = params.population[r.populationIndex] ?? {};
            const unitId = normalizedIdentifierField && row[normalizedIdentifierField] != null
                ? String(row[normalizedIdentifierField])
                : `#${r.populationIndex + 1}`;
            const reason =
                r.disposition === "careless_speeder"
                    ? `闪电敷衍卷（仅耗时 ${r.durationSec}s，远低于预计 ${burden.estimatedDurationSec}s）`
                    : r.disposition === "careless_straightliner"
                        ? `直线敷衍作答（量表连续机械同分，耗时 ${r.durationSec}s）`
                        : r.disposition === "breakoff"
                            ? `第 ${(r.breakoffAtQuestion ?? 0) + 1} 题处中途弃答`
                            : r.disposition === "refused"
                                ? "受访者拒绝访问"
                                : "渠道未触达/失联";
            return {
                populationIndex: r.populationIndex,
                unitId,
                disposition: r.disposition,
                durationSec: r.durationSec,
                reason,
            };
        });

    // Multi-layer target estimation
    let populationTruth: number | null = null;
    const estimates: EstimateComparisonItem[] = [];
    const populationSize = params.population.length;

    if (params.analysisTarget && populationSize > 0) {
        const target = params.analysisTarget;
        const z = zForConfidenceLevel(normalizeConfidenceLevel(params.confidenceLevel ?? "95"));
        const accessor: NumericAccessor = (row) => readTargetIndicatorOrNumeric(row, target, missingMap);

        const popVals: number[] = [];
        for (const pRow of params.population) {
            const v = accessor(pRow);
            if (v !== null && Number.isFinite(v)) popVals.push(v);
        }
        if (popVals.length > 0) {
            populationTruth = clampProportionIfNeeded(scaledMean(popVals), target);
        }

        const designStrataSpecs = params.method === "stratified" && normalizedStratifyBy && params.layers?.length
            ? params.layers.map((l) => ({ key: stratumKey(l.name), frameCount: l.count }))
            : null;

        const computeDesignSubsetEstimate = (
            rows: Array<Record<string, unknown>>,
            popIndices: number[],
            probs?: number[],
        ) => {
            if (designStrataSpecs && normalizedStratifyBy) {
                return computeStratifiedRespondentEstimateAndSe({
                    rows,
                    popIndices,
                    stratumField: normalizedStratifyBy,
                    strataSpecs: designStrataSpecs,
                    target,
                    missingMap,
                    populationSize,
                    z,
                });
            }
            return computeRespondentHajekEstimateAndSe({
                rows,
                popIndices,
                inclusionProbabilities: params.method === "pps" ? probs : undefined,
                requireInclusionProbabilities: params.method === "pps",
                invitedCount,
                target,
                missingMap,
                populationSize,
                z,
            });
        };

        const cleanedEst = computeDesignSubsetEstimate(
            materialized.cleanedRows,
            materialized.cleanedIndices,
            materialized.cleanedInclusionProbabilities,
        );
        estimates.push({
            key: "cleaned_design",
            label: "质检清洗后有效样本估计",
            description: "剔除选定废卷后的有效回收答卷，按当前抽样设计计算",
            sampleSize: cleanedEst.n,
            estimate: cleanedEst.estimate,
            standardError: cleanedEst.standardError,
            halfWidth: cleanedEst.halfWidth,
        });

        const uncleanedEst = computeDesignSubsetEstimate(
            materialized.uncleanedRows,
            materialized.uncleanedIndices,
            materialized.uncleanedInclusionProbabilities,
        );
        estimates.push({
            key: "uncleaned_raw",
            label: "未质检原始回收样本估计（含废卷对照）",
            description: "保留闪电卷与直线作答卷时的估计值，用于观察废卷污染",
            sampleSize: uncleanedEst.n,
            estimate: uncleanedEst.estimate,
            standardError: uncleanedEst.standardError,
            halfWidth: uncleanedEst.halfWidth,
        });

        // Post-stratified / Nonresponse-calibrated estimate using known frame stratum totals:
        // w_i^* = d_i / \hat{\phi}_{h(i)} = d_i * N_h / (\sum_{j \in R_h} d_j)
        if (chosenStratumField && strata.length >= 2 && frameCoveredCount === populationSize) {
            let baseWeightsForCalibration: number[] | undefined;
            let calibrationWeightsValid = true;

            if (params.method === "pps") {
                const probs = materialized.cleanedInclusionProbabilities;
                if (!probs || probs.length !== materialized.cleanedRows.length || probs.some((p) => !Number.isFinite(p) || p <= 0 || p > 1)) {
                    calibrationWeightsValid = false;
                } else if (probs.length > 0) {
                    const minP = probs.reduce((acc, p) => Math.min(acc, p), Infinity);
                    baseWeightsForCalibration = probs.map((p) => minP / p);
                }
            } else if (params.method === "stratified" && normalizedStratifyBy && normalizedStratifyBy !== chosenStratumField && params.layers?.length) {
                const layerMap = new Map(params.layers.map((l) => [stratumKey(l.name), l]));
                baseWeightsForCalibration = materialized.cleanedRows.map((r) => {
                    const layer = layerMap.get(stratumKey(r[normalizedStratifyBy]));
                    return layer && layer.sampleCount > 0 ? layer.count / layer.sampleCount : 1;
                });
            }

            const calSpecs = strata.map((s) => ({ key: s.stratum, frameCount: s.frameCount }));
            const calEst = calibrationWeightsValid
                ? computeStratifiedRespondentEstimateAndSe({
                    rows: materialized.cleanedRows,
                    popIndices: materialized.cleanedIndices,
                    baseWeights: baseWeightsForCalibration,
                    stratumField: chosenStratumField,
                    strataSpecs: calSpecs,
                    target,
                    missingMap,
                    populationSize,
                    z,
                })
                : { estimate: null, standardError: null, halfWidth: null, n: cleanedEst.n, hasEmptyStratum: false };

            estimates.push({
                key: "nonresponse_calibrated",
                label: `客群无回答权重校准估计（按${chosenStratumField}事后分层）`,
                description: calEst.hasEmptyStratum
                    ? "存在有效目标观测为 0 的客群空层，事后分层权重校准不可用，需在二轮对该层补量"
                    : "利用框内已知客群规模校正差异化拒访偏差（要求各层均有有效回收）",
                sampleSize: calEst.n,
                estimate: calEst.estimate,
                standardError: calEst.standardError,
                halfWidth: calEst.halfWidth,
            });
        }

        // Ideal 100% response full-invited design benchmark
        const validInvitedIndices: number[] = [];
        const fullInvitedRows: Array<Record<string, unknown>> = [];
        const fullInvitedProbs: number[] = [];
        const hasProbs = Array.isArray(params.inclusionProbabilities)
            && params.inclusionProbabilities.length === params.samplingIndices.length;

        params.samplingIndices.forEach((idx, pos) => {
            if (!Number.isSafeInteger(idx) || idx < 0 || idx >= populationSize) return;
            const row = params.population[idx];
            if (!row) return;
            validInvitedIndices.push(idx);
            fullInvitedRows.push(row);
            if (hasProbs) fullInvitedProbs.push(params.inclusionProbabilities![pos]!);
        });

        let fullEstimate: number | null = null;
        let fullSe: number | null = null;
        let fullHalfWidth: number | null = null;
        let fullN = 0;

        const uniqueFullCount = new Set(validInvitedIndices).size;
        const isUniqueValidSample = validInvitedIndices.length > 0 && uniqueFullCount === validInvitedIndices.length;
        const popComplete = popVals.length === populationSize;

        if (popComplete && isUniqueValidSample) {
            const popSd = sampleStandardDeviation(popVals);
            const popVar = popSd * popSd;
            fullN = fullInvitedRows.length;

            if (params.method === "simple") {
                const estVals = fullInvitedRows.map(accessor).filter((v): v is number => v !== null);
                fullEstimate = clampProportionIfNeeded(scaledMean(estVals), target);
                fullSe = computeSimpleRandomValueSe(popVar, populationSize, fullN, popSd);
            } else if (params.method === "systematic") {
                const estVals = fullInvitedRows.map(accessor).filter((v): v is number => v !== null);
                fullEstimate = clampProportionIfNeeded(scaledMean(estVals), target);
                fullSe = computeSystematicExactValueSe(params.population, accessor, {
                    completed: true,
                    interval: populationSize / fullN,
                    sampleCount: fullN,
                });
            } else if (params.method === "stratified" && normalizedStratifyBy && params.layers?.length) {
                fullEstimate = clampProportionIfNeeded(
                    computeStratifiedValueEstimate(fullInvitedRows, normalizedStratifyBy, params.layers, populationSize, accessor),
                    target,
                );
                fullSe = computeStratifiedValueSe(params.population, normalizedStratifyBy, params.layers, populationSize, accessor);
            } else if (params.method === "pps" && hasProbs) {
                fullEstimate = clampProportionIfNeeded(
                    estimateWeightedValue(fullInvitedRows, accessor, fullInvitedProbs),
                    target,
                );
                if (normalizedSizeField) {
                    const ctx = buildPpsStandardErrorContext(
                        params.population,
                        normalizedSizeField,
                        fullN,
                        [{ key: "__target__", accessor }],
                        0,
                    );
                    fullSe = ctx?.standardErrors.__target__ ?? null;
                }
            }
        }

        if (fullEstimate === null || fullSe === null || !Number.isFinite(fullSe)) {
            const fallbackFull = computeDesignSubsetEstimate(
                fullInvitedRows,
                validInvitedIndices,
                hasProbs ? fullInvitedProbs : undefined,
            );
            fullN = fallbackFull.n;
            if (fullEstimate === null) fullEstimate = fallbackFull.estimate;
            if (fullSe === null || !Number.isFinite(fullSe)) fullSe = fallbackFull.standardError;
        }

        if (fullSe !== null && Number.isFinite(fullSe) && fullSe >= 0) {
            fullSe = normalizeZero(fullSe);
            const hw = normalizeZero(z * fullSe);
            fullHalfWidth = Number.isFinite(hw) ? hw : null;
        } else {
            fullSe = null;
        }

        estimates.push({
            key: "full_invited_benchmark",
            label: "理想 100% 应答完整入样基准（教学对照）",
            description: "假设零拒访、零废卷时的纯抽样误差理论基准",
            sampleSize: fullN,
            estimate: fullEstimate,
            standardError: fullSe,
            halfWidth: fullHalfWidth,
        });
    }

    return {
        method: params.method,
        invitedCount,
        contactedCount,
        notContactedCount,
        refusedCount,
        breakoffCount,
        completedRawCount,
        speederCount,
        straightlinerCount,
        cleanedValidCount,
        effectiveRatePct,
        empiricalNonResponseRatePct,
        empiricalTargetVariance,
        empiricalTargetStdDev,
        totalEstimatedCost,
        unitEffectiveCost,
        stratumField: chosenStratumField,
        strata,
        maxStratumBiasPp,
        questionDiagnostics,
        burden,
        populationTruth,
        estimates,
        sampleAnomalies,
    };
}
