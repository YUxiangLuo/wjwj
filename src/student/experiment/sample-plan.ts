import type { SurveyVariableSpec } from "../../domain/experiment/planning-types";
export type { SurveyVariableSpec } from "../../domain/experiment/planning-types";
import { zForConfidenceLevel, isConfidenceLevel, Z_VALUES } from "./confidence-level";

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
    const nDeffRaw = n0Raw * deffValue;
    const nFpcRaw = nDeffRaw * N / (N - 1 + nDeffRaw);
    const nInviteRaw = nrrValue > 0 ? nFpcRaw / (1 - nrrValue) : nFpcRaw;
    const nInvite = capSampleSizeAtPopulation(nInviteRaw, N);

    return {
        n0Raw,
        nDeffRaw,
        nFpcRaw,
        nInviteRaw,
        n0: Math.ceil(n0Raw),
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
    return s2 * (populationCount - 1) / populationCount;
}

export function calculateFinitePopulationSampleSize(params: {
    confidenceLevel: unknown;
    marginOfError: unknown;
    populationSize: number | null | undefined;
    designEffect?: unknown;
    nonResponseRate?: unknown;
    p?: number;  // 估计比例，默认为0.5（最保守估计）
}) {
    if (params.populationSize == null || !(params.populationSize > 0)) {
        return null;
    }

    const clStr = String(params.confidenceLevel);
    if (!isConfidenceLevel(clStr)) return null;
    const z = Z_VALUES[clStr];
    const e = normalizeMarginOfError(Number(params.marginOfError));

    const p = params.p ?? 0.5;
    const n0 = (Math.pow(z, 2) * p * (1 - p)) / Math.pow(e, 2);
    return applyDesignAdjustments(n0, params.populationSize, params.designEffect, params.nonResponseRate).nInvite;
}

