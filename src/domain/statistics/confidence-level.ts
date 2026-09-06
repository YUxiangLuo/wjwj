/** 与 UI 选项及 Z 表一致的置信水平（百分比以字符串键表示）。 */
export type ConfidenceLevel = "90" | "95" | "99";

export const Z_VALUES: Record<ConfidenceLevel, number> = {
    "90": 1.645,
    "95": 1.96,
    "99": 2.576,
};

export function isConfidenceLevel(s: string): s is ConfidenceLevel {
    return s === "90" || s === "95" || s === "99";
}

/** 未知值回退到 95% 对应的 Z，避免静默误用 99% 分支。 */
export function zForConfidenceLevel(level: string): number {
    return isConfidenceLevel(level) ? Z_VALUES[level] : Z_VALUES["95"];
}

export function normalizeConfidenceLevel(level: string): ConfidenceLevel {
    return isConfidenceLevel(level) ? level : "95";
}
