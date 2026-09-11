import { calculateMeanEstimationSampleSize } from "../../student/experiment/sample-plan";
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
    topicA: "本科生每周学习时长",
    topicB: "学生每周阅读时长",
    topicC: "毕业生直接就业意向比例",
    topicD: "食堂午间等待时间",
    topicE: "新生数字素养调查（设计阶段）",
} as const;

export const DOGFOOD_COUNTS = {
    admin: 1,
    teacher: 3,
    semester: 3,
    class: 4,
    student: 20,
    topic: 5,
    task: 6,
    experiment: 17,
    samplingAttempt: 12,
    announcement: 5,
    topicAttachment: 2,
} as const;

export const DOGFOOD_MAIN_TASK_PROGRESS = {
    not_started: 3,
    stage1: 1,
    stage2: 1,
    stage3: 1,
    stage4: 1,
    submitted: 1,
    graded: 1,
    rejected: 1,
} as const;

export const STUDY_HOURS_POPULATION_PATH = "/storage/topics/seed-population-study-hours.xlsx";
export const READING_POPULATION_PATH = "/storage/topics/seed-population-reading-hours.csv";
export const EMPLOYMENT_POPULATION_PATH = "/storage/topics/seed-population-employment-intent.csv";
export const DINING_POPULATION_PATH = "/storage/topics/seed-population-dining-wait.csv";

/** Aliases kept for the population helpers below. */
export const PPS_POPULATION_PATH = STUDY_HOURS_POPULATION_PATH;
export const MEAN_POPULATION_PATH = READING_POPULATION_PATH;
export const PROPORTION_POPULATION_PATH = EMPLOYMENT_POPULATION_PATH;
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

export function computePpsMeanPlan(population = createPpsPopulation()) {
    const weeklyHours = population.map((row) => Number(row.每周学习时长));
    const mean = weeklyHours.reduce((sum, value) => sum + value, 0) / weeklyHours.length;
    const populationVariance = weeklyHours.reduce((sum, value) => sum + (value - mean) ** 2, 0) / weeklyHours.length;
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

export function createGraduateIntentionPopulation() {
    const colleges = ["文学院", "理学院", "商学院", "工学院"];
    const intentions = ["直接就业", "直接就业", "直接就业", "考研", "考研", "考公", "出国深造", "灵活就业"];
    return Array.from({ length: 160 }, (_, index) => ({
        样本编号: `G${String(index + 1).padStart(3, "0")}`,
        学院: colleges[index % colleges.length]!,
        培养层次: index % 5 === 0 ? "专业学位" : "学术学位",
        毕业去向意向: intentions[index % intentions.length]!,
        是否有实习经历: index % 3 === 0 ? "否" : "是",
        每周职业准备时长: 2 + (index * 3) % 19,
        求职准备度: 35 + (index * 7) % 66,
    }));
}

export function createDiningServicePopulation() {
    const campuses = ["东校区", "西校区"];
    const diningHalls = ["学苑食堂", "湖畔食堂", "风味食堂", "清真食堂"];
    const periods = ["11:30-11:45", "11:45-12:00", "12:00-12:15", "12:15-12:30"];
    const weekdays = ["周一", "周二", "周三", "周四", "周五"];
    return Array.from({ length: 96 }, (_, index) => ({
        记录编号: `D${String(index + 1).padStart(3, "0")}`,
        校区: campuses[index % campuses.length]!,
        食堂: diningHalls[index % diningHalls.length]!,
        观测时段: periods[index % periods.length]!,
        星期: weekdays[index % weekdays.length]!,
        等待分钟: 3 + (index * 5) % 18,
        客流量: 45 + (index * 11) % 156,
        开放窗口数: 3 + index % 8,
    }));
}
