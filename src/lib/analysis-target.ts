export type AnalysisTargetKind = "mean" | "proportion";

export type AnalysisTarget =
    | { kind: "mean"; field: string }
    | { kind: "proportion"; field: string; value: string };

export interface ResolvedAnalysisTarget {
    target: AnalysisTarget;
    inferred: boolean;
}

/**
 * 研究合同：把对照变量放进完整的调查设计语境——研究问题、目标总体、分析单位。
 * 存放于课题 fieldMapping.studyContract（jsonb，无迁移）。
 */
export interface StudyContract {
    version: 1;
    researchQuestion: string;
    targetPopulation: string;
    unitOfAnalysis: string;
    target: AnalysisTarget;
}

export interface ResolvedStudyContract {
    contract: StudyContract;
    inferred: boolean;
}

// 常见英文列名 → 中文显示名。默认研究问题用可读名称，避免直接暴露 monthly_spending
// 这类列名；任意分词未知时回退原始列名，不猜测教师的数据字典。
const FIELD_TOKEN_LABELS: Record<string, string> = {
    monthly: "每月", annual: "每年", yearly: "每年", weekly: "每周", daily: "每日",
    spending: "消费支出", spend: "消费", expenditure: "支出", expense: "花费", consumption: "消费",
    income: "收入", salary: "工资", wage: "薪酬", revenue: "收入", profit: "利润", earnings: "收益",
    amount: "金额", sales: "销售额", turnover: "成交额", price: "价格",
    score: "评分", scores: "评分", rating: "评分", satisfaction: "满意度", nps: "净推荐值",
    time: "时长", duration: "时长", wait: "等待", waiting: "等待", latency: "延迟",
    minutes: "分钟", hours: "小时",
    temperature: "温度", concentration: "浓度", energy: "能耗", power: "功率", deviation: "偏差",
    age: "年龄", height: "身高",
    frequency: "频次", count: "数量", times: "次数", rate: "比率",
};

/** 默认研究问题里给字段一个可读显示名；中文或含未知英文词时直接返回原始列名。 */
export function fieldDisplayName(field: string) {
    const raw = field.trim();
    if (!raw || /[\u4e00-\u9fff]/.test(raw)) return raw;
    const tokens = raw.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    if (tokens.length === 0) return raw;
    const labels = tokens.map((token) => FIELD_TOKEN_LABELS[token]);
    return labels.every(Boolean) ? labels.join("") : raw;
}

export function buildDefaultResearchQuestion(topicName: string, target: AnalysisTarget) {
    const subject = topicName.trim() || "本课题";
    const label = fieldDisplayName(target.field);
    return target.kind === "mean"
        ? `${subject}中${label}的平均水平是多少？`
        : `${subject}中${label}为「${target.value || "目标类别"}」的单位占比是多少？`;
}

/**
 * 兼容旧合同：识别由系统模板生成、但因课题改名而不再等于当前默认值的问题。
 * 同时接受新的可读显示名与旧的原始列名，保证既有课题重命名/复制时仍会被重新生成。
 */
