import { buildPopulationNumericStats } from "../../domain/statistics/population";
import { calculateMeanEstimationSampleSize, finitePopulationS2ToSigma2 } from "../../student/experiment/sample-plan";
import { DEMO_CLASS_NAME } from "./seed-identity";

export { DOGFOOD_ANCHORS, DOGFOOD_ROSTER, DOGFOOD_TEACHERS } from "./seed-identity";

export const DAY_MS = 24 * 60 * 60 * 1_000;

export const DOGFOOD_NAMES = {
    currentSemester: "2026-2027-1",
    previousSemester: "2025-2026-2",
    oldSemester: "2025-2026-1",
    mainClass: DEMO_CLASS_NAME,
    secondaryClass: "2026级商业分析班",
    dataScienceClass: "2026级数据科学班",
    historyClass: "2025级商务统计2班",
    topicA: "新锐现制茶饮新品定价与支付意愿调研",
    topicB: "B2B企业SaaS重点客户年度增购预算调研",
    topicC: "综合电商平台付费会员年度续费率调研",
    topicD: "连锁生鲜超市晚高峰门店履约容量调研",
    topicE: "智能新能源汽车门店试驾潜客转化调研",
} as const;

export const DOGFOOD_COUNTS = {
    admin: 1,
    teacher: 3,
    semester: 3,
    class: 4,
    student: 20,
    topic: 5,
    task: 8,
    experiment: 9,
    samplingAttempt: 10,
    announcement: 5,
    topicAttachment: 2,
} as const;

export const DOGFOOD_MAIN_TASK_PROGRESS = {
    not_started: 10,
    stage1: 0,
    stage2: 0,
    stage3: 0,
    stage4: 0,
    stage5: 0,
    submitted: 0,
    graded: 0,
    rejected: 0,
} as const;

export const HAPPINESS_POPULATION_PATH = "/storage/topics/seed-population-tea-pricing-v1.xlsx";
export const READING_POPULATION_PATH = "/storage/topics/seed-population-saas-budget-v1.csv";
export const EMPLOYMENT_POPULATION_PATH = "/storage/topics/seed-population-vip-renewal-v1.csv";
export const DINING_POPULATION_PATH = "/storage/topics/seed-population-fresh-fulfillment-v1.csv";
export const GREEN_COMMUTE_POPULATION_PATH = "/storage/topics/seed-population-nev-testdrive-v1.csv";
export const DINING_PPS_SIZE_FIELD = "历史日均客单量";

export const GUIDE_ATTACHMENT_PATH = "/storage/uploads/seed-topic-guide.pdf";
export const QUESTIONNAIRE_TEMPLATE_ATTACHMENT_PATH = "/storage/uploads/seed-questionnaire-template.docx";

export function resolveSeedAnchor(raw: string | undefined) {
    if (!raw?.trim()) return new Date();
    const value = raw.trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
    const parsed = new Date(value);
    const [, year, month, day, hour, minute, second] = match ?? [];
    const calendarDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    const validCalendarDate = match
        && calendarDate.getUTCFullYear() === Number(year)
        && calendarDate.getUTCMonth() === Number(month) - 1
        && calendarDate.getUTCDate() === Number(day)
        && Number(hour) <= 23
        && Number(minute) <= 59
        && Number(second) <= 59;
    if (!validCalendarDate || !Number.isFinite(parsed.getTime())) {
        throw new Error(`Invalid SEED_NOW value: ${JSON.stringify(value)}. Expected an ISO date-time with timezone.`);
    }
    return parsed;
}

export function shiftDays(anchor: Date, days: number) {
    return new Date(anchor.getTime() + days * DAY_MS);
}

export function allocateIntegerShares(total: number, ratios: readonly number[]): number[] {
    if (!Number.isInteger(total) || total < 0) {
        throw new Error("allocateIntegerShares total must be a non-negative integer");
    }
    if (ratios.length === 0) return [];
    const weightSum = ratios.reduce((sum, ratio) => sum + ratio, 0);
    if (!(weightSum > 0)) {
        throw new Error("allocateIntegerShares ratios must sum to a positive number");
    }
    const raw = ratios.map((ratio) => (ratio / weightSum) * total);
    const shares = raw.map((value) => Math.floor(value));
    const remaining = total - shares.reduce((sum, value) => sum + value, 0);
    const order = raw
        .map((value, index) => ({ index, frac: value - Math.floor(value) }))
        .sort((a, b) => b.frac - a.frac || a.index - b.index);
    for (let i = 0; i < remaining; i += 1) {
        const slot = order[i % order.length];
        if (!slot) break;
        shares[slot.index] = (shares[slot.index] ?? 0) + 1;
    }
    return shares;
}

