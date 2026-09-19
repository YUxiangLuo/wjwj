import type { AdvancedPlanBase, AdvancedPlanKind, AdvancedPlanSnapshot, SurveyVariableSpec } from "../../domain/experiment/planning-types";
export type { AdvancedPlanKind, AdvancedPlanSnapshot } from "../../domain/experiment/planning-types";
import {
    calculateClusterSamplingSize,
    calculateSampleSizeByCV,
    calculateSurveyVariableRequiredSampleSize,
} from "./sample-plan";

import { calculateCostPlan } from "./cost-plan";
import { isConfidenceLevel } from "@/domain/statistics/confidence-level";
import { getSurveyVariableParameterError } from "./survey-variable-validation";

const KINDS = new Set<AdvancedPlanKind>(["cost", "multivar", "cv", "cluster"]);
const IMPORTANCE = new Set(["primary", "secondary", "tertiary"]);

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function positive(value: unknown): value is number { return isFiniteNumber(value) && value > 0; }
function count(value: unknown): value is number { return positive(value) && Number.isSafeInteger(value); }
function rate(value: unknown, scale: number): value is number { return isFiniteNumber(value) && value >= 0 && value < scale; }
function confidence(value: unknown): value is string { return typeof value === "string" && isConfidenceLevel(value); }
function errorPercent(value: unknown): value is number { return positive(value) && value < 100; }

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function hasNumbers(value: Record<string, unknown>, keys: string[]): boolean {
    return keys.every((key) => isFiniteNumber(value[key]));
}

function parseSurveyVariable(value: unknown): SurveyVariableSpec | null {
    if (!isRecord(value)) return null;
    if (!isNonEmptyString(value.id) || !isNonEmptyString(value.name)) return null;
    if (value.type !== "proportion" && value.type !== "mean") return null;
    if (!isFiniteNumber(value.estimatedValue)) return null;
    if (value.estimatedStdDev !== undefined && !isFiniteNumber(value.estimatedStdDev)) return null;
    if (typeof value.importance !== "string" || !IMPORTANCE.has(value.importance)) return null;
    if (typeof value.confidenceLevel !== "string") return null;
    if (!isFiniteNumber(value.marginOfError) || !count(value.requiredSampleSize)) return null;
    const variable: SurveyVariableSpec = {
        id: value.id,
        name: value.name,
        type: value.type,
        estimatedValue: value.estimatedValue,
        ...(value.estimatedStdDev !== undefined ? { estimatedStdDev: value.estimatedStdDev } : {}),
        importance: value.importance as SurveyVariableSpec["importance"],
        confidenceLevel: value.confidenceLevel,
        marginOfError: value.marginOfError,
        requiredSampleSize: value.requiredSampleSize,
    };
    return getSurveyVariableParameterError(variable) ? null : variable;
}

function parseBase(value: unknown): (AdvancedPlanBase & Record<string, unknown>) | null {
    if (!isRecord(value)) return null;
    if (value.version !== 1) return null;
    if (typeof value.kind !== "string" || !KINDS.has(value.kind as AdvancedPlanKind)) return null;
    if (!isNonEmptyString(value.appliedAt) || !Number.isFinite(Date.parse(value.appliedAt))) return null;
    if (!isRecord(value.inputs) || !isRecord(value.result)) return null;
    return value as AdvancedPlanBase & Record<string, unknown>;
}

