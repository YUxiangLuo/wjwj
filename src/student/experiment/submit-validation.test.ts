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
        expect(validateSamplePlanForSubmit(plan({ finalSampleSize: 1 }), 50)).toBeNull();
        expect(validateSamplePlanForSubmit(plan({ finalSampleSize: 50 }), 50)).toBeNull();
        expect(validateSamplePlanForSubmit(plan({ finalSampleSize: 51 }), 50)).toBe(
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
                plan({ estimationType: "mean", marginOfError: 2, populationVariance: 100 }),
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
                plan({ estimationType: "mean", marginOfError: 12, populationVariance: 100 }),
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
            "本实验要求PPS抽样样本量在目标样本量的80%-120%之间（9-12）",
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
