import { getRichTextPlainLength, getRichTextPlainText } from "../../utils/rich-text";
import { validateQuestionAtIndex } from "../../lib/validate-question";
import { normalizeSamplePlanEstimationType } from "./sample-plan-display";
import { getFinalSampleSizeBounds } from "./final-sample-bounds";
import { getSamplingAcceptedRange } from "./sampling-tolerance";
import { calculateFinitePopulationSampleSize, calculateMeanEstimationSampleSize } from "./sample-plan";

function toTrimmedString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function toInteger(value: unknown): number | null {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return Math.floor(parsed);
}

function isSamplingStepCompleted(value: unknown) {
    return value === true || value === 1;
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
export function validateSamplePlanForSubmit(samplePlan: unknown, populationSize: number | null): string | null {
    if (!samplePlan || typeof samplePlan !== "object") {
        return "请先完成样本量规划";
    }

    const data = samplePlan as Record<string, unknown>;
    if (data.estimationType !== undefined && data.estimationType !== "proportion" && data.estimationType !== "mean") {
        return "估计类型无效";
    }
    const estimationType = normalizeSamplePlanEstimationType(data.estimationType);
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
): string | null {
    if (!samplingResults || typeof samplingResults !== "object") {
        return "请先完成抽样执行";
    }

    const data = samplingResults as Record<string, unknown>;
    const simple = data.simple as Record<string, unknown> | undefined;
    const systematic = data.systematic as Record<string, unknown> | undefined;
    const pps = data.pps as Record<string, unknown> | undefined;
    const stratified = data.stratified as Record<string, unknown> | undefined;
    const isPpsUnavailable = pps?.unavailable === true;

    if (!simple || !isSamplingStepCompleted(simple.completed)) {
        return "请先完成简单随机抽样";
    }

    if (!systematic || !isSamplingStepCompleted(systematic.completed)) {
        return "请先完成系统抽样";
    }

    if (!isPpsUnavailable && (!pps || !isSamplingStepCompleted(pps.completed))) {
        return "请先完成PPS抽样";
    }

    if (!stratified || !isSamplingStepCompleted(stratified.completed)) {
        return "请先完成分层抽样";
    }

    if (targetSampleSize !== null && Number.isFinite(targetSampleSize) && targetSampleSize > 0) {
        const simpleCount = toInteger(simple.sampleCount);
        if (simpleCount !== targetSampleSize) {
            return `简单随机抽样样本量需等于目标样本量（${targetSampleSize}）`;
        }

        const systematicCount = toInteger(systematic.sampleCount);
        if (systematicCount !== targetSampleSize) {
            return `系统抽样样本量需等于目标样本量（${targetSampleSize}）`;
        }

        if (!isPpsUnavailable) {
            const acceptedRange = getSamplingAcceptedRange(targetSampleSize, populationSize);
            const ppsCount = toInteger(pps?.sampleCount);
            if (ppsCount === null || ppsCount < 1) {
                return "PPS抽样样本量需大于0";
            }
            if (acceptedRange && (ppsCount < acceptedRange.min || ppsCount > acceptedRange.max)) {
                return `本实验要求PPS抽样样本量在目标样本量的80%-120%之间（${acceptedRange.min}-${acceptedRange.max}）`;
            }
        }

        const stratifiedLayers = Array.isArray(stratified.layers) ? stratified.layers : [];
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
