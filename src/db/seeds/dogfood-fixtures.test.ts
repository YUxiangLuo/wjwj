import { describe, expect, test } from "bun:test";
import { buildPopulationNumericStats } from "../../domain/statistics/population";
import { performSystematicSampling } from "../../domain/statistics/sampling";
import { calculateFinitePopulationSampleSize, finitePopulationS2ToSigma2 } from "../../student/experiment/sample-plan";
import {
    computeFreshFulfillmentPlan,
    computeSaasBudgetPlan,
    computeTeaPricingPlan,
    createFreshFulfillmentPopulation,
    createNevTestDrivePopulation,
    createSaasBudgetPopulation,
    createTeaPricingPopulation,
    createVipRenewalPopulation,
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

describe("business statistics demo research fixtures", () => {
    test("the catalog contains five distinct business statistics cases", () => {
        const topics = [
            DOGFOOD_NAMES.topicA,
            DOGFOOD_NAMES.topicB,
            DOGFOOD_NAMES.topicC,
            DOGFOOD_NAMES.topicD,
            DOGFOOD_NAMES.topicE,
        ];
        expect(uniqueCount(topics)).toBe(5);
        expect(topics[0]).toBe("新锐现制茶饮新品定价与支付意愿调研");
    });

    test("tea pricing flagship case is deterministic, bounded and varied across unequal member-tier strata", () => {
        const first = createTeaPricingPopulation();
        const second = createTeaPricingPopulation();
        expect(first).toEqual(second);
        expect(first).toHaveLength(240);
        expect(uniqueCount(first.map((row) => row.会员编号))).toBe(240);
        expect(new Set(first.map((row) => row.会员等级))).toEqual(new Set(["普通会员", "银卡会员", "黑金会员"]));
        expect(new Set(first.map((row) => row.城市线级))).toEqual(new Set(["一线城市", "新一线城市", "二线城市"]));
        expect(first.every((row) => row.最高支付意愿 >= 10 && row.最高支付意愿 <= 32)).toBe(true);
        expect(uniqueCount(first.map((row) => row.最高支付意愿))).toBeGreaterThan(30);
        for (const [tier, count] of [["普通会员", 96], ["银卡会员", 84], ["黑金会员", 60]] as const) {
            expect(first.filter((row) => row.会员等级 === tier)).toHaveLength(count);
        }
        expect(new Set(first.map((row) => row.常购门店商圈)).size).toBe(9);
        expect(first.some((row) => row.近一月领券核销次数 === 0)).toBe(true);
        expect(first.some((row) => row.门店小程序体验评分 === null)).toBe(true);
        const tierMeans = ["普通会员", "银卡会员", "黑金会员"].map((tier) => (
            mean(first.filter((row) => row.会员等级 === tier).map((row) => row.最高支付意愿))
        ));
        expect(Math.max(...tierMeans) - Math.min(...tierMeans)).toBeGreaterThan(5);
    });

    test("fresh fulfillment frame crosses warehouses with peak slots and contains a strong PPS size signal", () => {
        const rows = createFreshFulfillmentPopulation();
        const pairs = new Set(rows.map((row) => `${row.前置仓门店}|${row.晚高峰时段}`));
        expect(pairs.size).toBe(16);
        for (const wh of ["陆家嘴仓", "张江仓", "静安仓", "徐汇仓"]) {
            expect(rows.filter((row) => row.前置仓门店 === wh)).toHaveLength(24);
        }
        expect(correlation(rows.map((row) => row.平均履约等待时长), rows.map((row) => row.历史日均客单量))).toBeGreaterThan(0.75);
        expect(rows.every((row) => row.平均履约等待时长 > 0 && row.历史日均客单量 > 0 && row.当班拣货员人数 > 0)).toBe(true);
    });

    test("SaaS budget small population crosses industries with scale bands and preserves valid zero budgets", () => {
        const rows = createSaasBudgetPopulation();
        expect(rows).toHaveLength(32);
        expect(rows.some((row) => row.年度增购预算 === 0)).toBe(true);
        for (const industry of ["智能制造", "连锁零售", "现代物流", "金融科技"]) {
            const group = rows.filter((row) => row.所属行业 === industry);
            expect(group).toHaveLength(8);
            expect(group.filter((row) => row.是否部署私有云 === "是")).toHaveLength(4);
            expect(group.filter((row) => row.是否部署私有云 === "否")).toHaveLength(4);
        }
    });

    test("VIP renewal population exhibits strong heterogeneity across activity strata", () => {
        const rows = createVipRenewalPopulation();
        expect(rows).toHaveLength(200);
        const rates = ["高频活跃", "中频稳定", "低频沉默", "濒临流失"].map((tier) => {
            const sub = rows.filter((row) => row.近半年活跃度 === tier);
            expect(sub).toHaveLength(50);
            return sub.filter((row) => row.续费意向 === "明确续费").length / sub.length;
        });
        expect(rates[0]!).toBeGreaterThan(rates[1]!);
        expect(rates[1]!).toBeGreaterThan(rates[2]!);
        expect(rates[2]!).toBeGreaterThan(rates[3]!);
    });

    test("NEV test-drive frame exposes both store-level implicit stratification and K=4 arrival periodicity", () => {
        const rows = createNevTestDrivePopulation();
        expect(rows).toHaveLength(360);
        expect(uniqueCount(rows.map((row) => row.试驾编号))).toBe(360);
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
            expect(uniqueCount(sample.data.map((row) => row.到店时段周期))).toBe(1);
            return sample.data.filter((row) => row.是否高意向锁单 === "是").length / sample.data.length;
        });
        expect(Math.max(...estimates) - Math.min(...estimates)).toBeGreaterThan(0.25);
    });

    test("all five populations and mean plans stay inside their declared frames", () => {
        const populations = [
            createTeaPricingPopulation(),
            createSaasBudgetPopulation(),
            createVipRenewalPopulation(),
            createFreshFulfillmentPopulation(),
            createNevTestDrivePopulation(),
        ];
        expect(populations.map((rows) => rows.length)).toEqual([240, 32, 200, 96, 360]);
        for (const [population, field, plan] of [
            [createTeaPricingPopulation(), "最高支付意愿", computeTeaPricingPlan()],
            [createSaasBudgetPopulation(), "年度增购预算", computeSaasBudgetPlan()],
            [createFreshFulfillmentPopulation(), "平均履约等待时长", computeFreshFulfillmentPlan()],
        ] as const) {
            const stats = buildPopulationNumericStats(population, [field])[field]!;
            expect(plan.populationVariance).toBeCloseTo(finitePopulationS2ToSigma2(stats.variance, stats.count)!, 12);
            expect(plan.recommendedSize).toBeGreaterThan(0);
            expect(plan.recommendedSize).toBeLessThanOrEqual(population.length);
        }
    });
});
