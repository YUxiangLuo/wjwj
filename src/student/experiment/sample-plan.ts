import type { SurveyVariableSpec } from "../../domain/experiment/planning-types";
export type { SurveyVariableSpec } from "../../domain/experiment/planning-types";
import { zForConfidenceLevel, isConfidenceLevel, Z_VALUES } from "@/domain/statistics/confidence-level";
import { getSurveyVariableParameterError } from "./survey-variable-validation";

/**
 * 将百分比或小数形式的误差限统一为小数比例。
 * 约定：值 >= 1 视为百分比（如 5 → 0.05），< 1 视为已是比例（如 0.05 不变）。
 * 注意：此约定无法区分 < 1 的百分比值（如 0.5% 需传入 0.005 而非 0.5）。
 */
function normalizeMarginOfError(value: number): number {
    return value >= 1 ? value / 100 : value;
}

export interface SampleSizeMetrics {
    n0: number;              // 初始样本量（无限总体）
    nDeff: number;           // n₀ × deff
    nFpc: number;            // 对 deff 调整后的样本量做有限总体校正
    n1: number;              // 预期完成样本量（与 expectedCompleted 相同，供旧 UI 读取）
    n: number;              // 计划邀请数（不超过 N）
    expectedCompleted: number;
    cappedAtPopulation: boolean;
    precisionUnreachable: boolean;
    targetMarginOfError: number;
    standardError: number;   // 按预期完成量与 deff 计算的 SE
    relativeStandardError: number;
    marginOfError: number;   // 预期误差限（绝对值）
    /** 规划假设下的预期区间，不是观测后的置信区间。 */
    confidenceInterval: {
        lower: number;
        upper: number;
    };
}

export interface DesignAdjustedSampleSize {
    n0Raw: number;
    nDeffRaw: number;
    nFpcRaw: number;
    nInviteRaw: number;
    n0: number;
    nDeff: number;
    nFpc: number;
    nInvite: number;
    expectedCompleted: number;
    cappedAtPopulation: boolean;
}

function emptyDesignAdjustedSampleSize(): DesignAdjustedSampleSize {
    return {
        n0Raw: 0,
        nDeffRaw: 0,
        nFpcRaw: 0,
        nInviteRaw: 0,
        n0: 0,
        nDeff: 0,
        nFpc: 0,
        nInvite: 0,
        expectedCompleted: 0,
        cappedAtPopulation: false,
    };
}

function normalizeDeff(deff: unknown): number {
    const value = Number(deff);
    return Number.isFinite(value) && value > 0 ? value : 1;
}

function normalizeNrr(nrr: unknown): number {
    const value = Number(nrr);
    return Number.isFinite(value) && value > 0 && value < 1 ? value : 0;
}

/**
 * 先按设计效应膨胀，再对膨胀后的目标完成量做有限总体校正，最后按无回答率换算邀请数。
 * n_fpc = n_deff × N / (N − 1 + n_deff)，与 ME² = Z² deff v / n × (N−n)/(N−1) 联立结果一致。
 */
export function applyDesignAdjustments(
    n0Raw: number,
    populationSize: number,
    deff: unknown,
    nrr: unknown,
): DesignAdjustedSampleSize {
    const N = Math.floor(populationSize);
    if (!(n0Raw > 0) || !(N > 0)) return emptyDesignAdjustedSampleSize();

    const deffValue = normalizeDeff(deff);
    const nrrValue = normalizeNrr(nrr);
    // Raw targets can exceed Number.MAX_VALUE before the finite-population
    // correction. Saturate only those display values; for any finite N the
    // corrected target is indistinguishable from N at that magnitude.
    const finiteN0Raw = Math.min(n0Raw, Number.MAX_VALUE);
    const nDeffProduct = n0Raw * deffValue;
    const nDeffRaw = nDeffProduct === 0
        ? Number.MIN_VALUE
        : Math.min(nDeffProduct, Number.MAX_VALUE);
    // For n_deff > N, divide first: n_deff*N can overflow even though
    // the finite-population result is at most N. Keep the direct form for
    // small n_deff so (N-1)/n_deff cannot overflow instead.
    const nFpcRaw = nDeffRaw <= N
        ? nDeffRaw * N / (N - 1 + nDeffRaw)
        : N / (1 + (N - 1) / nDeffRaw);
    const nInviteRaw = nrrValue > 0 ? nFpcRaw / (1 - nrrValue) : nFpcRaw;
    const nInvite = capSampleSizeAtPopulation(nInviteRaw, N);

    return {
        n0Raw: finiteN0Raw,
        nDeffRaw,
        nFpcRaw,
        nInviteRaw,
        n0: Math.ceil(finiteN0Raw),
        nDeff: Math.ceil(nDeffRaw),
        nFpc: Math.ceil(nFpcRaw),
        nInvite,
        expectedCompleted: nInvite * (1 - nrrValue),
        cappedAtPopulation: nInviteRaw > N,
    };
}

/** 计划发放量不能超过总体；存在无回答时，向全体发放仍不等于完整普查。 */
export function capSampleSizeAtPopulation(n: number, populationSize: number): number {
    const N = Math.floor(populationSize);
    if (!Number.isFinite(n) || n <= 0) return 0;
    if (!(N > 0)) return Math.ceil(n);
    return Math.min(Math.ceil(n), N);
}

/**
 * 有限总体方差因子。这里把 p(1-p) 或 σ² 定义为分母为 N 的有限总体方差，
 * 因此精确因子为 (N-n)/(N-1)，并与 n₁=n₀/(1+(n₀-1)/N) 保持同一口径。
 */
