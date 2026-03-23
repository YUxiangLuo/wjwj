/**
 * 将动画网格步数映射为面向用户的「已选样本量 / 目标样本量」展示。
 * `steps` 为 `selectionOrder.length`，与 `currentSelectIndex` 同量纲。
 */
export function computeSampleProgressDisplay(
    steps: number,
    currentSelectIndex: number,
    sampleSize: number,
): { current: number; total: number } {
    if (sampleSize <= 0) return { current: 0, total: 0 };
    if (steps === 0) return { current: 0, total: sampleSize };
    const ratio = Math.min(1, currentSelectIndex / steps);
    const current = Math.min(sampleSize, Math.round(ratio * sampleSize));
    return { current, total: sampleSize };
}
