import { getRichTextPlainLength, getRichTextPlainText } from "../../utils/rich-text";
import { validateQuestionAtIndex } from "../../lib/validate-question";
import { normalizeSamplePlanEstimationType } from "./sample-plan-display";
import { getFinalSampleSizeBounds } from "./final-sample-bounds";
import { getSamplingAcceptedRange } from "./sampling-tolerance";
import { calculateFinitePopulationSampleSize, calculateMeanEstimationSampleSize } from "./sample-plan";
import { parseAdvancedPlans, validateAdvancedPlanConsistency } from "./advanced-plan";
import {
    evaluateSamplingPolicy,
    isCompletedSamplingResult,
    resolveSamplingPolicy,
    type SamplingMethod,
} from "../../lib/sampling-policy";

function toTrimmedString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function toInteger(value: unknown): number | null {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return Math.floor(parsed);
}

export function getTargetSampleSizeFromSamplePlan(samplePlan: unknown) {
    if (!samplePlan || typeof samplePlan !== "object") return null;
    const size = toInteger((samplePlan as Record<string, unknown>).finalSampleSize);
    if (size === null || size <= 0) return null;
    return size;
}

export function validateQuestionnaireForSubmit(questionnaire: unknown): string | null {
    if (!questionnaire || typeof questionnaire !== "object") {
        return "请先完成问卷设计";
    }

    const data = questionnaire as Record<string, unknown>;
    const title = toTrimmedString(data.title);
    const welcomeText = getRichTextPlainText(data.welcomeText);
    const endingText = getRichTextPlainText(data.endingText);
    const questions = Array.isArray(data.questions) ? data.questions : [];

    if (title.length < 1 || title.length > 100) {
        return "问卷标题长度需在1-100字之间";
    }

    if (welcomeText.length < 20 || welcomeText.length > 1000) {
        return "欢迎语长度需在20-1000字之间";
    }

    if (endingText.length < 20 || endingText.length > 1000) {
        return "结束语长度需在20-1000字之间";
    }

    if (questions.length < 5 || questions.length > 50) {
        return "本实验要求问卷题目数量在5-50题之间";
    }

    for (let index = 0; index < questions.length; index += 1) {
        const err = validateQuestionAtIndex(questions[index], index + 1);
        if (err) return err;
    }

    return null;
}

