import { expect, test, describe } from "bun:test";
import {
    getTargetSampleSizeFromSamplePlan,
    validateMeanPlanVariance,
    validateReportForSubmit,
    validateSamplePlanForSubmit,
    validateSamplingResultsForSubmit,
} from "./submit-validation";
import { calculateFinitePopulationSampleSize } from "./sample-plan";

/** 与复算路径同源的 cost 推荐样本量（95%、5%、N=1000、deff=1、nrr=0.1）。 */
function genuineCostSizeImpl() {
    const size = calculateFinitePopulationSampleSize({
        confidenceLevel: "95",
        marginOfError: 5,
        populationSize: 1000,
        designEffect: 1,
        nonResponseRate: 0.1,
    });
    if (size === null) throw new Error("failed to compute genuine cost sample size");
    return size;
}

/** 与后端/持久化字段一致的最小合法对象 */
function plan(overrides: Record<string, unknown>) {
    return {
        confidenceLevel: "95",
        marginOfError: 5,
        designEffect: 1,
        nonResponseRate: 0,
        recommendedSize: 132,
        finalSampleSize: 50,
        ...overrides,
    };
}

describe("validateMeanPlanVariance", () => {
    test("accepts a variance matching the current population", () => {
        expect(validateMeanPlanVariance({ populationVariance: 35 }, "mean", 35)).toBeNull();
        expect(validateMeanPlanVariance({ populationVariance: 1e-6 }, "mean", 1e-6)).toBeNull();
    });

    test("rejects forged or stale variances for mean targets", () => {
        expect(validateMeanPlanVariance({ populationVariance: 1e-6 }, "mean", 35)).toMatch(/总体方差与当前总体不一致/);
        expect(validateMeanPlanVariance({ populationVariance: 49900 }, "mean", 35)).toMatch(/总体方差与当前总体不一致/);
        expect(validateMeanPlanVariance({ populationVariance: 0 }, "mean", 35)).toMatch(/正的总体方差/);
    });

    test("skips non-mean targets, unknown targets and unavailable actual variance", () => {
        expect(validateMeanPlanVariance({ populationVariance: 1 }, "proportion", 35)).toBeNull();
        expect(validateMeanPlanVariance({ populationVariance: 1 }, null, 35)).toBeNull();
        expect(validateMeanPlanVariance({ populationVariance: 1 }, "mean", null)).toBeNull();
        expect(validateMeanPlanVariance({ populationVariance: 1 }, "mean", 0)).toBeNull();
        expect(validateMeanPlanVariance(null, "mean", 35)).toBeNull();
    });

    test("accepts 4-decimal UI rounding and rejects larger mismatches", () => {
        const actual = 66.792364721;
        // 规划界面展示/保存 4 位小数
        expect(validateMeanPlanVariance({ populationVariance: 66.7924 }, "mean", actual)).toBeNull();
        expect(validateMeanPlanVariance({ populationVariance: actual + 1e-12 }, "mean", actual)).toBeNull();
        expect(validateMeanPlanVariance({ populationVariance: actual + 1e-3 }, "mean", actual)).toMatch(/总体方差与当前总体不一致/);
    });
});

test("report validation does not count content swallowed by an unclosed script element", () => {
    expect(validateReportForSubmit(`<p>可见内容很短</p><script>${"不可见内容".repeat(40)}`))
        .toBe("本实验要求报告内容不少于100字");
});