function populationVarianceForPlan(population: Array<Record<string, unknown>>, field: string) {
    const stats = buildPopulationNumericStats(population, [field])[field];
    const variance = stats && finitePopulationS2ToSigma2(stats.variance, stats.count);
    if (variance === null || variance === undefined) {
        throw new Error(`Population variance could not be calculated for ${field}`);
    }
    return variance;
}

export function computeTeaPricingPlan(population = createTeaPricingPopulation()) {
    const populationVariance = populationVarianceForPlan(population, "最高支付意愿");
    const recommendedSize = calculateMeanEstimationSampleSize({
        confidenceLevel: "95",
        marginOfError: 1.0,
        populationSize: population.length,
        populationVariance,
        designEffect: 1,
        nonResponseRate: 0.15,
    });
    if (recommendedSize === null) {
        throw new Error("Tea pricing sample plan could not be calculated");
    }
    return { recommendedSize, populationVariance };
}

export function computeSaasBudgetPlan(population = createSaasBudgetPopulation()) {
    const populationVariance = populationVarianceForPlan(population, "年度增购预算");
    const recommendedSize = calculateMeanEstimationSampleSize({
        confidenceLevel: "95",
        marginOfError: 3,
        populationSize: population.length,
        populationVariance,
        designEffect: 1,
        nonResponseRate: 0.15,
    });
    if (recommendedSize === null) {
        throw new Error("SaaS budget sample plan could not be calculated");
    }
    return { recommendedSize, populationVariance };
}

export function computeFreshFulfillmentPlan(population = createFreshFulfillmentPopulation()) {
    const populationVariance = populationVarianceForPlan(population, "平均履约等待时长");
    const recommendedSize = calculateMeanEstimationSampleSize({
        confidenceLevel: "95",
        marginOfError: 2,
        populationSize: population.length,
        populationVariance,
        designEffect: 1,
        nonResponseRate: 0.15,
    });
    if (recommendedSize === null) {
        throw new Error("Fresh fulfillment sample plan could not be calculated");
    }
    return { recommendedSize, populationVariance };
}

function fixtureNoise(index: number, salt: number) {
    let value = (Math.imul(index + 1, 2_654_435_761) ^ Math.imul(salt, 1_597_334_677)) >>> 0;
    value = Math.imul(value ^ (value >>> 16), 2_246_822_507) >>> 0;
    return ((value ^ (value >>> 13)) >>> 0) / 4_294_967_296;
}