export function resemblesGeneratedResearchQuestion(question: string, target: AnalysisTarget) {
    const suffix = (label: string) => target.kind === "mean"
        ? `中${label}的平均水平是多少？`
        : `中${label}为「${target.value || "目标类别"}」的单位占比是多少？`;
    const labels = new Set([fieldDisplayName(target.field), target.field]);
    const trimmed = question.trim();
    return [...labels].some((label) => label.length > 0 && trimmed.endsWith(suffix(label)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toNonEmptyString(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}

/** Spreadsheet column names are exact keys, not human text to trim. */
export function parseFieldKey(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value : null;
}

export function categoricalFieldsFromMapping(mapping: {
    stratified?: string[];
    others?: string[];
}): string[] {
    return [...new Set([...(mapping.stratified ?? []), ...(mapping.others ?? [])].filter(Boolean))];
}

export function parseAnalysisTarget(fieldMapping: unknown): AnalysisTarget | null {
    if (!isRecord(fieldMapping)) return null;
    return parseStudyContract(fieldMapping)?.target ?? parseLegacyAnalysisTarget(fieldMapping);
}

function parseLegacyAnalysisTarget(fieldMapping: unknown): AnalysisTarget | null {
    if (!isRecord(fieldMapping)) return null;
    const raw = fieldMapping.analysisTarget;
    if (!isRecord(raw)) return null;
    const field = parseFieldKey(raw.field);
    if (!field) return null;
    if (raw.kind === "mean") return { kind: "mean", field };
    if (raw.kind === "proportion") {
        const value = toNonEmptyString(raw.value);
        if (!value) return null;
        return { kind: "proportion", field, value };
    }
    return null;
}

export function parseStudyContract(fieldMapping: unknown): StudyContract | null {
    if (!isRecord(fieldMapping) || !isRecord(fieldMapping.studyContract)) return null;
    const raw = fieldMapping.studyContract;
    const researchQuestion = toNonEmptyString(raw.researchQuestion);
    const targetPopulation = toNonEmptyString(raw.targetPopulation);
    const unitOfAnalysis = toNonEmptyString(raw.unitOfAnalysis);
    const target = parseTarget(raw.target);
    if (raw.version !== 1 || !researchQuestion || !targetPopulation || !unitOfAnalysis || !target) return null;
    return { version: 1, researchQuestion, targetPopulation, unitOfAnalysis, target };
}

/**
 * 课题改名/复制时，只同步仍等于旧系统默认值的研究问题；教师手写内容保持不变。
 * 返回原引用表示无需更新，便于调用方避免无意义的 JSONB 写入。
 */
export function retitleGeneratedStudyContract(
    fieldMapping: unknown,
    previousTopicName: string,
    nextTopicName: string,
): unknown {
    let parsed = fieldMapping;
    if (typeof parsed === "string") {
        try {
            parsed = JSON.parse(parsed);
        } catch {
            return fieldMapping;
        }
    }
    if (!isRecord(parsed) || !isRecord(parsed.studyContract)) return fieldMapping;
    const contract = parseStudyContract(parsed);
    if (!contract) return fieldMapping;
    const previousDefault = buildDefaultResearchQuestion(previousTopicName, contract.target);
    // Also upgrade questions generated before the readable display name existed
    // (they carry the raw column name but share the same generated suffix).
    if (contract.researchQuestion !== previousDefault && !resemblesGeneratedResearchQuestion(contract.researchQuestion, contract.target)) {
        return fieldMapping;
    }
    return {
        ...parsed,
        studyContract: {
            ...parsed.studyContract,
            researchQuestion: buildDefaultResearchQuestion(nextTopicName, contract.target),
        },
    };
}

function parseTarget(raw: unknown): AnalysisTarget | null {
    if (!isRecord(raw)) return null;
    const field = parseFieldKey(raw.field);
    if (!field) return null;
    if (raw.kind === "mean") return { kind: "mean", field };
    if (raw.kind === "proportion") {
        const value = toNonEmptyString(raw.value);
        if (!value) return null;
        return { kind: "proportion", field, value };
    }
    return null;
}

export function resolveAnalysisTarget(fieldMapping: unknown): ResolvedAnalysisTarget | null {
    const parsed = parseAnalysisTarget(fieldMapping);
    if (parsed) return { target: parsed, inferred: false };
    if (!isRecord(fieldMapping)) return null;
    const numeric = Array.isArray(fieldMapping.numeric)
        ? fieldMapping.numeric.filter((field): field is string => typeof field === "string" && field.trim() !== "")
        : [];
    const fallback = numeric[0];
    if (!fallback) return null;
    return { target: { kind: "mean", field: fallback }, inferred: true };
}

function defaultResearchQuestion(target: AnalysisTarget) {
    const label = fieldDisplayName(target.field);
    return target.kind === "mean"
        ? `总体中${label}的平均水平是多少？`
        : `总体中${label}为「${target.value}」的单位占比是多少？`;
}

/**
 * 解析研究合同：优先显式合同；缺失时由对照变量与上下文推断一份兼容合同，
 * 保证没有合同的历史课题在学生端依然有完整的研究语境展示。
 */
export function resolveStudyContract(
    fieldMapping: unknown,
    context: { topicName?: string | null; targetPopulation?: string | null; unitOfAnalysis?: string | null } = {},
): ResolvedStudyContract | null {
    const explicit = parseStudyContract(fieldMapping);
    if (explicit) return { contract: explicit, inferred: false };
    const resolvedTarget = resolveAnalysisTarget(fieldMapping);
    if (!resolvedTarget) return null;
    return {
        inferred: true,
        contract: {
            version: 1,
            researchQuestion: context.topicName?.trim() || defaultResearchQuestion(resolvedTarget.target),
            targetPopulation: context.targetPopulation?.trim() || "上传总体数据中的全部单位",
            unitOfAnalysis: context.unitOfAnalysis?.trim() || "总体数据中的一行记录",
            target: resolvedTarget.target,
        },
    };
}

export function validateAnalysisTarget(
    fieldMapping: unknown,
    rows?: Array<Record<string, unknown>>,
): string | null {
    if (!isRecord(fieldMapping)) return "字段映射格式无效";
    const target = parseAnalysisTarget(fieldMapping);
    if (!target) return "请指定对照变量：均值选一个数值字段，比例选一个分类字段及其类别";

    const numeric = Array.isArray(fieldMapping.numeric) ? fieldMapping.numeric : [];
    const categorical = categoricalFieldsFromMapping({
        stratified: Array.isArray(fieldMapping.stratified) ? fieldMapping.stratified as string[] : [],
        others: Array.isArray(fieldMapping.others) ? fieldMapping.others as string[] : [],
    });

    if (target.kind === "mean") {
        if (!numeric.includes(target.field)) return "均值对照变量必须是已映射的数值字段";
        return null;
    }

    if (!categorical.includes(target.field)) return "比例对照变量必须是已映射的分层或其他分类字段";
    if (rows) {
        const missingIndex = rows.findIndex((row) => String(row[target.field] ?? "").trim() === "");
        if (missingIndex >= 0) return `比例对照变量 ${target.field} 在数据第${missingIndex + 1}行存在空值`;
        const targetValue = target.value.normalize("NFKC");
        const present = rows.some((row) => String(row[target.field] ?? "").trim().normalize("NFKC") === targetValue);
        if (!present) return `比例对照类别「${target.value}」在字段 ${target.field} 中不存在`;
    }
    return null;
}

export function validateStudyContract(
    fieldMapping: unknown,
    rows?: Array<Record<string, unknown>>,
): string | null {
    if (!isRecord(fieldMapping)) return "字段映射格式无效";
    const contract = parseStudyContract(fieldMapping);
    if (!contract) {
        // Name an unsupported estimator instead of echoing the missing fields.
        const rawTarget = isRecord(fieldMapping.studyContract) && isRecord(fieldMapping.studyContract.target)
            ? fieldMapping.studyContract.target as Record<string, unknown>
            : isRecord(fieldMapping.analysisTarget) ? fieldMapping.analysisTarget as Record<string, unknown> : null;
        const kind = rawTarget && typeof rawTarget.kind === "string" ? rawTarget.kind : null;
        if (kind && kind !== "mean" && kind !== "proportion") {
            return `不支持的研究目标类型「${kind}」，请选择均值或比例`;
        }
        // 逐项点名缺少的内容：笼统地列四项会让人以为是全部缺失
        const contractRaw = isRecord(fieldMapping.studyContract) ? fieldMapping.studyContract : null;
        const contractTarget = isRecord(contractRaw?.target) ? contractRaw.target : null;
        const missing: string[] = [];
        if (!contractRaw || contractRaw.version !== 1) missing.push("合同版本");
        if (!toNonEmptyString(contractRaw?.researchQuestion)) missing.push("研究问题");
        if (!toNonEmptyString(contractRaw?.targetPopulation)) missing.push("目标总体");
        if (!toNonEmptyString(contractRaw?.unitOfAnalysis)) missing.push("分析单位");
        if (!parseTarget(contractRaw?.target)) {
            if (kind === "proportion") {
                if (!toNonEmptyString(contractTarget?.field)) missing.push("比例对照变量");
                else if (!toNonEmptyString(contractTarget?.value)) missing.push("比例对照类别");
                else missing.push("比例对照变量");
            } else {
                missing.push("均值对照变量");
            }
        }
        return missing.length
            ? `研究合同缺少：${missing.join("、")}`
            : "研究合同格式无效，请重新保存研究目标与字段";
    }
    if (contract.researchQuestion.length < 5 || contract.researchQuestion.length > 300) {
        return "研究问题长度需在 5-300 字之间";
    }
    if (contract.targetPopulation.length < 2 || contract.targetPopulation.length > 200) {
        return "目标总体长度需在 2-200 字之间";
    }
    if (contract.unitOfAnalysis.length < 1 || contract.unitOfAnalysis.length > 100) {
        return "分析单位长度需在 1-100 字之间";
    }
    const legacy = fieldMapping.analysisTarget === undefined ? null : parseTarget(fieldMapping.analysisTarget);
    if (legacy && JSON.stringify(legacy) !== JSON.stringify(contract.target)) {
        return "研究合同与兼容对照变量不一致";
    }
    return validateAnalysisTarget({ ...fieldMapping, analysisTarget: contract.target, studyContract: undefined }, rows);
}

export function analysisTargetConflictsWithSizeField(target: AnalysisTarget | null | undefined, sizeField: string): boolean {
    return Boolean(target && sizeField && target.field === sizeField);
}

export function formatAnalysisTargetSummary(
    resolved: ResolvedAnalysisTarget | null,
    extras?: { marginLabel?: string },
): string {
    if (!resolved) return "课题未指定对照变量。问卷是预试，不进入估计。";
    const prefix = resolved.inferred ? "课题未指定，暂用 " : "对照变量：";
    const core = resolved.target.kind === "mean"
        ? `${resolved.target.field} 的均值`
        : `${resolved.target.field} 中「${resolved.target.value}」的比例`;
    const margin = extras?.marginLabel ? `；目标误差限 ${extras.marginLabel}` : "";
    return `${prefix}${core}${margin}。问卷是预试，不进入估计。`;
}

export function formatStudyContractSummary(
    resolved: ResolvedStudyContract | null,
    extras?: { marginLabel?: string },
): string {
    if (!resolved) return "课题未指定研究目标。问卷是预试，不进入估计。";
    const { contract } = resolved;
    const target = contract.target.kind === "mean"
        ? `${contract.target.field} 的均值`
        : `${contract.target.field} 中「${contract.target.value}」的比例`;
    const margin = extras?.marginLabel ? `；目标误差限 ${extras.marginLabel}` : "";
    if (resolved.inferred) {
        return `兼容目标：${contract.researchQuestion}；估计量：${target}${margin}。问卷是预试，不进入估计。`;
    }
    return `研究目标：${contract.researchQuestion}；总体：${contract.targetPopulation}；分析单位：${contract.unitOfAnalysis}；估计量：${target}${margin}。问卷是预试，不进入估计。`;
}
