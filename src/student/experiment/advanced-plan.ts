export type AdvancedPlanKind = "domain" | "cost" | "deff" | "multivar" | "cv" | "cluster";

interface AdvancedPlanBase {
    version: 1;
    kind: AdvancedPlanKind;
    appliedAt: string;
}

export type AdvancedPlanSnapshot =
    | (AdvancedPlanBase & {
        kind: "domain";
        inputs: {
            estimationType: "mean" | "proportion";
            populationVariance?: number;
            domains: Array<{
                name: string;
                populationSize: number;
                confidenceLevel: string;
                marginOfError: number;
                requiredSampleSize: number;
            }>;
        };
        result: { requiredSampleSize: number };
    })
    | (AdvancedPlanBase & {
        kind: "cost";
        inputs: {
            confidenceLevel: string;
            targetMarginOfError: number;
            designEffect: number;
            nonResponseRate: number;
            fixedCost: number;
            variableCostPerUnit: number;
            totalBudget: number;
        };
        result: { requiredSampleSize: number; totalCost: number; feasible: boolean };
    })
    | (AdvancedPlanBase & {
        kind: "deff";
        inputs: { designEffect: number };
        result: { appliedDesignEffect: number };
    })
    | (AdvancedPlanBase & {
        kind: "multivar";
        inputs: {
            variables: Array<{
                name: string;
                type: "mean" | "proportion";
                estimatedValue: number;
                estimatedStdDev?: number;
                importance: "primary" | "secondary" | "tertiary";
                confidenceLevel: string;
                marginOfError: number;
                requiredSampleSize: number;
            }>;
        };
        result: { requiredSampleSize: number };
    })
    | (AdvancedPlanBase & {
        kind: "cv";
        inputs: {
            confidenceLevel: string;
            targetCV: number;
            estimatedCV: number;
            designEffect: number;
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
            marginOfError: number;
            clusterSize: number;
            designEffect: number;
            nonResponseRate: number;
        };
        result: {
            requiredClusters: number;
            requiredSampleSize: number;
            intraClassCorrelation: number;
        };
    });

export type FinalSizeSource = "basic" | "manual" | "advanced";

const CONFIDENCE_LEVELS = new Set(["90", "95", "99"]);

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function isPositiveNumber(value: unknown): value is number {
    return isFiniteNumber(value) && value > 0;
}

