export type AnalysisTargetKind = "mean" | "proportion";

export type AnalysisTarget =
    | { kind: "mean"; field: string }
    | { kind: "proportion"; field: string; value: string };

export interface StudyContract {
    version: 1;
    researchQuestion: string;
    targetPopulation: string;
    unitOfAnalysis: string;
    target: AnalysisTarget;
}

export interface ResolvedAnalysisTarget {
    target: AnalysisTarget;
    inferred: boolean;
}

export interface ResolvedStudyContract {
    contract: StudyContract;
    inferred: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toNonEmptyString(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}

export function categoricalFieldsFromMapping(mapping: {
    stratified?: string[];
    others?: string[];
}): string[] {
    return [...new Set([...(mapping.stratified ?? []), ...(mapping.others ?? [])].filter(Boolean))];
}

function parseTarget(raw: unknown): AnalysisTarget | null {
    if (!isRecord(raw)) return null;
    const field = toNonEmptyString(raw.field);
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

export function parseAnalysisTarget(fieldMapping: unknown): AnalysisTarget | null {
    if (!isRecord(fieldMapping)) return null;
    return parseStudyContract(fieldMapping)?.target ?? parseTarget(fieldMapping.analysisTarget);
}

export function resolveAnalysisTarget(fieldMapping: unknown): ResolvedAnalysisTarget | null {
    const explicitContract = parseStudyContract(fieldMapping);
    if (explicitContract) return { target: explicitContract.target, inferred: false };
    const parsed = isRecord(fieldMapping) ? parseTarget(fieldMapping.analysisTarget) : null;
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
    return target.kind === "mean"
        ? `总体中${target.field}的平均水平是多少？`
        : `总体中${target.field}为“${target.value}”的单位占比是多少？`;
}

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

export function validateStudyContract(fieldMapping: unknown, rows?: Array<Record<string, unknown>>): string | null {
    if (!isRecord(fieldMapping)) return "字段映射格式无效";
    const contract = parseStudyContract(fieldMapping);
    if (!contract) return "请填写完整的研究问题、目标总体、分析单位和对照变量";
    if (contract.researchQuestion.length < 5 || contract.researchQuestion.length > 300) {
        return "研究问题长度需在5-300字之间";
    }
    if (contract.targetPopulation.length < 2 || contract.targetPopulation.length > 200) {
        return "目标总体长度需在2-200字之间";
    }
    if (contract.unitOfAnalysis.length < 1 || contract.unitOfAnalysis.length > 100) {
        return "分析单位长度需在1-100字之间";
    }
    const legacy = fieldMapping.analysisTarget === undefined ? null : parseTarget(fieldMapping.analysisTarget);
    if (legacy && JSON.stringify(legacy) !== JSON.stringify(contract.target)) {
        return "研究合同与兼容对照变量不一致";
    }
    return validateAnalysisTarget({ ...fieldMapping, analysisTarget: contract.target, studyContract: undefined }, rows);
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
        const present = rows.some((row) => String(row[target.field] ?? "").trim() === target.value);
        if (!present) return `比例对照类别「${target.value}」在字段 ${target.field} 中不存在`;
    }
    return null;
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
        ? `${contract.target.field}的均值`
        : `${contract.target.field}中“${contract.target.value}”的比例`;
    const margin = extras?.marginLabel ? `；目标误差限 ${extras.marginLabel}` : "";
    const prefix = resolved.inferred ? "兼容目标" : "研究目标";
    return `${prefix}：${contract.researchQuestion}；总体：${contract.targetPopulation}；分析单位：${contract.unitOfAnalysis}；估计量：${target}${margin}。问卷是认知预试，不进入估计。`;
}
