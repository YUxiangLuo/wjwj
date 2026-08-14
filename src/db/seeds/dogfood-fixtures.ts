export const DAY_MS = 24 * 60 * 60 * 1_000;

export const DOGFOOD_NAMES = {
    currentSemester: "2026-2027-1",
    oldSemester: "2025-2026-2",
    mainClass: "统计学一班",
    oldClass: "历史空班",
    topicA: "比例-PPS全流程",
    topicB: "均值-无PPS",
    topicC: "未发布草稿",
    topicD: "已截止",
    topicE: "尚未开放",
    topicF: "软删课题",
    topicG: "软删任务用课题",
} as const;

export const DOGFOOD_COUNTS = {
    admin: 1,
    teacher: 3,
    semester: 2,
    class: 2,
    student: 11,
    topic: 7,
    task: 6,
    experiment: 11,
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