describe("validateSamplePlanForSubmit", () => {
    test("完整合法：有总体规模且在区间内", () => {
        expect(validateSamplePlanForSubmit(plan({ finalSampleSize: 50 }), 200)).toBeNull();
        expect(validateSamplePlanForSubmit(plan({ finalSampleSize: 1 }), 200)).toBeNull();
        expect(validateSamplePlanForSubmit(plan({ finalSampleSize: 200 }), 200)).toBeNull();
    });

    test("有总体规模时：与 getFinalSampleSizeBounds 一致，允许 1..N", () => {
        expect(validateSamplePlanForSubmit(plan({ finalSampleSize: 1, recommendedSize: 45 }), 50)).toBeNull();
        expect(validateSamplePlanForSubmit(plan({ finalSampleSize: 50, recommendedSize: 45 }), 50)).toBeNull();
        expect(validateSamplePlanForSubmit(plan({ finalSampleSize: 51, recommendedSize: 45 }), 50)).toBe(
            "最终样本量需在 1～50 个单位之间",
        );
    });

    test("有总体规模时：高于上限时报错", () => {
        expect(validateSamplePlanForSubmit(plan({ finalSampleSize: 201 }), 200)).toBe(
            "最终样本量需在 1～200 个单位之间",
        );
    });

    test("无总体规模时不额外施加课堂下限", () => {
        expect(validateSamplePlanForSubmit(plan({ finalSampleSize: 1 }), null)).toBeNull();
        expect(validateSamplePlanForSubmit(plan({ finalSampleSize: 29 }), null)).toBeNull();
    });

    test("populationSize 为 0 时不额外施加课堂下限", () => {
        expect(validateSamplePlanForSubmit(plan({ finalSampleSize: 29 }), 0)).toBeNull();
    });

    test("finalSampleSize 须为整数", () => {
        expect(validateSamplePlanForSubmit(plan({ finalSampleSize: 50.5 }), 200)).toBe(
            "最终样本量需为不小于 1 的整数",
        );
    });

    test("缺少或非法 samplePlan", () => {
        expect(validateSamplePlanForSubmit(null, 200)).toBe("请先完成样本量规划");
        expect(validateSamplePlanForSubmit(undefined, 200)).toBe("请先完成样本量规划");
    });

    test("置信水平与允许误差", () => {
        expect(
            validateSamplePlanForSubmit({ ...plan({}), confidenceLevel: "" }, 200),
        ).toBe("请先设置置信水平");
        expect(
            validateSamplePlanForSubmit({ ...plan({}), confidenceLevel: "80" }, 200),
        ).toBe("置信水平需为 90%、95% 或 99%");
        expect(
            validateSamplePlanForSubmit({ ...plan({}), marginOfError: 0 }, 200),
        ).toBe("允许误差需在1%-10%之间");
        expect(
            validateSamplePlanForSubmit({ ...plan({}), marginOfError: 11 }, 200),
        ).toBe("允许误差需在1%-10%之间");
    });

    test("均值估计校验绝对误差限与总体方差", () => {
        expect(
            validateSamplePlanForSubmit(
                plan({ estimationType: "mean", marginOfError: 2, populationVariance: 100, recommendedSize: 66 }),
                200,
            ),
        ).toBeNull();
        expect(
            validateSamplePlanForSubmit(
                plan({ estimationType: "mean", marginOfError: 0, populationVariance: 100 }),
                200,
            ),
        ).toBe("均值估计的绝对误差限需为正数");
        expect(
            validateSamplePlanForSubmit(
                plan({ estimationType: "mean", marginOfError: 12, populationVariance: 100, recommendedSize: 3 }),
                200,
            ),
        ).toBeNull();
        expect(
            validateSamplePlanForSubmit(
                plan({ estimationType: "mean", marginOfError: 2, populationVariance: 0 }),
                200,
            ),
        ).toBe("均值估计时需提供正的总体方差估计");
    });

    test("服务端校验设计效应、无回答率、高级来源和建议样本量", () => {
        expect(validateSamplePlanForSubmit(plan({ designEffect: 0.49 }), 200)).toBe("设计效应需在 0.5～5.0 之间");
        expect(validateSamplePlanForSubmit(plan({ designEffect: 5.1 }), 200)).toBe("设计效应需在 0.5～5.0 之间");
        expect(validateSamplePlanForSubmit(plan({ designEffect: 0.9, recommendedSize: 127 }), 200)).toBeNull();
        expect(validateSamplePlanForSubmit(plan({ nonResponseRate: -0.1 }), 200)).toBe("无回答率需在 0%～50% 之间");
        expect(validateSamplePlanForSubmit(plan({ nonResponseRate: 0.51 }), 200)).toBe("无回答率需在 0%～50% 之间");
        expect(validateSamplePlanForSubmit(plan({ advancedPlanSource: "unknown" }), 200)).toBe("高级规划来源无效");
        expect(validateSamplePlanForSubmit(plan({ estimationType: "unknown" }), 200)).toBe("估计类型无效");
        expect(validateSamplePlanForSubmit(plan({ recommendedSize: 131 }), 200)).toBe("建议样本量与当前规划参数不一致，请重新计算");
        expect(validateSamplePlanForSubmit(
            plan({ advancedPlanSource: "cost" }),
            200,
            "proportion",
            { allowLegacyAdvancedSourceWithoutSnapshot: true },
        )).toBeNull();
    });

    test("高级规划来源必须与研究估计类型相容", () => {
        const meanPlan = plan({
            estimationType: "mean",
            marginOfError: 2,
            populationVariance: 100,
            recommendedSize: 66,
            advancedPlanSource: "cost",
        });
        expect(validateSamplePlanForSubmit(meanPlan, 200, "mean"))
            .toBe("当前高级规划仅适用于比例估计，请改用均值规划工具");
        expect(validateSamplePlanForSubmit(plan({ advancedPlanSource: "cv" }), 200, "proportion"))
            .toBe("CV-based 规划仅适用于具有自然零点的均值目标");
        expect(validateSamplePlanForSubmit(plan({ advancedPlanSource: "cost" }), 200, "proportion"))
            .toBe("高级样本量缺少可复核快照，请重新应用该高级规划");
    });

    test("估计类型需与研究目标变量一致", () => {
        expect(validateSamplePlanForSubmit(plan({}), 200, "proportion")).toBeNull();
        expect(validateSamplePlanForSubmit(plan({}), 200, "mean")).toBe("估计类型需与研究目标变量一致");
        expect(
            validateSamplePlanForSubmit(
                plan({ estimationType: "mean", marginOfError: 2, populationVariance: 100, recommendedSize: 66 }),
                200,
                "mean",
            ),
        ).toBeNull();
        expect(
            validateSamplePlanForSubmit(
                plan({ estimationType: "mean", marginOfError: 2, populationVariance: 100, recommendedSize: 66 }),
                200,
                "proportion",
            ),
        ).toBe("估计类型需与研究目标变量一致");
    });
});

