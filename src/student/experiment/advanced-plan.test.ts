import { expect, test } from "bun:test";
import {
    parseAdvancedPlans,
    validateAdvancedPlanConsistency,
    type AdvancedPlanSnapshot,
} from "./advanced-plan";
import {
    calculateClusterSamplingSize,
    calculateFinitePopulationSampleSize,
    calculateSampleSizeByCV,
    calculateSurveyVariableRequiredSampleSize,
} from "./sample-plan";

const POPULATION_SIZE = 1000;

function costSnapshot(overrides?: { inputs?: Record<string, unknown>; result?: Record<string, unknown> }): AdvancedPlanSnapshot {
    const inputs = {
        confidenceLevel: "95",
        targetMarginOfError: 5,
        designEffect: 1,
        nonResponseRate: 0.1,
        fixedCost: 5000,
        variableCostPerUnit: 20,
        totalBudget: 100000,
        ...overrides?.inputs,
    };
    const requiredSampleSize = calculateFinitePopulationSampleSize({
        confidenceLevel: inputs.confidenceLevel,
        marginOfError: inputs.targetMarginOfError,
        populationSize: POPULATION_SIZE,
        designEffect: inputs.designEffect,
        nonResponseRate: inputs.nonResponseRate,
    })!;
    const result = {
        requiredSampleSize,
        totalCost: inputs.fixedCost + requiredSampleSize * inputs.variableCostPerUnit,
        feasible: inputs.fixedCost + requiredSampleSize * inputs.variableCostPerUnit <= inputs.totalBudget,
        ...overrides?.result,
    };
    return {
        version: 1,
        kind: "cost",
        appliedAt: "2026-09-01T08:00:00.000Z",
        inputs,
        result,
    } as AdvancedPlanSnapshot;
}

function multivarSnapshot(overrides?: { result?: Record<string, unknown> }): AdvancedPlanSnapshot {
    const variables = [
        {
            id: "v1",
            name: "学习时长比例",
            type: "proportion" as const,
            estimatedValue: 0.5,
            importance: "primary" as const,
            confidenceLevel: "95",
            marginOfError: 5,
            requiredSampleSize: 0,
        },
        {
            id: "v2",
            name: "月生活费均值",
            type: "mean" as const,
            estimatedValue: 2000,
            estimatedStdDev: 500,
            importance: "secondary" as const,
            confidenceLevel: "95",
            marginOfError: 5,
            requiredSampleSize: 0,
        },
    ].map((variable) => ({
        ...variable,
        requiredSampleSize: calculateSurveyVariableRequiredSampleSize(variable, POPULATION_SIZE),
    }));
    return {
        version: 1,
        kind: "multivar",
        appliedAt: "2026-09-01T08:00:00.000Z",
        inputs: { variables },
        result: {
            requiredSampleSize: Math.max(...variables.map((variable) => variable.requiredSampleSize)),
            ...overrides?.result,
        },
    } as AdvancedPlanSnapshot;
}

function cvSnapshot(): Extract<AdvancedPlanSnapshot, { kind: "cv" }> {
    const inputs = {
        confidenceLevel: "95",
        targetCV: 5,
        estimatedCV: 30,
        designEffect: 1.5,
        nonResponseRate: 10,
    };
    const result = calculateSampleSizeByCV({
        confidenceLevel: inputs.confidenceLevel,
        targetCV: inputs.targetCV / 100,
        populationSize: POPULATION_SIZE,
        estimatedCV: inputs.estimatedCV / 100,
        designEffect: inputs.designEffect,
        nonResponseRate: inputs.nonResponseRate / 100,
    })!;
    return {
        version: 1,
        kind: "cv",
        appliedAt: "2026-09-01T08:00:00.000Z",
        inputs,
        result: {
            requiredSampleSize: result.requiredSampleSize,
            expectedRespondentSampleSize: result.expectedRespondentSampleSize,
            achievedCV: result.achievedCV,
        },
    };
}

function clusterSnapshot(): Extract<AdvancedPlanSnapshot, { kind: "cluster" }> {
    const inputs = {
        confidenceLevel: "95",
        marginOfError: 5,
        clusterSize: 50,
        designEffect: 2,
        nonResponseRate: 10,
    };
    const result = calculateClusterSamplingSize({
        populationSize: POPULATION_SIZE,
        confidenceLevel: inputs.confidenceLevel,
        marginOfError: inputs.marginOfError,
        clusterSize: inputs.clusterSize,
        deff: inputs.designEffect,
        nonResponseRate: inputs.nonResponseRate / 100,
    })!;
    return {
        version: 1,
        kind: "cluster",
        appliedAt: "2026-09-01T08:00:00.000Z",
        inputs,
        result: {
            requiredClusters: result.requiredClusters,
            requiredSampleSize: result.requiredSampleSize,
            intraClassCorrelation: result.intraClassCorrelation,
        },
    };
}

