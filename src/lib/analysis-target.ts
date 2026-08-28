export type AnalysisTargetKind = "mean" | "proportion";

export type AnalysisTarget =
    | { kind: "mean"; field: string }
    | { kind: "proportion"; field: string; value: string };

export interface ResolvedAnalysisTarget {
    target: AnalysisTarget;
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

export function parseAnalysisTarget(fieldMapping: unknown): AnalysisTarget | null {
    if (!isRecord(fieldMapping)) return null;
    const raw = fieldMapping.analysisTarget;
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