export function finitePopulationVarianceFactor(populationSize: number, sampleSize: number): number {
    const N = Math.floor(populationSize);
    if (!(N > 0) || !(sampleSize > 0)) return 0;
    if (sampleSize >= N) return 0;
    if (N === 1) return 0;
    return Math.max(0, (N - sampleSize) / (N - 1));
}

/**
 * 把分母 N−1 的有限总体方差 S² 换成分母 N 的 σ²。
 * 项目的均值规划公式使用 σ² 与 (N−n)/(N−1) 这一组一致口径。
 */
export function finitePopulationS2ToSigma2(s2: number, populationCount: number): number | null {
    if (!Number.isFinite(s2) || s2 < 0 || !Number.isInteger(populationCount) || populationCount < 1) {
        return null;
    }
    if (populationCount === 1) return 0;
    const scaled = s2 * (populationCount - 1);
    return Number.isFinite(scaled) ? scaled / populationCount : s2 * ((populationCount - 1) / populationCount);
}

function parseProportionEstimationParams(params: {
    confidenceLevel: unknown;
    marginOfError: unknown;
    populationSize: number | null | undefined;
    designEffect?: unknown;
    nonResponseRate?: unknown;
    p?: number;
}) {
    const populationSize = params.populationSize;
    if (typeof populationSize !== "number" || !Number.isSafeInteger(populationSize) || populationSize < 1) return null;
    const clStr = String(params.confidenceLevel);
    if (!isConfidenceLevel(clStr)) return null;
    const rawError = Number(params.marginOfError);
    if (!Number.isFinite(rawError)) return null;
    const e = normalizeMarginOfError(rawError);
    if (!(e > 0 && e < 1)) return null;
    const p = params.p ?? 0.5;
    const rawDeff = params.designEffect ?? 1;
    const rawNrr = params.nonResponseRate ?? 0;
    if (!Number.isFinite(p) || p <= 0 || p >= 1
        || typeof rawDeff !== "number" || !Number.isFinite(rawDeff) || !(rawDeff > 0)
        || typeof rawNrr !== "number" || !Number.isFinite(rawNrr) || rawNrr < 0 || rawNrr >= 1) return null;
    return { z: Z_VALUES[clStr], e, N: populationSize, p, deff: rawDeff, nrr: rawNrr };
}

export function calculateFinitePopulationSampleSize(params: {
    confidenceLevel: unknown;
    marginOfError: unknown;
    populationSize: number | null | undefined;
    designEffect?: unknown;
    nonResponseRate?: unknown;
    p?: number;  // 估计比例，默认为0.5（最保守估计）
}) {
    const parsed = parseProportionEstimationParams(params);
    if (!parsed) return null;
    const n0 = (Math.pow(parsed.z, 2) * parsed.p * (1 - parsed.p)) / Math.pow(parsed.e, 2);
    return applyDesignAdjustments(n0, parsed.N, parsed.deff, parsed.nrr).nInvite;
}

export function calculateSampleSizeMetrics(params: {
    confidenceLevel: unknown;
    marginOfError: unknown;
    populationSize: number | null | undefined;
    designEffect?: unknown;
    nonResponseRate?: unknown;
    p?: number;
}): SampleSizeMetrics | null {
    const parsed = parseProportionEstimationParams(params);
    if (!parsed) return null;
    const { z, e, N, p, deff, nrr } = parsed;
    const n0 = (Math.pow(z, 2) * p * (1 - p)) / Math.pow(e, 2);
    const adjusted = applyDesignAdjustments(n0, N, deff, nrr);
    const expectedCompleted = adjusted.expectedCompleted;
    // A fractional expected response count is not a singleton census. The
    // planning FPC (N-m)/(N-1) is undefined here, not a zero-error estimate.
    if (N === 1 && expectedCompleted < 1) return null;
    const fpc = finitePopulationVarianceFactor(N, expectedCompleted);
    const standardError = expectedCompleted > 0
        ? Math.sqrt(deff * p * (1 - p) / expectedCompleted * fpc)
        : 0;
    const relativeStandardError = p > 0 ? standardError / p : 0;
    const marginOfErrorAbs = z * standardError;

    return {
        n0: adjusted.n0Raw,
        nDeff: adjusted.nDeff,
        nFpc: adjusted.nFpc,
        n1: expectedCompleted,
        n: adjusted.nInvite,
        expectedCompleted,
        cappedAtPopulation: adjusted.cappedAtPopulation,
        precisionUnreachable: adjusted.cappedAtPopulation && marginOfErrorAbs > e + 1e-12,
        targetMarginOfError: e,
        standardError,
        relativeStandardError,
        marginOfError: marginOfErrorAbs,
        confidenceInterval: {
            lower: Math.max(0, p - marginOfErrorAbs),
            upper: Math.min(1, p + marginOfErrorAbs),
        },
    };
}

// 计算不同p值下的样本量对比
export function calculateSampleSizeForDifferentP(params: {
    confidenceLevel: unknown;
    marginOfError: unknown;
    populationSize: number | null | undefined;
    designEffect?: unknown;
    nonResponseRate?: unknown;
}): Array<{ p: number; pLabel: string; sampleSize: number; description: string }> {
    const pValues = [
        { p: 0.5, label: "0.5", description: "最保守估计（最大方差）" },
        { p: 0.3, label: "0.3", description: "中等变异" },
        { p: 0.1, label: "0.1", description: "低比例估计" },
        { p: 0.05, label: "0.05", description: "稀有事件" },
    ];

    return pValues.map(({ p, label, description }) => ({
        p,
        pLabel: label,
        sampleSize: calculateFinitePopulationSampleSize({ ...params, p }) ?? 0,
        description,
    }));
}

