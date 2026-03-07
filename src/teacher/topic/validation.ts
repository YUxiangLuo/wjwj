import { isRowEmpty } from "./file-utils";

interface ParsedExcelFile {
    rows: Array<Record<string, any>>;
    columns: string[];
    rowCount: number;
    colCount: number;
}

interface TopicFieldMappingInput {
    identifier?: string;
    stratified?: string[];
    numeric?: string[];
    others?: string[];
}

interface TopicWeightConfigInput {
    questionnaire: number;
    process: number;
    report: number;
}

interface TopicPublishReadyInput {
    excelFilePath?: string | null;
    fieldMapping?: TopicFieldMappingInput | string | null;
    weightConfig?: TopicWeightConfigInput | string | null;
}

interface TopicAttachmentInput {
    currentCount: number;
    fileName: string;
    mimeType: string;
    fileSize: number;
}

interface TopicRecommendQuestionInput {
    questionType: number;
    content: string;
    options?: any;
    sortOrder?: number;
}

function parseObjectLike<T extends object>(value: T | string | null | undefined): T | null {
    if (!value) return null;
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === "object" ? parsed as T : null;
        } catch {
            return null;
        }
    }

    return typeof value === "object" ? value : null;
}

export function validateParsedExcelUpload(parsed: ParsedExcelFile) {
    if (!parsed.columns.length) return "Excel表头为空";
    if (parsed.rowCount < 1 || parsed.rowCount > 100000) return "数据行数需在1-100000之间";
    if (parsed.colCount < 2 || parsed.colCount > 50) return "数据列数需在2-50之间";

    const columnSet = new Set(parsed.columns);
    if (columnSet.size !== parsed.columns.length) return "表头存在重复列名";
    if (parsed.rows.some((row) => isRowEmpty(row))) return "存在完全空白的行";

    return null;
}

export function validateTopicFieldMappingConfig(fieldMapping: TopicFieldMappingInput | null | undefined) {
    if (!fieldMapping) return "字段映射不能为空";

    const identifier = fieldMapping.identifier;
    const stratified = fieldMapping.stratified ?? [];
    const numeric = fieldMapping.numeric ?? [];
    const others = fieldMapping.others ?? [];

    const uniqueFields = new Set([identifier, ...stratified, ...numeric, ...others].filter(Boolean));
    if (!identifier) return "必须选择1个标识符字段";
    if (stratified.length < 1) return "至少选择1个分层变量";
    if (numeric.length < 1) return "至少选择1个数值变量";
    if (uniqueFields.size < 3) return "至少选择3个字段";

    return null;
}

export function validateTopicPublishReadiness(topicInfo: TopicPublishReadyInput | null | undefined) {
    if (!topicInfo?.excelFilePath) return "课题需先上传总体数据后才能发布";

    const fieldMapping = parseObjectLike<TopicFieldMappingInput>(topicInfo.fieldMapping);
    if (!fieldMapping || validateTopicFieldMappingConfig(fieldMapping)) {
        return "课题需先完成字段映射后才能发布";
    }

    const weightConfig = parseObjectLike<TopicWeightConfigInput>(topicInfo.weightConfig);
    if (!weightConfig || validateWeightConfig(weightConfig)) {
        return "课题需先完成评分权重配置后才能发布";
    }

    return null;
}

export function validateStratifiedValueCardinality(
    rows: Array<Record<string, any>>,
    stratifiedFields: string[]
) {
    for (const field of stratifiedFields) {
        const values = new Set<string>();
        for (const row of rows) {
            const value = String(row[field] ?? "").trim();
            if (value) values.add(value);
        }
        if (values.size > 20) {
            return `分层变量 ${field} 的唯一值数量超过20`;
        }
    }

    return null;
}

export function validateTopicAttachmentUpload(input: TopicAttachmentInput, attachmentType: string) {
    if (input.currentCount >= 20) return "附件数量已达上限";

    const sizeLimit =
        attachmentType === "image"
            ? 10 * 1024 * 1024
            : attachmentType === "video"
                ? 200 * 1024 * 1024
                : attachmentType === "document"
                    ? 50 * 1024 * 1024
                    : 0;

    if (!sizeLimit) return "不支持的文件类型";
    if (input.fileSize > sizeLimit) return "文件大小超过限制";

    return null;
}

export function validateRecommendQuestionItems(items: TopicRecommendQuestionInput[]) {
    if (items.length > 30) return "推荐题目数量不能超过30";

    for (const item of items) {
        const content = (item.content ?? "").trim();
        if (!content || content.length > 500) return "题目内容长度需在1-500字";

        if (item.questionType === 2 || item.questionType === 3) {
            const rawOptions = typeof item.options === "string" ? item.options : "";
            const options = rawOptions.split(",").map((option) => option.trim()).filter(Boolean);
            if (options.length < 2 || options.length > 10) return "选项数量需在2-10之间";
            if (options.some((option) => option.length > 200)) return "选项内容长度不能超过200";
        }
    }

    return null;
}

export function validateWeightConfig(weightConfig: TopicWeightConfigInput | null | undefined) {
    if (!weightConfig) return "评分权重不能为空";

    const { questionnaire, process, report } = weightConfig;
    if (questionnaire < 10 || questionnaire > 50) return "问卷设计权重需在10-50%之间";
    if (process < 20 || process > 60) return "实验过程权重需在20-60%之间";
    if (report < 10 || report > 50) return "实验报告权重需在10-50%之间";
    if (questionnaire + process + report !== 100) return "评分权重总和必须等于100";

    return null;
}

export function validateTopicName(name: unknown) {
    if (typeof name !== "string") return "课题名称格式无效";
    const trimmed = name.trim();
    if (!trimmed) return "课题名称不能为空";
    if (trimmed.length > 200) return "课题名称不能超过200字";
    return null;
}