function parseAdvancedPlan(value: unknown): AdvancedPlanSnapshot | null {
    const base = parseBase(value);
    if (!base) return null;
    const inputs = base.inputs as Record<string, unknown>;
    const result = base.result as Record<string, unknown>;

    switch (base.kind) {
        case "cost": {
            if (!confidence(inputs.confidenceLevel)) return null;
            if (!hasNumbers(inputs, ["targetMarginOfError", "designEffect", "nonResponseRate", "fixedCost", "variableCostPerUnit", "totalBudget"])) return null;
            if (!hasNumbers(result, ["requiredSampleSize", "totalCost"])) return null;
            if (typeof result.feasible !== "boolean") return null;
            if (!errorPercent(inputs.targetMarginOfError) || !positive(inputs.designEffect) || !rate(inputs.nonResponseRate, 1)) return null;
            if ([inputs.fixedCost, inputs.variableCostPerUnit, inputs.totalBudget, result.totalCost].some(value => !isFiniteNumber(value) || value < 0)) return null;
            if (!count(result.requiredSampleSize)) return null;
            return {
                version: 1,
                kind: "cost",
                appliedAt: base.appliedAt,
                inputs: {
                    confidenceLevel: inputs.confidenceLevel,
                    targetMarginOfError: inputs.targetMarginOfError as number,
                    designEffect: inputs.designEffect as number,
                    nonResponseRate: inputs.nonResponseRate as number,
                    fixedCost: inputs.fixedCost as number,
                    variableCostPerUnit: inputs.variableCostPerUnit as number,
                    totalBudget: inputs.totalBudget as number,
                },
                result: {
                    requiredSampleSize: result.requiredSampleSize as number,
                    totalCost: result.totalCost as number,
                    feasible: result.feasible as boolean,
                },
            };
        }
        case "multivar": {
            if (!Array.isArray(inputs.variables) || inputs.variables.length === 0) return null;
            const variables = inputs.variables.map(parseSurveyVariable);
            if (variables.some((variable) => variable === null) || new Set(variables.map(variable => variable!.id)).size !== variables.length) return null;
            if (!count(result.requiredSampleSize)) return null;
            return {
                version: 1,
                kind: "multivar",
                appliedAt: base.appliedAt,
                inputs: { variables: variables as SurveyVariableSpec[] },
                result: { requiredSampleSize: result.requiredSampleSize as number },
            };
        }
        case "cv": {
            if (!confidence(inputs.confidenceLevel)) return null;
            if (!hasNumbers(inputs, ["targetCV", "estimatedCV", "designEffect", "nonResponseRate"])) return null;
            if (!hasNumbers(result, ["requiredSampleSize", "expectedRespondentSampleSize", "achievedCV"])) return null;
            if (!positive(inputs.targetCV) || !positive(inputs.estimatedCV) || !positive(inputs.designEffect) || !rate(inputs.nonResponseRate, 100)) return null;
            if (!count(result.requiredSampleSize) || !positive(result.expectedRespondentSampleSize) || (result.achievedCV as number) < 0) return null;
            return {
                version: 1,
                kind: "cv",
                appliedAt: base.appliedAt,
                inputs: {
                    confidenceLevel: inputs.confidenceLevel,
                    targetCV: inputs.targetCV as number,
                    estimatedCV: inputs.estimatedCV as number,
                    designEffect: inputs.designEffect as number,
                    nonResponseRate: inputs.nonResponseRate as number,
                },
                result: {
                    requiredSampleSize: result.requiredSampleSize as number,
                    expectedRespondentSampleSize: result.expectedRespondentSampleSize as number,
                    achievedCV: result.achievedCV as number,
                },
            };
        }
        case "cluster": {
            if (!confidence(inputs.confidenceLevel)) return null;
            if (!hasNumbers(inputs, ["marginOfError", "clusterSize", "designEffect", "nonResponseRate"])) return null;
            if (!hasNumbers(result, ["requiredClusters", "requiredSampleSize"])) return null;
            if (!errorPercent(inputs.marginOfError) || !count(inputs.clusterSize) || !positive(inputs.designEffect) || !rate(inputs.nonResponseRate, 100)) return null;
            const icc = result.intraClassCorrelation;
            if (icc !== null && (!isFiniteNumber(icc) || icc < -1 || icc > 1)) return null;
            // 群框和 deff 上界依赖总体规模，统一交给 calculateClusterSamplingSize 复核。
            if (!count(result.requiredClusters) || !count(result.requiredSampleSize)) return null;
            return {
                version: 1,
                kind: "cluster",
                appliedAt: base.appliedAt,
                inputs: {
                    confidenceLevel: inputs.confidenceLevel,
                    marginOfError: inputs.marginOfError as number,
                    clusterSize: inputs.clusterSize as number,
                    designEffect: inputs.designEffect as number,
                    nonResponseRate: inputs.nonResponseRate as number,
                },
                result: {
                    requiredClusters: result.requiredClusters as number,
                    requiredSampleSize: result.requiredSampleSize as number,
                    intraClassCorrelation: icc,
                },
            };
        }
    }
}

/** 解析高级规划快照数组；任何一份形状非法都会导致整体失败（fail closed）。 */
export function parseAdvancedPlans(value: unknown): AdvancedPlanSnapshot[] | null {
    if (!Array.isArray(value)) return null;
    const plans = value.map(parseAdvancedPlan);
    if (plans.some((plan) => plan === null)) return null;
    return plans as AdvancedPlanSnapshot[];
}

function approximatelyEqual(left: number, right: number, tolerance = 1e-6) {
    return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance;
}

function requireEqual(actual: number, expected: number, message: string, tolerance?: number): string | null {
    return approximatelyEqual(actual, expected, tolerance) ? null : message;
}

/**
 * 用与规划页相同的计算函数复算快照 inputs→result；
 * appliedFinalSize 非空时还要求被应用快照的推荐样本量与最终样本量一致。
 */
