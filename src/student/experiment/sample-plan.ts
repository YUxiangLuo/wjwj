const Z_SCORES = new Map<number, number>([
    [0.90, 1.645],
    [0.95, 1.96],
    [0.99, 2.576],
]);

/**
 * 将百分比或小数形式的误差限统一为小数比例。
 * 约定：值 >= 1 视为百分比（如 5 → 0.05），< 1 视为已是比例（如 0.05 不变）。
 */
function normalizeMarginOfError(value: number): number {
    return value >= 1 ? value / 100 : value;
}

export interface SampleSizeMetrics {
    n0: number;              // 初始样本量（无限总体）
    n1: number;              // 有限总体校正后
    n: number;              // 最终样本量
    standardError: number;   // 标准误差 SE
    relativeStandardError: number; // 相对标准误差 RSE (CV)
    marginOfError: number;   // 误差限（绝对值）
    confidenceInterval: {    // 置信区间
        lower: number;
        upper: number;
    };
}

export function calculateFinitePopulationSampleSize(params: {
    confidenceLevel: unknown;
    marginOfError: unknown;
    populationSize: number | null | undefined;
    designEffect?: unknown;
    nonResponseRate?: unknown;
    p?: number;  // 估计比例，默认为0.5（最保守估计）
}) {
    if (!params.populationSize || params.populationSize <= 0) {
        return null;
    }

    const confidenceValue = Number(params.confidenceLevel);
    const confidenceRatio = confidenceValue > 1 ? confidenceValue / 100 : confidenceValue;
    const e = normalizeMarginOfError(Number(params.marginOfError));

    const z = Z_SCORES.get(confidenceRatio);
    if (z === undefined) return null;

    const N = params.populationSize;
    const p = params.p ?? 0.5;

    // Basic sample size with finite population correction
    const n0 = (Math.pow(z, 2) * p * (1 - p)) / Math.pow(e, 2);
    let n = n0 / (1 + (n0 - 1) / N);
    const n1 = n; // 有限总体校正后的样本量

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

    return Math.ceil(n);
}

