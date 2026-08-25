import { isRowEmpty } from "./file-utils";

interface ParsedExcelFile {
    rows: Array<Record<string, any>>;
    columns: string[];
    rowCount: number;
    colCount: number;
    duplicateColumns?: string[];
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
    fieldMapping?: TopicFieldMappingInput | Record<string, unknown> | string | null;
    weightConfig?: TopicWeightConfigInput | Record<string, unknown> | string | null;
}

interface TopicAttachmentInput {
    currentCount: number;
    fileSize: number;
}

function parseObjectLike<T extends object>(value: unknown): T | null {
    if (!value) return null;
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === "object" ? parsed as T : null;
        } catch {
            return null;
        }
    }

    return typeof value === "object" ? (value as T) : null;
}

export function validateParsedExcelUpload(parsed: ParsedExcelFile) {
    if (!parsed.columns.length) return "Excel表头为空";
    if (parsed.rowCount < 1 || parsed.rowCount > 100000) return "数据行数需在1-100000之间";
    if (parsed.colCount < 2 || parsed.colCount > 50) return "数据列数需在2-50之间";

    const columnSet = new Set(parsed.columns);
    if ((parsed.duplicateColumns?.length ?? 0) > 0 || columnSet.size !== parsed.columns.length) {
        return "表头存在重复列名";
    }
    if (parsed.rows.some((row) => isRowEmpty(row))) return "存在完全空白的行";

    return null;
}

export function validateTopicFieldMappingConfig(fieldMapping: unknown) {
    if (!fieldMapping) return "字段映射不能为空";
    if (typeof fieldMapping !== "object" || Array.isArray(fieldMapping)) return "字段映射格式无效";

    const input = fieldMapping as Record<string, unknown>;
    if (input.identifier !== undefined && typeof input.identifier !== "string") return "字段映射格式无效";
    for (const key of ["stratified", "numeric", "others"] as const) {
        const value = input[key];
        if (value !== undefined && (!Array.isArray(value) || value.some((field) => typeof field !== "string"))) {
            return "字段映射格式无效";
        }
    }

    const identifier = input.identifier as string | undefined;
    const stratified = (input.stratified ?? []) as string[];
    const numeric = (input.numeric ?? []) as string[];
    const others = (input.others ?? []) as string[];

    const uniqueFields = new Set([identifier, ...stratified, ...numeric, ...others].filter(Boolean));
    if (!identifier) return "必须选择1个标识符字段";
    if (stratified.length < 1) return "至少选择1个分层变量";
    if (numeric.length < 1) return "至少选择1个数值变量";
    if (uniqueFields.size < 3) return "至少选择3个字段";

    return null;
}

export function validateTopicFieldMappingColumns(
    fieldMapping: TopicFieldMappingInput,
    columns: string[],
) {
    const columnSet = new Set(columns);
    const mappedFields = [
        fieldMapping.identifier,
        ...(fieldMapping.stratified ?? []),
        ...(fieldMapping.numeric ?? []),
        ...(fieldMapping.others ?? []),
    ].filter((field): field is string => Boolean(field));
    const missingFields = [...new Set(mappedFields.filter((field) => !columnSet.has(field)))];

    if (missingFields.length > 0) {
        return `字段映射包含当前总体数据中不存在的列：${missingFields.join("、")}`;
    }

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
                ? 120 * 1024 * 1024
                : attachmentType === "document"
                    ? 50 * 1024 * 1024
                    : 0;

    if (!sizeLimit) return "不支持的文件类型";
    if (input.fileSize > sizeLimit) return "文件大小超过限制";

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
