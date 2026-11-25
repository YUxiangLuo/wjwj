import { describe, expect, test } from "bun:test";
import type { QuestionnaireData } from "../../lib/questionnaire-types";
import type { VariableDictionary } from "../variables/types";
import { calculateCrossTab } from "../variables/analysis";
import {
    autoBindQuestionnaireVariables,
    buildMethodFieldworkDiagnostics,
    evaluateQuestionnaireBurden,
    materializeFieldworkSample,
    simulateMethodFieldwork,
    validateAdjustmentPlan,
    verifyMethodFieldworkReplay,
} from "./index";

const samplePopulation = Array.from({ length: 60 }, (_, idx) => {
    const tier = idx < 20 ? "黑卡会员" : idx < 40 ? "活跃会员" : "普通顾客";
    const wtp = idx === 0 ? 0 : tier === "黑卡会员" ? 28 + (idx % 5) : tier === "活跃会员" ? 19 + (idx % 4) : 13 + (idx % 3);
    return {
        顾客编号: `C${String(idx + 1).padStart(3, "0")}`,
        会员等级: tier,
        支付意愿: wtp,
        月消费频次: 2 + (idx % 6),
    };
});

const sampleDictionary: VariableDictionary = {
    source: "hash-demo-1",
    revision: 1,
    variables: [
        { field: "顾客编号", label: "顾客编号", unit: "", kind: "identifier", categories: [], missing: [null] },
        {
            field: "会员等级",
            label: "会员等级",
            unit: "",
            kind: "ordinal",
            categories: [
                { value: "普通顾客", label: "普通顾客" },
                { value: "活跃会员", label: "活跃会员" },
                { value: "黑卡会员", label: "黑卡会员" },
            ],
            missing: [null],
        },
        { field: "支付意愿", label: "支付意愿", unit: "元", kind: "continuous", categories: [], missing: [null] },
        { field: "月消费频次", label: "月消费频次", unit: "次", kind: "continuous", categories: [], missing: [null] },
    ],
};

const baseQuestionnaire: QuestionnaireData = {
    title: "新锐茶饮定价调研",
    welcomeText: "您好！本次匿名商业调研用于了解消费者新品支付意愿，数据严格保密且仅用于汇总统计分析。",
    endingText: "感谢您的宝贵意见！",
    questions: [
        { id: "q1", section: "main", type: "numeric", content: "您对本款新品单杯最高支付意愿是多少？", unit: "元", numericMin: 1, numericMax: 60, decimalPlaces: 0 },
        { id: "q2", section: "background", type: "single", content: "您的会员等级属于？", options: ["普通顾客", "活跃会员", "黑卡会员"] },
    ],
};