/** 校验持久化后的 samplePlan 形状；不包含子总体/多变量等仅前端的辅助字段（那些字段也不会写入存储）。 */
export function validateSamplePlanForSubmit(
    samplePlan: unknown,
    populationSize: number | null,
    analysisTargetKind?: "mean" | "proportion" | null,
    options: { allowLegacyAdvancedSourceWithoutSnapshot?: boolean } = {},
): string | null {
    if (!samplePlan || typeof samplePlan !== "object") {
        return "请先完成样本量规划";
    }

    const data = samplePlan as Record<string, unknown>;
    if (data.estimationType !== undefined && data.estimationType !== "proportion" && data.estimationType !== "mean") {
        return "估计类型无效";
    }
    const estimationType = normalizeSamplePlanEstimationType(data.estimationType);
    if (
        (analysisTargetKind === "mean" || analysisTargetKind === "proportion")
        && estimationType !== analysisTargetKind
    ) {
        return "估计类型需与研究目标变量一致";
    }
    const confidenceLevel = toTrimmedString(data.confidenceLevel);
    const marginOfError = Number(data.marginOfError);
    const populationVariance = Number(data.populationVariance);
    const designEffect = Number(data.designEffect);
    const nonResponseRate = Number(data.nonResponseRate);
    const recommendedSize = Number(data.recommendedSize);
    const finalSampleSize = Number(data.finalSampleSize);

    if (!confidenceLevel) {
        return "请先设置置信水平";
    }

    const allowedConfidence = new Set(["90", "95", "99"]);
    if (!allowedConfidence.has(confidenceLevel)) {
        return "置信水平需为 90%、95% 或 99%";
    }

    if (estimationType === "mean") {
        if (!Number.isFinite(marginOfError) || marginOfError <= 0) {
            return "均值估计的绝对误差限需为正数";
        }
        if (!Number.isFinite(populationVariance) || populationVariance <= 0) {
            return "均值估计时需提供正的总体方差估计";
        }
    } else if (!Number.isFinite(marginOfError) || marginOfError < 1 || marginOfError > 10) {
        return "允许误差需在1%-10%之间";
    }

    if (data.designEffect === null || !Number.isFinite(designEffect) || designEffect < 0.5 || designEffect > 5) {
        return "设计效应需在 0.5～5.0 之间";
    }
    if (data.nonResponseRate === null || !Number.isFinite(nonResponseRate) || nonResponseRate < 0 || nonResponseRate > 0.5) {
        return "无回答率需在 0%～50% 之间";
    }
    if (!Number.isFinite(recommendedSize) || !Number.isInteger(recommendedSize) || recommendedSize < 1) {
        return "建议样本量需为不小于 1 的整数";
    }
    if (!Number.isFinite(finalSampleSize) || !Number.isInteger(finalSampleSize) || finalSampleSize < 1) {
        return "最终样本量需为不小于 1 的整数";
    }

    const advancedSource = data.advancedPlanSource;
    if (
        advancedSource !== undefined
        && advancedSource !== "cost"
        && advancedSource !== "multivar"
        && advancedSource !== "cv"
        && advancedSource !== "cluster"
    ) {
        return "高级规划来源无效";
    }
    if (estimationType === "mean" && (advancedSource === "cost" || advancedSource === "cluster")) {
        return "当前高级规划仅适用于比例估计，请改用均值规划工具";
    }
    if (estimationType === "proportion" && advancedSource === "cv") {
        return "CV-based 规划仅适用于具有自然零点的均值目标";
    }
    if (advancedSource && data.advancedPlans === undefined && !options.allowLegacyAdvancedSourceWithoutSnapshot) {
        return "高级样本量缺少可复核快照，请重新应用该高级规划";
    }

    // 高级规划快照：形状严格校验、逐份复算 inputs→result；
    // 当前来源种类的快照必须存在且其推荐样本量与最终样本量一致。
    // 历史数据只有来源标记、没有快照时保持放行（grandfathered）。
    if (data.advancedPlans !== undefined) {
        const advancedPlans = parseAdvancedPlans(data.advancedPlans);
        if (!advancedPlans) return "高级规划快照格式无效";
        if (advancedPlans.length > 4 || new Set(advancedPlans.map((plan) => plan.kind)).size !== advancedPlans.length) {
            return "每类高级规划最多保留一份快照";
        }
        const appliedPlan = advancedSource
            ? advancedPlans.find((plan) => plan.kind === advancedSource)
            : undefined;
        if (advancedSource && !appliedPlan) {
            return "高级样本量缺少可复核快照，请重新应用该高级规划";
        }
        for (const plan of advancedPlans) {
            const consistencyError = validateAdvancedPlanConsistency(
                plan,
                populationSize,
                plan === appliedPlan ? finalSampleSize : null,
            );
            if (consistencyError) return consistencyError;
        }
    }

    if (populationSize !== null && Number.isFinite(populationSize) && populationSize > 0) {
        const { min, max } = getFinalSampleSizeBounds(populationSize);
        if (finalSampleSize < min || finalSampleSize > max) {
            return `最终样本量需在 ${min}～${max} 人之间`;
        }

        const calculatedRecommendedSize = estimationType === "mean"
            ? calculateMeanEstimationSampleSize({
                confidenceLevel,
                marginOfError,
                populationSize,
                populationVariance,
                designEffect,
                nonResponseRate,
            })
            : calculateFinitePopulationSampleSize({
                confidenceLevel,
                marginOfError,
                populationSize,
                designEffect,
                nonResponseRate,
            });
        if (calculatedRecommendedSize === null || recommendedSize !== calculatedRecommendedSize) {
            return "建议样本量与当前规划参数不一致，请重新计算";
        }
    }

    return null;
}

