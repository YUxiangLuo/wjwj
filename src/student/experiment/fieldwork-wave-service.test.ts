import { describe, expect, test } from "bun:test";
import {
    autoBindQuestionnaireVariables,
    DEFAULT_CLEANING_CONFIG,
    type StoredExperimentWave,
} from "../../domain/fieldwork";
import { buildPopulationNumericStats } from "../../domain/statistics/population";
import {
    createTeaPricingDictionary,
    teaPricingFieldMapping,
    teaPricingFieldworkConfig,
    teaPricingQuestionnaire,
} from "../../db/seeds/happiness-topic";
import { createTeaPricingPopulation } from "../../db/seeds/dogfood-fixtures";
import { finitePopulationS2ToSigma2 } from "./sample-plan";
import { validateMeanPlanVariance } from "./submit-validation";
import {
    buildWaveDiagnosticsMap,
    getVerifiedWave1EmpiricalVariance,
    getVerifiedWave1EmpiricalVariances,
    simulateWaveDispatchForCompletedMethods,
} from "./fieldwork-wave-service";

function createMultiMethodWave1Fixture() {
    const population = createTeaPricingPopulation();
    const dictionary = createTeaPricingDictionary("tea-multi-method-test", 1);
    const { questionnaire } = autoBindQuestionnaireVariables({
        questionnaire: teaPricingQuestionnaire,
        dictionary,
        taskId: 1,
        targetField: "最高支付意愿",
    });

    // Two distinct Wave 1 subsets so simple and stratified produce distinct positive empirical variances
    const simpleIndices = Array.from({ length: 24 }, (_, i) => i); // mostly 普通会员
    const stratifiedIndices = [
        ...Array.from({ length: 8 }, (_, i) => i),           // 普通会员
        ...Array.from({ length: 8 }, (_, i) => 96 + i),      // 银卡会员
        ...Array.from({ length: 8 }, (_, i) => 180 + i),     // 黑金会员
    ];

    const baseWave: StoredExperimentWave = {
        waveNumber: 1,
        kind: "pilot",
        label: "第 1 轮 · 首轮试投",
        questionnaire,
        samplePlan: {
            estimationType: "mean",
            confidenceLevel: "95",
            marginOfError: 2,
            populationVariance: 16,
            varianceSource: "prior_estimate",
            designEffect: 1,
            nonResponseRate: 0.1,
            recommendedSize: 24,
            finalSampleSize: 24,
        },
        samplingResults: {
            simple: { completed: true, serverGenerated: true, sampleCount: simpleIndices.length, indices: simpleIndices },
            stratified: {
                completed: true,
                serverGenerated: true,
                sampleCount: stratifiedIndices.length,
                stratifyBy: "会员等级",
                layers: [
                    { name: "普通会员", count: 96, sampleCount: 8 },
                    { name: "银卡会员", count: 84, sampleCount: 8 },
                    { name: "黑金会员", count: 60, sampleCount: 8 },
                ],
                indices: stratifiedIndices,
            },
        },
        fieldwork: null,
        cleaningConfig: { ...DEFAULT_CLEANING_CONFIG },
        completedAt: "2026-11-24T02:00:00.000Z",
    };

    const dispatched = simulateWaveDispatchForCompletedMethods({
        wave: baseWave,
        population,
        fieldMapping: teaPricingFieldMapping,
        fieldworkConfig: teaPricingFieldworkConfig,
        dictionary,
        seed: 20261124,
    });
    if (!dispatched.ok) throw new Error(dispatched.message);

    const wave1: StoredExperimentWave = { ...baseWave, fieldwork: dispatched.fieldwork };
    const diagMap = buildWaveDiagnosticsMap({
        wave: wave1,
        population,
        fieldMapping: teaPricingFieldMapping,
        fieldworkConfig: teaPricingFieldworkConfig,
        dictionary,
    });

    const popStat = buildPopulationNumericStats(population, ["最高支付意愿"])["最高支付意愿"]!;
    const actualPopVariance = finitePopulationS2ToSigma2(popStat.variance, popStat.count)!;

    return { population, dictionary, wave1, diagMap, actualPopVariance };
}

describe("fieldwork-wave-service empirical variance verification (QA-S2-03)", () => {
    test("returns verified empirical variances for all dispatched valid Wave 1 methods and matches any method", () => {
        const { population, dictionary, wave1, diagMap, actualPopVariance } = createMultiMethodWave1Fixture();
        const simpleVar = diagMap.simple?.empiricalTargetVariance;
        const stratifiedVar = diagMap.stratified?.empiricalTargetVariance;
        expect(simpleVar).toBeGreaterThan(0);
        expect(stratifiedVar).toBeGreaterThan(0);
        expect(Math.abs(simpleVar! - stratifiedVar!) / simpleVar!).toBeGreaterThan(1e-3);

        const verifiedList = getVerifiedWave1EmpiricalVariances({
            waves: [wave1],
            population,
            fieldMapping: teaPricingFieldMapping,
            fieldworkConfig: teaPricingFieldworkConfig,
            dictionary,
        });
        expect(verifiedList).toContain(simpleVar!);
        expect(verifiedList).toContain(stratifiedVar!);
        expect(verifiedList).toHaveLength(2);

        // Single-value helper preserves first-method default and can also match a non-first method when plannedVariance is supplied
        expect(getVerifiedWave1EmpiricalVariance({
            waves: [wave1],
            population,
            fieldMapping: teaPricingFieldMapping,
            fieldworkConfig: teaPricingFieldworkConfig,
            dictionary,
        })).toBe(simpleVar!);
        expect(getVerifiedWave1EmpiricalVariance({
            waves: [wave1],
            population,
            fieldMapping: teaPricingFieldMapping,
            fieldworkConfig: teaPricingFieldworkConfig,
            dictionary,
            plannedVariance: stratifiedVar!,
        })).toBe(stratifiedVar!);

        // End-to-end provenance check with validateMeanPlanVariance: both dispatched methods pass, population σ² with wave1_empirical fails
        expect(validateMeanPlanVariance(
            { populationVariance: simpleVar, varianceSource: "wave1_empirical" },
            "mean",
            actualPopVariance,
            { verifiedEmpiricalVariances: verifiedList },
        )).toBeNull();
        expect(validateMeanPlanVariance(
            { populationVariance: stratifiedVar, varianceSource: "wave1_empirical" },
            "mean",
            actualPopVariance,
            { verifiedEmpiricalVariances: verifiedList },
        )).toBeNull();
        expect(validateMeanPlanVariance(
            { populationVariance: actualPopVariance, varianceSource: "wave1_empirical" },
            "mean",
            actualPopVariance,
            { verifiedEmpiricalVariances: verifiedList },
        )).toMatch(/首轮实测样本方差/);
    });

    test("returns empty list and null when Wave 1 is absent or has no fieldwork", () => {
        const population = createTeaPricingPopulation();
        expect(getVerifiedWave1EmpiricalVariances({
            waves: [],
            population,
            fieldMapping: teaPricingFieldMapping,
            fieldworkConfig: teaPricingFieldworkConfig,
        })).toEqual([]);
        expect(getVerifiedWave1EmpiricalVariance({
            waves: [],
            population,
            fieldMapping: teaPricingFieldMapping,
            fieldworkConfig: teaPricingFieldworkConfig,
        })).toBeNull();
    });
});
