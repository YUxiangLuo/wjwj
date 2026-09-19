/** 多变量规划中的单个调查变量（与 MultiVariableSamplePlan 的 SurveyVariable 同形）。 */
export interface SurveyVariableSpec {
    id: string;
    name: string;
    type: "proportion" | "mean";
    estimatedValue: number;      // 估计值 (p或均值)
    estimatedStdDev?: number;    // 估计标准差 (均值类型时需要)
    importance: "primary" | "secondary" | "tertiary";
    confidenceLevel: string;
    marginOfError: number;
    requiredSampleSize: number;
}

/**
 * 高级样本量规划快照：学生点击「应用」时记录该类工具的输入与结果，
 * 提交时服务端用同一套计算函数复算 inputs→result，防止伪造或过期引用。
 * 覆盖会写非标准路径样本量的四类工具（与 AdvancedNonStandardSampleSource 一致）；
 * domain/deff 工具调整的是基础输入，已由基础路径复算覆盖。
 */
export type AdvancedPlanKind = "cost" | "multivar" | "cv" | "cluster";

export interface AdvancedPlanBase {
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
        /** feasible 表示预算足够且按预期完成量计算的目标精度达标。 */
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
            intraClassCorrelation: number | null;
        };
    });
