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
    secondaryClass: "2026级公共管理班",
    dataScienceClass: "2026级数据科学班",
    historyClass: "2025级统计学2班",
    topicA: "青年幸福感调查",
    topicB: "学生每周阅读时长",
    topicC: "毕业生直接就业意向比例",
    topicD: "食堂午间等待时间",
    topicE: "校园绿色通勤方式占比",
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
    submitted: 0,
    graded: 0,
    rejected: 0,
} as const;

export const HAPPINESS_POPULATION_PATH = "/storage/topics/seed-population-youth-happiness-v3.xlsx";
export const READING_POPULATION_PATH = "/storage/topics/seed-population-reading-hours.csv";
export const EMPLOYMENT_POPULATION_PATH = "/storage/topics/seed-population-employment-intent.csv";
export const DINING_POPULATION_PATH = "/storage/topics/seed-population-dining-wait.csv";
export const GREEN_COMMUTE_POPULATION_PATH = "/storage/topics/seed-population-green-commute.csv";
export const DINING_PPS_SIZE_FIELD = "历史同期客流量";

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
    let remaining = total - shares.reduce((sum, value) => sum + value, 0);
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

export function computeYouthHappinessPlan(population = createYouthHappinessPopulation()) {
    const populationVariance = populationVarianceForPlan(population, "生活幸福感得分");
    const recommendedSize = calculateMeanEstimationSampleSize({
        confidenceLevel: "95",
        marginOfError: 0.5,
        populationSize: population.length,
        populationVariance,
        designEffect: 1,
        nonResponseRate: 0,
    });
    if (recommendedSize === null) {
        throw new Error("Youth happiness sample plan could not be calculated");
    }
    return { recommendedSize, populationVariance };
}

/**
 * Reading scenario plan derived from the generated population, so the stored
 * fixture and the live planning UI cannot disagree about the variance.
 */
export function computeReadingPlan(population = createMeanPopulation()) {
    const populationVariance = populationVarianceForPlan(population, "每周阅读时长");
    const recommendedSize = calculateMeanEstimationSampleSize({
        confidenceLevel: "95",
        marginOfError: 2,
        populationSize: population.length,
        populationVariance,
        designEffect: 1,
        nonResponseRate: 0,
    });
    if (recommendedSize === null) {
        throw new Error("Reading scenario sample plan could not be calculated");
    }
    return { recommendedSize, populationVariance };
}