// 敏感性分析：样本量随置信水平、误差限变化
export function calculateSampleSizeSensitivity(params: {
    populationSize: number | null | undefined;
    designEffect?: unknown;
    nonResponseRate?: unknown;
    p?: number;
}) {
    if (params.populationSize == null || !(params.populationSize > 0)) {
        return null;
    }

    const confidenceLevels = [
        { level: "90", label: "90%", z: 1.645 },
        { level: "95", label: "95%", z: 1.96 },
        { level: "99", label: "99%", z: 2.576 },
    ];

    const marginsOfError = [1, 2, 3, 5, 7, 10]; // 百分比

    const matrix: Array<{
        confidenceLabel: string;
        confidenceLevel: string;
        marginOfError: number;
        sampleSize: number;
    }> = [];

    for (const cl of confidenceLevels) {
        for (const me of marginsOfError) {
            const n = calculateFinitePopulationSampleSize({
                confidenceLevel: cl.level,
                marginOfError: me,
                populationSize: params.populationSize,
                designEffect: params.designEffect,
                nonResponseRate: params.nonResponseRate,
                p: params.p ?? 0.5,
            }) ?? 0;

            matrix.push({
                confidenceLabel: cl.label,
                confidenceLevel: cl.level,
                marginOfError: me,
                sampleSize: n,
            });
        }
    }

    return matrix;
}

export function attachCalculatedSampleSize(samplePlan: Record<string, any>, populationSize: number | null | undefined) {
    if (!samplePlan?.confidenceLevel || !samplePlan?.marginOfError) {
        return samplePlan;
    }

    const estimationType = samplePlan.estimationType === "mean" ? "mean" : "proportion";
    const calculatedSampleSize = estimationType === "mean"
        ? calculateMeanEstimationSampleSize({
            confidenceLevel: samplePlan.confidenceLevel,
            marginOfError: samplePlan.marginOfError,
            populationSize,
            populationVariance: Number(samplePlan.populationVariance),
            designEffect: samplePlan.designEffect,
            nonResponseRate: samplePlan.nonResponseRate,
        })
        : calculateFinitePopulationSampleSize({
            confidenceLevel: samplePlan.confidenceLevel,
            marginOfError: samplePlan.marginOfError,
            populationSize,
            designEffect: samplePlan.designEffect,
            nonResponseRate: samplePlan.nonResponseRate,
        });

    if (calculatedSampleSize) {
        return { ...samplePlan, calculatedSampleSize };
    }

    return samplePlan;
}

// ========== 均值估计样本量计算（课件第16页） ==========

/** 均值估计 n₀ 及 deff → FPC → 邀请数（无副作用，无参数校验）。 */
function meanEstimationCore(z: number, sigma2: number, e: number, N: number, deff: number, nrr: number) {
    const n0 = (z * z * sigma2) / (e * e);
    const adjusted = applyDesignAdjustments(n0, N, deff, nrr);
    return {
        ...adjusted,
        n0: adjusted.n0Raw,
        n: adjusted.nInvite,
    };
}

function parseMeanEstimationParams(params: {
    confidenceLevel: unknown;
    marginOfError: unknown;
    populationSize: number | null | undefined;
    populationVariance: number;
    designEffect?: unknown;
    nonResponseRate?: unknown;
}) {
    if (params.populationSize == null || !(params.populationSize > 0)) return null;
    if (!(params.populationVariance > 0)) return null;
    const clStr = String(params.confidenceLevel);
    if (!isConfidenceLevel(clStr)) return null;
    const z = Z_VALUES[clStr];
    const e = Number(params.marginOfError);
    if (!Number.isFinite(e) || e <= 0) return null;
    return {
        z, e,
        N: params.populationSize,
        sigma2: params.populationVariance,
        deff: Number(params.designEffect),
        nrr: Number(params.nonResponseRate),
    };
}

/**
 * 均值估计下的样本量计算（简单随机抽样）
 *
 * 无限总体: n₀ = Z² × σ² / e²
 * 随后先乘 deff，再做有限总体校正，最后按无回答率换算邀请数。
 *
 * 其中 σ² 为按分母 N 定义的有限总体方差估计值，e 为绝对误差限（与均值同单位）。
 */
export function calculateMeanEstimationSampleSize(params: {
    confidenceLevel: unknown;
    marginOfError: unknown;
    populationSize: number | null | undefined;
    populationVariance: number;
    designEffect?: unknown;
    nonResponseRate?: unknown;
}): number | null {
    const parsed = parseMeanEstimationParams(params);
    if (!parsed) return null;
    return meanEstimationCore(parsed.z, parsed.sigma2, parsed.e, parsed.N, parsed.deff, parsed.nrr).n;
}

export interface MeanSampleSizeMetrics {
    n0: number;
    nDeff: number;
    nFpc: number;
    n1: number;
    n: number;
    expectedCompleted: number;
    cappedAtPopulation: boolean;
    precisionUnreachable: boolean;
    targetMarginOfError: number;
    standardError: number;
    relativeStandardError: number | null;
    marginOfError: number;
    confidenceInterval: { lower: number; upper: number } | null;
}

/**
 * 均值估计的精度指标计算。
 * estimatedMean 用于计算相对标准误差和置信区间。
 */