describe("validateSamplingResultsForSubmit", () => {
    const completedResults = (ppsCount: number) => ({
        simple: { completed: true, sampleCount: 12 },
        systematic: { completed: true, sampleCount: 12 },
        pps: { completed: true, sampleCount: ppsCount },
        stratified: { completed: true, layers: [{ name: "all", sampleCount: 12 }] },
    });

    test("caps the PPS range at the population during completion and submission validation", () => {
        expect(validateSamplingResultsForSubmit(completedResults(12), 12, 12)).toBeNull();
        expect(validateSamplingResultsForSubmit(completedResults(13), 12, 12)).toBe(
            "本实验要求PPS抽样样本量在目标样本量的80%-120%之间（10-12）",
        );
    });

    test("accepts simple sampling plus one selected method under the default policy", () => {
        expect(validateSamplingResultsForSubmit({
            simple: { completed: true, sampleCount: 12 },
            systematic: { completed: true, sampleCount: 12 },
        }, 12, 100)).toBeNull();
        expect(validateSamplingResultsForSubmit({
            simple: { completed: true, sampleCount: 12 },
        }, 12, 100)).toBe("请至少完成两种本实验启用的抽样方法");
    });

    test("treats a required PPS as not applicable once the server proved it unusable", () => {
        const policy = {
            version: 1,
            methods: { simple: "required", systematic: "optional", pps: "required", stratified: "optional" },
        } as const;
        // Without this degradation a published template whose population has no
        // eligible size field could never be submitted.
        expect(validateSamplingResultsForSubmit({
            simple: { completed: true, sampleCount: 12 },
            systematic: { completed: true, sampleCount: 12 },
            pps: { unavailable: true, unavailableReason: "no_eligible_size_field" },
        }, 12, 100, policy)).toBeNull();
    });

    test("still requires a usable method that is merely missing", () => {
        const policy = {
            version: 1,
            methods: { simple: "required", systematic: "optional", pps: "required", stratified: "optional" },
        } as const;
        const error = validateSamplingResultsForSubmit({
            simple: { completed: true, sampleCount: 12 },
            systematic: { completed: true, sampleCount: 12 },
        }, 12, 100, policy);
        expect(error).toBeTruthy();
        expect(error).not.toContain("没有合格规模变量");
    });
});

