import type { SamplePlanData } from "../api-client";
import { attachCalculatedSampleSize } from "./sample-plan";

export type SamplePlanEstimationType = "proportion" | "mean";
export type SamplePlanAdvancedSource = "cost" | "multivar" | "cv" | "cluster";

const ADVANCED_SOURCE_LABELS: Record<SamplePlanAdvancedSource, string> = {
    cost: "成本权衡",
    multivar: "多变量规划",
    cv: "CV-based计算",
    cluster: "整群抽样",
};

export function normalizeSamplePlanEstimationType(value: unknown): SamplePlanEstimationType {
    return value === "mean" ? "mean" : "proportion";
}

export function normalizeSamplePlanAdvancedSource(value: unknown): SamplePlanAdvancedSource | undefined {
    return value === "cost" || value === "multivar" || value === "cv" || value === "cluster"
        ? value
        : undefined;
}

function toFiniteNumber(value: unknown): number | null {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

export function normalizeSamplePlanData(
    samplePlan: unknown,
    populationSize?: number | null,
): SamplePlanData | null {
    if (!samplePlan || typeof samplePlan !== "object") {
        return null;
    }

    const hydrated = attachCalculatedSampleSize(samplePlan as Record<string, any>, populationSize);
    const data = (hydrated ?? samplePlan) as Record<string, unknown>;

    const confidenceLevel = typeof data.confidenceLevel === "string"
        ? data.confidenceLevel
        : String(data.confidenceLevel ?? "");
    const { advancedPlanSource: _ignoredAdvancedSource, ...restData } = data;
    const estimationType = normalizeSamplePlanEstimationType(data.estimationType);
    const marginOfError = toFiniteNumber(data.marginOfError);
    const finalSampleSize = toFiniteNumber(data.finalSampleSize);
    const recommendedSize = toFiniteNumber(data.recommendedSize)
        ?? toFiniteNumber(data.calculatedSampleSize)
        ?? finalSampleSize;
    const designEffect = toFiniteNumber(data.designEffect);
    const nonResponseRate = toFiniteNumber(data.nonResponseRate);
    const populationVariance = toFiniteNumber(data.populationVariance);
    const advancedPlanSource = normalizeSamplePlanAdvancedSource(data.advancedPlanSource);

    if (!confidenceLevel || marginOfError == null || finalSampleSize == null || finalSampleSize <= 0) {
        return null;
    }

    return {
        ...restData,
        estimationType,
        confidenceLevel,
        marginOfError,
        ...(advancedPlanSource ? { advancedPlanSource } : {}),
        ...(estimationType === "mean" && populationVariance != null && populationVariance > 0
            ? { populationVariance }
            : {}),
        designEffect: designEffect != null && designEffect > 0 ? designEffect : 1,
        nonResponseRate: nonResponseRate != null && nonResponseRate >= 0 && nonResponseRate < 1 ? nonResponseRate : 0,
        recommendedSize: recommendedSize != null && recommendedSize > 0
            ? Math.round(recommendedSize)
            : Math.round(finalSampleSize),
        finalSampleSize: Math.round(finalSampleSize),
    } as SamplePlanData;
}

export function getEstimationTypeLabel(value: unknown): string {
    return normalizeSamplePlanEstimationType(value) === "mean" ? "均值估计" : "比例估计";
}

export function getMarginOfErrorLabel(value: unknown): string {
    return normalizeSamplePlanEstimationType(value) === "mean" ? "绝对误差限" : "允许误差";
}

export function getAdvancedPlanSourceLabel(value: unknown): string | null {
    const source = normalizeSamplePlanAdvancedSource(value);
    return source ? ADVANCED_SOURCE_LABELS[source] : null;
}

export function formatMarginOfError(
    marginOfError: number,
    estimationType: unknown,
    options?: { meanSuffix?: string },
): string {
    if (normalizeSamplePlanEstimationType(estimationType) === "mean") {
        return `±${marginOfError}${options?.meanSuffix ?? ""}`;
    }
    return `±${marginOfError}%`;
}

/** 样本规划参数统一使用最多一位小数，避免把浮点计算尾差直接展示给学生。 */
export function formatSamplePlanNumber(value: number): string {
    return Number(value.toFixed(1)).toString();
}