export function validateSamplingResultsForSubmit(
    samplingResults: unknown,
    targetSampleSize: number | null,
    populationSize?: number | null,
    samplingPolicy?: unknown,
): string | null {
    if (!samplingResults || typeof samplingResults !== "object") {
        return "请先完成抽样执行";
    }

    const data = samplingResults as Record<string, unknown>;
    const simple = data.simple as Record<string, unknown> | undefined;
    const systematic = data.systematic as Record<string, unknown> | undefined;
    const pps = data.pps as Record<string, unknown> | undefined;
    const stratified = data.stratified as Record<string, unknown> | undefined;
    const byMethod: Record<SamplingMethod, Record<string, unknown> | undefined> = {
        simple,
        systematic,
        pps,
        stratified,
    };
    const policy = resolveSamplingPolicy(samplingPolicy);
    const completedMethods = (Object.keys(byMethod) as SamplingMethod[])
        .filter((method) => policy.methods[method] !== "disabled" && isCompletedSamplingResult(byMethod[method]));
    const progress = evaluateSamplingPolicy(policy, completedMethods);
    if (progress.missingRequired.length > 0) {
        const missing = progress.missingRequired[0]!;
        if (missing === "pps" && pps?.unavailable === true) {
            return "实验模板要求完成PPS抽样，但当前总体没有合格规模变量，请联系教师调整抽样策略";
        }
        const label = missing === "simple"
            ? "简单随机抽样"
            : missing === "systematic"
                ? "系统抽样"
                : missing === "pps"
                    ? "PPS抽样"
                    : "分层抽样";
        return `请先完成${label}`;
    }
    if (!progress.canComplete) return "请至少完成两种本实验启用的抽样方法";

    if (targetSampleSize !== null && Number.isFinite(targetSampleSize) && targetSampleSize > 0) {
        const simpleCount = toInteger(simple?.sampleCount);
        if (completedMethods.includes("simple") && simpleCount !== targetSampleSize) {
            return `简单随机抽样样本量需等于目标样本量（${targetSampleSize}）`;
        }

        const systematicCount = toInteger(systematic?.sampleCount);
        if (completedMethods.includes("systematic") && systematicCount !== targetSampleSize) {
            return `系统抽样样本量需等于目标样本量（${targetSampleSize}）`;
        }

        if (completedMethods.includes("pps")) {
            const acceptedRange = getSamplingAcceptedRange(targetSampleSize, populationSize);
            const ppsCount = toInteger(pps?.sampleCount);
            if (ppsCount === null || ppsCount < 1) {
                return "PPS抽样样本量需大于0";
            }
            if (acceptedRange && (ppsCount < acceptedRange.min || ppsCount > acceptedRange.max)) {
                return `本实验要求PPS抽样样本量在目标样本量的80%-120%之间（${acceptedRange.min}-${acceptedRange.max}）`;
            }
        }

        if (completedMethods.includes("stratified")) {
            const stratifiedLayers = Array.isArray(stratified?.layers) ? stratified.layers : [];
            let stratifiedTotal = 0;
            for (let i = 0; i < stratifiedLayers.length; i += 1) {
                const layer = stratifiedLayers[i];
                if (!layer || typeof layer !== "object") continue;
                const sampleCount = toInteger((layer as Record<string, unknown>).sampleCount);
                if (sampleCount === null || sampleCount < 1) {
                    return `分层抽样第${i + 1}层样本数需为正整数`;
                }
                stratifiedTotal += sampleCount;
            }

            if (stratifiedLayers.length === 0 || stratifiedTotal !== targetSampleSize) {
                return `分层抽样样本量总和需等于目标样本量（${targetSampleSize}）`;
            }
        }
    }

    return null;
}

export function validateReportForSubmit(reportContent: unknown): string | null {
    const reportLength = getRichTextPlainLength(reportContent);
    if (reportLength < 100) {
        return "本实验要求报告内容不少于100字";
    }
    if (reportLength > 5000) {
        return "本实验要求报告内容不超过5000字";
    }
    return null;
}
