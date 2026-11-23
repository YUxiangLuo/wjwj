import { parseNumericText } from "../../lib/numeric-text";
import type { AnalysisTarget } from "../../lib/analysis-target";
import type { QuestionnaireData } from "../../lib/questionnaire-types";
import type { SamplingMethod } from "../../lib/sampling-policy";
import { normalizeConfidenceLevel, zForConfidenceLevel } from "../statistics/confidence-level";
import { stratumKey } from "../statistics/sampling";
import { estimateSimpleMean, extractFiniteValues, sampleStandardDeviation } from "../statistics/values";
import type { VariableDictionary } from "../variables/types";
import {
    checkNumericQuestionRangeConflict,
    evaluateQuestionnaireBurden,
    resolveQuestionBoundFields,
    type QuestionnaireBurdenProfile,
} from "./questionnaire-burden";
import { materializeFieldworkSample } from "./simulate-dispatch";
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

function readTargetIndicatorOrNumeric(
    row: Record<string, unknown>,
    target: AnalysisTarget,
): number | null {
    if (target.kind === "mean") {
        return parseNumericText(row[target.field]);
    }
    const raw = row[target.field];
    if (raw === null || raw === undefined || String(raw).trim() === "") return null;
    if (raw === "__NON_TARGET__") return 0;
    return String(raw).trim().normalize("NFKC") === target.value.trim().normalize("NFKC") ? 1 : 0;
}

function computeWeightedEstimateAndSe(params: {
    rows: Array<Record<string, unknown>>;
    weights?: number[];
    target: AnalysisTarget;
    populationSize: number;
    z: number;
}): { estimate: number | null; standardError: number | null; halfWidth: number | null; n: number } {
    const values: number[] = [];
    const activeWeights: number[] = [];

    params.rows.forEach((row, idx) => {
        const val = readTargetIndicatorOrNumeric(row, params.target);
        if (val === null || !Number.isFinite(val)) return;
        values.push(val);
        activeWeights.push(params.weights?.[idx] ?? 1);
    });

    const n = values.length;
    if (n === 0) return { estimate: null, standardError: null, halfWidth: null, n: 0 };

    const weightSum = activeWeights.reduce((acc, w) => acc + w, 0);
    if (!(weightSum > 0)) return { estimate: null, standardError: null, halfWidth: null, n };

    const estimate = values.reduce((acc, v, i) => acc + v * activeWeights[i]!, 0) / weightSum;
    if (n <= 1) {
        return { estimate, standardError: n === params.populationSize ? 0 : null, halfWidth: n === params.populationSize ? 0 : null, n };
    }

    const fpc = Math.max(0, 1 - n / Math.max(1, params.populationSize));
    // Taylor linearization / Kish effective sample variance approximation for respondent subset
    const residualsSq = values.reduce((acc, v, i) => {
        const wNorm = activeWeights[i]! / weightSum;
        return acc + (wNorm * (v - estimate)) ** 2;
    }, 0);
    const variance = (n / Math.max(1, n - 1)) * fpc * residualsSq;
    const standardError = Math.sqrt(Math.max(0, variance));
    const halfWidth = params.z * standardError;

    return { estimate, standardError, halfWidth, n };
}

