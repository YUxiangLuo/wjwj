export interface LayerInfo {
    name: string;
    count: number;  // 层总体大小 Nh
    ratio: number;  // 层占比 (%)
}

export type AllocationMethod =
    | "proportional"
    | "neyman"
    | "equal"
    | "sqrt"
    | "sizeMeasure"
    | "sqrtSizeMeasure"
    | "costOptimal"
    | "equalVarianceCost";

export interface AllocationResult {
    layerName: string;
    populationSize: number;   // Nh
    sampleSize: number;       // nh
    proportion: number;       // nh / 总样本量
    isOverAllocated?: boolean;
    isFullyEnumerated?: boolean;
}

export interface AllocationComparison {
    method: AllocationMethod;
    name: string;
    description: string;
    allocation: AllocationResult[];
    totalVariance: number;
    efficiency: number;
    totalCost?: number;
    hasOverAllocation: boolean;
    overAllocatedLayers: string[];
    adjustedTotalSampleSize?: number;
}

/** Inline 分配方法选择器使用的基础四方法 */
export const INLINE_METHODS: AllocationMethod[] = [
    "proportional",
    "neyman",
    "equal",
    "sqrt",
];

export const ALLOCATION_METHOD_LABELS: Record<AllocationMethod, string> = {
    proportional: "按比例分配",
    neyman: "奈曼分配",
    equal: "等额分配",
    sqrt: "与 √N 成比例",
    sizeMeasure: "与 Yₕ 成比例",
    sqrtSizeMeasure: "与 √Yₕ 成比例",
    costOptimal: "费用最优",
    equalVarianceCost: "等方差费用最优",
};

export const ALLOCATION_METHOD_DESCRIPTIONS: Record<AllocationMethod, string> = {
    proportional: "样本量与层总体大小成比例，最常用且稳健",
    neyman: "方差大的层分配更多样本，使估计方差最小",
    equal: "每层分配相同样本量",
    sqrt: "各层样本量与 √Nₕ 成比例，按比例与等额之间折中",
    sizeMeasure: "各层样本量与层总量 Yₕ 成比例",
    sqrtSizeMeasure: "各层样本量与 √Yₕ 成比例",
    costOptimal: "兼顾费用与方差的最优分配",
    equalVarianceCost: "假设各层方差相等时的费用最优",
};
