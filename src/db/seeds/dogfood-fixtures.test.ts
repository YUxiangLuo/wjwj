import { describe, expect, test } from "bun:test";
import { buildPopulationNumericStats } from "../../domain/statistics/population";
import { performSystematicSampling } from "../../domain/statistics/sampling";
import { calculateFinitePopulationSampleSize, finitePopulationS2ToSigma2 } from "../../student/experiment/sample-plan";
import {
    computeDiningPlan,
    computeReadingPlan,
    computeYouthHappinessPlan,
    createDiningServicePopulation,
    createGraduateIntentionPopulation,
    createGreenCommutePopulation,
    createMeanPopulation,
    createYouthHappinessPopulation,
    DOGFOOD_NAMES,
} from "./dogfood-fixtures";

function uniqueCount<T>(values: T[]) {
    return new Set(values).size;
}

function mean(values: number[]) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function correlation(left: number[], right: number[]) {
    const leftMean = mean(left);
    const rightMean = mean(right);
    const numerator = left.reduce((sum, value, index) => sum + (value - leftMean) * (right[index]! - rightMean), 0);
    const leftSquares = left.reduce((sum, value) => sum + (value - leftMean) ** 2, 0);
    const rightSquares = right.reduce((sum, value) => sum + (value - rightMean) ** 2, 0);
    return numerator / Math.sqrt(leftSquares * rightSquares);
}

describe("default demo research fixtures", () => {
    test("the catalog contains five distinct, complete teaching topics", () => {
        const topics = [
            DOGFOOD_NAMES.topicA,
            DOGFOOD_NAMES.topicB,
            DOGFOOD_NAMES.topicC,
            DOGFOOD_NAMES.topicD,
            DOGFOOD_NAMES.topicE,
        ];
        expect(uniqueCount(topics)).toBe(5);
        expect(topics[0]).toBe("青年幸福感调查");
        expect(topics.every((name) => !name.includes("设计阶段"))).toBe(true);
    });

    test("youth happiness is deterministic, bounded and varied across a balanced frame", () => {
        const first = createYouthHappinessPopulation();
        const second = createYouthHappinessPopulation();
        expect(first).toEqual(second);
        expect(first).toHaveLength(240);
        expect(uniqueCount(first.map((row) => row.青年代号))).toBe(240);
        expect(new Set(first.map((row) => row.年龄组))).toEqual(new Set(["18—22岁", "23—27岁", "28—35岁"]));
        expect(new Set(first.map((row) => row.居住地类型))).toEqual(new Set(["城区", "县镇", "农村"]));
        expect(first.every((row) => row.生活幸福感得分 >= 0 && row.生活幸福感得分 <= 10)).toBe(true);
        expect(uniqueCount(first.map((row) => row.生活幸福感得分))).toBeGreaterThan(30);
        for (const ageGroup of ["18—22岁", "23—27岁", "28—35岁"]) {
            expect(first.filter((row) => row.年龄组 === ageGroup)).toHaveLength(80);
        }
        const ageMeans = ["18—22岁", "23—27岁", "28—35岁"].map((ageGroup) => (
            mean(first.filter((row) => row.年龄组 === ageGroup).map((row) => row.生活幸福感得分))
        ));
        expect(Math.max(...ageMeans) - Math.min(...ageMeans)).toBeGreaterThan(0.7);
    });

    test("dining frame crosses halls with periods and contains a prior-frame PPS signal", () => {
        const rows = createDiningServicePopulation();
        const hallPeriodPairs = new Set(rows.map((row) => `${row.食堂}|${row.观测时段}`));
        expect(hallPeriodPairs.size).toBe(16);
        for (const hall of ["学苑食堂", "风味食堂", "湖畔食堂", "清真食堂"]) {
            expect(rows.filter((row) => row.食堂 === hall)).toHaveLength(24);
        }
        expect(correlation(rows.map((row) => row.等待分钟), rows.map((row) => row.历史同期客流量))).toBeGreaterThan(0.75);
        expect(rows.every((row) => row.等待分钟 > 0 && row.历史同期客流量 > 0 && row.开放窗口数 > 0)).toBe(true);
    });

    test("green commute exposes both implicit stratification and periodicity risk", () => {
        const rows = createGreenCommutePopulation();
        expect(rows).toHaveLength(360);
        expect(uniqueCount(rows.map((row) => row.通勤记录编号))).toBe(360);
        expect(new Set(rows.slice(0, 120).map((row) => row.住宿片区))).toEqual(new Set(["校内宿舍"]));
        expect(new Set(rows.slice(120, 240).map((row) => row.住宿片区))).toEqual(new Set(["近校社区"]));
        expect(new Set(rows.slice(240).map((row) => row.住宿片区))).toEqual(new Set(["远校社区"]));
        const rate = (area: string) => {
            const group = rows.filter((row) => row.住宿片区 === area);
            return group.filter((row) => row.是否绿色通勤 === "是").length / group.length;
        };
        expect(rate("校内宿舍")).toBeGreaterThan(rate("近校社区"));
        expect(rate("近校社区")).toBeGreaterThan(rate("远校社区"));
        expect(rows.every((row) => row.通勤距离公里 > 0)).toBe(true);

        const sampleSize = calculateFinitePopulationSampleSize({
            confidenceLevel: "95",
            marginOfError: 9,
            populationSize: rows.length,
            designEffect: 1,
            nonResponseRate: 0,
        });
        expect(sampleSize).toBe(90);
        const estimates = [0, 0.25, 0.5, 0.75].map((randomStart) => {
            const sample = performSystematicSampling(rows, sampleSize!, () => randomStart);
            expect(sample.interval).toBe(4);
            expect(uniqueCount(sample.data.map((row) => row.登记时段))).toBe(1);
            return sample.data.filter((row) => row.是否绿色通勤 === "是").length / sample.data.length;
        });
        expect(Math.max(...estimates) - Math.min(...estimates)).toBeGreaterThan(0.3);
    });

    test("all five populations and mean plans stay inside their declared frames", () => {
        const populations = [
            createYouthHappinessPopulation(),
            createMeanPopulation(),
            createGraduateIntentionPopulation(),
            createDiningServicePopulation(),
            createGreenCommutePopulation(),
        ];
        expect(populations.map((rows) => rows.length)).toEqual([240, 24, 160, 96, 360]);
        for (const [plan, populationSize] of [
            [computeYouthHappinessPlan(), 240],
            [computeReadingPlan(), 24],
            [computeDiningPlan(), 96],
        ] as const) {
            expect(plan.populationVariance).toBeGreaterThan(0);
            expect(plan.recommendedSize).toBeGreaterThan(0);
            expect(plan.recommendedSize).toBeLessThanOrEqual(populationSize);
        }

        for (const [population, field, plan] of [
            [createYouthHappinessPopulation(), "生活幸福感得分", computeYouthHappinessPlan()],
            [createMeanPopulation(), "每周阅读时长", computeReadingPlan()],
            [createDiningServicePopulation(), "等待分钟", computeDiningPlan()],
        ] as const) {
            const stats = buildPopulationNumericStats(population, [field])[field]!;
            expect(plan.populationVariance).toBeCloseTo(finitePopulationS2ToSigma2(stats.variance, stats.count)!, 12);
            expect(plan.populationVariance).toBeLessThan(stats.variance);
        }
    });
});
