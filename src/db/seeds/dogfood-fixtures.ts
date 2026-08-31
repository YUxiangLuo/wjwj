import { calculateMeanEstimationSampleSize } from "../../student/experiment/sample-plan";

export const DAY_MS = 24 * 60 * 60 * 1_000;

export const DOGFOOD_NAMES = {
    currentSemester: "2026-2027-1",
    oldSemester: "2025-2026-2",
    mainClass: "统计学一班",
    oldClass: "历史空班",
    topicA: "均值对照（PPS 可用）",
    topicB: "均值-无PPS",
    topicC: "未发布草稿",
    topicD: "已截止",
    topicE: "尚未开放",
    topicF: "软删课题",
    topicG: "软删任务用课题",
    topicH: "比例对照（PPS 可用）",
} as const;

export const DOGFOOD_COUNTS = {
    admin: 1,
    teacher: 3,
    semester: 2,
    class: 2,
    student: 11,
    topic: 8,
    task: 7,
    experiment: 12,
    samplingAttempt: 4,
    announcement: 4,
    topicAttachment: 1,
} as const;

export const PPS_POPULATION_PATH = "/storage/topics/seed-population-pps.xlsx";
export const MEAN_POPULATION_PATH = "/storage/topics/seed-population-mean.csv";
export const GUIDE_ATTACHMENT_PATH = "/storage/uploads/seed-topic-guide.pdf";

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

export function computePpsMeanPlan(population = createPpsPopulation()) {
    const weeklyHours = population.map((row) => Number(row.每周学习时长));
    const mean = weeklyHours.reduce((sum, value) => sum + value, 0) / weeklyHours.length;
    const populationVariance = weeklyHours.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (weeklyHours.length - 1);
    const recommendedSize = calculateMeanEstimationSampleSize({
        confidenceLevel: "95",
        marginOfError: 2,
        populationSize: population.length,
        populationVariance,
        designEffect: 1,
        nonResponseRate: 0,
    });
    if (recommendedSize === null) {
        throw new Error("Dogfood PPS mean sample plan could not be calculated");
    }
    return { recommendedSize, populationVariance };
}

export function createPpsPopulation() {
    const gradePlan = [
        ...Array.from({ length: 80 }, () => "大一"),
        ...Array.from({ length: 60 }, () => "大二"),
        ...Array.from({ length: 40 }, () => "大三"),
        ...Array.from({ length: 20 }, () => "大四"),
    ];
    const majors = ["统计学", "经济学", "管理学", "计算机"];
    return gradePlan.map((年级, index) => ({
        编号: index + 1,
        年级,
        专业: majors[index % majors.length]!,
        性别: index % 2 === 0 ? "男" : "女",
        每周学习时长: 6 + (index % 28),
        月生活费: 800 + (index % 20) * 180,
        学习满意度: 1 + (index % 5),
    }));
}

export function createMeanPopulation() {
    const colleges = ["文学院", "理学院", "商学院"];
    return Array.from({ length: 24 }, (_, index) => ({
        编号: index + 1,
        学院: colleges[index % colleges.length]!,
        年级: `大${index % 4 + 1}`,
        每周阅读时长: index === 0 ? 0 : 2 + (index % 13),
        是否住宿: index % 3 === 0 ? "否" : "是",
    }));
}
