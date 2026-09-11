import { buildDefaultStudyContract, type FieldMappingState } from "../components/StudyContractEditor";

const ID_EXACT_KEYWORDS = new Set(["id", "uid", "userid", "studentid", "respondentid", "recordid", "sampleid"]);
const ID_PREFIX_KEYWORDS = ["user", "student", "respondent", "record", "sample", "member", "customer", "subject", "case"];
const ID_LABEL_KEYWORDS = ["编号", "编码", "序号", "样本号", "学号", "工号"];
const NUMERIC_KEYWORDS = ["age", "income", "score", "amount", "count", "frequency", "rate", "price", "spending", "nps", "满意", "次数", "分数", "金额", "收入"];
const STRATIFIED_KEYWORDS = ["gender", "sex", "education", "province", "city", "grade", "major", "class", "platform", "status", "marital", "职业", "学历", "年级", "专业", "地区", "省", "性别"];

// Groups that connect a topic name to a plausible outcome column. A group only
// scores when BOTH the topic and the column share its semantic, so a study
// about learning is not redirected to a time column just because one exists.
const TARGET_SEMANTIC_GROUPS: Array<{ cn: string[]; en: string[] }> = [
    { cn: ["消费", "支出", "花费", "开销"], en: ["spending", "expenditure", "consumption", "spend", "expense"] },
    { cn: ["收入", "工资", "薪酬"], en: ["income", "salary", "wage", "revenue"] },
    { cn: ["利润", "盈亏", "收益"], en: ["profit", "earnings", "margin"] },
    { cn: ["金额", "销售额", "成交额"], en: ["amount", "sales", "turnover"] },
    { cn: ["评分", "满意度", "得分", "分值", "分数"], en: ["score", "rating", "satisfaction", "nps"] },
    { cn: ["时长", "时间", "等待", "耗时", "分钟"], en: ["time", "duration", "wait", "latency", "minutes"] },
    { cn: ["温度", "浓度", "用电量", "能耗", "偏差"], en: ["temperature", "concentration", "energy", "power", "deviation"] },
    { cn: ["年龄"], en: ["age"] },
    { cn: ["身高"], en: ["height"] },
    { cn: ["体重"], en: ["weight", "bmi"] },
];

const GENERIC_TARGET_KEYWORDS = ["amount", "spending", "expenditure", "consumption", "income", "score", "rate", "price", "value", "sales", "profit", "cost", "duration", "消费", "支出", "金额", "收入", "评分", "分数", "时长", "次数"];
const DEMOGRAPHIC_KEYWORDS = ["age", "height", "bmi", "weight", "年龄", "身高", "体重"];

/** Higher means more likely to be the study outcome; ties keep column order. */
export function scoreNumericTarget(column: string, topicName: string) {
    const normalizedTopic = normalizeColumnName(topicName);
    const normalizedColumn = normalizeColumnName(column);
    const topicTokens = tokenizeColumnName(topicName);
    const columnTokens = tokenizeColumnName(column);
    let score = 0;
    if (normalizedColumn.length >= 2 && normalizedTopic.includes(normalizedColumn)) score += 100;
    if (columnTokens.length > 0 && columnTokens.every((token) => token.length >= 3 && topicTokens.includes(token))) score += 50;
    for (const group of TARGET_SEMANTIC_GROUPS) {
        const topicMatch = group.cn.some((keyword) => topicName.includes(keyword))
            || group.en.some((keyword) => normalizedTopic.includes(keyword));
        const columnMatch = group.cn.some((keyword) => column.includes(keyword))
            || group.en.some((keyword) => normalizedColumn.includes(keyword));
        if (topicMatch && columnMatch) score += 60;
    }
    if (GENERIC_TARGET_KEYWORDS.some((keyword) => normalizedColumn.includes(keyword) || column.includes(keyword))) score += 10;
    if (DEMOGRAPHIC_KEYWORDS.some((keyword) => normalizedColumn.includes(keyword) || column.includes(keyword))) score -= 20;
    return score;
}

function normalizeColumnName(value: string) {
    return value.toLowerCase().replace(/[\s_-]/g, "");
}

function tokenizeColumnName(value: string) {
    return value.toLowerCase().split(/[\s_-]+/).filter(Boolean);
}

function isNumericValue(value: unknown) {
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value !== "string") return false;
    const trimmed = value.trim();
    if (!trimmed) return false;
    return /^-?\d+(\.\d+)?$/.test(trimmed.replace(/,/g, ""));
}