export function buildMethodFieldworkDiagnostics(params: {
    method: SamplingMethod;
    population: Array<Record<string, unknown>>;
    samplingIndices: number[];
    inclusionProbabilities?: number[];
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
    const records = params.fieldworkResult.records;

    let notContactedCount = 0;
    let refusedCount = 0;
    let breakoffCount = 0;
    let speederCount = 0;
    let straightlinerCount = 0;
    let validCompleteRaw = 0;

    for (const r of records) {
        if (r.disposition === "not_contacted") notContactedCount += 1;
        else if (r.disposition === "refused") refusedCount += 1;
        else if (r.disposition === "breakoff") breakoffCount += 1;
        else if (r.disposition === "careless_speeder") speederCount += 1;
        else if (r.disposition === "careless_straightliner") straightlinerCount += 1;
        else if (r.disposition === "valid_complete") validCompleteRaw += 1;
    }

    const invitedCount = records.length;
    const contactedCount = invitedCount - notContactedCount;
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
    const effectiveRatePct = invitedCount > 0 ? (cleanedValidCount / invitedCount) * 100 : 0;
    const empiricalNonResponseRatePct = invitedCount > 0
        ? Math.min(50, Math.max(0, Math.round((1 - cleanedValidCount / invitedCount) * 100)))
        : 20;

    const totalEstimatedCost =
        invitedCount * config.contactCostPerUnit
        + completedRawCount * config.incentiveCostPerComplete;
    const unitEffectiveCost = cleanedValidCount > 0 ? totalEstimatedCost / cleanedValidCount : null;

    // Empirical sample variance on cleaned respondent set
    let empiricalTargetVariance: number | null = null;
    let empiricalTargetStdDev: number | null = null;
    if (params.analysisTarget?.kind === "mean") {
        const vals = extractFiniteValues(materialized.cleanedRows, params.analysisTarget.field);
        if (vals.length >= 2) {
            const sd = sampleStandardDeviation(vals);
            if (Number.isFinite(sd) && sd > 0) {
                empiricalTargetStdDev = sd;
                empiricalTargetVariance = sd * sd;
            }
        }
    }

    // Subgroup / Stratum response diagnostics
    const chosenStratumField =
        params.stratifyBy
        ?? config.stratumField
        ?? params.frameFields.find((f) => f !== params.identifierField)
        ?? null;
    const strata: StratumDiagnosticRow[] = [];
    let maxStratumBiasPp: number | null = null;

    if (chosenStratumField && params.population.length > 0) {
        const frameMap = new Map<string, number>();
        for (const row of params.population) {
            const key = stratumKey(row[chosenStratumField]);
            if (!key) continue;
            frameMap.set(key, (frameMap.get(key) ?? 0) + 1);
        }
        const invitedMap = new Map<string, number>();
        for (const idx of params.samplingIndices) {
            const key = stratumKey(params.population[idx]?.[chosenStratumField]);
            if (key) invitedMap.set(key, (invitedMap.get(key) ?? 0) + 1);
        }
        const validMap = new Map<string, number>();
        for (const row of materialized.cleanedRows) {
            const key = stratumKey(row[chosenStratumField]);
            if (key) validMap.set(key, (validMap.get(key) ?? 0) + 1);
        }

        if (frameMap.size >= 2 && frameMap.size <= 25) {
            maxStratumBiasPp = 0;
            for (const [sName, fCount] of frameMap.entries()) {
                const inv = invitedMap.get(sName) ?? 0;
                const val = validMap.get(sName) ?? 0;
                const frameSharePct = (fCount / params.population.length) * 100;
                const validSharePct = cleanedValidCount > 0 ? (val / cleanedValidCount) * 100 : 0;
                const responseRatePct = inv > 0 ? (val / inv) * 100 : 0;
                maxStratumBiasPp = Math.max(maxStratumBiasPp, Math.abs(validSharePct - frameSharePct));
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
        }
    }

    // Question-by-question diagnostics
    const questionDiagnostics: QuestionQualityDiagnostic[] = params.questionnaire.questions.map((q, qIdx) => {
        const boundFields = resolveQuestionBoundFields(q);
        let breakoffHereCount = 0;
        let rangeBlockedCount = 0;
        let answeredCount = 0;

        for (const rec of records) {
            if (rec.disposition === "not_contacted" || rec.disposition === "refused") continue;
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
        if (q.type === "numeric" && boundFields.length > 0) {
            const f = boundFields[0]!;
            for (const pRow of params.population) {
                const v = parseNumericText(pRow[f]);
                if (v !== null && checkNumericQuestionRangeConflict(q, v)) populationRangeConflictCount += 1;
            }
        }

        const warnings: string[] = [];
        if (boundFields.length === 0 && q.section !== "screening") {
            warnings.push("未绑定课题变量字典，仅作问卷体验题，不产出可量化分析字段");
        }
        if (rangeBlockedCount > 0 || populationRangeConflictCount > 0) {
            warnings.push(`数值上下限拦截了有效真实值（本轮受阻 ${rangeBlockedCount} 份），请检查最小值/最大值边界（如是否允许 0）`);
        }
        if (breakoffHereCount >= 2) {
            warnings.push(`有 ${breakoffHereCount} 名受访者在此题处中途弃答，建议精简前置冗余题目或前移核心题`);
        }

        const startedCount = Math.max(1, completedRawCount + breakoffCount);
        return {
            questionIndex: qIdx,
            questionId: q.id,
            title: q.content,
            type: q.type,
            boundFields,
            answeredCount,
            answerRatePct: completedRawCount + breakoffCount > 0 ? (answeredCount / startedCount) * 100 : 0,
            breakoffHereCount,
            rangeBlockedCount,
            warnings,
        };
    });

    // Sample anomaly preview list for the QC Cleaning Workbench
    const sampleAnomalies = records
        .filter((r) => r.disposition !== "valid_complete")
        .slice(0, 12)
        .map((r) => {
            const row = params.population[r.populationIndex] ?? {};
            const unitId = params.identifierField && row[params.identifierField] != null
                ? String(row[params.identifierField])
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
    if (params.analysisTarget && params.population.length > 0) {
        const target = params.analysisTarget;
        const z = zForConfidenceLevel(normalizeConfidenceLevel(params.confidenceLevel ?? "95"));
        if (target.kind === "mean") {
            populationTruth = estimateSimpleMean(params.population, target.field);
        } else {
            const hits = params.population.filter(
                (r) => String(r[target.field] ?? "").trim().normalize("NFKC") === target.value.trim().normalize("NFKC"),
            ).length;
            populationTruth = hits / params.population.length;
        }

        const buildDesignWeightsForRows = (rows: Array<Record<string, unknown>>, probs?: number[]) => {
            if (params.method === "pps" && probs && probs.length === rows.length) {
                return probs.map((p) => (p > 0 ? 1 / p : 1));
            }
            if (params.method === "stratified" && params.stratifyBy && params.layers?.length) {
                const layerPopMap = new Map(params.layers.map((l) => [stratumKey(l.name), l.count]));
                const respCountMap = new Map<string, number>();
                for (const r of rows) {
                    const k = stratumKey(r[params.stratifyBy]);
                    respCountMap.set(k, (respCountMap.get(k) ?? 0) + 1);
                }
                return rows.map((r) => {
                    const k = stratumKey(r[params.stratifyBy!]);
                    const nh = respCountMap.get(k) ?? 1;
                    const Nh = layerPopMap.get(k) ?? nh;
                    return Nh / Math.max(1, nh);
                });
            }
            return undefined;
        };

        const cleanedWeights = buildDesignWeightsForRows(materialized.cleanedRows, materialized.cleanedInclusionProbabilities);
        const cleanedEst = computeWeightedEstimateAndSe({
            rows: materialized.cleanedRows,
            weights: cleanedWeights,
            target,
            populationSize: params.population.length,
            z,
        });
        estimates.push({
            key: "cleaned_design",
            label: "质检清洗后有效样本估计",
            description: "剔除选定废卷后的有效回收答卷，按当前抽样设计计算",
            sampleSize: cleanedEst.n,
            estimate: cleanedEst.estimate,
            standardError: cleanedEst.standardError,
            halfWidth: cleanedEst.halfWidth,
        });

        const uncleanedWeights = buildDesignWeightsForRows(materialized.uncleanedRows, materialized.uncleanedInclusionProbabilities);
        const uncleanedEst = computeWeightedEstimateAndSe({
            rows: materialized.uncleanedRows,
            weights: uncleanedWeights,
            target,
            populationSize: params.population.length,
            z,
        });
        estimates.push({
            key: "uncleaned_raw",
            label: "未质检原始回收样本估计（含废卷对照）",
            description: "保留闪电卷与直线作答卷时的估计值，用于观察废卷污染",
            sampleSize: uncleanedEst.n,
            estimate: uncleanedEst.estimate,
            standardError: uncleanedEst.standardError,
            halfWidth: uncleanedEst.halfWidth,
        });

        // Post-stratified / Nonresponse-calibrated estimate using known frame stratum totals
        if (chosenStratumField && strata.length >= 2 && strata.every((s) => s.validCount > 0)) {
            const postWeightsMap = new Map(strata.map((s) => [s.stratum, s.frameCount / s.validCount]));
            const postWeights = materialized.cleanedRows.map((r) => postWeightsMap.get(stratumKey(r[chosenStratumField])) ?? 1);
            const calEst = computeWeightedEstimateAndSe({
                rows: materialized.cleanedRows,
                weights: postWeights,
                target,
                populationSize: params.population.length,
                z,
            });
            estimates.push({
                key: "nonresponse_calibrated",
                label: `客群无回答权重校准估计（按${chosenStratumField}事后分层）`,
                description: "利用框内已知客群规模校正差异化拒访偏差（要求各层均有有效回收）",
                sampleSize: calEst.n,
                estimate: calEst.estimate,
                standardError: calEst.standardError,
                halfWidth: calEst.halfWidth,
            });
        }

        const fullInvitedRows = params.samplingIndices.map((idx) => params.population[idx]!).filter(Boolean);
        const fullWeights = buildDesignWeightsForRows(fullInvitedRows, params.inclusionProbabilities);
        const fullEst = computeWeightedEstimateAndSe({
            rows: fullInvitedRows,
            weights: fullWeights,
            target,
            populationSize: params.population.length,
            z,
        });
        estimates.push({
            key: "full_invited_benchmark",
            label: "理想 100% 应答完整入样基准（教学对照）",
            description: "假设零拒访、零废卷时的纯抽样误差理论基准",
            sampleSize: fullEst.n,
            estimate: fullEst.estimate,
            standardError: fullEst.standardError,
            halfWidth: fullEst.halfWidth,
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
