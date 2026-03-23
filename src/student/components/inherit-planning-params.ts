/**
 * 父级样本量规划中的 nonResponseRate（小数 0～1）→ 子组件表单中的整数百分比 0～50（与决策面板一致）
 */
export function nonResponseDecimalToFormPercent(rate: number | undefined): number {
    if (rate == null || !Number.isFinite(rate)) return 0;
    return Math.min(50, Math.max(0, Math.round(rate * 100)));
}

function clampDesignEffectForAdvancedForm(d: number | undefined, fallback = 1): number {
    const v = d ?? fallback;
    if (!Number.isFinite(v)) return fallback;
    return Math.min(5, Math.max(0.5, v));
}

/** CV/整群等高级工具内设计效应输入框的初始值，与决策面板 deff 对齐 */
export function initialDesignEffectFromParent(d: number | undefined): number {
    return clampDesignEffectForAdvancedForm(d, 1);
}
