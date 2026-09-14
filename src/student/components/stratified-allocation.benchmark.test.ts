import { expect, test } from "bun:test";
import { allocateNeymanSampleCounts, allocateStratifiedSampleCounts } from "./stratified-allocation";

/**
 * ST-S06 独立基准（非对称层规模与层内标准差）。
 *
 * 期望值不调用被测实现生成：
 * - 比例/等额：独立实现「求解 λ 使 Σclamp(λ·w_i, 1, N_i)=n，再做最大余数整数化」；
 * - 奈曼：对 Σ(N_h·S_h)²/n_h 在 1≤n_h≤N_h、Σn_h=n 上**暴力枚举**取最小值。
 * 夹具 F1：N=[60,30,10]，S=[1,8,20]，n=12。
 */
test("ST-S06 proportional keeps raw shares then largest remainder (F1)", () => {
    expect(allocateStratifiedSampleCounts({ targetSampleSize: 12, rawCounts: [60, 30, 10], caps: [60, 30, 10] })).toEqual([7, 4, 1]);
});

test("ST-S06 equal allocation splits evenly with capacity-aware redistribution (F1/F4)", () => {
    expect(allocateStratifiedSampleCounts({ targetSampleSize: 12, rawCounts: [1, 1, 1], caps: [60, 30, 10] })).toEqual([4, 4, 4]);
    // 小层容量上限 2 生效后，剩余 18 个名额全部给未封顶层
    expect(allocateStratifiedSampleCounts({ targetSampleSize: 20, rawCounts: [1, 1], caps: [2, 58] })).toEqual([2, 18]);
});

test("ST-S06 Neyman matches the enumerated integer optimum (F1/F2)", () => {
    const f1 = allocateNeymanSampleCounts({ targetSampleSize: 12, populationCounts: [60, 30, 10], stdDevs: [1, 8, 20] });
    expect(f1).toEqual([1, 6, 5]);
    const variance = (counts: number[]) => counts.reduce((sum, n, index) => sum + (( [60, 30, 10][index]! * [1, 8, 20][index]!) ** 2) / n, 0);
    expect(variance(f1!)).toBeCloseTo(21200, 6);
    // 容量约束：A 层只有 2 个单位，剩余名额按正确目标重分配给 B
    expect(allocateNeymanSampleCounts({ targetSampleSize: 10, populationCounts: [2, 98], stdDevs: [100, 1] })).toEqual([2, 8]);
});

test("ST-S06 proportional lower bound and tiny-stratum cap stay legal (F2/F3)", () => {
    // 原始份额 [0.2, 9.8] → 下限 1 生效
    expect(allocateStratifiedSampleCounts({ targetSampleSize: 10, rawCounts: [2, 98], caps: [2, 98] })).toEqual([1, 9]);
    // 单单位层锁定为 1，其余名额给未封顶层
    expect(allocateStratifiedSampleCounts({ targetSampleSize: 50, rawCounts: [1, 99], caps: [1, 99] })).toEqual([1, 49]);
});