export function calculateMeanSampleSizeMetrics(params: {
    confidenceLevel: unknown;
    marginOfError: unknown;
    populationSize: number | null | undefined;
    populationVariance: number;
    designEffect?: unknown;
    nonResponseRate?: unknown;
    estimatedMean?: number;
}): MeanSampleSizeMetrics | null {
    const parsed = parseMeanEstimationParams(params);
    if (!parsed) return null;
    const { z, sigma2, N, deff, nrr } = parsed;

    const adjusted = meanEstimationCore(z, sigma2, parsed.e, N, deff, nrr);
    const deffValue = normalizeDeff(deff);
    const expectedCompleted = adjusted.expectedCompleted;
    const fpc = finitePopulationVarianceFactor(N, expectedCompleted);
    const standardError = expectedCompleted > 0
        ? Math.sqrt(deffValue * sigma2 / expectedCompleted * fpc)
        : 0;

    const mean = params.estimatedMean;
    const hasMean = typeof mean === "number" && Number.isFinite(mean);
    const relativeStandardError = hasMean && mean !== 0 ? standardError / Math.abs(mean) : null;
    const marginOfErrorAbs = z * standardError;

    return {
        n0: adjusted.n0,
        nDeff: adjusted.nDeff,
        nFpc: adjusted.nFpc,
        n1: expectedCompleted,
        n: adjusted.nInvite,
        expectedCompleted,
        cappedAtPopulation: adjusted.cappedAtPopulation,
        precisionUnreachable: adjusted.cappedAtPopulation && marginOfErrorAbs > parsed.e + 1e-12,
        targetMarginOfError: parsed.e,
        standardError,
        relativeStandardError,
        marginOfError: marginOfErrorAbs,
        confidenceInterval: hasMean ? {
            lower: mean - marginOfErrorAbs,
            upper: mean + marginOfErrorAbs,
        } : null,
    };
}

// ========== 四步法中间步骤（课件第18页，供 UI 展示用） ==========

export interface SampleSizeSteps {
    n0: number; // Step 1: 初始样本量
    n1: number; // Step 2: 设计效应调整后
    n2: number; // Step 3: 有限总体校正后
    n3: number; // Step 4: 邀请数（封顶后）
    formulaLabel: string;
}

export interface SampleSizeStepDetails extends SampleSizeSteps {
    n0Raw: number;
    n1Raw: number;
    n2Raw: number;
    n3Raw: number;
}

/**
 * 返回四步法（n₀ → deff → FPC → 邀请数）各阶段的整数样本量。
 * 供 FourStepPhase 展示使用，避免 UI 层重复实现公式。
 *
 * 中间步用各自 raw 值的 ceil 仅供展示；下一步仍用 raw 往下传。
 * 最终 n3 与 calculateFinitePopulationSampleSize /
 * calculateMeanEstimationSampleSize 使用同一套「最后一次 ceil，再封顶为 N」。
 */
export function calculateSampleSizeSteps(params: {
    estimationType: "proportion" | "mean";
    confidenceLevel: unknown;
    marginOfError: number;
    populationSize: number;
    populationVariance?: number;
    designEffect: number;
    nonResponseRate: number;
}): SampleSizeSteps {
    const details = calculateSampleSizeStepDetails(params);
    return {
        n0: details.n0,
        n1: details.n1,
        n2: details.n2,
        n3: details.n3,
        formulaLabel: details.formulaLabel,
    };
}

export function calculateSampleSizeStepDetails(params: {
    estimationType: "proportion" | "mean";
    confidenceLevel: unknown;
    marginOfError: number;
    populationSize: number;
    populationVariance?: number;
    designEffect: number;
    nonResponseRate: number;
}): SampleSizeStepDetails {
    const clStr = String(params.confidenceLevel);
    const z = isConfidenceLevel(clStr) ? Z_VALUES[clStr] : 1.96;
    const N = params.populationSize;
    const deff = params.designEffect;
    const nrr = params.nonResponseRate;

    let n0Raw: number;
    let formulaLabel: string;

    if (params.estimationType === "mean") {
        const sigma2 = params.populationVariance ?? 0;
        const e = params.marginOfError;
        if (e <= 0 || sigma2 <= 0) {
            return { n0Raw: 0, n1Raw: 0, n2Raw: 0, n3Raw: 0, n0: 0, n1: 0, n2: 0, n3: 0, formulaLabel: "Z²σ²/e²" };
        }
        n0Raw = (z * z * sigma2) / (e * e);
        formulaLabel = "Z²σ²/e²";
    } else {
        const E = normalizeMarginOfError(params.marginOfError);
        if (E <= 0) {
            return { n0Raw: 0, n1Raw: 0, n2Raw: 0, n3Raw: 0, n0: 0, n1: 0, n2: 0, n3: 0, formulaLabel: "Z²p(1-p)/E²" };
        }
        n0Raw = (z * z * 0.25) / (E * E);
        formulaLabel = "Z²p(1-p)/E²";
    }

    const adjusted = applyDesignAdjustments(n0Raw, N, deff, nrr);

    return {
        n0Raw: adjusted.n0Raw,
        n1Raw: adjusted.nDeffRaw,
        n2Raw: adjusted.nFpcRaw,
        n3Raw: adjusted.nInviteRaw,
        n0: adjusted.n0,
        n1: adjusted.nDeff,
        n2: adjusted.nFpc,
        n3: adjusted.nInvite,
        formulaLabel,
    };
}

// ========== 补充功能：基于变异系数(CV)的样本量计算 ==========

export interface CVBasedSampleSizeParams {
    confidenceLevel: string;  // "90", "95", "99"
    targetCV: number;         // 目标变异系数 (如 0.05 表示 5%)
    populationSize: number;
    estimatedCV?: number;     // 估计的总体变异系数
    designEffect?: number;
    nonResponseRate?: number;
}