export function calculateSampleSizeMetrics(params: {
    confidenceLevel: unknown;
    marginOfError: unknown;
    populationSize: number | null | undefined;
    designEffect?: unknown;
    nonResponseRate?: unknown;
    p?: number;
}): SampleSizeMetrics | null {
    if (!params.populationSize || params.populationSize <= 0) {
        return null;
    }

    const confidenceValue = Number(params.confidenceLevel);
    const confidenceRatio = confidenceValue > 1 ? confidenceValue / 100 : confidenceValue;
    const e = normalizeMarginOfError(Number(params.marginOfError));

    const z = Z_SCORES.get(confidenceRatio);
    if (z === undefined) return null;

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

    const finalN = Math.ceil(n);

    // 计算精度指标（基于调整后的有效样本量，即n1）
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
    if (!params.populationSize || params.populationSize <= 0) {
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

    const calculatedSampleSize = calculateFinitePopulationSampleSize({
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
    if (params.populationSize <= 0 || params.targetCV <= 0) {
        return null;
    }

    const z = params.confidenceLevel === "90" ? 1.645 : 
              params.confidenceLevel === "95" ? 1.96 : 2.576;
    
    const estimatedCV = params.estimatedCV ?? 0.5;  // 默认估计变异系数50%
    const targetCV = params.targetCV;
    const deff = params.designEffect ?? 1;
    const nrr = params.nonResponseRate ?? 0;

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

    const z = params.confidenceLevel === "90" ? 1.645 : 
              params.confidenceLevel === "95" ? 1.96 : 2.576;
    
    const e = normalizeMarginOfError(params.marginOfError);
    const p = params.p ?? 0.5;
    
    // 基础样本量（简单随机抽样，含有限总体校正）
    const n0 = (Math.pow(z, 2) * p * (1 - p)) / Math.pow(e, 2);
    const n_srs = n0 / (1 + (n0 - 1) / params.populationSize);
    
    // 整群抽样样本量 = 有限总体校正后样本量 × deff / (1 - nrr)
    const n_cluster = Math.ceil(n_srs * params.deff / (1 - (params.nonResponseRate ?? 0)));
    
    // 计算所需群数
    const requiredClusters = Math.ceil(n_cluster / params.clusterSize);
    
    // 反推群内相关系数ρ（用于教育展示）
    // deff = 1 + (M-1)×ρ => ρ = (deff - 1) / (M - 1)
    const rho = params.clusterSize > 1 ? (params.deff - 1) / (params.clusterSize - 1) : 0;
    
    // 总样本量 = 群数 × 群规模
    const requiredSampleSize = requiredClusters * params.clusterSize;

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
 * 考虑费用的最优分配（Neyman分配推广）
 * 公式: n_h ∝ (N_h × S_h) / √c_h
 */
export function calculateOptimalAllocationWithCost(
    layers: LayerWithCost[],
    totalBudget: number,
    fixedCost: number = 0
): OptimalAllocationWithCostResult | null {
    if (!layers.length || totalBudget <= fixedCost) return null;

    // 计算可用预算
    const availableBudget = totalBudget - fixedCost;
    
    // 计算各层权重: w_h = (N_h × S_h) / √c_h
    const weights = layers.map(layer => {
        const costFactor = Math.sqrt(layer.unitCost);
        return costFactor > 0 ? (layer.populationSize * layer.stdDev) / costFactor : 0;
    });
    
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    if (totalWeight <= 0) return null;

    // 初始分配（按比例）
    let allocation = layers.map((layer, index) => {
        const weight = weights[index] ?? 0;
        const proportion = totalWeight > 0 ? weight / totalWeight : 0;
        
        // 估算该层可分配的样本量（基于预算约束）
        const budgetShare = availableBudget * proportion;
        const sampleSize = Math.floor(budgetShare / layer.unitCost);
        
        return {
            layerName: layer.name,
            sampleSize,
            proportion,
            cost: sampleSize * layer.unitCost,
            isOverAllocated: sampleSize > layer.populationSize,
        };
    });

    // 处理超额分配并重新平衡
    let currentTotalCost = allocation.reduce((sum, a) => sum + a.cost, 0);
    let iterations = 0;
    
    while (Math.abs(currentTotalCost - availableBudget) > 1 && iterations < 100) {
        const diff = availableBudget - currentTotalCost;
        
        // 找出可以增加样本量的层（未超额且剩余预算允许）
        const increasableLayers = allocation
            .map((a, i) => ({ 
                ...a, 
                index: i, 
                maxAdd: (layers[i]?.populationSize ?? 0) - a.sampleSize,
                unitCost: layers[i]?.unitCost ?? 0
            }))
            .filter(a => a.maxAdd > 0 && a.unitCost > 0);
        
        if (increasableLayers.length === 0) break;
        
        // 按权重比例增加
        const increasableWeight = increasableLayers.reduce((sum, a) => sum + (weights[a.index] ?? 0), 0);
        
        for (const layer of increasableLayers) {
            const layerWeight = weights[layer.index] ?? 0;
            const share = increasableWeight > 0 ? layerWeight / increasableWeight : 0;
            const addBudget = diff * share;
            const layerUnitCost = layers[layer.index]?.unitCost ?? 1;
            const addSamples = Math.min(
                Math.floor(addBudget / layerUnitCost),
                layer.maxAdd
            );
            
            if (addSamples > 0) {
                const targetLayer = allocation[layer.index];
                if (targetLayer) {
                    targetLayer.sampleSize += addSamples;
                    targetLayer.cost += addSamples * layerUnitCost;
                }
            }
        }
        
        currentTotalCost = allocation.reduce((sum, a) => sum + a.cost, 0);
        iterations++;
    }

    // 重新计算比例和检测超额分配
    const totalSampleSize = allocation.reduce((sum, a) => sum + a.sampleSize, 0);
    allocation = allocation.map((a, i) => ({
        ...a,
        proportion: totalSampleSize > 0 ? a.sampleSize / totalSampleSize : 0,
        isOverAllocated: a.sampleSize > (layers[i]?.populationSize ?? 0),
    }));

    const totalCost = fixedCost + allocation.reduce((sum, a) => sum + a.cost, 0);
    
    // 计算方差（简化估计）
    const totalVariance = calculateOptimalVariance(allocation, layers);

    return {
        allocation,
        totalSampleSize,
        totalCost,
        totalVariance,
        efficiency: 1 / (totalVariance || 1),
        formula: "n_h = n × (N_h × S_h / √c_h) / Σ(N_i × S_i / √c_i)",
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
