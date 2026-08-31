import { expect, test, describe } from "bun:test";
import { getTargetSampleSizeFromSamplePlan, validateSamplePlanForSubmit, validateSamplingResultsForSubmit } from "./submit-validation";

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
            "最终样本量需在 1～50 人之间",
        );
    });

    test("有总体规模时：高于上限时报错", () => {
        expect(validateSamplePlanForSubmit(plan({ finalSampleSize: 201 }), 200)).toBe(
            "最终样本量需在 1～200 人之间",
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
        expect(validateSamplePlanForSubmit(plan({ advancedPlanSource: "cost" }), 200)).toBeNull();
    });

    test("估计类型需与课题对照变量一致", () => {
        expect(validateSamplePlanForSubmit(plan({}), 200, "proportion")).toBeNull();
        expect(validateSamplePlanForSubmit(plan({}), 200, "mean")).toBe("估计类型需与课题对照变量一致");
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
        ).toBe("估计类型需与课题对照变量一致");
    });

    test("高级规划快照需能由服务端复算且匹配最终样本量", () => {
        const costSnapshot = {
            version: 1,
            kind: "cost",
            appliedAt: "2026-08-31T00:00:00.000Z",
            inputs: {
                confidenceLevel: "95",
                targetMarginOfError: 5,
                designEffect: 1,
                nonResponseRate: 0,
                fixedCost: 5000,
                variableCostPerUnit: 20,
                totalBudget: 50000,
            },
            result: { requiredSampleSize: 132, totalCost: 7640, feasible: true },
        };
        expect(validateSamplePlanForSubmit(plan({
            finalSampleSize: 132,
            finalSizeSource: "advanced",
            advancedPlanSource: "cost",
            advancedPlans: [costSnapshot],
        }), 200)).toBeNull();
        expect(validateSamplePlanForSubmit(plan({
            finalSampleSize: 131,
            finalSizeSource: "advanced",
            advancedPlanSource: "cost",
            advancedPlans: [costSnapshot],
        }), 200)).toBe("高级规划结果需与最终样本量一致");
    });

    test("即使不是最终样本量来源，也拒绝每一种畸形高级快照", () => {
        for (const kind of ["domain", "cost", "deff", "multivar", "cv", "cluster"]) {
            expect(validateSamplePlanForSubmit(plan({
                finalSizeSource: "manual",
                advancedPlans: [{
                    version: 1,
                    kind,
                    appliedAt: "2026-08-31T00:00:00.000Z",
                    inputs: {},
                    result: {},
                }],
            }), 200)).toBe("高级规划快照格式无效");
        }
        expect(validateSamplePlanForSubmit(plan({ advancedPlans: {} }), 200)).toBe("高级规划快照格式无效");
    });

    test("非活动高级快照也必须与自身输入一致", () => {
        expect(validateSamplePlanForSubmit(plan({
            finalSizeSource: "manual",
            advancedPlans: [{
                version: 1,
                kind: "cost",
                appliedAt: "2026-08-31T00:00:00.000Z",
                inputs: {
                    confidenceLevel: "95",
                    targetMarginOfError: 5,
                    designEffect: 1,
                    nonResponseRate: 0,
                    fixedCost: 5000,
                    variableCostPerUnit: 20,
                    totalBudget: 50000,
                },
                result: { requiredSampleSize: 132, totalCost: 1, feasible: true },
            }],
        }), 200)).toBe("成本规划快照与输入参数不一致");
    });

    test("畸形的活动多变量快照返回校验错误而不是抛异常", () => {
        expect(() => validateSamplePlanForSubmit(plan({
            finalSizeSource: "advanced",
            advancedPlanSource: "multivar",
            advancedPlans: [{
                version: 1,
                kind: "multivar",
                appliedAt: "2026-08-31T00:00:00.000Z",
                inputs: { variables: [{}] },
                result: { requiredSampleSize: 50 },
            }],
        }), 200)).not.toThrow();
        expect(validateSamplePlanForSubmit(plan({
            finalSizeSource: "advanced",
            advancedPlanSource: "multivar",
            advancedPlans: [{
                version: 1,
                kind: "multivar",
                appliedAt: "2026-08-31T00:00:00.000Z",
                inputs: { variables: [{}] },
                result: { requiredSampleSize: 50 },
            }],
        }), 200)).toBe("高级规划快照格式无效");
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
