import { getPpsEligibleNumericFields } from "@/domain/statistics/population";
import { parseStudyContract, resolveAnalysisTarget, validateAnalysisTarget, validateStudyContract } from "../../lib/analysis-target";
import { buildDefaultSamplingPolicy, resolveSamplingPolicy, validateSamplingPolicy } from "../../lib/sampling-policy";
import { identityKey, normalizeIdentityText } from "../../lib/identity-text";
import { isNumericText } from "../../lib/numeric-text";
import { isRowEmpty } from "./file-utils";

interface ParsedExcelFile {
    rows: Array<Record<string, any>>;
    columns: string[];
    rowCount: number;
    colCount: number;
    duplicateColumns?: string[];
    blankColumnIndexes?: number[];
    malformed?: boolean;
    malformedRow?: number;
}

interface TopicFieldMappingInput {
    identifier?: string;
    stratified?: string[];
    numeric?: string[];
    others?: string[];
    analysisTarget?: { kind?: string; field?: string; value?: string };
    studyContract?: unknown;
}

interface TopicWeightConfigInput {
    questionnaire: number;
    process: number;
    report: number;
}

interface TopicPublishReadyInput {
    excelFilePath?: string | null;
    fieldMapping?: TopicFieldMappingInput | Record<string, unknown> | string | null;
    samplingPolicy?: unknown;
    weightConfig?: TopicWeightConfigInput | Record<string, unknown> | string | null;
    /** Parsed population rows: enables the value-level PPS eligibility gate. */
    rows?: Array<Record<string, any>>;
}

interface TopicAttachmentInput {
    currentCount: number;
    fileSize: number;
    fileName?: string;
    currentTotalBytes?: number;
}

const MAX_TOPIC_ATTACHMENT_TOTAL_BYTES = 500 * 1024 * 1024;

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
    if (parsed.malformed) return `表格第${parsed.malformedRow ?? "未知"}行的列数与表头不一致或引号未闭合`;

    if ((parsed.blankColumnIndexes?.length ?? 0) > 0 || parsed.columns.some((column) => !column.trim())) {
        return `表头存在空白列名${parsed.blankColumnIndexes?.length ? `（第${parsed.blankColumnIndexes.join("、")}列）` : ""}`;
    }

    const columnSet = new Set(parsed.columns);
    if ((parsed.duplicateColumns?.length ?? 0) > 0 || columnSet.size !== parsed.columns.length) {
        return "表头存在重复列名";
    }
    if (parsed.columns.some((column) => column.trim().toLowerCase().startsWith("__wj_"))) {
        return "表头不能使用系统保留前缀 __wj_";
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

    if (!identifier?.trim()) return "必须选择1个标识符字段";
    const roleEntries = [
        ["标识符", [identifier]],
        ["分层变量", stratified],
        ["数值变量", numeric],
        ["其他分类变量", others],
    ] as const;
    const fieldRoles = new Map<string, string>();
    for (const [role, fields] of roleEntries) {
        const local = new Set<string>();
        for (const field of fields) {
            const normalized = field.trim().normalize("NFKC");
            if (!normalized) return "字段映射不能包含空字段";
            if (local.has(normalized)) return `${role}中不能重复选择字段 ${field}`;
            local.add(normalized);
            const previousRole = fieldRoles.get(normalized);
            if (previousRole) return `字段 ${field} 不能同时作为${previousRole}和${role}`;
            fieldRoles.set(normalized, role);
        }
    }
    if (input.studyContract !== undefined) {
        const contractError = validateStudyContract(input);
        if (contractError) return contractError;
    } else if (input.analysisTarget !== undefined) {
        const analysisError = validateAnalysisTarget(input);
        if (analysisError) return analysisError;
    }

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
    if (!topicInfo?.excelFilePath) return "实验模板需先上传总体数据后才能发布";

    const fieldMapping = parseObjectLike<TopicFieldMappingInput>(topicInfo.fieldMapping);
    if (!fieldMapping) return "实验模板需先完成研究目标与字段配置后才能发布";
    // 透出具体校验原因（含研究合同错误），便于教师定位。
    const configError = validateTopicFieldMappingConfig(fieldMapping);
    if (configError) return configError;
    // 有研究合同的课题到此处已完整；仅有旧版对照变量或缺失目标的历史课题继续走原校验。
    if (parseStudyContract(fieldMapping) === null && fieldMapping.studyContract === undefined) {
        const analysisError = validateAnalysisTarget(fieldMapping);
        if (analysisError) return "实验模板需先指定研究目标变量后才能发布";
    }

    const samplingPolicyError = validateSamplingPolicy(
        topicInfo.samplingPolicy ?? buildDefaultSamplingPolicy(),
    );
    if (samplingPolicyError) return `实验模板需先完成抽样策略配置：${samplingPolicyError}`;
    const samplingPolicy = resolveSamplingPolicy(topicInfo.samplingPolicy);
    if (samplingPolicy.methods.stratified !== "disabled" && (fieldMapping.stratified?.length ?? 0) === 0) {
        return "没有分层变量时必须将分层抽样设为不适用";
    }
    if (samplingPolicy.methods.pps !== "disabled") {
        const target = resolveAnalysisTarget(fieldMapping)?.target;
        const numeric = fieldMapping.numeric ?? [];
        const hasMappedPpsCandidate = numeric.some((field) => field !== target?.field);
        if (!hasMappedPpsCandidate) return "没有非目标数值字段时必须将 PPS 设为不适用";
        // The mapping/policy save paths measure eligibility; publishing must too,
        // otherwise data restored or edited outside those paths ships a template
        // whose required PPS can never be executed.
        if (topicInfo.rows) {
            const eligible = getPpsEligibleNumericFields(topicInfo.rows, numeric).some((field: string) => field !== target?.field);
            if (!eligible) {
                return "当前总体没有合格的 PPS 规模变量（需每一行都是正数），请将 PPS 设为不适用后再发布";
            }
        }
    }

    const weightConfig = parseObjectLike<TopicWeightConfigInput>(topicInfo.weightConfig);
    if (!weightConfig || validateWeightConfig(weightConfig)) {
        return "实验模板需先完成评分规则配置后才能发布";
    }

    return null;
}