export interface CVBasedSampleSizeResult {
    requiredSampleSize: number;      // 计划发放量
    expectedRespondentSampleSize: number; // 按回答率假设得到的预期完成量
    achievedCV: number;              // 按预期完成量近似得到的设计 CV
    cappedAtPopulation: boolean;     // 发放量是否被总体上限截断
    z: number;                       // Z值
    formula: string;                 // 使用的公式
}

/**
 * 基于变异系数(CV)计算所需样本量
 *
 * CV(ȳ) = SE(ȳ) / ȳ = CV_pop / √n（无限总体近似）
 * 要使 CV(ȳ) ≤ targetCV，需要 n₀ = CV_pop² / targetCV²
 *
 * 注意：CV 不含 Z 值。若要从 CV 得到置信区间相对半宽，
 * 需另行乘以 Z：相对误差限 = Z × CV(ȳ)。
 */
export function calculateSampleSizeByCV(params: CVBasedSampleSizeParams): CVBasedSampleSizeResult | null {
    const N = Math.floor(params.populationSize);
    const targetCV = params.targetCV;
    const estimatedCV = params.estimatedCV ?? 0.5;
    const deff = params.designEffect ?? 1;
    const nrr = params.nonResponseRate ?? 0;

    if (
        !(N > 0)
        || !Number.isFinite(targetCV) || !(targetCV > 0)
        || !Number.isFinite(estimatedCV) || !(estimatedCV > 0)
        || !Number.isFinite(deff) || !(deff > 0)
        || !Number.isFinite(nrr) || nrr < 0 || nrr >= 1
    ) {
        return null;
    }

    // z 不参与样本量计算，仅用于 UI 展示（供用户换算置信区间相对半宽 = Z × CV(ȳ)）
    const z = zForConfidenceLevel(String(params.confidenceLevel));

    const n0 = Math.pow(estimatedCV, 2) / Math.pow(targetCV, 2);
    const adjusted = applyDesignAdjustments(n0, N, deff, nrr);
    const requiredSampleSize = Math.max(1, adjusted.nInvite);
    const expectedRespondentSampleSize = adjusted.expectedCompleted;
    const fpc = finitePopulationVarianceFactor(N, expectedRespondentSampleSize);
    const achievedCV = expectedRespondentSampleSize > 0
        ? estimatedCV * Math.sqrt(deff * fpc / expectedRespondentSampleSize)
        : Number.POSITIVE_INFINITY;

    return {
        requiredSampleSize,
        expectedRespondentSampleSize,
        achievedCV,
        cappedAtPopulation: adjusted.cappedAtPopulation,
        z,
        formula: "n₀=CV_pop²/CV_target²；先按 deff 调整，再做 FPC，再除以 (1−NRR) 得发放量",
    };
}

// ========== 补充功能：整群抽样和多阶段抽样 ==========

export interface ClusterSamplingParams {
    populationSize: number;
    confidenceLevel: string;
    marginOfError: number;
    clusterSize: number;           // 规划群规模（末群可不足）
    deff: number;                  // 完整回答时，相对同样本量 SRSWOR 的方差比
    nonResponseRate?: number;
    p?: number;
}

export interface ClusterSamplingResult {
    marginOfError: number;
    precisionUnreachable: boolean;
    requiredClusters: number;      // 所需群数
    requiredSampleSize: number;    // 计划发放量上限（末群可能不足）
    intraClassCorrelation: number | null; // 仅等规模、多群且每群多单位时可反推
    deff: number;                  // 输入的完整回答设计效应；单群总体不使用
    explanation: string;           // 解释说明
}

/**
 * D = Var(cluster mean) / Var(SRSWOR mean)，不是直接代入 1+(M−1)ρ 的模型参数。
 * 等规模群：B=D·v·(K−1)/(N−1) 为群均值的总体方差，W=M/(M−1)·(v−B) 为平均群内 S²。
 * 抽 k 群、每群固定 m=M(1−r) 个随机回答者：Var=B(K−k)/(k(K−1))+rW/(kM(1−r))。
 * m 为小数时仅作预期完成量近似，不刻画独立无回答导致空群的机制。
 * 推导参见 https://online.stat.psu.edu/stat506/Lesson09.html （两阶段 SRS）。
 */
