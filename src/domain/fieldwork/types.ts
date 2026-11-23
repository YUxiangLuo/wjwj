import type { RawValue } from "../variables/types";
import type { QuestionnaireData } from "../../lib/questionnaire-types";
import type { SamplingMethod } from "../../lib/sampling-policy";

export type FieldworkPreset =
    | "balanced"
    | "stratum_differential"
    | "high_burden_sensitive"
    | "peak_congestion";

export interface FieldworkSimulationConfig {
    version: 1;
    preset: FieldworkPreset;
    /** 基准单元无回答率（0..0.75） */
    baseUnitNonResponseRate: number;
    /** 差异化应答所依据的框内分层字段（可选） */
    stratumField?: string;
    /** 各细分客群/分层的基准单元无回答率（0..0.85） */
    stratumNonResponseRates?: Record<string, number>;
    /** 闪电敷衍卷基准比例（0..0.35） */
    baseSpeederRate: number;
    /** 直线作答废卷基准比例（0..0.35） */
    baseStraightlinerRate: number;
    /** 普通题项随机漏答率（0..0.25） */
    baseItemSkipRate: number;
    /** 单份触达/发放参考成本（元，仅作商务成本效益参考，不阻断操作） */
    contactCostPerUnit: number;
    /** 单份完答激励/礼金参考成本（元） */
    incentiveCostPerComplete: number;
}

export interface CleaningConfig {
    removeSpeeders: boolean;
    removeStraightliners: boolean;
    requirePrimaryTargetValid: boolean;
}

export type RespondentDisposition =
    | "valid_complete"
    | "careless_speeder"
    | "careless_straightliner"
    | "breakoff"
    | "refused"
    | "not_contacted";

export interface UnitFieldworkRecord {
    populationIndex: number;
    disposition: RespondentDisposition;
    durationSec: number;
    answeredQuestionCount: number;
    breakoffAtQuestion?: number;
    rangeBlockedFields?: string[];
    skippedFields?: string[];
    carelessOverrides?: Record<string, RawValue>;
}

export interface MethodFieldworkResult {
    method: SamplingMethod;
    dispatchSeed: number;
    dispatchedAt: string;
    invitedCount: number;
    records: UnitFieldworkRecord[];
}

export interface WaveFieldworkData {
    methods: Partial<Record<SamplingMethod, MethodFieldworkResult>>;
}

export type AdjustmentIssueKey =
    | "unit_nonresponse_gap"
    | "stratum_response_bias"
    | "careless_responses"
    | "questionnaire_burden_or_range"
    | "periodic_or_frame_risk"
    | "unmeasured_variables";

export type AdjustmentActionKey =
    | "revise_questionnaire"
    | "recalibrate_sample_size"
    | "upgrade_sampling_design"
    | "apply_nonresponse_weighting";

export interface AdjustmentPlan {
    identifiedIssues: AdjustmentIssueKey[];
    plannedActions: AdjustmentActionKey[];
    rationale: string;
    updatedAt?: string;
}

export interface StoredExperimentWave {
    waveNumber: number;
    kind: "pilot" | "main" | "refinement";
    label: string;
    questionnaire: QuestionnaireData;
    samplePlan: Record<string, unknown> | null;
    samplingResults: Record<string, unknown> | null;
    fieldwork: WaveFieldworkData | null;
    cleaningConfig: CleaningConfig;
    completedAt: string | null;
}

export const DEFAULT_CLEANING_CONFIG: CleaningConfig = {
    removeSpeeders: true,
    removeStraightliners: true,
    requirePrimaryTargetValid: true,
};

export const DEFAULT_FIELDWORK_CONFIG: FieldworkSimulationConfig = {
    version: 1,
    preset: "balanced",
    baseUnitNonResponseRate: 0.16,
    baseSpeederRate: 0.06,
    baseStraightlinerRate: 0.05,
    baseItemSkipRate: 0.02,
    contactCostPerUnit: 4,
    incentiveCostPerComplete: 15,
};

