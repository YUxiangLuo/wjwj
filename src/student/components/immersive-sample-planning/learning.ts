import type { Phase } from "./types";

export const FACTOR_ORDER = ["error_tolerance", "subpopulation", "variability", "design_effect", "non_response", "cost_balance"] as const;
export const QUIZ_CHECKS = ["quiz_se", "quiz_population", "quiz_design"] as const;

export interface LearningQuestion {
    question: string;
    options: readonly string[];
    correctIndex: number;
    explanation: string;
}

export const LEARNING_QUESTIONS = {
    precision: {
        question: "95% 置信水平应该怎样理解？",
        options: ["每次估计的误差都不会超过设定的误差限", "重复抽样并构造区间，长期来看约 95% 的区间覆盖总体真值", "调查总体中 95% 的单位"],
        correctIndex: 1,
        explanation: "总体真值是固定的，区间随样本变化。95% 描述重复抽样时区间的长期覆盖率，不能保证每一次估计都达到目标误差。",
    },
    error_tolerance: {
        question: "其他条件相同，把允许的误差限缩小，通常需要怎样调整样本量？",
        options: ["增加样本量，同时检查是否已接近总体上限", "减少样本量", "样本量不受误差限影响"],
        correctIndex: 0,
        explanation: "误差限越小，精度要求越高，通常需要更多样本。有限总体下的增幅要代入公式计算，不能一律按大总体的倍数放大。",
    },
    subpopulation: {
        question: "全体的估计已达到精度目标，能否认定每个子总体也都达标？",
        options: ["可以，整体达标就代表每组达标", "可以，只要按各组人数比例分配", "不能，需要分别检查各子总体的有效样本量与精度"],
        correctIndex: 2,
        explanation: "整体估计与分组估计是不同的目标。每个域都需要足够样本，整体达标或按比例分配都不自动保证各域达标。",
    },
    variability: {
        question: "精度要求和其他条件相同时，研究指标越分散，通常需要多少样本？",
        options: ["更少", "更多", "只看总体人数，与分散程度无关"],
        correctIndex: 1,
        explanation: "总体变异越大，估计的波动通常越大，需要更多样本压低抽样误差。比例未知时用 p = 0.5 作保守规划，均值估计则需要方差依据。",
    },
    design_effect: {
        question: "规划中的设计效应 deff 应依据什么确定？",
        options: ["所有抽样方法都固定取 1", "只要不是简单随机抽样，就固定取 2", "结合研究变量、设计、分配与权重，用历史数据或预调查等评估"],
        correctIndex: 2,
        explanation: "deff 是同一估计量的设计方差与简单随机方差之比，可能高于或低于 1，不能只按抽样方法的名称指定。",
    },
    non_response: {
        question: "总体足够大，需要完成 80 份有效回答，预计 20% 不回答，应计划邀请多少个单位？",
        options: ["100 个：80 ÷ (1 − 20%)", "80 个：有效回答数就是邀请数", "96 个：80 × (1 + 20%)"],
        correctIndex: 0,
        explanation: "邀请数按目标完成数除以预期回答率计算，80 ÷ 0.8 = 100。实际邀请数还受总体数量限制；增加邀请只能补数量，不能保证消除无回答偏差。",
    },
    cost_balance: {
        question: "预算只能支持少于建议值的样本量，规划时应怎样处理？",
        options: ["直接减少样本量，仍然声称原精度目标达标", "重新计算可执行样本量的预期误差，明确是否需要调整目标", "不必估算精度，只要预算够用即可"],
        correctIndex: 1,
        explanation: "最终样本量可以与建议值不同，但要核对实际采用数量的预期精度，并说明成本约束与目标之间的取舍。",
    },
    calculation: {
        question: "抽取总体中较大一部分单位时，为什么要做有限总体校正？",
        options: ["为了给任何总体都固定打七折", "因为无回答率一定更低", "因为已覆盖更多总体单位，剩余的抽样不确定性更小"],
        correctIndex: 2,
        explanation: "有限总体校正反映不放回抽样中剩余不确定性的减少，取决于总体规模与抽样比。它与无回答修正不同；中间计算保留小数，最后才向上取整。",
    },
    quiz_se: {
        question: "标准误差 SE 与误差限 ME 的关系是？",
        options: ["ME = Z × SE", "SE = Z × ME", "ME 与置信水平无关"],
        correctIndex: 0,
        explanation: "在这里采用的正态近似下，误差限 ME = Z × SE，是置信区间的半宽。置信水平改变时，Z 也会改变。",
    },
    quiz_population: {
        question: "在 95% 置信、±5 个百分点的比例规划下，总体规模从 2,000 增加到 200,000，所需样本量大约会？",
        options: ["随总体一起增加到 100 倍", "从约 322 增到约 384，增加约两成", "完全不变"],
        correctIndex: 1,
        explanation: "以 n₀≈385 为例，n = n₀N/(N−1+n₀)。两种总体下分别约需 322 和 384 个单位。样本量不会随总体同比例增长，只有总体已经很大时，校正才几乎消失。",
    },
    quiz_design: {
        question: "设计效应 deff = 2 意味着？",
        options: ["同一估计量下，该复杂设计的方差约为简单随机抽样的 2 倍", "有限总体下所需样本量一定恰好是简单随机抽样的 2 倍", "需要的样本减半"],
        correctIndex: 0,
        explanation: "deff 是方差之比。有限总体校正不可忽略时，目标完成量为 n = deff·n₀·N / (N−1+deff·n₀)。只有校正可忽略时，样本量才近似变为简单随机方案的 2 倍。",
    },
} as const satisfies Record<string, LearningQuestion>;

export type LearningCheckId = keyof typeof LEARNING_QUESTIONS;

/** Local learning progress, independent of sample-size parameters and server grading. */
export interface LearningProgress {
    version: 1;
    completed: LearningCheckId[];
    decisionReviewed: boolean;
}

export function restoreLearningProgress(saved?: LearningProgress): LearningProgress {
    return {
        version: 1,
        completed: saved?.version === 1 && Array.isArray(saved.completed)
            ? [...new Set(saved.completed.filter(id => Object.hasOwn(LEARNING_QUESTIONS, id)))] : [],
        decisionReviewed: saved?.version === 1 && saved.decisionReviewed === true,
    };
}

export function phaseLearningCheck(phase: Phase): LearningCheckId | null {
    if (phase.type === "precision") return "precision";
    if (phase.type === "factors" && phase.step !== "summary") return phase.step;
    if (phase.type === "fourstep") return "calculation";
    if (phase.type === "quiz") return QUIZ_CHECKS[phase.questionIndex] ?? null;
    return null;
}
