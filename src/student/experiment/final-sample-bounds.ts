/**
 * 最终样本量的基础合法区间：1..N。
 * 这里只做最基本的可执行性校验，不引入课堂/产品规则。
 */
export function getFinalSampleSizeBounds(populationSize: number): { min: number; max: number } {
    const n = Math.max(0, Math.floor(populationSize));
    if (n < 1) {
        return { min: 1, max: Math.max(1, n) };
    }
    return { min: 1, max: n };
}
