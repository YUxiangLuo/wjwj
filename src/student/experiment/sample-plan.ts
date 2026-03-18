const Z_SCORES = new Map<number, number>([
    [0.90, 1.645],
    [0.95, 1.96],
    [0.99, 2.576],
]);

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
    const errorValue = Number(params.marginOfError);
    const errorRatio = errorValue > 1 ? errorValue / 100 : errorValue;

    const z = Z_SCORES.get(confidenceRatio);
    if (z === undefined) return null;

    const e = errorRatio;
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
    const errorValue = Number(params.marginOfError);
    const errorRatio = errorValue > 1 ? errorValue / 100 : errorValue;

    const z = Z_SCORES.get(confidenceRatio);
    if (z === undefined) return null;

    const e = errorRatio;
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
    
    // 标准误差 SE = sqrt(p*(1-p)/n)
    const standardError = Math.sqrt(p * (1 - p) / effectiveN);
    
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
        samplePlan.calculatedSampleSize = calculatedSampleSize;
    }

    return samplePlan;
}
