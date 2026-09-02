import { buildDefaultStudyContract, type FieldMappingState } from "../components/StudyContractEditor";

const ID_EXACT_KEYWORDS = new Set(["id", "uid", "userid", "studentid", "respondentid", "recordid", "sampleid"]);
const ID_PREFIX_KEYWORDS = ["user", "student", "respondent", "record", "sample", "member", "customer", "subject", "case"];
const ID_LABEL_KEYWORDS = ["编号", "编码", "序号", "样本号", "学号", "工号"];
const NUMERIC_KEYWORDS = ["age", "income", "score", "amount", "count", "frequency", "rate", "price", "spending", "nps", "满意", "次数", "分数", "金额", "收入"];
const STRATIFIED_KEYWORDS = ["gender", "sex", "education", "province", "city", "grade", "major", "class", "platform", "status", "marital", "职业", "学历", "年级", "专业", "地区", "省", "性别"];

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
    const numeric = unique(
        analysableCandidates.filter((column) => isLikelyNumeric(preview, column)),
    ).slice(0, 4);
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