function parseFiniteNumber(value: unknown): number | null {
    if (typeof value === "number") {
        return Number.isFinite(value) ? (Object.is(value, -0) ? 0 : value) : null;
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return null;
        const parsed = Number(trimmed);
        return Number.isFinite(parsed) ? (Object.is(parsed, -0) ? 0 : parsed) : null;
    }
    return null;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
    const parsed = parseFiniteNumber(value);
    if (parsed === null) return fallback;
    const clamped = Math.min(max, Math.max(min, parsed));
    return Object.is(clamped, -0) ? 0 : clamped;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function resolveCleaningConfig(raw: unknown): CleaningConfig {
    if (!isPlainObject(raw)) return { ...DEFAULT_CLEANING_CONFIG };
    return {
        removeSpeeders: typeof raw.removeSpeeders === "boolean" ? raw.removeSpeeders : DEFAULT_CLEANING_CONFIG.removeSpeeders,
        removeStraightliners: typeof raw.removeStraightliners === "boolean" ? raw.removeStraightliners : DEFAULT_CLEANING_CONFIG.removeStraightliners,
        requirePrimaryTargetValid: typeof raw.requirePrimaryTargetValid === "boolean" ? raw.requirePrimaryTargetValid : DEFAULT_CLEANING_CONFIG.requirePrimaryTargetValid,
    };
}

export function resolveFieldworkConfig(raw: unknown): FieldworkSimulationConfig {
    if (!isPlainObject(raw)) return { ...DEFAULT_FIELDWORK_CONFIG };
    const preset: FieldworkPreset =
        raw.preset === "stratum_differential"
        || raw.preset === "high_burden_sensitive"
        || raw.preset === "peak_congestion"
            ? raw.preset
            : "balanced";
    const stratumField = typeof raw.stratumField === "string" && raw.stratumField.trim()
        ? raw.stratumField.trim()
        : undefined;
    const baseUnitNonResponseRate = clampNumber(
        raw.baseUnitNonResponseRate,
        DEFAULT_FIELDWORK_CONFIG.baseUnitNonResponseRate,
        0,
        0.75,
    );
    let stratumNonResponseRates: Record<string, number> | undefined;
    if (isPlainObject(raw.stratumNonResponseRates)) {
        const mapped: Record<string, number> = {};
        for (const [key, val] of Object.entries(raw.stratumNonResponseRates)) {
            const normalizedKey = key.trim().normalize("NFKC");
            if (normalizedKey && normalizedKey !== "__proto__" && normalizedKey !== "constructor" && normalizedKey !== "prototype") {
                mapped[normalizedKey] = clampNumber(val, baseUnitNonResponseRate, 0, 0.85);
            }
        }
        if (Object.keys(mapped).length > 0) stratumNonResponseRates = mapped;
    }

    return {
        version: 1,
        preset,
        baseUnitNonResponseRate,
        ...(stratumField ? { stratumField } : {}),
        ...(stratumNonResponseRates ? { stratumNonResponseRates } : {}),
        baseSpeederRate: clampNumber(raw.baseSpeederRate, DEFAULT_FIELDWORK_CONFIG.baseSpeederRate, 0, 0.35),
        baseStraightlinerRate: clampNumber(raw.baseStraightlinerRate, DEFAULT_FIELDWORK_CONFIG.baseStraightlinerRate, 0, 0.35),
        baseItemSkipRate: clampNumber(raw.baseItemSkipRate, DEFAULT_FIELDWORK_CONFIG.baseItemSkipRate, 0, 0.25),
        contactCostPerUnit: clampNumber(raw.contactCostPerUnit, DEFAULT_FIELDWORK_CONFIG.contactCostPerUnit, 0, 10_000),
        incentiveCostPerComplete: clampNumber(raw.incentiveCostPerComplete, DEFAULT_FIELDWORK_CONFIG.incentiveCostPerComplete, 0, 50_000),
    };
}

function validateBoundedField(
    rawValue: unknown,
    min: number,
    max: number,
    errorMessage: string,
): string | null {
    if (rawValue === undefined) return null;
    const parsed = parseFiniteNumber(rawValue);
    if (parsed === null || parsed < min || parsed > max) return errorMessage;
    return null;
}

export function validateFieldworkConfig(raw: unknown, allowedStrataFields?: string[]): string | null {
    if (!isPlainObject(raw)) return "虚拟发放配置格式无效";
    const validPresets = ["balanced", "stratum_differential", "high_burden_sensitive", "peak_congestion"];
    if (raw.preset !== undefined && (typeof raw.preset !== "string" || !validPresets.includes(raw.preset))) {
        return "虚拟发放预设场景无效";
    }

    const numericChecks =
        validateBoundedField(raw.baseUnitNonResponseRate, 0, 0.75, "基准单元无回答率需在 0%–75% 之间")
        ?? validateBoundedField(raw.baseSpeederRate, 0, 0.35, "闪电敷衍卷基准比例需在 0%–35% 之间")
        ?? validateBoundedField(raw.baseStraightlinerRate, 0, 0.35, "直线作答废卷基准比例需在 0%–35% 之间")
        ?? validateBoundedField(raw.baseItemSkipRate, 0, 0.25, "普通题项随机漏答率需在 0%–25% 之间")
        ?? validateBoundedField(raw.contactCostPerUnit, 0, 10_000, "单份触达参考成本需在 0–10000 元之间")
        ?? validateBoundedField(raw.incentiveCostPerComplete, 0, 50_000, "单份完答激励参考成本需在 0–50000 元之间");
    if (numericChecks) return numericChecks;

    if (raw.stratumField !== undefined && raw.stratumField !== null) {
        if (typeof raw.stratumField !== "string") {
            return "差异化应答分层字段格式无效";
        }
        const field = raw.stratumField.trim();
        if (field !== "" && allowedStrataFields !== undefined && !allowedStrataFields.includes(field)) {
            return allowedStrataFields.length === 0
                ? `当前课题未配置分层变量，不能设置差异化应答分层字段“${field}”`
                : `差异化应答分层字段“${field}”不在已映射的分层变量中`;
        }
    }

    if (raw.stratumNonResponseRates !== undefined && raw.stratumNonResponseRates !== null) {
        if (!isPlainObject(raw.stratumNonResponseRates)) {
            return "分层单元无回答率配置格式无效";
        }
        for (const [key, val] of Object.entries(raw.stratumNonResponseRates)) {
            if (!key.trim()) return "分层单元无回答率包含空客群名称";
            const parsed = parseFiniteNumber(val);
            if (parsed === null || parsed < 0 || parsed > 0.85) {
                return "各分层单元无回答率需在 0%–85% 之间";
            }
        }
    }

    return null;
}

const VALID_ISSUES = new Set<AdjustmentIssueKey>([
    "unit_nonresponse_gap",
    "stratum_response_bias",
    "careless_responses",
    "questionnaire_burden_or_range",
    "periodic_or_frame_risk",
    "unmeasured_variables",
]);

const VALID_ACTIONS = new Set<AdjustmentActionKey>([
    "revise_questionnaire",
    "recalibrate_sample_size",
    "upgrade_sampling_design",
    "apply_nonresponse_weighting",
]);

export function parseAdjustmentPlan(raw: unknown): AdjustmentPlan | null {
    if (!isPlainObject(raw)) return null;
    if (!Array.isArray(raw.identifiedIssues) || !Array.isArray(raw.plannedActions) || typeof raw.rationale !== "string") {
        return null;
    }
    const identifiedIssues = [...new Set(raw.identifiedIssues.filter((item): item is AdjustmentIssueKey => VALID_ISSUES.has(item as AdjustmentIssueKey)))];
    const plannedActions = [...new Set(raw.plannedActions.filter((item): item is AdjustmentActionKey => VALID_ACTIONS.has(item as AdjustmentActionKey)))];
    const rationale = raw.rationale.trim();
    return {
        identifiedIssues,
        plannedActions,
        rationale,
        ...(typeof raw.updatedAt === "string" ? { updatedAt: raw.updatedAt } : {}),
    };
}

export function validateAdjustmentPlan(raw: unknown): string | null {
    const plan = parseAdjustmentPlan(raw);
    if (!plan) return "请填写完整的抽样与投放调优决策单";
    if (plan.identifiedIssues.length === 0) return "请至少勾选 1 项首轮试投暴露的数据或抽样问题";
    if (plan.plannedActions.length === 0) return "请至少选择 1 项二轮正式投放拟采取的调优动作";
    if (plan.rationale.length < 15) return "调优依据与统计思路说明至少需填写 15 个字";
    if (plan.rationale.length > 2000) return "调优依据说明不能超过 2000 字";
    return null;
}