export function validateAdvancedPlanConsistency(
    plan: AdvancedPlanSnapshot,
    populationSize: number | null,
    appliedFinalSize: number | null,
): string | null {
    if (!parseAdvancedPlan(plan)) return "高级规划快照包含无效参数，请检查取值范围并重新应用";
    if (populationSize === null || !Number.isSafeInteger(populationSize) || populationSize <= 0) {
        return "缺少总体规模，无法复算高级样本量规划";
    }
    const kindLabels: Record<AdvancedPlanKind, string> = {
        cost: "成本权衡",
        multivar: "多变量规划",
        cv: "CV-based 计算",
        cluster: "整群抽样",
    };
    const label = kindLabels[plan.kind];
    const appliedError = appliedFinalSize !== null
        ? (recomputed: number) => requireEqual(
            recomputed,
            appliedFinalSize,
            `${label}快照的推荐样本量与最终样本量不一致，请重新应用或改回基础公式`,
        )
        : () => null;

    switch (plan.kind) {
        case "cost": {
            const recomputed = calculateCostPlan(plan.inputs, populationSize);
            if (!recomputed) return `${label}快照的输入参数无法复算，请重新应用`;
            const { requiredSampleSize, totalCost } = recomputed;
            if (requiredSampleSize !== plan.result.requiredSampleSize) return `${label}快照的结果与输入不一致，请重新应用`;
            const costError = requireEqual(totalCost, plan.result.totalCost, `${label}快照的总成本与输入不一致，请重新应用`, 1e-6);
            if (costError) return costError;
            if (recomputed.isFeasible !== plan.result.feasible) return `${label}快照的预算或精度达标状态与输入不一致，请重新应用`;
            return appliedError(requiredSampleSize);
        }
        case "multivar": {
            for (const variable of plan.inputs.variables) {
                const recomputed = calculateSurveyVariableRequiredSampleSize(variable, populationSize);
                if (recomputed !== variable.requiredSampleSize) {
                    return `${label}快照中变量「${variable.name}」的所需样本量与输入不一致，请重新应用`;
                }
            }
            const requiredSampleSize = plan.inputs.variables.length > 0
                ? Math.max(...plan.inputs.variables.map((variable) => variable.requiredSampleSize))
                : 0;
            if (requiredSampleSize !== plan.result.requiredSampleSize) {
                return `${label}快照的推荐样本量与变量列表不一致，请重新应用`;
            }
            return appliedError(requiredSampleSize);
        }
        case "cv": {
            const recomputed = calculateSampleSizeByCV({
                confidenceLevel: plan.inputs.confidenceLevel,
                targetCV: plan.inputs.targetCV / 100,
                populationSize,
                estimatedCV: plan.inputs.estimatedCV / 100,
                designEffect: plan.inputs.designEffect,
                nonResponseRate: plan.inputs.nonResponseRate / 100,
            });
            if (!recomputed) return `${label}快照的输入参数无法复算，请重新应用`;
            if (recomputed.requiredSampleSize !== plan.result.requiredSampleSize) return `${label}快照的结果与输入不一致，请重新应用`;
            const respondentError = requireEqual(
                recomputed.expectedRespondentSampleSize,
                plan.result.expectedRespondentSampleSize,
                `${label}快照的预期完成量与输入不一致，请重新应用`,
            );
            if (respondentError) return respondentError;
            const cvError = requireEqual(recomputed.achievedCV, plan.result.achievedCV, `${label}快照的达成 CV 与输入不一致，请重新应用`, 1e-6);
            if (cvError) return cvError;
            return appliedError(recomputed.requiredSampleSize);
        }
        case "cluster": {
            const recomputed = calculateClusterSamplingSize({
                populationSize,
                confidenceLevel: plan.inputs.confidenceLevel,
                marginOfError: plan.inputs.marginOfError,
                clusterSize: plan.inputs.clusterSize,
                deff: plan.inputs.designEffect,
                nonResponseRate: plan.inputs.nonResponseRate / 100,
            });
            if (!recomputed) return `${label}快照的输入参数无法复算，请重新应用`;
            if (recomputed.requiredClusters !== plan.result.requiredClusters) return `${label}快照的群数与输入不一致，请重新应用`;
            if (recomputed.requiredSampleSize !== plan.result.requiredSampleSize) return `${label}快照的结果与输入不一致，请重新应用`;
            const actualIcc = recomputed.intraClassCorrelation;
            const savedIcc = plan.result.intraClassCorrelation;
            if (actualIcc === null || savedIcc === null
                ? actualIcc !== savedIcc
                : !approximatelyEqual(actualIcc, savedIcc, 1e-6)) {
                return `${label}快照的群内相关系数与输入不一致，请重新应用`;
            }
            return appliedError(recomputed.requiredSampleSize);
        }
    }
}