function isNonNegativeNumber(value: unknown): value is number {
    return isFiniteNumber(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
    return Number.isInteger(value) && Number(value) > 0;
}

function isConfidenceLevel(value: unknown): value is string {
    return typeof value === "string" && CONFIDENCE_LEVELS.has(value);
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function hasValidBase(record: Record<string, unknown>) {
    return record.version === 1
        && isNonEmptyString(record.appliedAt)
        && Number.isFinite(Date.parse(record.appliedAt));
}

function isDomainPlan(record: Record<string, unknown>) {
    if (!isRecord(record.inputs) || !isRecord(record.result)) return false;
    const { inputs, result } = record;
    if (inputs.estimationType !== "mean" && inputs.estimationType !== "proportion") return false;
    if (inputs.populationVariance !== undefined && !isPositiveNumber(inputs.populationVariance)) return false;
    if (inputs.estimationType === "mean" && !isPositiveNumber(inputs.populationVariance)) return false;
    if (!Array.isArray(inputs.domains) || inputs.domains.length === 0) return false;
    if (!inputs.domains.every((domain) => {
        if (!isRecord(domain)) return false;
        return isNonEmptyString(domain.name)
            && isPositiveInteger(domain.populationSize)
            && isConfidenceLevel(domain.confidenceLevel)
            && isPositiveNumber(domain.marginOfError)
            && isPositiveInteger(domain.requiredSampleSize);
    })) return false;
    return isPositiveInteger(result.requiredSampleSize);
}

function isCostPlan(record: Record<string, unknown>) {
    if (!isRecord(record.inputs) || !isRecord(record.result)) return false;
    const { inputs, result } = record;
    return isConfidenceLevel(inputs.confidenceLevel)
        && isPositiveNumber(inputs.targetMarginOfError)
        && isPositiveNumber(inputs.designEffect)
        && isNonNegativeNumber(inputs.nonResponseRate)
        && isNonNegativeNumber(inputs.fixedCost)
        && isPositiveNumber(inputs.variableCostPerUnit)
        && isNonNegativeNumber(inputs.totalBudget)
        && isPositiveInteger(result.requiredSampleSize)
        && isNonNegativeNumber(result.totalCost)
        && typeof result.feasible === "boolean";
}

function isDesignEffectPlan(record: Record<string, unknown>) {
    if (!isRecord(record.inputs) || !isRecord(record.result)) return false;
    return isPositiveNumber(record.inputs.designEffect)
        && isPositiveNumber(record.result.appliedDesignEffect);
}

function isMultivariablePlan(record: Record<string, unknown>) {
    if (!isRecord(record.inputs) || !isRecord(record.result)) return false;
    const variables = record.inputs.variables;
    if (!Array.isArray(variables) || variables.length === 0) return false;
    if (!variables.every((variable) => {
        if (!isRecord(variable)) return false;
        if (variable.type !== "mean" && variable.type !== "proportion") return false;
        if (variable.importance !== "primary" && variable.importance !== "secondary" && variable.importance !== "tertiary") return false;
        if (variable.estimatedStdDev !== undefined && !isPositiveNumber(variable.estimatedStdDev)) return false;
        if (variable.type === "mean" && !isPositiveNumber(variable.estimatedStdDev)) return false;
        return isNonEmptyString(variable.name)
            && isFiniteNumber(variable.estimatedValue)
            && isConfidenceLevel(variable.confidenceLevel)
            && isPositiveNumber(variable.marginOfError)
            && isPositiveInteger(variable.requiredSampleSize);
    })) return false;
    return isPositiveInteger(record.result.requiredSampleSize);
}

function isCvPlan(record: Record<string, unknown>) {
    if (!isRecord(record.inputs) || !isRecord(record.result)) return false;
    const { inputs, result } = record;
    return isConfidenceLevel(inputs.confidenceLevel)
        && isPositiveNumber(inputs.targetCV)
        && isPositiveNumber(inputs.estimatedCV)
        && isPositiveNumber(inputs.designEffect)
        && isNonNegativeNumber(inputs.nonResponseRate)
        && isPositiveInteger(result.requiredSampleSize)
        && isPositiveNumber(result.expectedRespondentSampleSize)
        && isPositiveNumber(result.achievedCV);
}

function isClusterPlan(record: Record<string, unknown>) {
    if (!isRecord(record.inputs) || !isRecord(record.result)) return false;
    const { inputs, result } = record;
    return isConfidenceLevel(inputs.confidenceLevel)
        && isPositiveNumber(inputs.marginOfError)
        && isPositiveInteger(inputs.clusterSize)
        && isPositiveNumber(inputs.designEffect)
        && isNonNegativeNumber(inputs.nonResponseRate)
        && isPositiveInteger(result.requiredClusters)
        && isPositiveInteger(result.requiredSampleSize)
        && isFiniteNumber(result.intraClassCorrelation)
        && result.intraClassCorrelation >= 0
        && result.intraClassCorrelation <= 1;
}

export function isAdvancedPlanSnapshot(value: unknown): value is AdvancedPlanSnapshot {
    if (!isRecord(value) || !hasValidBase(value)) return false;
    if (value.kind === "domain") return isDomainPlan(value);
    if (value.kind === "cost") return isCostPlan(value);
    if (value.kind === "deff") return isDesignEffectPlan(value);
    if (value.kind === "multivar") return isMultivariablePlan(value);
    if (value.kind === "cv") return isCvPlan(value);
    if (value.kind === "cluster") return isClusterPlan(value);
    return false;
}

export function normalizeFinalSizeSource(params: {
    value: unknown;
    hasAdvancedSource: boolean;
    hasExplicitFinalSize: boolean;
}): FinalSizeSource {
    const requested = params.value === "basic" || params.value === "manual" || params.value === "advanced"
        ? params.value
        : params.hasAdvancedSource ? "advanced" : params.hasExplicitFinalSize ? "manual" : "basic";
    if (requested === "advanced" && !params.hasAdvancedSource) {
        return params.hasExplicitFinalSize ? "manual" : "basic";
    }
    return requested;
}

export function leaveAdvancedFinalSizeSource(value: FinalSizeSource): FinalSizeSource {
    return value === "advanced" ? "manual" : value;
}

export function replaceAdvancedPlan(
    current: AdvancedPlanSnapshot[],
    next: AdvancedPlanSnapshot,
) {
    return [...current.filter((item) => item.kind !== next.kind), next];
}

export function parseAdvancedPlans(value: unknown): AdvancedPlanSnapshot[] {
    if (!Array.isArray(value)) return [];
    return value.filter(isAdvancedPlanSnapshot);
}