export function calculateSampleSizeMetrics(params: {
    confidenceLevel: unknown;
    marginOfError: unknown;
    populationSize: number | null | undefined;
    designEffect?: unknown;
    nonResponseRate?: unknown;
    p?: number;
}): SampleSizeMetrics | null {
    if (params.populationSize == null || !(params.populationSize > 0)) {
        return null;
    }

    const clStr = String(params.confidenceLevel);
    if (!isConfidenceLevel(clStr)) return null;
    const z = Z_VALUES[clStr];
    const e = normalizeMarginOfError(Number(params.marginOfError));

    const N = params.populationSize;
    const p = params.p ?? 0.5;
    const deff = normalizeDeff(params.designEffect);
    const n0 = (Math.pow(z, 2) * p * (1 - p)) / Math.pow(e, 2);
    const adjusted = applyDesignAdjustments(n0, N, deff, params.nonResponseRate);
    const expectedCompleted = adjusted.expectedCompleted;
    const fpc = finitePopulationVarianceFactor(N, expectedCompleted);
    const standardError = expectedCompleted > 0
        ? Math.sqrt(deff * p * (1 - p) / expectedCompleted * fpc)
        : 0;
    const relativeStandardError = p > 0 ? standardError / p : 0;
    const marginOfErrorAbs = z * standardError;

    return {
        n0,
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
        n0,
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
    relativeStandardError: number;
    marginOfError: number;
    confidenceInterval: { lower: number; upper: number };
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

    const mean = params.estimatedMean ?? 0;
    const relativeStandardError = mean !== 0 ? standardError / Math.abs(mean) : 0;
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
        confidenceInterval: {
            lower: mean - marginOfErrorAbs,
            upper: mean + marginOfErrorAbs,
        },
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
    deff: number;                  // 设计效应（整群抽样通常1.5-3.0）
    nonResponseRate?: number;
    p?: number;
}

export interface ClusterSamplingResult {
    marginOfError: number;
    precisionUnreachable: boolean;
    requiredClusters: number;      // 所需群数
    requiredSampleSize: number;    // 所需样本量（群数×群规模）
    intraClassCorrelation: number; // 群内相关系数ρ（估计值）
    deff: number;                  // 实际设计效应
    explanation: string;           // 解释说明
}

/**
 * 计算整群抽样所需群数
 * 公式基于：deff ≈ 1 + (M-1)×ρ，其中M为群规模，ρ为群内相关系数
 */
export function calculateClusterSamplingSize(params: ClusterSamplingParams): ClusterSamplingResult | null {
    if (params.populationSize <= 0 || params.clusterSize <= 0) {
        return null;
    }

    const z = zForConfidenceLevel(String(params.confidenceLevel));
    
    const e = normalizeMarginOfError(params.marginOfError);
    const p = params.p ?? 0.5;
    
    const n0 = (Math.pow(z, 2) * p * (1 - p)) / Math.pow(e, 2);
    const nCluster = applyDesignAdjustments(
        n0,
        params.populationSize,
        params.deff,
        params.nonResponseRate,
    ).nInvite;
    // Planning assumption: fixed group size with a possibly smaller final group.
    // Rounding down would silently discard the remaining population units.
    const maxClusters = Math.max(1, Math.ceil(params.populationSize / params.clusterSize));
    const requiredClusters = Math.min(Math.max(1, Math.ceil(nCluster / params.clusterSize)), maxClusters);
    
    // 反推群内相关系数ρ（用于教育展示）
    // deff = 1 + (M-1)×ρ => ρ = (deff - 1) / (M - 1)
    const rho = params.clusterSize > 1 ? (params.deff - 1) / (params.clusterSize - 1) : 0;
    
    // 总样本量 = 群数 × 群规模，但不能超过总体
    const requiredSampleSize = Math.min(requiredClusters * params.clusterSize, params.populationSize);
    const completed = requiredSampleSize * (1 - normalizeNrr(params.nonResponseRate));
    const marginOfError = z * Math.sqrt(
        normalizeDeff(params.deff) * p * (1 - p)
        * finitePopulationVarianceFactor(params.populationSize, completed) / completed,
    );

    return {
        marginOfError,
        precisionUnreachable: marginOfError > e + 1e-12,
        requiredClusters,
        requiredSampleSize,
        intraClassCorrelation: Math.min(rho, 1),  // ρ不超过1
        deff: params.deff,
        explanation: `按固定群规模规划，末群可不足一群；实际执行前需核对真实群框。在当前目标变量的 deff=${params.deff} 假设下补偿样本量。`,
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
 * 超额层先全数调查，剩余预算在未满层上重算。
 */
export function calculateOptimalAllocationWithCost(
    layers: LayerWithCost[],
    totalBudget: number,
    fixedCost: number = 0
): OptimalAllocationWithCostResult | null {
    if (!layers.length || totalBudget <= fixedCost) return null;

    let remainingBudget = totalBudget - fixedCost;
    const locked = layers.map(() => false);
    const sampleSizes = layers.map(() => 0);

    const weightOf = (layer: LayerWithCost) => {
        const costFactor = Math.sqrt(layer.unitCost);
        return costFactor > 0 ? (layer.populationSize * layer.stdDev) / costFactor : 0;
    };

    for (let round = 0; round <= layers.length; round += 1) {
        const active = layers
            .map((layer, index) => ({ layer, index }))
            .filter(({ layer, index }) => !locked[index] && layer.unitCost > 0 && layer.populationSize > 0);
        if (active.length === 0 || remainingBudget <= 0) break;

        const denom = active.reduce((sum, { layer }) => sum + weightOf(layer) * layer.unitCost, 0);
        if (denom <= 0) break;

        let lockedThisRound = false;
        for (const { layer, index } of active) {
            const exact = remainingBudget * weightOf(layer) / denom;
            const censusCost = layer.populationSize * layer.unitCost;
            if (exact >= layer.populationSize - 1e-9 && censusCost <= remainingBudget + 1e-9) {
                sampleSizes[index] = layer.populationSize;
                remainingBudget -= censusCost;
                locked[index] = true;
                lockedThisRound = true;
            }
        }
        if (lockedThisRound) continue;

        const exacts = active.map(({ layer }) => remainingBudget * weightOf(layer) / denom);
        const floored = exacts.map((exact, position) => {
            const cap = active[position]!.layer.populationSize;
            return Math.min(cap, Math.max(0, Math.floor(exact)));
        });
        let leftover = remainingBudget - floored.reduce(
            (sum, count, position) => sum + count * active[position]!.layer.unitCost,
            0,
        );

        const remainderOrder = exacts
            .map((_, position) => position)
            .sort((left, right) => (exacts[right]! - floored[right]!) - (exacts[left]! - floored[left]!));
        for (const position of remainderOrder) {
            const layer = active[position]!.layer;
            if ((floored[position] ?? 0) >= layer.populationSize) continue;
            if (layer.unitCost > leftover + 1e-9) continue;
            floored[position] = (floored[position] ?? 0) + 1;
            leftover -= layer.unitCost;
        }

        let progressed = true;
        while (progressed) {
            progressed = false;
            let best = -1;
            let bestScore = -Infinity;
            for (let position = 0; position < active.length; position += 1) {
                const layer = active[position]!.layer;
                if ((floored[position] ?? 0) >= layer.populationSize) continue;
                if (layer.unitCost > leftover + 1e-9) continue;
                const score = weightOf(layer) / layer.unitCost;
                if (score > bestScore) {
                    bestScore = score;
                    best = position;
                }
            }
            if (best >= 0) {
                floored[best] = (floored[best] ?? 0) + 1;
                leftover -= active[best]!.layer.unitCost;
                progressed = true;
            }
        }

        for (let position = 0; position < active.length; position += 1) {
            sampleSizes[active[position]!.index] = floored[position] ?? 0;
        }
        remainingBudget = leftover;
        break;
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
        formula: "n_h = C × (N_h S_h / √c_h) / Σ(N_i S_i √c_i)",
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
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    // Largest remainder method: guarantees sum exactly equals totalSampleSize
    const exactShares = weights.map(w => totalWeight > 0 ? totalSampleSize * w / totalWeight : 0);
    const floored = exactShares.map(s => Math.floor(s));
    let remainder = totalSampleSize - floored.reduce((a, b) => a + b, 0);

    const indices = floored.map((_, i) => i);
    indices.sort((a, b) => (exactShares[b]! - floored[b]!) - (exactShares[a]! - floored[a]!));
    for (const idx of indices) {
        if (remainder <= 0) break;
        floored[idx] = (floored[idx] ?? 0) + 1;
        remainder--;
    }

    return layers.map((layer, index) => ({
        name: layer.name,
        sampleSize: floored[index] ?? 0,
        proportion: totalWeight > 0 ? (weights[index] ?? 0) / totalWeight : 0,
    }));
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
 * 最大余数法分配（保证合计恰好等于 totalSampleSize）。
 * 供各种按权重比例分配方法复用。
 */
function applyLargestRemainderAllocation(
    layers: Array<{ name: string }>,
    weights: number[],
    totalSampleSize: number,
): Array<{ name: string; sampleSize: number; proportion: number }> {
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    if (totalWeight <= 0) {
        return layers.map(l => ({ name: l.name, sampleSize: 0, proportion: 0 }));
    }

    const exactShares = weights.map(w => totalSampleSize * w / totalWeight);
    const floored = exactShares.map(s => Math.floor(s));
    let remainder = totalSampleSize - floored.reduce((a, b) => a + b, 0);

    const indices = floored.map((_, i) => i);
    indices.sort((a, b) => (exactShares[b]! - floored[b]!) - (exactShares[a]! - floored[a]!));
    for (const idx of indices) {
        if (remainder <= 0) break;
        floored[idx] = (floored[idx] ?? 0) + 1;
        remainder--;
    }

    return layers.map((layer, index) => ({
        name: layer.name,
        sampleSize: floored[index] ?? 0,
        proportion: totalWeight > 0 ? (weights[index] ?? 0) / totalWeight : 0,
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
    if (!(populationSize > 0) || !(variable.marginOfError > 0)) return 0;

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
            // 0、1 或非法值通常表示缺少可靠先验比例，按 p=.5 做保守规划。
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
