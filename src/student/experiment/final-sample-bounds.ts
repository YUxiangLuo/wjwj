/**
 * 最终样本量合法区间：默认下限 30、上限 ⌊N/2⌋。
 * 当总体较小时 ⌊N/2⌋ 小于 30，将下限下调为与上限一致，避免出现空区间。
 * 与前端沉浸式/经典规划 UI 一致，供服务端校验复用。
 */
export function getFinalSampleSizeBounds(populationSize: number): { min: number; max: number } {
    const n = Math.max(0, Math.floor(populationSize));
    const rawMax = Math.floor(n * 0.5);
    const max = Math.min(Math.max(0, rawMax), n);
    const minCap = 30;
    if (max < 1) {
        return { min: 1, max: Math.max(1, n) };
    }
    const min = Math.min(minCap, max);
    return { min, max };
}

/** 是否因总体规模较小而启用了「下限与上限对齐」规则（用于界面提示） */
export function isSmallPopulationSampleBounds(populationSize: number): boolean {
    const n = Math.max(0, Math.floor(populationSize));
    return n > 0 && Math.floor(n * 0.5) < 30;
}
