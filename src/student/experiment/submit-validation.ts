import { getRichTextPlainLength, getRichTextPlainText } from "../../utils/rich-text";
import { getSystematicAcceptedRange } from "./systematic-sampling";

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
        return "问卷题目数量需在5-50题之间";
    }

    for (let index = 0; index < questions.length; index += 1) {
        const rawQuestion = questions[index];
        if (!rawQuestion || typeof rawQuestion !== "object") {
            return `第${index + 1}题配置无效`;
        }

        const question = rawQuestion as Record<string, unknown>;
        const type = toTrimmedString(question.type);
        const content = toTrimmedString(question.content);
        if (content.length < 1 || content.length > 500) {
            return `第${index + 1}题题目内容长度需在1-500字之间`;
        }

        if (!["boolean", "single", "multiple", "scale"].includes(type)) {
            return `第${index + 1}题题型无效`;
        }

        if (type === "single" || type === "multiple") {
            const options = Array.isArray(question.options)
                ? question.options.map((option) => toTrimmedString(option)).filter((option) => option.length > 0)
                : [];

            if (options.length < 2 || options.length > 10) {
                return `第${index + 1}题选项数量需在2-10个之间`;
            }

            if (options.some((option) => option.length > 200)) {
                return `第${index + 1}题选项内容不能超过200字`;
            }

            if (type === "multiple") {
                const minSelect = Number.isFinite(Number(question.minSelect)) ? Math.floor(Number(question.minSelect)) : 1;
                const maxSelect = Number.isFinite(Number(question.maxSelect)) ? Math.floor(Number(question.maxSelect)) : options.length;
                if (minSelect < 1 || maxSelect < minSelect || maxSelect > options.length) {
                    return `第${index + 1}题多选数量限制无效`;
                }
            }
        }

        if (type === "scale") {
            const scaleMin = Number.isFinite(Number(question.scaleMin)) ? Number(question.scaleMin) : 1;
            const scaleMax = Number.isFinite(Number(question.scaleMax)) ? Number(question.scaleMax) : 10;
            if (scaleMin < 1 || scaleMax > 10 || scaleMin >= scaleMax) {
                return `第${index + 1}题量表范围无效`;
            }
        }
    }

    return null;
}

export function validateSamplePlanForSubmit(samplePlan: unknown, populationSize: number | null): string | null {
    if (!samplePlan || typeof samplePlan !== "object") {
        return "请先完成样本量规划";
    }

    const data = samplePlan as Record<string, unknown>;
    const confidenceLevel = toTrimmedString(data.confidenceLevel);
    const marginOfError = Number(data.marginOfError);
    const finalSampleSize = Number(data.finalSampleSize);

    if (!confidenceLevel) {
        return "请先设置置信水平";
    }

    if (!Number.isFinite(marginOfError) || marginOfError < 1 || marginOfError > 10) {
        return "允许误差需在1%-10%之间";
    }

    if (!Number.isFinite(finalSampleSize) || finalSampleSize < 30) {
        return "最终样本量不能小于30";
    }

    if (populationSize !== null && Number.isFinite(populationSize) && populationSize > 0) {
        const maxSampleSize = Math.floor(populationSize * 0.5);
        if (maxSampleSize >= 30 && finalSampleSize > maxSampleSize) {
            return `最终样本量不能超过总体规模的50%（${maxSampleSize}）`;
        }
    }

    return null;
}

export function validateSamplingResultsForSubmit(samplingResults: unknown, targetSampleSize: number | null): string | null {
    if (!samplingResults || typeof samplingResults !== "object") {
        return "请先完成抽样执行";
    }

    const data = samplingResults as Record<string, unknown>;
    const simple = data.simple as Record<string, unknown> | undefined;
    const systematic = data.systematic as Record<string, unknown> | undefined;
    const pps = data.pps as Record<string, unknown> | undefined;
    const stratified = data.stratified as Record<string, unknown> | undefined;

    if (!simple || !isSamplingStepCompleted(simple.completed)) {
        return "请先完成简单随机抽样";
    }

    if (!systematic || !isSamplingStepCompleted(systematic.completed)) {
        return "请先完成系统抽样";
    }

    if (!pps || !isSamplingStepCompleted(pps.completed)) {
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

        const acceptedRange = getSystematicAcceptedRange(targetSampleSize);
        const systematicCount = toInteger(systematic.sampleCount);
        if (acceptedRange && (systematicCount === null || systematicCount < acceptedRange.min || systematicCount > acceptedRange.max)) {
            return `系统抽样样本量需在 ${acceptedRange.min}-${acceptedRange.max} 之间`;
        }

        const ppsCount = toInteger(pps.sampleCount);
        if (ppsCount === null || ppsCount < 1) {
            return "PPS抽样样本量需大于0";
        }
        if (acceptedRange && (ppsCount < acceptedRange.min || ppsCount > acceptedRange.max)) {
            return `PPS抽样样本量需在目标样本量的80%-120%之间（${acceptedRange.min}-${acceptedRange.max}）`;
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
        return "报告内容不能少于100字";
    }
    if (reportLength > 5000) {
        return "报告内容不能超过5000字";
    }
    return null;
}