describe("getTargetSampleSizeFromSamplePlan", () => {
    test("读取 finalSampleSize 正整数", () => {
        expect(getTargetSampleSizeFromSamplePlan(plan({ finalSampleSize: 50 }))).toBe(50);
        expect(getTargetSampleSizeFromSamplePlan({ finalSampleSize: "120" })).toBe(120);
    });

    test("非法或缺失返回 null", () => {
        expect(getTargetSampleSizeFromSamplePlan(null)).toBeNull();
        expect(getTargetSampleSizeFromSamplePlan({})).toBeNull();
        expect(getTargetSampleSizeFromSamplePlan({ finalSampleSize: 0 })).toBeNull();
        expect(getTargetSampleSizeFromSamplePlan({ finalSampleSize: -3 })).toBeNull();
    });
});

    test("高级规划快照：来源种类快照缺失、结果被篡改、最终样本量不一致均拒绝", () => {
        const populationSize = 1000;
        // 基础路径复算要求 recommendedSize 始终等于基础公式结果（N=1000/95/5/1/0 → 278）。
        const basicRecommended = 278;
        const requiredSampleSize = 385;
        // 用真实计算函数构造合法 cost 快照
        const genuineCostSize = (() => {
            // 与 advanced-plan 复算同路径：calculateFinitePopulationSampleSize(95, 5%, 1000, 1, 0.1)
            // 直接引用 sample-plan 以避免测试里手写魔法数
            return genuineCostSizeImpl();
        })();
        const costSnapshot = {
            version: 1,
            kind: "cost",
            appliedAt: "2026-09-01T08:00:00.000Z",
            inputs: {
                confidenceLevel: "95",
                targetMarginOfError: 5,
                designEffect: 1,
                nonResponseRate: 0.1,
                fixedCost: 5000,
                variableCostPerUnit: 20,
                totalBudget: 1000000,
            },
            result: {
                requiredSampleSize: genuineCostSize,
                totalCost: 5000 + genuineCostSize * 20,
                feasible: true,
            },
        };
        // 合法：来源 + 快照 + 最终样本量一致
        expect(validateSamplePlanForSubmit(plan({
            recommendedSize: basicRecommended,
            advancedPlanSource: "cost",
            advancedPlans: [costSnapshot],
            finalSampleSize: genuineCostSize,
        }), populationSize)).toBeNull();

        // 来源种类快照缺失
        expect(validateSamplePlanForSubmit(plan({
            recommendedSize: basicRecommended,
            advancedPlanSource: "cluster",
            advancedPlans: [costSnapshot],
            finalSampleSize: genuineCostSize,
        }), populationSize)).toBe("高级样本量缺少可复核快照，请重新应用该高级规划");

        // 快照结果被篡改
        expect(validateSamplePlanForSubmit(plan({
            recommendedSize: basicRecommended,
            advancedPlanSource: "cost",
            advancedPlans: [{ ...costSnapshot, result: { ...costSnapshot.result, requiredSampleSize: genuineCostSize + 1 } }],
            finalSampleSize: genuineCostSize,
        }), populationSize)).toContain("请重新应用");

        // 快照推荐量与最终样本量不一致（手动改过最终样本量）
        expect(validateSamplePlanForSubmit(plan({
            recommendedSize: basicRecommended,
            advancedPlanSource: "cost",
            advancedPlans: [costSnapshot],
            finalSampleSize: genuineCostSize + 5,
        }), populationSize)).toContain("推荐样本量与最终样本量不一致");

        // 快照格式非法
        expect(validateSamplePlanForSubmit(plan({
            recommendedSize: basicRecommended,
            advancedPlans: [{ version: 2, kind: "cost" }],
        }), populationSize)).toBe("高级规划快照格式无效");

        // 每类最多一份
        expect(validateSamplePlanForSubmit(plan({
            recommendedSize: basicRecommended,
            advancedPlans: [costSnapshot, costSnapshot],
            finalSampleSize: genuineCostSize,
        }), populationSize)).toBe("每类高级规划最多保留一份快照");

        // 历史数据：只有来源标记、没有快照 → 放行（grandfathered）
        expect(validateSamplePlanForSubmit(
            plan({
                recommendedSize: basicRecommended,
                advancedPlanSource: "cost",
                finalSampleSize: requiredSampleSize,
            }),
            populationSize,
            "proportion",
            { allowLegacyAdvancedSourceWithoutSnapshot: true },
        )).toBeNull();
    });