export function calculateClusterSamplingSize(params: ClusterSamplingParams): ClusterSamplingResult | null {
    if (!Number.isSafeInteger(params.populationSize) || params.populationSize < 1
        || !Number.isSafeInteger(params.clusterSize) || params.clusterSize < 1
        || !isConfidenceLevel(String(params.confidenceLevel))
        || !Number.isFinite(params.marginOfError)
        || !Number.isFinite(params.deff) || params.deff <= 0
        || (params.clusterSize === 1 && params.deff !== 1)
        || (params.nonResponseRate !== undefined && (!Number.isFinite(params.nonResponseRate) || params.nonResponseRate < 0 || params.nonResponseRate >= 1))) {
        return null;
    }
    const e = normalizeMarginOfError(params.marginOfError);
    const p = params.p ?? 0.5;
    if (!(e > 0 && e < 1) || !Number.isFinite(p) || p <= 0 || p >= 1) return null;
    const z = zForConfidenceLevel(String(params.confidenceLevel));
    const nrr = params.nonResponseRate ?? 0;
    const maxClusters = Math.max(1, Math.ceil(params.populationSize / params.clusterSize));
    const N = params.populationSize;
    const meanClusterSize = N / maxClusters;
    const responseRate = 1 - nrr;
    const v = p * (1 - p);
    if (maxClusters > 1 && params.deff > (N - 1) / (maxClusters - 1)) return null;
    if ((meanClusterSize > 1 && meanClusterSize * responseRate < 1) || (N === 1 && nrr > 0)) return null;
    const betweenFraction = maxClusters > 1 ? params.deff / ((N - 1) / (maxClusters - 1)) : 0;
    const betweenVariance = v * betweenFraction;
    const withinVariance = meanClusterSize > 1
        ? meanClusterSize / (meanClusterSize - 1) * v * Math.max(0, 1 - betweenFraction)
        : 0;

    const resultFor = (clusterCount: number) => {
        const sampleSize = Math.min(clusterCount * params.clusterSize, params.populationSize);
        // 末群不足时，以平均群规模近似方差；sampleSize 仅为发放量上限。
        const completed = clusterCount * meanClusterSize * responseRate;
        const variance = meanClusterSize === 1
            ? v / completed * finitePopulationVarianceFactor(N, completed)
            : betweenVariance / clusterCount * finitePopulationVarianceFactor(maxClusters, clusterCount)
                + nrr * withinVariance / completed;
        const marginOfError = z * Math.sqrt(variance);
        return { sampleSize, marginOfError };
    };

    let low = 1;
    let high = maxClusters;
    while (low < high) {
        const midpoint = Math.floor((low + high) / 2);
        if (resultFor(midpoint).marginOfError <= e) high = midpoint;
        else low = midpoint + 1;
    }
    const requiredClusters = low;
    const planned = resultFor(requiredClusters);

    const equalClusters = N % params.clusterSize === 0;
    const rho = maxClusters > 1 && meanClusterSize > 1 && equalClusters
        ? (meanClusterSize * betweenFraction - 1) / (meanClusterSize - 1)
        : null;
    const frameExplanation = maxClusters === 1
        ? "总体仅有一个群，全部发放；deff 不参与计算，ICC 不适用。"
        : meanClusterSize === 1
            ? "每群一个单位，按 SRSWOR 的预期完成量规划，ICC 不适用。"
            : equalClusters
                ? "按等规模群规划；deff 为完整回答时相对同样本量 SRSWOR 的方差比。"
                : "末群不足，按平均群规模近似方差、按上限规划发放量；不保证保守，ICC 不适用，请核对真实群框。";

    return {
        marginOfError: planned.marginOfError,
        precisionUnreachable: planned.marginOfError > e + 1e-12,
        requiredClusters,
        requiredSampleSize: planned.sampleSize,
        intraClassCorrelation: rho,
        deff: params.deff,
        explanation: `${frameExplanation} 无回答按群内固定比例随机减少回答者近似，非整群失访；不包含无回答偏差或空群风险。`,
    };
}

// ========== 补充功能：分层抽样的高级分配方法 ==========

export interface LayerWithCost {
    name: string;
    populationSize: number;      // Nh
    stdDev: number;             // Sh（层内标准差）
    unitCost: number;           // ch（每样本成本）
}

export interface OptimalAllocationWithCostResult {
    allocation: Array<{
        layerName: string;
        sampleSize: number;
        proportion: number;
        cost: number;
        isOverAllocated?: boolean;
    }>;
    totalSampleSize: number;
    totalCost: number;
    /** Nonempty strata with no sampled units make the overall estimate unavailable. */
    uncoveredLayers: string[];
    totalVariance: number | null;
    efficiency: number | null;
    formula: string;
}

/**
 * 考虑费用的最优分配（Neyman 分配推广，固定预算）
 * 闭式解: n_h = C × (N_h S_h / √c_h) / Σ(N_i S_i √c_i)
 * 连续解施加每层覆盖和容量约束，整数预算结果为近似方案，不保证全局最优。
 */