function columnProfile(preview: Array<Record<string, unknown>>, column: string) {
    const rawValues = preview.slice(0, 30).map((row) => row[column]);
    const values = rawValues
        .map((value) => value === null || value === undefined ? "" : String(value).trim())
        .filter(Boolean);
    const sampleSize = rawValues.length;
    if (sampleSize === 0) {
        return { sampleSize: 0, uniqueCount: 0, uniqueRatio: 0, numericRatio: 0 };
    }
    const uniqueCount = new Set(values).size;
    const numericCount = rawValues.filter((value) => isNumericValue(value)).length;
    return {
        sampleSize,
        uniqueCount,
        uniqueRatio: uniqueCount / sampleSize,
        numericRatio: numericCount / sampleSize,
    };
}

export function isLikelyIdentifierColumn(column: string) {
    const tokens = tokenizeColumnName(column);
    const normalized = normalizeColumnName(column);
    const byExact = ID_EXACT_KEYWORDS.has(normalized);
    const byToken = tokens.some((token) => token === "id" || token === "uid");
    const byPrefixSuffix = normalized.endsWith("id") && ID_PREFIX_KEYWORDS.some((prefix) => normalized.startsWith(prefix));
    const byLabel = ID_LABEL_KEYWORDS.some((keyword) => column.includes(keyword));
    return byExact || byToken || byPrefixSuffix || byLabel;
}

function isLikelyNumeric(preview: Array<Record<string, unknown>>, column: string) {
    if (isLikelyIdentifierColumn(column)) return false;
    const profile = columnProfile(preview, column);
    if (profile.sampleSize > 0) return profile.numericRatio === 1;
    const normalized = normalizeColumnName(column);
    return NUMERIC_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export function isLikelyHighCardinalityColumn(preview: Array<Record<string, unknown>>, column: string) {
    const { sampleSize, uniqueCount, uniqueRatio } = columnProfile(preview, column);
    if (sampleSize < 10) return false;
    return uniqueCount > 8 && uniqueRatio >= 0.8;
}

function isLikelyStratified(preview: Array<Record<string, unknown>>, column: string) {
    if (isLikelyIdentifierColumn(column) || isLikelyHighCardinalityColumn(preview, column)) return false;
    const normalized = normalizeColumnName(column);
    const byName = STRATIFIED_KEYWORDS.some((keyword) => normalized.includes(keyword));
    const profile = columnProfile(preview, column);
    const byData =
        profile.sampleSize > 0
        && profile.numericRatio < 0.5
        && profile.uniqueCount >= 2
        && profile.uniqueCount <= 20
        && (profile.sampleSize < 10 || profile.uniqueRatio <= 0.7);
    return byName || byData;
}

function unique<T>(values: T[]) {
    return Array.from(new Set(values));
}

export function buildRecommendedFieldMapping(params: {
    columns: string[];
    preview: Array<Record<string, unknown>>;
    topicName: string;
}): FieldMappingState {
    const { columns, preview, topicName } = params;
    if (columns.length === 0) {
        return { identifier: undefined, stratified: [], numeric: [], others: [] };
    }

    const identifier =
        columns.find((column) => normalizeColumnName(column) === "id")
        ?? columns.find((column) => isLikelyIdentifierColumn(column))
        ?? columns[0];
    const analysableCandidates = columns.filter((column) => column !== identifier && !isLikelyIdentifierColumn(column));
    // Rank plausible outcomes so the most topic-relevant column becomes the
    // default analysis target; this used to be the first numeric column only.
    const numeric = unique(
        analysableCandidates.filter((column) => isLikelyNumeric(preview, column)),
    )
        .map((column, index) => ({ column, index, score: scoreNumericTarget(column, topicName) }))
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map((entry) => entry.column)
        .slice(0, 4);
    const stratifiedPool = analysableCandidates.filter(
        (column) => !numeric.includes(column) && !isLikelyHighCardinalityColumn(preview, column),
    );
    let stratified = unique(
        stratifiedPool.filter((column) => isLikelyStratified(preview, column)),
    ).slice(0, 4);

    if (stratified.length === 0) {
        const fallback = [...stratifiedPool].sort((a, b) => {
            const aByName = STRATIFIED_KEYWORDS.some((keyword) => normalizeColumnName(a).includes(keyword)) ? 1 : 0;
            const bByName = STRATIFIED_KEYWORDS.some((keyword) => normalizeColumnName(b).includes(keyword)) ? 1 : 0;
            if (aByName !== bByName) return bByName - aByName;
            return columnProfile(preview, a).uniqueCount - columnProfile(preview, b).uniqueCount;
        })[0];
        if (fallback) stratified = [fallback];
    }

    const analysisTarget = numeric[0] ? { kind: "mean" as const, field: numeric[0] } : undefined;
    return {
        identifier,
        stratified,
        numeric,
        others: [],
        analysisTarget,
        studyContract: analysisTarget ? buildDefaultStudyContract(topicName, analysisTarget) : undefined,
    };
}
