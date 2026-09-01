import {
    calculateClusterSamplingSize,
    calculateFinitePopulationSampleSize,
    calculateSampleSizeByCV,
    calculateSurveyVariableRequiredSampleSize,
    type SurveyVariableSpec,
} from "./sample-plan";

/**
 * 高级样本量规划快照：学生点击「应用」时记录该类工具的输入与结果，
 * 提交时服务端用同一套计算函数复算 inputs→result，防止伪造或过期引用。
 * 覆盖会写非标准路径样本量的四类工具（与 AdvancedNonStandardSampleSource 一致）；
 * domain/deff 工具调整的是基础输入，已由基础路径复算覆盖。
 */
export type AdvancedPlanKind = "cost" | "multivar" | "cv" | "cluster";

interface AdvancedPlanBase {
    version: 1;
    kind: AdvancedPlanKind;
    /** 应用时间（ISO 字符串），仅作记录不参与复算。 */
    appliedAt: string;
}

export type AdvancedPlanSnapshot =
    | (AdvancedPlanBase & {
        kind: "cost";
        inputs: {
            confidenceLevel: string;
            /** 目标误差限（百分数，与工具表单一致）。 */
            targetMarginOfError: number;
            designEffect: number;
            /** 无回答率（小数）。 */
            nonResponseRate: number;
            fixedCost: number;
            variableCostPerUnit: number;
            totalBudget: number;
        };
        result: { requiredSampleSize: number; totalCost: number; feasible: boolean };
    })
    | (AdvancedPlanBase & {
        kind: "multivar";
        inputs: { variables: SurveyVariableSpec[] };
        result: { requiredSampleSize: number };
    })
    | (AdvancedPlanBase & {
        kind: "cv";
        inputs: {
            confidenceLevel: string;
            /** 目标/估计变异系数（百分数，与工具表单一致）。 */
            targetCV: number;
            estimatedCV: number;
            designEffect: number;
            /** 无回答率（百分数，与工具表单一致）。 */
            nonResponseRate: number;
        };
        result: {
            requiredSampleSize: number;
            expectedRespondentSampleSize: number;
            achievedCV: number;
        };
    })
    | (AdvancedPlanBase & {
        kind: "cluster";
        inputs: {
            confidenceLevel: string;
            /** 误差限（百分数，与工具表单一致）。 */
            marginOfError: number;
            clusterSize: number;
            designEffect: number;
            /** 无回答率（百分数，与工具表单一致）。 */
            nonResponseRate: number;
        };
        result: {
            requiredClusters: number;
            requiredSampleSize: number;
            intraClassCorrelation: number;
        };
    });

const KINDS = new Set<AdvancedPlanKind>(["cost", "multivar", "cv", "cluster"]);
const IMPORTANCE = new Set(["primary", "secondary", "tertiary"]);

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

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
    if (!isNonEmptyString(value.confidenceLevel)) return null;
    if (!isFiniteNumber(value.marginOfError) || !isFiniteNumber(value.requiredSampleSize)) return null;
    return {
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
}

function parseBase(value: unknown): (AdvancedPlanBase & Record<string, unknown>) | null {
    if (!isRecord(value)) return null;
    if (value.version !== 1) return null;
    if (typeof value.kind !== "string" || !KINDS.has(value.kind as AdvancedPlanKind)) return null;
    if (!isNonEmptyString(value.appliedAt)) return null;
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
            if (!isNonEmptyString(inputs.confidenceLevel)) return null;
            if (!hasNumbers(inputs, ["targetMarginOfError", "designEffect", "nonResponseRate", "fixedCost", "variableCostPerUnit", "totalBudget"])) return null;
            if (!hasNumbers(result, ["requiredSampleSize", "totalCost"])) return null;
            if (typeof result.feasible !== "boolean") return null;
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
            if (!Array.isArray(inputs.variables)) return null;
            const variables = inputs.variables.map(parseSurveyVariable);
            if (variables.some((variable) => variable === null)) return null;
            if (!hasNumbers(result, ["requiredSampleSize"])) return null;
            return {
                version: 1,
                kind: "multivar",
                appliedAt: base.appliedAt,
                inputs: { variables: variables as SurveyVariableSpec[] },
                result: { requiredSampleSize: result.requiredSampleSize as number },
            };
        }
        case "cv": {
            if (!isNonEmptyString(inputs.confidenceLevel)) return null;
            if (!hasNumbers(inputs, ["targetCV", "estimatedCV", "designEffect", "nonResponseRate"])) return null;
            if (!hasNumbers(result, ["requiredSampleSize", "expectedRespondentSampleSize", "achievedCV"])) return null;
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
            if (!isNonEmptyString(inputs.confidenceLevel)) return null;
            if (!hasNumbers(inputs, ["marginOfError", "clusterSize", "designEffect", "nonResponseRate"])) return null;
            if (!hasNumbers(result, ["requiredClusters", "requiredSampleSize", "intraClassCorrelation"])) return null;
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
                    intraClassCorrelation: result.intraClassCorrelation as number,
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
    if (populationSize === null || !Number.isFinite(populationSize) || populationSize <= 0) {
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
            const requiredSampleSize = calculateFinitePopulationSampleSize({
                confidenceLevel: plan.inputs.confidenceLevel,
                marginOfError: plan.inputs.targetMarginOfError,
                populationSize,
                designEffect: plan.inputs.designEffect,
                nonResponseRate: plan.inputs.nonResponseRate,
            });
            if (requiredSampleSize === null) return `${label}快照的输入参数无法复算，请重新应用`;
            if (requiredSampleSize !== plan.result.requiredSampleSize) return `${label}快照的结果与输入不一致，请重新应用`;
            const totalCost = plan.inputs.fixedCost + requiredSampleSize * plan.inputs.variableCostPerUnit;
            const costError = requireEqual(totalCost, plan.result.totalCost, `${label}快照的总成本与输入不一致，请重新应用`, 1e-6);
            if (costError) return costError;
            if ((totalCost <= plan.inputs.totalBudget) !== plan.result.feasible) return `${label}快照的预算可行性与输入不一致，请重新应用`;
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
            const iccError = requireEqual(
                recomputed.intraClassCorrelation,
                plan.result.intraClassCorrelation,
                `${label}快照的群内相关系数与输入不一致，请重新应用`,
                1e-6,
            );
            if (iccError) return iccError;
            return appliedError(recomputed.requiredSampleSize);
        }
    }
}