test("parseAdvancedPlans accepts all four kinds and rejects malformed payloads", () => {
    const valid = [costSnapshot(), multivarSnapshot(), cvSnapshot(), clusterSnapshot()];
    expect(parseAdvancedPlans(valid)).toHaveLength(4);

    expect(parseAdvancedPlans("not-an-array")).toBeNull();
    expect(parseAdvancedPlans([{ ...costSnapshot(), version: 2 }])).toBeNull();
    expect(parseAdvancedPlans([{ ...costSnapshot(), appliedAt: "" }])).toBeNull();
    expect(parseAdvancedPlans([{ ...costSnapshot(), inputs: { broken: true } }])).toBeNull();
    expect(parseAdvancedPlans([{
        ...multivarSnapshot(),
        inputs: { variables: [{ id: "v1", name: "x", type: "proportion", estimatedValue: 0.5, importance: "vip", confidenceLevel: "95", marginOfError: 5, requiredSampleSize: 10 }] },
    }])).toBeNull();
});

test("validateAdvancedPlanConsistency passes genuine snapshots", () => {
    const plans = [costSnapshot(), multivarSnapshot(), cvSnapshot(), clusterSnapshot()];
    for (const plan of plans) {
        expect(validateAdvancedPlanConsistency(plan, POPULATION_SIZE, null)).toBeNull();
    }
});

test("validateAdvancedPlanConsistency rejects tampered results and inputs", () => {
    const tamperedCost = costSnapshot({ result: { requiredSampleSize: costSnapshot().result.requiredSampleSize + 1 } });
    expect(validateAdvancedPlanConsistency(tamperedCost, POPULATION_SIZE, null)).toContain("请重新应用");

    const tamperedCv = cvSnapshot();
    tamperedCv.result.achievedCV = tamperedCv.result.achievedCV + 0.01;
    expect(validateAdvancedPlanConsistency(tamperedCv, POPULATION_SIZE, null)).toContain("请重新应用");

    const tamperedCluster = clusterSnapshot();
    tamperedCluster.result.requiredClusters += 1;
    expect(validateAdvancedPlanConsistency(tamperedCluster, POPULATION_SIZE, null)).toContain("请重新应用");

    const tamperedMultivar = multivarSnapshot({ result: { requiredSampleSize: 1 } });
    expect(validateAdvancedPlanConsistency(tamperedMultivar, POPULATION_SIZE, null)).toContain("请重新应用");
});

test("validateAdvancedPlanConsistency checks the applied plan against the final size", () => {
    const snapshot = costSnapshot();
    expect(validateAdvancedPlanConsistency(snapshot, POPULATION_SIZE, snapshot.result.requiredSampleSize)).toBeNull();
    expect(validateAdvancedPlanConsistency(snapshot, POPULATION_SIZE, snapshot.result.requiredSampleSize + 5))
        .toContain("推荐样本量与最终样本量不一致");
    expect(validateAdvancedPlanConsistency(snapshot, null, null)).toBe("缺少总体规模，无法复算高级样本量规划");
});

test("advanced plans reject invalid domains before accepting numerically consistent results", () => {
    for (const inputs of [
        { targetMarginOfError: -.05 }, { targetMarginOfError: 0 }, { designEffect: -2 }, { designEffect: 0 },
        { nonResponseRate: 2 }, { nonResponseRate: -1 }, { fixedCost: -1000 }, { variableCostPerUnit: -5 }, { totalBudget: -500 }, { confidenceLevel: "80" },
    ]) {
        const plan = costSnapshot({ inputs });
        expect(parseAdvancedPlans([plan])).toBeNull();
        expect(validateAdvancedPlanConsistency(plan, POPULATION_SIZE, null)).not.toBeNull();
    }
    for (const plan of [cvSnapshot(), clusterSnapshot(), multivarSnapshot()]) {
        const invalid = structuredClone(plan);
        invalid.result.requiredSampleSize = -1;
        expect(parseAdvancedPlans([invalid])).toBeNull();
        expect(validateAdvancedPlanConsistency(invalid, POPULATION_SIZE, null)).not.toBeNull();
    }
    for (const plan of [cvSnapshot(), clusterSnapshot()]) {
        for (const input of [{ nonResponseRate: 100 }, { designEffect: 0 }, { confidenceLevel: "80" }]) {
            const invalid = { ...plan, inputs: { ...plan.inputs, ...input } } as AdvancedPlanSnapshot;
            expect(parseAdvancedPlans([invalid])).toBeNull();
            expect(validateAdvancedPlanConsistency(invalid, POPULATION_SIZE, null)).not.toBeNull();
        }
    }
    const multivar = multivarSnapshot() as Extract<AdvancedPlanSnapshot, { kind: "multivar" }>;
    multivar.inputs.variables[0]!.estimatedValue = 2;
    expect(parseAdvancedPlans([multivar])).toBeNull();
});