describe("Business statistics fieldwork simulation & quality control engine", () => {
    test("autoBindQuestionnaireVariables binds matching questions and evaluates burden", () => {
        const { questionnaire, newlyBoundCount } = autoBindQuestionnaireVariables({
            questionnaire: baseQuestionnaire,
            dictionary: sampleDictionary,
            taskId: 7,
            targetField: "支付意愿",
        });
        expect(newlyBoundCount).toBe(2);
        const burden = evaluateQuestionnaireBurden(questionnaire, sampleDictionary, { kind: "mean", field: "支付意愿" });
        expect(burden.primaryTargetBound).toBe(true);
        expect(burden.unboundVariables).toEqual(["月消费频次"]);
        expect(burden.welcomeHasPurposeAndPrivacy).toBe(true);
    });

    test("simulateMethodFieldwork is deterministic, replayable, and detects numeric range blocking on 0 values", () => {
        const { questionnaire } = autoBindQuestionnaireVariables({
            questionnaire: baseQuestionnaire,
            dictionary: sampleDictionary,
            taskId: 7,
        });
        const indices = Array.from({ length: 40 }, (_, i) => i);
        const config = {
            version: 1 as const,
            preset: "stratum_differential" as const,
            baseUnitNonResponseRate: 0.15,
            stratumField: "会员等级",
            stratumNonResponseRates: { 黑卡会员: 0.45, 活跃会员: 0.15, 普通顾客: 0.08 },
            baseSpeederRate: 0.12,
            baseStraightlinerRate: 0.08,
            baseItemSkipRate: 0.02,
            contactCostPerUnit: 5,
            incentiveCostPerComplete: 15,
        };

        const run1 = simulateMethodFieldwork({
            method: "simple",
            population: samplePopulation,
            indices,
            questionnaire,
            dictionary: sampleDictionary,
            analysisTarget: { kind: "mean", field: "支付意愿" },
            fieldworkConfig: config,
            dispatchSeed: 20261121,
            dispatchedAt: "2026-11-21T10:00:00.000Z",
        });
        const run2 = simulateMethodFieldwork({
            method: "simple",
            population: samplePopulation,
            indices,
            questionnaire,
            dictionary: sampleDictionary,
            analysisTarget: { kind: "mean", field: "支付意愿" },
            fieldworkConfig: config,
            dispatchSeed: 20261121,
            dispatchedAt: "2026-11-21T10:00:00.000Z",
        });

        expect(run1).toEqual(run2);
        expect(verifyMethodFieldworkReplay({
            stored: run1,
            population: samplePopulation,
            indices,
            questionnaire,
            dictionary: sampleDictionary,
            analysisTarget: { kind: "mean", field: "支付意愿" },
            fieldworkConfig: config,
        })).toBe(true);

        // Masking check: unbound field 月消费频次 should be null on respondent rows
        const materialized = materializeFieldworkSample({
            population: samplePopulation,
            samplingIndices: indices,
            fieldworkResult: run1,
            questionnaire,
            dictionary: sampleDictionary,
            frameFields: ["顾客编号", "会员等级"],
            analysisTarget: { kind: "mean", field: "支付意愿" },
        });
        expect(materialized.cleanedRows.length).toBeGreaterThan(0);
        expect(materialized.cleanedRows[0]!.月消费频次).toBeNull();

        const diagnostics = buildMethodFieldworkDiagnostics({
            method: "simple",
            population: samplePopulation,
            samplingIndices: indices,
            fieldworkResult: run1,
            fieldworkConfig: config,
            questionnaire,
            dictionary: sampleDictionary,
            frameFields: ["顾客编号", "会员等级"],
            identifierField: "顾客编号",
            analysisTarget: { kind: "mean", field: "支付意愿" },
        });
        expect(diagnostics.invitedCount).toBe(40);
        expect(diagnostics.cleanedValidCount).toBeLessThanOrEqual(diagnostics.completedRawCount);
        // Question 1 had numericMin=1 while population row 0 has 支付意愿=0 -> range conflict flagged!
        expect(diagnostics.questionDiagnostics[0]!.warnings.some((w) => w.includes("数值上下限拦截"))).toBe(true);
        expect(diagnostics.estimates.length).toBeGreaterThanOrEqual(3);
    });

    test("calculateCrossTab computes subgroup means across customer tiers", () => {
        const indices = Array.from({ length: 60 }, (_, i) => i);
        const result = calculateCrossTab({
            rows: samplePopulation,
            indices,
            variable: sampleDictionary.variables[2]!,
            groupVariable: sampleDictionary.variables[1]!,
            weighted: false,
        });
        expect(result.kind).toBe("crosstab");
        expect(result.groups).toHaveLength(3);
        const blackCard = result.groups.find((g) => g.groupLabel === "黑卡会员")!;
        const regular = result.groups.find((g) => g.groupLabel === "普通顾客")!;
        expect(blackCard.mean!).toBeGreaterThan(regular.mean!);
    });

    test("validateAdjustmentPlan enforces structured closed-loop reflection", () => {
        expect(validateAdjustmentPlan({ identifiedIssues: [], plannedActions: ["revise_questionnaire"], rationale: "需要修改问卷长度以提升回答率并重抽" })).toContain("至少勾选 1 项");
        expect(validateAdjustmentPlan({
            identifiedIssues: ["stratum_response_bias", "careless_responses"],
            plannedActions: ["upgrade_sampling_design", "recalibrate_sample_size"],
            rationale: "首轮试投中黑卡会员有效应答率偏低且存在闪电废卷，二轮剔除废卷并按会员等级分层补量。",
        })).toBeNull();
    });

    test("verifyMethodFieldworkReplay accepts PostgreSQL jsonb reordered object keys", () => {
        const { questionnaire } = autoBindQuestionnaireVariables({
            questionnaire: baseQuestionnaire,
            dictionary: sampleDictionary,
            taskId: 7,
        });
        const indices = Array.from({ length: 20 }, (_, i) => i);
        const simulated = simulateMethodFieldwork({
            method: "simple",
            population: samplePopulation,
            indices,
            questionnaire,
            dictionary: sampleDictionary,
            analysisTarget: { kind: "mean", field: "支付意愿" },
            dispatchSeed: 20261122,
            dispatchedAt: "2026-11-21T10:00:00.000Z",
        });
        const reorderedRecords = simulated.records.map((rec) => {
            const entries = Object.entries(rec).sort(([a], [b]) => a.length - b.length || a.localeCompare(b));
            return Object.fromEntries(entries) as typeof rec;
        });
        expect(verifyMethodFieldworkReplay({
            stored: { ...simulated, records: reorderedRecords },
            population: samplePopulation,
            indices,
            questionnaire,
            dictionary: sampleDictionary,
            analysisTarget: { kind: "mean", field: "支付意愿" },
        })).toBe(true);
    });

    test("QA-S1-04 full_invited_benchmark keeps standardError and halfWidth null when exact finite-population PPS SE is unavailable", () => {
        // Case 1: Unresolvable PPS probability frame (size=[1, 1, 1e-20], n=2 -> preparePPSSampling returns null)
        const unresolvedPop = [
            { id: "U1", grp: "A", y: 10, size: 1 },
            { id: "U2", grp: "A", y: 20, size: 1 },
            { id: "U3", grp: "B", y: 30, size: 1e-20 },
        ];
        const q: QuestionnaireData = {
            title: "PPS精确SE不可用基准",
            welcomeText: baseQuestionnaire.welcomeText,
            endingText: baseQuestionnaire.endingText,
            questions: [{ id: "q1", type: "numeric", content: "y", unit: "" }],
        };
        const diag1 = buildMethodFieldworkDiagnostics({
            method: "pps",
            population: unresolvedPop,
            samplingIndices: [0, 1],
            inclusionProbabilities: [0.9999999, 0.9999999],
            sizeField: "size",
            fieldworkResult: {
                method: "pps",
                dispatchSeed: 1,
                dispatchedAt: "2026-11-24T00:00:00.000Z",
                invitedCount: 2,
                records: [
                    { populationIndex: 0, disposition: "valid_complete", durationSec: 40, answeredQuestionCount: 1 },
                    { populationIndex: 1, disposition: "valid_complete", durationSec: 40, answeredQuestionCount: 1 },
                ],
            },
            questionnaire: q,
            frameFields: ["id", "grp"],
            identifierField: "id",
            analysisTarget: { kind: "mean", field: "y" },
            confidenceLevel: "95",
        });
        const bench1 = diag1.estimates.find((e) => e.key === "full_invited_benchmark")!;
        expect(bench1.estimate).toBe(15);
        expect(bench1.standardError).toBeNull();
        expect(bench1.halfWidth).toBeNull();
        // Respondent Taylor SE remains available on cleaned_design, proving full_invited_benchmark did NOT fall back to it.
        expect(diag1.estimates.find((e) => e.key === "cleaned_design")?.standardError).not.toBeNull();

        // Case 2: PPS frame prepares, but exact SE for target field is unrepresentable (standardErrors.__target__ === null)
        const unrepresentableFieldPop = [
            { id: "U1", grp: "A", y: 0, size: 1e-200 },
            { id: "U2", grp: "A", y: 1e-200, size: 1 },
            { id: "U3", grp: "B", y: 1e100, size: 1 },
        ];
        const diag2 = buildMethodFieldworkDiagnostics({
            method: "pps",
            population: unrepresentableFieldPop,
            samplingIndices: [1, 2],
            inclusionProbabilities: [0.5, 0.5],
            sizeField: "size",
            fieldworkResult: {
                method: "pps",
                dispatchSeed: 2,
                dispatchedAt: "2026-11-24T00:00:00.000Z",
                invitedCount: 2,
                records: [
                    { populationIndex: 1, disposition: "valid_complete", durationSec: 40, answeredQuestionCount: 1 },
                    { populationIndex: 2, disposition: "valid_complete", durationSec: 40, answeredQuestionCount: 1 },
                ],
            },
            questionnaire: q,
            frameFields: ["id", "grp"],
            identifierField: "id",
            analysisTarget: { kind: "mean", field: "y" },
            confidenceLevel: "95",
        });
        const bench2 = diag2.estimates.find((e) => e.key === "full_invited_benchmark")!;
        expect(bench2.estimate).not.toBeNull();
        expect(bench2.standardError).toBeNull();
        expect(bench2.halfWidth).toBeNull();
    });
});
