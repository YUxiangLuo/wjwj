import { buildPopulationNumericStats } from "../../domain/statistics/population";
import { expect, test } from "bun:test";
import {
    allocateIntegerShares,
    computePpsMeanPlan,
    computeReadingPlan,
    createDiningServicePopulation,
    createGraduateIntentionPopulation,
    createMeanPopulation,
    createPpsPopulation,
} from "./dogfood-fixtures";

test("allocateIntegerShares preserves the total with largest remainder", () => {
    expect(allocateIntegerShares(49, [0.4, 0.3, 0.2, 0.1]).reduce((sum, n) => sum + n, 0)).toBe(49);
    expect(allocateIntegerShares(15, [1 / 3, 1 / 3, 1 / 3])).toEqual([5, 5, 5]);
});

test("computePpsMeanPlan matches the student-facing population variance", () => {
    const plan = computePpsMeanPlan();
    expect(plan.recommendedSize).toBe(49);
    // Same convention as buildPopulationNumericStats (÷(N−1)); a different
    // divisor here would make the seeded plan disagree with the planning screen.
    expect(plan.populationVariance).toBeCloseTo(
        buildPopulationNumericStats(createPpsPopulation(), ["每周学习时长"])["每周学习时长"]!.variance,
        9,
    );
});

test("computeReadingPlan matches the student-facing population variance", () => {
    const plan = computeReadingPlan();
    expect(plan.recommendedSize).toBe(9);
    expect(plan.populationVariance).toBeCloseTo(
        buildPopulationNumericStats(createMeanPopulation(), ["每周阅读时长"])["每周阅读时长"]!.variance,
        9,
    );
});

test("the compatibility populations represent proportion and non-person service research", () => {
    const graduate = createGraduateIntentionPopulation();
    expect(graduate).toHaveLength(160);
    expect(new Set(graduate.map((row) => row.毕业去向意向))).toEqual(new Set([
        "直接就业",
        "考研",
        "考公",
        "出国深造",
        "灵活就业",
    ]));
    expect(graduate.every((row) => row.求职准备度 > 0)).toBe(true);

    const dining = createDiningServicePopulation();
    expect(dining).toHaveLength(96);
    expect(new Set(dining.map((row) => row.校区))).toEqual(new Set(["东校区", "西校区"]));
    expect(new Set(dining.map((row) => row.星期))).toEqual(new Set(["周一", "周二", "周三", "周四", "周五"]));
    expect(dining.every((row) => !("是否工作日" in row))).toBe(true);
    expect(dining.every((row) => row.等待分钟 > 0 && row.客流量 > 0)).toBe(true);
});
