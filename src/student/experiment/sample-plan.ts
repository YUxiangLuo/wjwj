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
    n1: number;              // 有限总体校正后
    n: number;              // 最终样本量（不超过 N）
    cappedAtPopulation: boolean;
    standardError: number;   // 标准误差 SE
    relativeStandardError: number; // 相对标准误差 RSE (CV)
    marginOfError: number;   // 误差限（绝对值）
    confidenceInterval: {    // 置信区间
        lower: number;
        upper: number;
    };
}

/** 发放样本量不能超过总体：再膨胀也只能做全面调查。 */
export function capSampleSizeAtPopulation(n: number, populationSize: number): number {
    const N = Math.floor(populationSize);
    if (!Number.isFinite(n) || n <= 0) return 0;
    if (!(N > 0)) return Math.ceil(n);
    return Math.min(Math.ceil(n), N);
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

    const N = params.populationSize;
    const p = params.p ?? 0.5;

    // Basic sample size with finite population correction
    const n0 = (Math.pow(z, 2) * p * (1 - p)) / Math.pow(e, 2);
    let n = n0 / (1 + (n0 - 1) / N);
    // Apply design effect (deff): accounts for complex sampling designs (e.g., cluster sampling)
    const deff = Number(params.designEffect);
    if (Number.isFinite(deff) && deff > 0) {
        n = n * deff;
    }

    // Apply non-response rate adjustment: n_final = n / (1 - nonResponseRate)
    const nrr = Number(params.nonResponseRate);
    if (Number.isFinite(nrr) && nrr > 0 && nrr < 1) {
        n = n / (1 - nrr);
    }

    return capSampleSizeAtPopulation(n, N);
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

    // 初始样本量（无限总体）
    const n0 = (Math.pow(z, 2) * p * (1 - p)) / Math.pow(e, 2);
    
    // 有限总体校正
    const n1 = n0 / (1 + (n0 - 1) / N);
    let n = n1;

    // 设计效应调整
    const deff = Number(params.designEffect);
    if (Number.isFinite(deff) && deff > 0) {
        n = n * deff;
    }

    // 无回答率调整
    const nrr = Number(params.nonResponseRate);
    if (Number.isFinite(nrr) && nrr > 0 && nrr < 1) {
        n = n / (1 - nrr);
    }

    const uncappedN = Math.ceil(n);
    const finalN = capSampleSizeAtPopulation(n, N);

    // 精度指标基于有效样本量 n1（FPC 校正后、deff/NRR 调整前）。
    // 原因：n_final = n1 × deff / (1-NRR)，其中 deff 和 NRR 是膨胀因子；
    // 实际回收有效样本的等效精度仍为 n1（deff 抵消群内相关，NRR 补偿丢失），
    // 故 SE/CV 应反映设计意图下的精度，而非原始发放样本量。
    const effectiveN = Math.ceil(n1);

    // 标准误差 SE = sqrt(p*(1-p)/n * (1 - n/N))，含有限总体校正
    // 当 n ≥ N（全数调查）时 FPC=0，SE=0，此为正确行为
    const fpc = Math.max(0, 1 - effectiveN / N);
    const standardError = Math.sqrt(p * (1 - p) / effectiveN * fpc);
    
    // 相对标准误差 RSE (CV) = SE / p
    const relativeStandardError = p > 0 ? standardError / p : 0;
    
    // 误差限 = z * SE
    const marginOfErrorAbs = z * standardError;
    
    // 置信区间
    const confidenceInterval = {
        lower: Math.max(0, p - marginOfErrorAbs),
        upper: Math.min(1, p + marginOfErrorAbs),
    };

    return {
        n0,
        n1,
        n: finalN,
        cappedAtPopulation: uncappedN > Math.floor(N),
        standardError,
        relativeStandardError,
        marginOfError: marginOfErrorAbs,
        confidenceInterval,
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

/** 均值估计 n₀ 计算的内部核心（无副作用，无参数校验）。 */
function meanEstimationCore(z: number, sigma2: number, e: number, N: number, deff: number, nrr: number) {
    const n0 = (z * z * sigma2) / (e * e);
    const n1 = n0 / (1 + (n0 - 1) / N);
    let n = n1;
    if (Number.isFinite(deff) && deff > 0) n *= deff;
    if (Number.isFinite(nrr) && nrr > 0 && nrr < 1) n /= (1 - nrr);
    const uncappedN = Math.ceil(n);
    return {
        n0,
        n1,
        n: capSampleSizeAtPopulation(n, N),
        cappedAtPopulation: uncappedN > Math.floor(N),
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
 * 有限总体: n₁ = n₀ / (1 + (n₀ - 1) / N)
 * 最终:     n  = n₁ × deff / (1 - NRR)
 *
 * 其中 σ² 为总体方差估计值，e 为绝对误差限（与均值同单位）。
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
    n1: number;
    n: number;
    cappedAtPopulation: boolean;
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

    const { n0, n1, n: finalN, cappedAtPopulation } = meanEstimationCore(z, sigma2, parsed.e, N, deff, nrr);
    const effectiveN = Math.ceil(n1);

    const fpc = Math.max(0, 1 - effectiveN / N);
    const standardError = Math.sqrt(sigma2 / effectiveN * fpc);

    const mean = params.estimatedMean ?? 0;
    const relativeStandardError = mean !== 0 ? standardError / Math.abs(mean) : 0;

    const marginOfErrorAbs = z * standardError;

    const confidenceInterval = {
        lower: mean - marginOfErrorAbs,
        upper: mean + marginOfErrorAbs,
    };

    return {
        n0,
        n1,
        n: finalN,
        cappedAtPopulation,
        standardError,
        relativeStandardError,
        marginOfError: marginOfErrorAbs,
        confidenceInterval,
    };
}

// ========== 四步法中间步骤（课件第18页，供 UI 展示用） ==========

export interface SampleSizeSteps {
    n0: number; // Step 1: 初始样本量
    n1: number; // Step 2: 有限总体校正后
    n2: number; // Step 3: 设计效应调整后
    n3: number; // Step 4: 无回答率调整后（最终值）
    formulaLabel: string;
}

export interface SampleSizeStepDetails extends SampleSizeSteps {
    n0Raw: number;
    n1Raw: number;
    n2Raw: number;
    n3Raw: number;
}

/**
 * 返回四步法（n₀ → FPC → deff → NRR）各阶段的整数样本量。
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

    const n1Raw = n0Raw / (1 + (n0Raw - 1) / N);
    const n2Raw = n1Raw * deff;
    const n3Raw = nrr > 0 && nrr < 1 ? n2Raw / (1 - nrr) : n2Raw;

    return {
        n0Raw,
        n1Raw,
        n2Raw,
        n3Raw,
        n0: Math.ceil(n0Raw),
        n1: Math.ceil(n1Raw),
        n2: Math.ceil(n2Raw),
        n3: capSampleSizeAtPopulation(n3Raw, N),
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
    requiredSampleSize: number;      // 所需样本量
    achievedCV: number;              // 能达到的变异系数
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
    if (!(params.populationSize > 0) || !(params.targetCV > 0)) {
        return null;
    }

    const nrr = params.nonResponseRate ?? 0;
    if (nrr >= 1) return null;

    // z 不参与样本量计算，仅用于 UI 展示（供用户换算置信区间相对半宽 = Z × CV(ȳ)）
    const z = zForConfidenceLevel(String(params.confidenceLevel));

    const estimatedCV = params.estimatedCV ?? 0.5;  // 默认估计变异系数50%
    const targetCV = params.targetCV;
    const deff = params.designEffect ?? 1;

    // 基础样本量: n₀ = CV_pop² / targetCV²
    const n0 = Math.pow(estimatedCV, 2) / Math.pow(targetCV, 2);

    // 有限总体校正
    let n = n0 / (1 + (n0 - 1) / params.populationSize);

    // 设计效应和无回答率调整
    n = n * deff / (1 - nrr);
    
    const requiredSampleSize = Math.min(Math.ceil(n), params.populationSize);
    
    // 反推实际能达到的CV（含有限总体校正）
    // CV(ȳ) = CV_pop × √(deff × FPC / n_eff)，其中 n_eff = n × (1 - NRR)
    // 当 n=N（全数调查）时 FPC=0，CV=0（完美估计）
    const fpc = 1 - requiredSampleSize / params.populationSize;
    const achievedCV = fpc > 0
        ? estimatedCV * Math.sqrt(deff * fpc / (requiredSampleSize * (1 - nrr)))
        : 0;

    return {
        requiredSampleSize,
        achievedCV,
        z,
        formula: `n = CV_pop² / CV_target² × deff / (1-NRR)`,
    };
}

// ========== 补充功能：整群抽样和多阶段抽样 ==========

export interface ClusterSamplingParams {
    populationSize: number;
    confidenceLevel: string;
    marginOfError: number;
    clusterSize: number;           // 群规模（每群平均单元数）
    deff: number;                  // 设计效应（整群抽样通常1.5-3.0）
    nonResponseRate?: number;
    p?: number;
}

export interface ClusterSamplingResult {
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
    
    // 基础样本量（简单随机抽样，含有限总体校正）
    const n0 = (Math.pow(z, 2) * p * (1 - p)) / Math.pow(e, 2);
    const n_srs = n0 / (1 + (n0 - 1) / params.populationSize);
    
    // 整群抽样样本量 = 有限总体校正后样本量 × deff / (1 - nrr)
    const nrr = params.nonResponseRate ?? 0;
    const n_cluster = nrr > 0 && nrr < 1
        ? n_srs * params.deff / (1 - nrr)
        : n_srs * params.deff;
    const maxClusters = Math.max(1, Math.floor(params.populationSize / params.clusterSize) || 1);
    const requiredClusters = Math.min(Math.max(1, Math.ceil(n_cluster / params.clusterSize)), maxClusters);
    
    // 反推群内相关系数ρ（用于教育展示）
    // deff = 1 + (M-1)×ρ => ρ = (deff - 1) / (M - 1)
    const rho = params.clusterSize > 1 ? (params.deff - 1) / (params.clusterSize - 1) : 0;
    
    // 总样本量 = 群数 × 群规模，但不能超过总体
    const requiredSampleSize = Math.min(requiredClusters * params.clusterSize, params.populationSize);

    return {
        requiredClusters,
        requiredSampleSize,
        intraClassCorrelation: Math.min(rho, 1),  // ρ不超过1
        deff: params.deff,
        explanation: `整群抽样中，由于群内单元同质性高，需要${params.deff}倍于简单随机抽样的样本量来补偿。`,
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
    totalVariance: number;
    efficiency: number;
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
    const totalVariance = calculateOptimalVariance(allocation, layers);

    return {
        allocation,
        totalSampleSize,
        totalCost,
        totalVariance,
        efficiency: 1 / (totalVariance || 1),
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
 * 适用于总体估计值 Y 是总值大小度量时。
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
 * 精度高于与 Nh×Yh 成比例分配。
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