export function validateNumericFieldValues(
    rows: Array<Record<string, any>>,
    numericFields: string[],
) {
    for (const field of numericFields) {
        for (let index = 0; index < rows.length; index += 1) {
            if (!isNumericText(rows[index]?.[field])) {
                return `数值变量 ${field} 在数据第${index + 1}行存在空值或非数值`;
            }
        }
    }
    return null;
}

export function validateStratifiedValueCardinality(
    rows: Array<Record<string, any>>,
    stratifiedFields: string[]
) {
    for (const field of stratifiedFields) {
        const values = new Set<string>();
        for (let index = 0; index < rows.length; index += 1) {
            const value = String(rows[index]?.[field] ?? "").trim().normalize("NFKC");
            if (!value) return `分层变量 ${field} 在数据第${index + 1}行存在空值`;
            values.add(value);
        }
        if (values.size < 2) return `分层变量 ${field} 至少需要2个唯一值`;
        if (values.size > 20) {
            return `分层变量 ${field} 的唯一值数量超过20`;
        }
    }

    return null;
}

export function validateIdentifierFieldValues(
    rows: Array<Record<string, any>>,
    identifierField: string,
) {
    const seen = new Map<string, number>();
    for (let index = 0; index < rows.length; index += 1) {
        const value = normalizeIdentityText(String(rows[index]?.[identifierField] ?? ""));
        if (!value) return `标识符字段 ${identifierField} 在数据第${index + 1}行存在空值`;
        // Case-insensitive like the platform's other identity fields (citext IDs).
        const key = identityKey(value);
        const previousIndex = seen.get(key);
        if (previousIndex !== undefined) {
            return `标识符字段 ${identifierField} 在数据第 ${index + 1} 行与第 ${previousIndex + 1} 行重复（忽略大小写）`;
        }
        seen.set(key, index);
    }
    return null;
}

export function validateMappedPopulationData(
    parsed: ParsedExcelFile,
    fieldMapping: TopicFieldMappingInput,
) {
    const validationError = validateParsedExcelUpload(parsed)
        ?? validateTopicFieldMappingColumns(fieldMapping, parsed.columns)
        ?? validateIdentifierFieldValues(parsed.rows, fieldMapping.identifier ?? "")
        ?? validateStratifiedValueCardinality(parsed.rows, fieldMapping.stratified ?? [])
        ?? validateNumericFieldValues(parsed.rows, fieldMapping.numeric ?? [])
        ?? (fieldMapping.studyContract !== undefined
            ? validateStudyContract(fieldMapping, parsed.rows)
            : validateAnalysisTarget(fieldMapping, parsed.rows));
    if (validationError) return validationError;
    const target = resolveAnalysisTarget(fieldMapping)?.target;
    if (target?.kind === "mean" && parsed.rows.length > 0) {
        const first = Number(parsed.rows[0]?.[target.field]);
        if (parsed.rows.every(row => Number(row[target.field]) === first)) {
            return `均值研究目标 ${target.field} 的总体值全部相同（方差为0），当前样本量规划要求正方差，请调整研究目标或总体数据`;
        }
    }
    return null;
}

export function validateTopicAttachmentUpload(input: TopicAttachmentInput, attachmentType: string) {
    if (input.currentCount >= 20) return "附件数量已达上限";
    if (input.fileName !== undefined && (input.fileName.trim().length === 0 || input.fileName.length > 255)) {
        return "附件名称不能为空且不能超过255个字符";
    }
    if ((input.currentTotalBytes ?? 0) + input.fileSize > MAX_TOPIC_ATTACHMENT_TOTAL_BYTES) {
        return "单个实验模板的附件总大小不能超过500 MiB";
    }

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
    if (typeof name !== "string") return "实验模板名称格式无效";
    const trimmed = name.trim();
    if (!trimmed) return "实验模板名称不能为空";
    if (trimmed.length > 200) return "实验模板名称不能超过200字";
    return null;
}