function clamp(value: number, minimum: number, maximum: number) {
    return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Case A (N=240): 新锐现制茶饮新品定价与支付意愿调研
 * Unequal member-tier strata (96 / 84 / 60) with distinct WTP means, valid 0 coupon count,
 * and 22 null mini-program ratings for non-users.
 */
export function createTeaPricingPopulation() {
    const memberTiers = ["普通会员", "银卡会员", "黑金会员"];
    const cityTiers = ["一线城市", "新一线城市", "二线城市"];
    const freqBands = ["低频尝鲜(1-2杯)", "中频复购(3-5杯)", "高频重度(6杯以上)"];
    const storeGroups = [
        ["CBD写字楼店", "核心商场店", "科技园区店"],
        ["高校街区店", "文旅步行街店", "创意园区店"],
        ["社区邻里店", "交通枢纽店", "夜间市集店"],
    ];
    const scenes = ["工作日下午茶", "周末社交聚会", "通勤随手买", "外卖拼单"];

    return Array.from({ length: 240 }, (_, index) => {
        const tierIndex = index < 96 ? 0 : index < 180 ? 1 : 2;
        const memberTier = memberTiers[tierIndex]!;
        const age = [18, 23, 27][tierIndex]! + Math.floor(fixtureNoise(index, 8) * [7, 8, 14][tierIndex]!);
        const cityIndex = (index * 17) % 240 < 108 ? 0 : (index * 17) % 240 < 192 ? 1 : 2;
        const cityTier = cityTiers[cityIndex]!;
        const store = storeGroups[cityIndex]![Math.floor(fixtureNoise(index, 9) * 3)]!;

        const freqNoise = fixtureNoise(index, 10);
        const freqThresholds = tierIndex === 0 ? [0.65, 0.92] : tierIndex === 1 ? [0.22, 0.78] : [0.05, 0.38];
        const freqBand = freqBands[freqNoise < freqThresholds[0]! ? 0 : freqNoise < freqThresholds[1]! ? 1 : 2]!;

        const sceneNoise = fixtureNoise(index, 11);
        const scene = scenes[Math.floor(sceneNoise * scenes.length)]!;

        const healthFocus = 1 + Math.floor(fixtureNoise(index, 1) * 5);
        const novelty = 1 + Math.floor(fixtureNoise(index, 2) * 5);
        const priceSensitivity = clamp(
            5 - tierIndex - Math.floor(fixtureNoise(index, 3) * 3),
            1,
            5,
        );

        const tierBase = tierIndex === 0 ? 15.2 : tierIndex === 1 ? 19.4 : 24.6;
        const cityAdj = cityIndex === 0 ? 1.4 : cityIndex === 1 ? 0.5 : -0.8;
        const wtp = clamp(
            tierBase + cityAdj + healthFocus * 0.55 + novelty * 0.45 - priceSensitivity * 0.65 + (fixtureNoise(index, 4) - 0.5) * 3.2,
            10,
            32,
        );

        const monthlySpend = Number(clamp(
            (tierIndex === 0 ? 42 : tierIndex === 1 ? 98 : 185) + novelty * 9 + (fixtureNoise(index, 12) - 0.5) * 45,
            18,
            360,
        ).toFixed(1));

        return {
            会员编号: `M${String(index + 1).padStart(3, "0")}`,
            年龄: age,
            会员等级: memberTier,
            常购门店商圈: store,
            城市线级: cityTier,
            消费场景偏好: scene,
            月均购茶频次档位: freqBand,
            最高支付意愿: Number(wtp.toFixed(1)),
            健康低糖关注度: healthFocus,
            新品尝鲜意愿: novelty,
            价格敏感度: priceSensitivity,
            月均茶饮消费额: monthlySpend,
            近一月领券核销次数: index % 29 === 0 ? 0 : Math.floor(1 + fixtureNoise(index, 13) * 9),
            门店小程序体验评分: index % 11 === 0 ? null : 1 + Math.floor(fixtureNoise(index, 14) * 5),
        };
    });
}

/**
 * Case B (N=32): B2B企业SaaS重点客户年度增购预算调研
 * Small finite population (FPC critical) + valid 0 budget boundary + no positive PPS size column.
 */
export function createSaasBudgetPopulation() {
    const industries = ["智能制造", "连锁零售", "现代物流", "金融科技"];
    return Array.from({ length: 32 }, (_, index) => {
        const industry = industries[index % industries.length]!;
        const withinIndustry = Math.floor(index / industries.length); // 0..7
        const scaleBand = withinIndustry % 2 === 0 ? "中型成长企业" : "大型集团企业";
        const privateCloud = withinIndustry < 4 ? "否" : "是";
        const rawBudget = index % 8 === 0
            ? 0
            : Math.round((scaleBand === "大型集团企业" ? 26 : 12) + (index % 7) * 3.5 + (industry === "金融科技" ? 6 : 0));
        return {
            客户编号: `KA${String(index + 1).padStart(2, "0")}`,
            所属行业: industry,
            企业规模档位: scaleBand,
            年度增购预算: rawBudget,
            是否部署私有云: privateCloud,
        };
    });
}

/**
 * Case C (N=200): 综合电商平台付费会员年度续费率调研
 * Proportion target ("明确续费") with strong between-stratum differences across 4 activity tiers.
 */
export function createVipRenewalPopulation() {
    const activityTiers = ["高频活跃", "中频稳定", "低频沉默", "濒临流失"];
    const profiles = [
        [38, 8, 4],  // 高频活跃: 76% 明确续费
        [27, 14, 9], // 中频稳定: 54% 明确续费
        [15, 17, 18], // 低频沉默: 30% 明确续费
        [8, 12, 30],  // 濒临流失: 16% 明确续费
    ];
    const intentions = ["明确续费", "观望比价", "暂不续费"];

    return Array.from({ length: 200 }, (_, index) => {
        const tierIdx = index % activityTiers.length;
        const withinTier = Math.floor(index / activityTiers.length); // 0..49
        const pos = (withinTier * 17 + tierIdx * 7) % 50;
        const profile = profiles[tierIdx]!;
        let cum = 0;
        const intentIdx = profile.findIndex((cnt) => {
            cum += cnt;
            return pos < cum;
        });
        return {
            会员账号编码: `VIP${String(index + 1).padStart(3, "0")}`,
            近半年活跃度: activityTiers[tierIdx]!,
            城市线级: (withinTier + tierIdx) % 3 === 0 ? "三四线及以下" : "一二线城市",
            续费意向: intentions[intentIdx]!,
            是否开通自动续费: (withinTier * 2 + tierIdx) % 3 === 0 ? "否" : "是",
            近半年省下运费金额: 24 + ((index * 11) % 260),
            会员权益使用率: 15 + (3 - tierIdx) * 18 + (index % 19),
        };
    });
}

/**
 * Case D (N=96): 连锁生鲜超市晚高峰门店履约容量调研
 * Non-person operational slot unit + strong PPS size measure (`历史日均客单量`, r > 0.78).
 */
export function createFreshFulfillmentPopulation() {
    const regions = ["浦东运营区", "浦西运营区"];
    const warehouses = [["陆家嘴仓", "张江仓"], ["静安仓", "徐汇仓"]];
    const slots = ["17:30-17:45", "17:45-18:00", "18:00-18:15", "18:15-18:30"];
    const dayTypes = ["周二常态日", "周四促销日", "周五晚高峰", "周六家庭采购", "周日晚高峰", "周一补货日"];
    const slotBaseOrders = [85, 145, 210, 135];

    return Array.from({ length: 96 }, (_, index) => {
        const regionIdx = Math.floor(index / 48);
        const withinRegion = index % 48;
        const whIdx = Math.floor(withinRegion / 24);
        const withinWh = withinRegion % 24;
        const slotIdx = Math.floor(withinWh / dayTypes.length);
        const dayIdx = withinWh % dayTypes.length;

        const historicalOrders = Math.round(
            slotBaseOrders[slotIdx]!
            + regionIdx * 12
            + whIdx * 14
            + (fixtureNoise(index, 11) - 0.5) * 28,
        );
        const pickers = 4 + ((dayIdx * 3 + whIdx + regionIdx) % 5);
        const waitMinutes = clamp(
            2.2 + historicalOrders * 0.095 - pickers * 0.75 + slotIdx * 0.5 + (fixtureNoise(index, 12) - 0.5) * 2.2,
            2,
            28,
        );

        return {
            时段记录编号: `WH${String(index + 1).padStart(3, "0")}`,
            运营大区: regions[regionIdx]!,
            前置仓门店: warehouses[regionIdx]![whIdx]!,
            晚高峰时段: slots[slotIdx]!,
            观测日期档位: dayTypes[dayIdx]!,
            平均履约等待时长: Number(waitMinutes.toFixed(1)),
            历史日均客单量: historicalOrders,
            当班拣货员人数: pickers,
        };
    });
}

/**
 * Case E (N=360): 智能新能源汽车门店试驾潜客转化调研
 * Grouped by 3 store levels and cycling through 4 arrival slots (with n=90 -> K=4 periodic resonance!).
 */
export function createNevTestDrivePopulation() {
    const storeLevels = ["旗舰体验中心", "商超展示店", "城郊交付中心"];
    const budgetBands = ["20万以内", "20-30万", "30-40万", "40万以上"];
    const arrivalPeriods = ["周末黄金档", "工作日上午", "工作日下午", "晚间散客档"];
    const sellingPoints = ["智驾辅助", "续航补能", "座舱空间", "金融置换政策"];

    return Array.from({ length: 360 }, (_, index) => {
        const storeLevel = storeLevels[Math.floor(index / 120)]!;
        const arrivalPeriod = arrivalPeriods[index % arrivalPeriods.length]!;
        const storeBase = storeLevel === "旗舰体验中心" ? 0.68 : storeLevel === "城郊交付中心" ? 0.54 : 0.38;
        const periodAdj = arrivalPeriod === "周末黄金档"
            ? 0.22
            : arrivalPeriod === "工作日下午"
                ? 0.05
                : arrivalPeriod === "工作日上午"
                    ? -0.09
                    : -0.22;
        const lockProb = clamp(storeBase + periodAdj, 0.06, 0.94);
        const highIntent = fixtureNoise(index, 21) < lockProb;

        return {
            试驾编号: `TD${String(index + 1).padStart(3, "0")}`,
            门店能级: storeLevel,
            到店时段周期: arrivalPeriod,
            购车预算档位: budgetBands[Math.floor(index / arrivalPeriods.length) % budgetBands.length]!,
            是否高意向锁单: highIntent ? "是" : "否",
            重点关注卖点: sellingPoints[index % sellingPoints.length]!,
            试驾里程公里: Number(((storeLevel === "城郊交付中心" ? 9.5 : storeLevel === "旗舰体验中心" ? 6.2 : 3.5) + fixtureNoise(index, 22) * 4.5).toFixed(1)),
        };
    });
}

// Compatibility aliases
export const computeYouthHappinessPlan = computeTeaPricingPlan;
export const computeReadingPlan = computeSaasBudgetPlan;
export const computeDiningPlan = computeFreshFulfillmentPlan;
export const createYouthHappinessPopulation = createTeaPricingPopulation;
export const createMeanPopulation = createSaasBudgetPopulation;
export const createGraduateIntentionPopulation = createVipRenewalPopulation;
export const createDiningServicePopulation = createFreshFulfillmentPopulation;
export const createGreenCommutePopulation = createNevTestDrivePopulation;