export function computeDiningPlan(population = createDiningServicePopulation()) {
    const populationVariance = populationVarianceForPlan(population, "等待分钟");
    const recommendedSize = calculateMeanEstimationSampleSize({
        confidenceLevel: "95",
        marginOfError: 2,
        populationSize: population.length,
        populationVariance,
        designEffect: 1,
        nonResponseRate: 0,
    });
    if (recommendedSize === null) {
        throw new Error("Dining service sample plan could not be calculated");
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

export function createYouthHappinessPopulation() {
    const ageGroups = ["18—22岁", "23—27岁", "28—35岁"];
    const residenceTypes = ["城区", "县镇", "农村"];
    const employmentStatuses = ["在校学习", "稳定就业", "灵活就业", "求职或待业"];
    return Array.from({ length: 240 }, (_, index) => {
        const ageIndex = index < 96 ? 0 : index < 180 ? 1 : 2;
        const ageGroup = ageGroups[ageIndex]!;
        const age = [18, 23, 28][ageIndex]! + Math.floor(fixtureNoise(index, 8) * [5, 5, 8][ageIndex]!);
        const residenceIndex = (index * 17) % 240 < 132 ? 0 : (index * 17) % 240 < 204 ? 1 : 2;
        const residenceType = residenceTypes[residenceIndex]!;
        const community = [["青禾社区", "云溪社区", "新桥社区"], ["文景社区", "朝阳社区", "河畔社区"], ["溪口村", "田园村", "林下村"]][residenceIndex]![Math.floor(fixtureNoise(index, 9) * 3)]!;
        const statusNoise = fixtureNoise(index, 10);
        const thresholds = ageIndex === 0 ? [0.68, 0.84, 0.94] : ageIndex === 1 ? [0.12, 0.69, 0.88] : [0.02, 0.74, 0.93];
        const employmentStatus = employmentStatuses[statusNoise < thresholds[0]! ? 0 : statusNoise < thresholds[1]! ? 1 : statusNoise < thresholds[2]! ? 2 : 3]!;
        const housingNoise = fixtureNoise(index, 11);
        const housing = employmentStatus === "在校学习" && housingNoise < 0.7 ? "学校或单位宿舍"
            : residenceType === "农村" || housingNoise < 0.45 ? "与家人同住" : housingNoise < 0.7 ? "与他人合租" : "独居";
        const socialSupport = 1 + Math.floor(fixtureNoise(index, 1) * 5);
        const health = 1 + Math.floor(fixtureNoise(index, 2) * 5);
        const pressure = 1 + Math.floor(fixtureNoise(index, 3) * 5);
        // Deliberately create a visible between-stratum signal for the required
        // age-stratified exercise. These are synthetic teaching effects, not claims
        // about real age groups.
        const ageAdjustment = ageGroup === "18—22岁" ? -0.45 : ageGroup === "28—35岁" ? 0.45 : 0;
        const employmentAdjustment = employmentStatus === "稳定就业" ? 0.35 : employmentStatus === "求职或待业" ? -0.55 : 0;
        const happiness = clamp(
            4.2 + socialSupport * 0.55 + health * 0.45 - pressure * 0.38 + ageAdjustment + employmentAdjustment + (fixtureNoise(index, 4) - 0.5) * 2.2,
            0,
            10,
        );
        return {
            青年代号: `Y${String(index + 1).padStart(3, "0")}`,
            年龄: age,
            年龄组: ageGroup,
            居住社区: community,
            居住地类型: residenceType,
            居住方式: housing,
            当前状态: employmentStatus,
            生活幸福感得分: Number(happiness.toFixed(1)),
            社会支持感: socialSupport,
            自评健康: health,
            经济压力: pressure,
            每晚睡眠时长: Number(clamp(7.8 - pressure * 0.2 + (fixtureNoise(index, 12) - 0.5) * 2.4, 4, 10).toFixed(1)),
            每周休闲时长: index % 29 === 0 ? 0 : Number((2 + fixtureNoise(index, 13) * 18).toFixed(1)),
            社区服务满意度: index % 11 === 0 ? null : 1 + Math.floor(fixtureNoise(index, 14) * 5),
        };
    });
}

export function createMeanPopulation() {
    const colleges = ["文学院", "理学院", "商学院"];
    return Array.from({ length: 24 }, (_, index) => ({
        编号: index + 1,
        学院: colleges[index % colleges.length]!,
        年级: `大${Math.floor(index / colleges.length) % 4 + 1}`,
        每周阅读时长: index === 0 ? 0 : 2 + (index % 13),
        是否住宿: Math.floor(index / colleges.length) % 2 === 0 ? "否" : "是",
    }));
}

export function createGraduateIntentionPopulation() {
    const colleges = ["文学院", "理学院", "商学院", "工学院"];
    const intentionProfiles = [
        [14, 10, 6, 5, 5],
        [15, 11, 7, 4, 3],
        [20, 6, 6, 4, 4],
        [16, 10, 5, 4, 5],
    ];
    const intentionNames = ["直接就业", "考研", "考公", "出国深造", "灵活就业"];
    return Array.from({ length: 160 }, (_, index) => {
        const collegeIndex = index % colleges.length;
        const withinCollege = Math.floor(index / colleges.length);
        // Multiplication by 17 permutes all 40 positions (17 and 40 are
        // coprime), preserving each college's profile without long blocks.
        const profilePosition = (withinCollege * 17 + collegeIndex * 7) % 40;
        const profile = intentionProfiles[collegeIndex]!;
        let cumulative = 0;
        const intentionIndex = profile.findIndex((count) => {
            cumulative += count;
            return profilePosition < cumulative;
        });
        return {
            样本编号: `G${String(index + 1).padStart(3, "0")}`,
            学院: colleges[collegeIndex]!,
            培养层次: (withinCollege + collegeIndex * 2) % 5 === 0 ? "专业学位" : "学术学位",
            毕业去向意向: intentionNames[intentionIndex]!,
            是否有实习经历: (withinCollege * 2 + collegeIndex) % 3 === 0 ? "否" : "是",
            每周职业准备时长: 2 + (index * 3) % 19,
            求职准备度: 35 + (index * 7) % 66,
        };
    });
}

export function createDiningServicePopulation() {
    const campuses = ["东校区", "西校区"];
    const diningHalls = [["学苑食堂", "风味食堂"], ["湖畔食堂", "清真食堂"]];
    const periods = ["11:30-11:45", "11:45-12:00", "12:00-12:15", "12:15-12:30"];
    const observationDays = ["第一周周一", "第一周周二", "第一周周三", "第二周周一", "第二周周二", "第二周周三"];
    const periodTraffic = [70, 125, 175, 115];
    return Array.from({ length: 96 }, (_, index) => {
        const campusIndex = Math.floor(index / 48);
        const withinCampus = index % 48;
        const diningHallIndex = Math.floor(withinCampus / 24);
        const withinDiningHall = withinCampus % 24;
        const periodIndex = Math.floor(withinDiningHall / observationDays.length);
        const dayIndex = withinDiningHall % observationDays.length;
        const historicalTraffic = Math.round(
            periodTraffic[periodIndex]!
            + campusIndex * 8
            + diningHallIndex * 10
            + (fixtureNoise(index, 11) - 0.5) * 26,
        );
        const openWindows = 3 + ((dayIndex * 3 + diningHallIndex + campusIndex) % 5);
        const wait = clamp(
            1.8 + historicalTraffic * 0.1 - openWindows * 0.8 + periodIndex * 0.5 + (fixtureNoise(index, 12) - 0.5) * 2.4,
            1,
            25,
        );
        return {
            记录编号: `D${String(index + 1).padStart(3, "0")}`,
            校区: campuses[campusIndex]!,
            食堂: diningHalls[campusIndex]![diningHallIndex]!,
            观测时段: periods[periodIndex]!,
            观测日: observationDays[dayIndex]!,
            等待分钟: Number(wait.toFixed(1)),
            历史同期客流量: historicalTraffic,
            开放窗口数: openWindows,
        };
    });
}

export function createGreenCommutePopulation() {
    const residenceAreas = ["校内宿舍", "近校社区", "远校社区"];
    const grades = ["大一", "大二", "大三", "大四"];
    const registrationPeriods = ["07:00前", "07:00—08:00", "08:00—09:00", "09:00后"];
    return Array.from({ length: 360 }, (_, index) => {
        // The frame is grouped by residence area and repeats four registration
        // periods inside every group. With the documented n=90, K=4, each
        // random start locks onto one period and exposes systematic periodicity.
        const area = residenceAreas[Math.floor(index / 120)]!;
        const registrationPeriod = registrationPeriods[index % registrationPeriods.length]!;
        const areaBaseline = area === "校内宿舍" ? 0.82 : area === "近校社区" ? 0.67 : 0.5;
        const periodAdjustment = registrationPeriod === "07:00前" ? 0.18
            : registrationPeriod === "07:00—08:00" ? 0.06
                : registrationPeriod === "08:00—09:00" ? -0.08
                    : -0.2;
        const greenProbability = clamp(areaBaseline + periodAdjustment, 0.05, 0.95);
        const green = fixtureNoise(index, 21) < greenProbability;
        const greenModes = ["步行", "自行车", "公共交通"];
        return {
            通勤记录编号: `C${String(index + 1).padStart(3, "0")}`,
            住宿片区: area,
            登记时段: registrationPeriod,
            年级: grades[Math.floor(index / registrationPeriods.length) % grades.length]!,
            是否绿色通勤: green ? "是" : "否",
            主要通勤方式: green ? greenModes[index % greenModes.length]! : "网约车或私家车",
            通勤距离公里: Number(((area === "校内宿舍" ? 0.3 : area === "近校社区" ? 2 : 7) + fixtureNoise(index, 22) * 4).toFixed(1)),
        };
    });
}
