export type AdvancedTab =
    | "domain"
    | "cost"
    | "deff"
    | "multivar"
    | "cv"
    | "cluster"
    | "metrics";

/** 会写入「非标准公式」路径样本量的高级工具 — 应用后仅记录最终样本量来源 */
export type AdvancedNonStandardSampleSource = Extract<
    AdvancedTab,
    "cost" | "multivar" | "cv" | "cluster"
>;

export const ADVANCED_TAB_ACTIVE_CLASS =
    "bg-primary/10 border-primary/20 text-primary";

export const ADVANCED_TAB_CONFIG: Array<{
    key: AdvancedTab;
    label: string;
    title: string;
    description: string;
    targetEstimand: string;
    assumptionsAndSource: string;
    scopeAndLimitations: string;
    activeClass: string;
}> = [
    {
        key: "domain",
        label: "子总体估计",
        title: "互斥子总体（层）估计支持",
        description: "为互不重叠的子总体设置精度要求",
        targetEstimand: "各互斥子总体分别对应的比例或均值。",
        assumptionsAndSource: "子总体边界与规模已知；精度参数和均值方差来自项目要求、历史资料或预调查。",
        scopeAndLimitations: "用于分别控制域精度；不处理重叠域、未知域规模或跨域协方差。",
        activeClass: ADVANCED_TAB_ACTIVE_CLASS,
    },
    {
        key: "cost",
        label: "成本权衡",
        title: "精度与成本权衡",
        description: "在预算约束下评估可达到的精度水平",
        targetEstimand: "总体比例的绝对误差限（内部按 p=0.5 规划）。",
        assumptionsAndSource: "单位成本、设计效应和无回答率由用户根据预算、历史资料或预调查给出。",
        scopeAndLimitations: "仅作比例规划情景比较；不证明某预算最优，也不消除无回答偏差。",
        activeClass: ADVANCED_TAB_ACTIVE_CLASS,
    },
    {
        key: "deff",
        label: "设计效应参考",
        title: "设计效应估计器",
        description: "检查设计效应情景及其证据来源",
        targetEstimand: "同一总体、同一估计量下，复杂设计方差与 SRS 方差之比。",
        assumptionsAndSource: "ICC、平均群大小等输入应来自相近历史调查、预调查或设计模拟。",
        scopeAndLimitations: "只做假设检查，不按方法名称自动估计 deff；结果不能跨总体或估计量直接套用。",
        activeClass: ADVANCED_TAB_ACTIVE_CLASS,
    },
    {
        key: "multivar",
        label: "多变量规划",
        title: "多变量样本量规划",
        description: "为多个调查变量同时规划样本量",
        targetEstimand: "每个已配置变量的总体比例或均值；推荐值满足最大样本量硬约束。",
        assumptionsAndSource: "先验比例、均值、方差和精度目标来自业务要求、历史资料或预调查。",
        scopeAndLimitations: "不考虑变量间协方差；近零均值不适用相对误差，应改用绝对误差规划。",
        activeClass: ADVANCED_TAB_ACTIVE_CLASS,
    },
    {
        key: "cv",
        label: "CV-based计算",
        title: "基于CV的样本量计算",
        description: "通过变异系数计算所需样本量",
        targetEstimand: "具有有意义零点的正值比率尺度变量之总体均值。",
        assumptionsAndSource: "总体 CV 来自同类历史数据或预调查；回答率和 deff 需另有依据。",
        scopeAndLimitations: "不适用于零/负均值、区间尺度或类别比例；封顶发放不消除无回答偏差。",
        activeClass: ADVANCED_TAB_ACTIVE_CLASS,
    },
    {
        key: "cluster",
        label: "整群抽样",
        title: "整群抽样计算器",
        description: "计算整群抽样方案与设计效应",
        targetEstimand: "当前工具中的总体比例及其绝对误差限。",
        assumptionsAndSource: "群大小与 ICC 模型适用；ICC、群规模和无回答率来自抽样框、历史资料或预调查。",
        scopeAndLimitations: "用于近似等规模整群情景；不替代不等群规模、分层多阶段设计的专门方差计算。",
        activeClass: ADVANCED_TAB_ACTIVE_CLASS,
    },
    {
        key: "metrics",
        label: "SE/CV/敏感性",
        title: "高级分析（SE/CV/敏感性）",
        description: "查看精度指标、比例比较与敏感性矩阵",
        targetEstimand: "当前比例或均值规划目标对应的 SE、CV/RSE 与误差限。",
        assumptionsAndSource: "沿用主流程中的总体规模、先验变异、置信水平、deff 与回答率假设。",
        scopeAndLimitations: "属于规划近似与情景分析；比例 Wald 近似在小样本或 p 接近 0/1 时可能不可靠。",
        activeClass: ADVANCED_TAB_ACTIVE_CLASS,
    },
];