export function calculateOptimalAllocationWithCost(
    layers: LayerWithCost[],
    totalBudget: number,
    fixedCost: number = 0
): OptimalAllocationWithCostResult | null {
    if (!layers.length || !Number.isFinite(totalBudget) || !Number.isFinite(fixedCost)
        || fixedCost < 0 || totalBudget <= fixedCost
        || new Set(layers.map((layer) => layer.name)).size !== layers.length
        || layers.some((layer) => !Number.isInteger(layer.populationSize) || layer.populationSize < 0
            || !Number.isFinite(layer.stdDev) || layer.stdDev < 0
            || !Number.isFinite(layer.unitCost) || layer.unitCost <= 0)) return null;

    const budget = totalBudget - fixedCost;
    const sampleSizes = layers.map(() => 0);
    const coverageCost = layers.reduce((sum, layer) => sum + (layer.populationSize > 0 ? layer.unitCost : 0), 0);
    let leftover = budget;
    if (coverageCost > budget) {
        // A partial allocation is explicitly reported as uncovered below.
        for (let i = 0; i < layers.length; i++) {
            if (layers[i]!.populationSize > 0 && layers[i]!.unitCost <= leftover) {
                sampleSizes[i] = 1;
                leftover -= layers[i]!.unitCost;
            }
        }
    } else {
        const maxStd = layers.reduce((maximum, layer) => Math.max(maximum, layer.stdDev), 0);
        const weights = layers.map((layer) => maxStd > 0
            ? layer.populationSize * (layer.stdDev / maxStd) / Math.sqrt(layer.unitCost) : 0);
        // Continuous constrained solution: n_h = clamp(lambda*w_h, 1, N_h).
        const countAt = (i: number, lambda: number) => layers[i]!.populationSize === 0 ? 0
            : Math.min(layers[i]!.populationSize, Math.max(1, lambda * weights[i]!));
        let low = 0;
        let high = weights.reduce((maximum, weight, i) => weight > 0
            ? Math.max(maximum, layers[i]!.populationSize / weight) : maximum, 0);
        for (let iteration = 0; iteration < 100; iteration++) {
            const midpoint = (low + high) / 2;
            const cost = layers.reduce((sum, layer, i) => sum + countAt(i, midpoint) * layer.unitCost, 0);
            if (cost <= budget) low = midpoint; else high = midpoint;
        }
        for (let i = 0; i < layers.length; i++) sampleSizes[i] = Math.floor(countAt(i, low));
        leftover -= layers.reduce((sum, layer, i) => sum + sampleSizes[i]! * layer.unitCost, 0);
        // Integer budget approximation, not a claim of global knapsack optimality.
        while (leftover > 0) {
            let best = -1;
            let bestGain = -1;
            for (let i = 0; i < layers.length; i++) {
                const layer = layers[i]!;
                const n = sampleSizes[i]!;
                if (n >= layer.populationSize || layer.unitCost > leftover) continue;
                const gain = maxStd > 0
                    ? (layer.populationSize * (layer.stdDev / maxStd)) ** 2 / (n * (n + 1) * layer.unitCost) : 0;
                if (gain > bestGain) { best = i; bestGain = gain; }
            }
            if (best < 0) break;
            sampleSizes[best]!++;
            leftover -= layers[best]!.unitCost;
        }
    }

    const allocation = layers.map((layer, index) => {
        const sampleSize = sampleSizes[index] ?? 0;
        return {
            layerName: layer.name,
            sampleSize,
            proportion: 0,
            cost: sampleSize * layer.unitCost,
            isOverAllocated: sampleSize > layer.populationSize,
        };
    });
    const totalSampleSize = allocation.reduce((sum, item) => sum + item.sampleSize, 0);
    for (const item of allocation) {
        item.proportion = totalSampleSize > 0 ? item.sampleSize / totalSampleSize : 0;
    }

    const totalCost = fixedCost + allocation.reduce((sum, item) => sum + item.cost, 0);
    const uncoveredLayers = layers.filter((layer, index) => layer.populationSize > 0 && allocation[index]!.sampleSize === 0)
        .map(layer => layer.name);
    const totalVariance = uncoveredLayers.length ? null : calculateOptimalVariance(allocation, layers);

    return {
        allocation,
        totalSampleSize,
        totalCost,
        uncoveredLayers,
        totalVariance,
        efficiency: totalVariance !== null && totalVariance > 0 ? 1 / totalVariance : null,
        formula: "连续无约束解 n_h = C × (N_h S_h / √c_h) / Σ(N_i S_i √c_i)；实际结果为保留层覆盖的整数预算近似，不保证全局最优",
    };
}

/**
 * 与N的平方根成比例分配
 * 公式: n_h ∝ √N_h
 */
export function calculateSquareRootAllocation(
    layers: Array<{ name: string; populationSize: number }>,
    totalSampleSize: number
): Array<{ name: string; sampleSize: number; proportion: number }> {
    if (!layers.length) return [];

    const weights = layers.map(l => Math.sqrt(l.populationSize));
    return applyLargestRemainderAllocation(layers, weights, totalSampleSize);
}

// ========== 分层抽样：按规模度量的比例分配（课件第25页） ==========

/**
 * 与 Nh×Yh 成比例分配
 * 分配系数 wh = (Nh × Yh) / Σ(Ni × Yi)
 * 这是课件指定模型下的份额规则；没有目标方差与成本假设时，不把它称为通用最优分配。
 */
export function calculateSizeMeasureAllocation(
    layers: Array<{ name: string; populationSize: number; sizeMeasure: number }>,
    totalSampleSize: number
): Array<{ name: string; sampleSize: number; proportion: number }> {
    if (!layers.length) return [];

    const weights = layers.map(l => l.populationSize * l.sizeMeasure);
    return applyLargestRemainderAllocation(layers, weights, totalSampleSize);
}

/**
 * 与 √(Nh×Yh) 成比例分配
 * 分配系数 wh = √(Nh × Yh) / Σ√(Ni × Yi)
 * 这是课件给定的份额规则；没有目标方差与成本模型时，不能声称它普遍优于其他分配。
 */
export function calculateSqrtSizeMeasureAllocation(
    layers: Array<{ name: string; populationSize: number; sizeMeasure: number }>,
    totalSampleSize: number
): Array<{ name: string; sampleSize: number; proportion: number }> {
    if (!layers.length) return [];

    const weights = layers.map(l => Math.sqrt(l.populationSize * l.sizeMeasure));
    return applyLargestRemainderAllocation(layers, weights, totalSampleSize);
}

/**
 * 带层覆盖和容量约束的最大余数法分配。
 * 连续解满足 n_h=clamp(λw_h, lower_h, N_h)，再按小数余数整数化。
 * 供各种按权重比例分配方法复用。
 */
