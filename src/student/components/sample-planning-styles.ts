export const primarySliderClassName =
    "py-2 [&_[data-slot=slider-range]]:!bg-primary [&_[data-slot=slider-track]]:!bg-primary-muted [&_[data-slot=slider-thumb]]:!border-primary [&_[data-slot=slider-thumb]]:!bg-background [&_[data-slot=slider-thumb]]:!ring-ring";

/** 设计效应 1.0 是简单随机基准；只有高于基准才提示。 */
export function designEffectValueTone(designEffect: number) {
    return designEffect > 1 ? "text-warning" : "text-foreground";
}

/** 0% 无回答是默认假设；只有存在无回答才提示。 */
export function nonResponseRateValueTone(rate: number) {
    return rate > 0 ? "text-warning" : "text-foreground";
}
