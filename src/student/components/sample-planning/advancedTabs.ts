export type AdvancedTab =
    | "domain"
    | "cost"
    | "deff"
    | "multivar"
    | "cv"
    | "cluster"
    | "metrics";

/** 会写入「非标准公式」路径样本量的高级工具 — 应用后主面板参数锁定 */
export type AdvancedNonStandardSampleLockSource = Extract<
    AdvancedTab,
    "cost" | "multivar" | "cv" | "cluster"
>;

export const ADVANCED_TAB_ACTIVE_CLASS =
    "bg-indigo-100 border-indigo-300 text-indigo-800 dark:bg-indigo-950/55 dark:border-indigo-600 dark:text-indigo-200";

export const ADVANCED_TAB_CONFIG: Array<{
    key: AdvancedTab;
    label: string;
    title: string;
    description: string;
    activeClass: string;
}> = [
    {
        key: "domain",
        label: "子总体估计",
        title: "子总体（域）估计支持",
        description: "设置各子总体的精度要求",
        activeClass: ADVANCED_TAB_ACTIVE_CLASS,
    },
    {
        key: "cost",
        label: "成本权衡",
        title: "精度与成本权衡",
        description: "在预算约束下评估可达到的精度水平",
        activeClass: ADVANCED_TAB_ACTIVE_CLASS,
    },
    {
        key: "deff",
        label: "设计效应参考",
        title: "设计效应估计器",
        description: "根据抽样方法估算设计效应",
        activeClass: ADVANCED_TAB_ACTIVE_CLASS,
    },
    {
        key: "multivar",
        label: "多变量规划",
        title: "多变量样本量规划",
        description: "为多个调查变量同时规划样本量",
        activeClass: ADVANCED_TAB_ACTIVE_CLASS,
    },
    {
        key: "cv",
        label: "CV-based计算",
        title: "基于CV的样本量计算",
        description: "通过变异系数计算所需样本量",
        activeClass: ADVANCED_TAB_ACTIVE_CLASS,
    },
    {
        key: "cluster",
        label: "整群抽样",
        title: "整群抽样计算器",
        description: "计算整群抽样方案与设计效应",
        activeClass: ADVANCED_TAB_ACTIVE_CLASS,
    },
    {
        key: "metrics",
        label: "SE/CV/敏感性",
        title: "高级分析（SE/CV/敏感性）",
        description: "查看精度指标、比例比较与敏感性矩阵",
        activeClass: ADVANCED_TAB_ACTIVE_CLASS,
    },
];
