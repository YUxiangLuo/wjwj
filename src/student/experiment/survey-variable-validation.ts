import type { SurveyVariableSpec } from "../../domain/experiment/planning-types";
import { isConfidenceLevel } from "@/domain/statistics/confidence-level";

/** Shared by the calculator, its form, and saved-plan validation. */
export function getSurveyVariableParameterError(variable: Pick<SurveyVariableSpec,
    "type" | "confidenceLevel" | "marginOfError" | "estimatedValue" | "estimatedStdDev"
>): string | null {
    if (!isConfidenceLevel(variable.confidenceLevel)) return "置信水平需为 90%、95% 或 99%。";
    if (!Number.isFinite(variable.marginOfError) || variable.marginOfError <= 0 || variable.marginOfError >= 100) {
        return "误差限需大于 0 且小于 100%。";
    }
    if (variable.estimatedStdDev !== undefined && !Number.isFinite(variable.estimatedStdDev)) return "标准差必须是有限数值。";
    if (variable.type === "proportion") {
        return Number.isFinite(variable.estimatedValue) && variable.estimatedValue >= 0 && variable.estimatedValue <= 1
            ? null : "估计比例 p 必须在 0～1 之间。";
    }
    if (variable.type !== "mean") return "请选择比例或均值估计。";
    if (!Number.isFinite(variable.estimatedValue) || variable.estimatedValue === 0) return "均值变量需填写非零的有限先验均值。";
    if (variable.estimatedStdDev === undefined || variable.estimatedStdDev <= 0) return "均值变量需填写正且有限的标准差。";
    return null;
}