function applyLargestRemainderAllocation(
    layers: Array<{ name: string; populationSize: number }>,
    weights: number[],
    totalSampleSize: number,
): Array<{ name: string; sampleSize: number; proportion: number }> {
    const valid = Number.isSafeInteger(totalSampleSize) && totalSampleSize >= 0
        && layers.every((layer) => Number.isSafeInteger(layer.populationSize) && layer.populationSize >= 0)
        && weights.length === layers.length
        && weights.every((weight) => Number.isFinite(weight) && weight >= 0);
    const weightScale = weights.reduce((maximum, weight) => Math.max(maximum, weight), 0);
    if (!valid || weightScale <= 0) {
        return layers.map(l => ({ name: l.name, sampleSize: 0, proportion: 0 }));
    }
    const totalWeight = weights.reduce((sum, weight) => sum + weight / weightScale, 0);

    const totalCapacity = layers.reduce((sum, layer) => sum + layer.populationSize, 0);
    const target = Math.min(totalSampleSize, totalCapacity);
    const nonemptyCount = layers.filter((layer) => layer.populationSize > 0).length;
    const lower = layers.map((layer) => target >= nonemptyCount && layer.populationSize > 0 ? 1 : 0);
    const positiveWeightIndices = weights.map((_, index) => index).filter((index) => weights[index]! > 0);
    const maximumWeightedTotal = layers.reduce((sum, layer, index) => (
        sum + (weights[index]! > 0 ? layer.populationSize : lower[index]!)
    ), 0);
    let exact: number[];

    if (target <= maximumWeightedTotal) {
        exact = [...lower];
        let active = positiveWeightIndices;
        let remaining = target - lower.reduce<number>((sum, value, index) => sum + (weights[index] === 0 ? value : 0), 0);
        // 逐次固定确定触及的边界；每轮至少移除一层，不在跨数量级的 λ 区间中二分。
        // 总量偏大时只能固定下界，偏小时只能固定上界，避免两侧同时固定后误分配。
        while (active.length) {
            const scale = active.reduce((maximum, index) => Math.max(maximum, weights[index]!), 0);
            const sum = active.reduce((total, index) => total + weights[index]! / scale, 0);
            const shares = active.map(index => ({ index, value: remaining * (weights[index]! / scale) / sum }));
            let clampedTotal = 0;
            for (const { index, value } of shares) {
                exact[index] = Math.min(layers[index]!.populationSize, Math.max(lower[index]!, value));
                clampedTotal += exact[index]!;
            }
            const fixed = shares.filter(({ index, value }) => clampedTotal > remaining
                ? value < lower[index]!
                : value > layers[index]!.populationSize);
            if (!fixed.length) break;
            const fixedIndices = new Set(fixed.map(({ index }) => index));
            for (const { index } of fixed) remaining -= exact[index]!;
            active = active.filter(index => !fixedIndices.has(index));
        }
    } else {
        exact = layers.map((layer, index) => weights[index]! > 0 ? layer.populationSize : lower[index]!);
        const remainder = target - exact.reduce((sum, value) => sum + value, 0);
        const zeroWeightCapacity = layers.reduce((sum, layer, index) => (
            sum + (weights[index] === 0 ? layer.populationSize - exact[index]! : 0)
        ), 0);
        if (remainder > 0 && zeroWeightCapacity > 0) {
            for (let index = 0; index < layers.length; index++) {
                if (weights[index] === 0) {
                    exact[index]! += remainder * (layers[index]!.populationSize - exact[index]!) / zeroWeightCapacity;
                }
            }
        }
    }

    const allocated = exact.map((value, index) => Math.min(layers[index]!.populationSize, Math.floor(value)));
    let integerRemainder = target - allocated.reduce((sum, value) => sum + value, 0);
    const fractionalOrder = exact.map((value, index) => ({ index, fraction: value - Math.floor(value) }))
        .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
    for (const { index } of fractionalOrder) {
        if (integerRemainder <= 0) break;
        if (allocated[index]! >= layers[index]!.populationSize) continue;
        allocated[index]! += 1;
        integerRemainder -= 1;
    }

    return layers.map((layer, index) => ({
        name: layer.name,
        sampleSize: allocated[index] ?? 0,
        proportion: (weights[index]! / weightScale) / totalWeight,
    }));
}

// 辅助函数：计算最优分配的方差
function calculateOptimalVariance(
    allocation: Array<{ layerName: string; sampleSize: number }>,
    layers: LayerWithCost[]
): number {
    const totalPopulation = layers.reduce((a, l) => a + l.populationSize, 0);
    let variance = 0;

    for (const a of allocation) {
        const layer = layers.find(l => l.name === a.layerName);
        if (!layer || a.sampleSize <= 0) continue;

        const Wh = layer.populationSize / totalPopulation;
        const Sh2 = Math.pow(layer.stdDev, 2);
        
        // 层方差贡献
        variance += Math.pow(Wh, 2) * (Sh2 / a.sampleSize) * (1 - a.sampleSize / layer.populationSize);
    }

    return variance;
}

/** 计算单个调查变量在有限总体下的所需样本量；输入不合法时返回 0。 */
export function calculateSurveyVariableRequiredSampleSize(variable: SurveyVariableSpec, populationSize: number) {
    if (!Number.isSafeInteger(populationSize) || populationSize < 1 || getSurveyVariableParameterError(variable)) return 0;

    if (variable.type === "proportion") {
        const p = variable.estimatedValue;
        return calculateFinitePopulationSampleSize({
            confidenceLevel: variable.confidenceLevel,
            // 本组件的输入框始终以百分数显示和存储；底层兼容函数对 <1 的值
            // 会视为小数比例，因此必须在组件边界显式换算，避免 0.5% 被当成 50%。
            marginOfError: variable.marginOfError / 100,
            populationSize,
            designEffect: 1,
            nonResponseRate: 0,
            // 边界值 0、1 视为缺少可靠先验比例，按 p=.5 做保守规划；非法值已拒绝。
            p: p > 0 && p < 1 ? p : 0.5,
        }) ?? 0;
    }

    const sigma = Number(variable.estimatedStdDev);
    const meanMagnitude = Math.abs(variable.estimatedValue);
    if (!(sigma > 0) || !Number.isFinite(sigma) || !(meanMagnitude > 0)) return 0;

    const z = zForConfidenceLevel(variable.confidenceLevel);
    const absoluteMargin = (variable.marginOfError / 100) * meanMagnitude;
    const n0 = Math.pow((z * sigma) / absoluteMargin, 2);
    const finitePopulationN = n0 / (1 + (n0 - 1) / populationSize);
    return capSampleSizeAtPopulation(finitePopulationN, populationSize);
}
