import { describe, expect, test } from "bun:test";
import type { Question, QuestionnaireData } from "../../lib/questionnaire-types";
import { validateQuestionBindings } from "../variables/question-binding";
import type { VariableDictionary } from "../variables/types";
import {
    autoBindQuestionnaireVariables,
    buildAutoVariableBindingForQuestion,
    buildMethodFieldworkDiagnostics,
    checkNumericQuestionRangeConflict,
    DEFAULT_FIELDWORK_CONFIG,
    evaluateQuestionnaireBurden,
    findCompatibleDictionaryField,
    materializeFieldworkSample,
    resolveFieldworkConfig,
    simulateMethodFieldwork,
    validateFieldworkConfig,
    verifyMethodFieldworkReplay,
    type MethodFieldworkResult,
} from "./index";

function assertNoNonFiniteOrNegZero(value: unknown, path = "root"): void {
    if (typeof value === "number") {
        if (!Number.isFinite(value)) throw new Error(`${path} is non-finite: ${value}`);
        if (Object.is(value, -0)) throw new Error(`${path} is -0`);
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((item, idx) => assertNoNonFiniteOrNegZero(item, `${path}[${idx}]`));
        return;
    }
    if (value && typeof value === "object") {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            assertNoNonFiniteOrNegZero(v, `${path}.${k}`);
        }
    }
}

const cleanWelcome = "您好！本次匿名商业统计调研仅用于汇总统计分析，所有作答数据严格保密且自愿参与。";

describe("Fieldwork config validation & resolution adversarial regressions", () => {
    test("resolveFieldworkConfig ignores null/blank/boolean/array coercions and falls back to defaults", () => {
        const resolved = resolveFieldworkConfig({
            preset: "unknown_preset",
            baseUnitNonResponseRate: null,
            baseSpeederRate: "",
            baseStraightlinerRate: "   ",
            baseItemSkipRate: false,
            contactCostPerUnit: [],
            incentiveCostPerComplete: true,
            stratumNonResponseRates: {
                "  Ａ组 ": "0.25",
                "__proto__": 0.5,
                "": 0.3,
            },
        });
        expect(resolved.preset).toBe("balanced");
        expect(resolved.baseUnitNonResponseRate).toBe(DEFAULT_FIELDWORK_CONFIG.baseUnitNonResponseRate);
        expect(resolved.baseSpeederRate).toBe(DEFAULT_FIELDWORK_CONFIG.baseSpeederRate);
        expect(resolved.baseStraightlinerRate).toBe(DEFAULT_FIELDWORK_CONFIG.baseStraightlinerRate);
        expect(resolved.baseItemSkipRate).toBe(DEFAULT_FIELDWORK_CONFIG.baseItemSkipRate);
        expect(resolved.contactCostPerUnit).toBe(DEFAULT_FIELDWORK_CONFIG.contactCostPerUnit);
        expect(resolved.incentiveCostPerComplete).toBe(DEFAULT_FIELDWORK_CONFIG.incentiveCostPerComplete);
        expect(resolved.stratumNonResponseRates).toEqual({ A组: 0.25 });
    });

    test("validateFieldworkConfig enforces strict bounds across all rate/cost fields and empty allowedStrataFields", () => {
        expect(validateFieldworkConfig(null)).toContain("格式无效");
        expect(validateFieldworkConfig([])).toContain("格式无效");
        expect(validateFieldworkConfig({ preset: "invalid" })).toContain("预设场景无效");

        // Rejects non-numeric coercions (null, empty string, boolean)
        expect(validateFieldworkConfig({ baseUnitNonResponseRate: null })).toContain("基准单元无回答率");
        expect(validateFieldworkConfig({ baseUnitNonResponseRate: "" })).toContain("基准单元无回答率");
        expect(validateFieldworkConfig({ baseSpeederRate: false })).toContain("闪电敷衍卷");

        // Rejects out-of-bounds rates & costs
        expect(validateFieldworkConfig({ baseUnitNonResponseRate: -0.01 })).toContain("0%–75%");
        expect(validateFieldworkConfig({ baseUnitNonResponseRate: 0.76 })).toContain("0%–75%");
        expect(validateFieldworkConfig({ baseSpeederRate: 0.36 })).toContain("0%–35%");
        expect(validateFieldworkConfig({ baseStraightlinerRate: 0.4 })).toContain("0%–35%");
        expect(validateFieldworkConfig({ baseItemSkipRate: 0.3 })).toContain("0%–25%");
        expect(validateFieldworkConfig({ contactCostPerUnit: -1 })).toContain("0–10000");
        expect(validateFieldworkConfig({ contactCostPerUnit: 10001 })).toContain("0–10000");
        expect(validateFieldworkConfig({ incentiveCostPerComplete: 50001 })).toContain("0–50000");

        // Rejects stratumField when topic has 0 stratified columns (allowedStrataFields = [])
        expect(validateFieldworkConfig({ stratumField: "会员等级" }, [])).toContain("未配置分层变量");
        expect(validateFieldworkConfig({ stratumField: "不存在列" }, ["会员等级"])).toContain("不在已映射的分层变量中");
        expect(validateFieldworkConfig({ stratumField: 123 as unknown as string })).toContain("格式无效");

        // Rejects malformed stratumNonResponseRates
        expect(validateFieldworkConfig({ stratumNonResponseRates: [] })).toContain("格式无效");
        expect(validateFieldworkConfig({ stratumNonResponseRates: { 普通会员: 0.9 } })).toContain("0%–85%");
        expect(validateFieldworkConfig({ stratumNonResponseRates: { 普通会员: -0.1 } })).toContain("0%–85%");
        expect(validateFieldworkConfig({ stratumNonResponseRates: { "   ": 0.2 } })).toContain("空客群名称");

        // Accepts boundary-valid configuration
        expect(validateFieldworkConfig({
            preset: "stratum_differential",
            baseUnitNonResponseRate: 0,
            stratumField: "会员等级",
            stratumNonResponseRates: { 普通会员: 0, 黑金会员: 0.85 },
            baseSpeederRate: 0,
            baseStraightlinerRate: 0.35,
            baseItemSkipRate: 0.25,
            contactCostPerUnit: 0,
            incentiveCostPerComplete: 50000,
        }, ["会员等级"])).toBeNull();
    });
});

describe("Questionnaire burden, range conflicts, core position & binding coverage", () => {
    test("empty questionnaire and extreme question counts stay bounded and well-defined", () => {
        const empty = evaluateQuestionnaireBurden(
            { title: "空", welcomeText: cleanWelcome, endingText: "谢", questions: [] },
            null,
            { kind: "mean", field: "y" },
        );
        expect(empty.questionCount).toBe(0);
        expect(empty.estimatedDurationSec).toBe(0);
        expect(empty.estimatedMinutes).toBe(0);
        expect(empty.primaryTargetBound).toBe(false);
        expect(empty.primaryTargetQuestionIndex).toBeNull();
        expect(empty.burdenLevel).toBe("low");

        const hugeQuestions: Question[] = Array.from({ length: 120 }, (_, idx) => ({
            id: `q${idx}`,
            section: idx === 50 ? "screening" : "main",
            type: idx % 3 === 0 ? "scale" : "numeric",
            content: `问题 ${idx}`,
        }));
        const extreme = evaluateQuestionnaireBurden(
            { title: "超长", welcomeText: "太短", endingText: "谢", questions: hugeQuestions },
            null,
            null,
        );
        expect(extreme.questionCount).toBe(120);
        expect(extreme.funnelOrderClean).toBe(false);
        expect(extreme.burdenLevel).toBe("high");
        expect(extreme.refusalPenalty).toBeLessThanOrEqual(0.15);
        expect(extreme.totalBreakoffProbability).toBe(0.28);
        expect(extreme.speederPenalty).toBe(0.12);
        assertNoNonFiniteOrNegZero(extreme);
    });

    test("checkNumericQuestionRangeConflict handles unclosed bounds, null bounds, negative/zero values and inverted ranges", () => {
        // numericMin only (unclosed upper bound, including JSON null)
        const minOnly: Question = { id: "q1", type: "numeric", content: "预算", numericMin: 0, numericMax: null as unknown as undefined };
        expect(checkNumericQuestionRangeConflict(minOnly, 0)).toBe(false);
        expect(checkNumericQuestionRangeConflict(minOnly, -0)).toBe(false);
        expect(checkNumericQuestionRangeConflict(minOnly, 1_000_000)).toBe(false);
        expect(checkNumericQuestionRangeConflict(minOnly, -0.0001)).toBe(true);

        // numericMax only (unclosed lower bound, including negative numbers and JSON null)
        const maxOnly: Question = { id: "q2", type: "numeric", content: "温差", numericMin: null as unknown as undefined, numericMax: -5 };
        expect(checkNumericQuestionRangeConflict(maxOnly, -100)).toBe(false);
        expect(checkNumericQuestionRangeConflict(maxOnly, -5)).toBe(false);
        expect(checkNumericQuestionRangeConflict(maxOnly, -4.99)).toBe(true);
        expect(checkNumericQuestionRangeConflict(maxOnly, 0)).toBe(true);

        // Inverted range (numericMin > numericMax) blocks every finite number
        const inverted: Question = { id: "q3", type: "numeric", content: "倒置", numericMin: 50, numericMax: 10 };
        expect(checkNumericQuestionRangeConflict(inverted, -10)).toBe(true);
        expect(checkNumericQuestionRangeConflict(inverted, 0)).toBe(true);
        expect(checkNumericQuestionRangeConflict(inverted, 30)).toBe(true);
        expect(checkNumericQuestionRangeConflict(inverted, 100)).toBe(true);
        expect(checkNumericQuestionRangeConflict(inverted, Number.NaN)).toBe(false);
    });

    test("core target position scoring penalizes burying the primary target in background or tail", () => {
        const dict: VariableDictionary = {
            source: "src-1",
            revision: 1,
            variables: [
                { field: "id", label: "ID", unit: "", kind: "identifier", categories: [], missing: [] },
                { field: "wtp", label: "支付意愿", unit: "元", kind: "continuous", categories: [], missing: [] },
                ...Array.from({ length: 9 }, (_, i) => ({
                    field: `aux_${i}`,
                    label: `辅助_${i}`,
                    unit: "元",
                    kind: "continuous" as const,
                    categories: [],
                    missing: [],
                })),
            ],
        };

        const makeQ = (field: string, section: "main" | "background" = "main"): Question => ({
            id: `q-${field}`,
            section,
            type: "numeric",
            content: `请填写${field}`,
            unit: "元",
        });

        const early = autoBindQuestionnaireVariables({
            questionnaire: {
                title: "前置核心题",
                welcomeText: cleanWelcome,
                endingText: "感谢参与",
                questions: [makeQ("wtp", "main"), ...Array.from({ length: 9 }, (_, i) => makeQ(`aux_${i}`, "main"))],
            },
            dictionary: dict,
            taskId: 1,
        }).questionnaire;

        const buried = autoBindQuestionnaireVariables({
            questionnaire: {
                title: "后置核心题",
                welcomeText: cleanWelcome,
                endingText: "感谢参与",
                questions: [...Array.from({ length: 9 }, (_, i) => makeQ(`aux_${i}`, "main")), makeQ("wtp", "background")],
            },
            dictionary: dict,
            taskId: 1,
        }).questionnaire;

        const earlyBurden = evaluateQuestionnaireBurden(early, dict, { kind: "mean", field: "wtp" });
        const buriedBurden = evaluateQuestionnaireBurden(buried, dict, { kind: "mean", field: "wtp" });
        expect(earlyBurden.primaryTargetQuestionIndex).toBe(0);
        expect(buriedBurden.primaryTargetQuestionIndex).toBe(9);
        expect(buriedBurden.totalBreakoffProbability).toBeGreaterThan(earlyBurden.totalBreakoffProbability);
    });

    test("auto-binding handles inverted boolean, leading/middle missing option, nominal label matching and multiple-choice binary fields", () => {
        const dict: VariableDictionary = {
            source: "src-bind",
            revision: 3,
            variables: [
                { field: "id", label: "编号", unit: "", kind: "identifier", categories: [], missing: [] },
                {
                    field: "auto_renew",
                    label: "自动续费",
                    unit: "",
                    kind: "nominal",
                    // Intentionally "否" (0) first, "是" (1) second!
                    categories: [{ value: 0, label: "否" }, { value: 1, label: "是" }],
                    missing: [],
                },
                {
                    field: "sex",
                    label: "性别",
                    unit: "",
                    kind: "nominal",
                    categories: [{ value: 1, label: "男" }, { value: 2, label: "女" }],
                    missing: [null],
                },
                {
                    field: "app_rating",
                    label: "小程序评分",
                    unit: "",
                    kind: "ordinal",
                    categories: [
                        { value: 1, label: "低" },
                        { value: 2, label: "中" },
                        { value: 3, label: "高" },
                    ],
                    missing: [-99],
                },
                {
                    field: "feat_bi",
                    label: "BI驾驶舱",
                    unit: "",
                    kind: "nominal",
                    categories: [{ value: false, label: "否" }, { value: true, label: "是" }],
                    missing: [],
                },
                {
                    field: "feat_ai",
                    label: "AI助手",
                    unit: "",
                    kind: "nominal",
                    categories: [{ value: "Y", label: "是" }, { value: "N", label: "否" }],
                    missing: [],
                },
            ],
        };

        const rawQuestionnaire: QuestionnaireData = {
            title: "复杂绑定测试",
            welcomeText: cleanWelcome,
            endingText: "感谢参与本次测试",
            questions: [
                { id: "q1", type: "boolean", content: "是否开通自动续费？" },
                { id: "q2", type: "single", content: "您的性别是？", options: ["女", "男"] },
                // Leading missing option ("未使用过") before ordered ratings!
                { id: "q3", type: "single", content: "您对小程序评分如何？", options: ["近3个月未使用过", "低", "中", "高"] },
                { id: "q4", type: "multiple", content: "需要哪些模块？", options: ["BI驾驶舱", "AI助手"] },
            ],
        };

        const { questionnaire, newlyBoundCount } = autoBindQuestionnaireVariables({
            questionnaire: rawQuestionnaire,
            dictionary: dict,
            taskId: 9,
        });
        expect(newlyBoundCount).toBe(4);
        expect(() => validateQuestionBindings(questionnaire, dict, 9)).not.toThrow();

        // Check exact mapped values
        expect(questionnaire.questions[0]!.variableBinding!.mappings[0]!.answers).toEqual([
            { answer: "是", value: 1 },
            { answer: "否", value: 0 },
        ]);
        expect(questionnaire.questions[1]!.variableBinding!.mappings[0]!.answers).toEqual([
            { answer: "女", value: 2 },
            { answer: "男", value: 1 },
        ]);
        expect(questionnaire.questions[2]!.variableBinding!.mappings[0]!.answers).toEqual([
            { answer: "近3个月未使用过", value: -99 },
            { answer: "低", value: 1 },
            { answer: "中", value: 2 },
            { answer: "高", value: 3 },
        ]);
        expect(questionnaire.questions[3]!.variableBinding!.mappings).toEqual([
            { field: "feat_bi", option: "BI驾驶舱", answers: [{ answer: "是", value: true }, { answer: "否", value: false }] },
            { field: "feat_ai", option: "AI助手", answers: [{ answer: "是", value: "Y" }, { answer: "否", value: "N" }] },
        ]);

        const burden = evaluateQuestionnaireBurden(questionnaire, dict, { kind: "proportion", field: "auto_renew", value: "1" });
        expect(burden.unboundVariables).toEqual([]);
        expect(findCompatibleDictionaryField({ id: "m", type: "multiple", content: "x", options: ["a"] }, dict.variables)?.field).toBe("auto_renew");
        expect(buildAutoVariableBindingForQuestion({
            question: { id: "dup", type: "single", content: "性别", options: ["男", "男"] },
            dictionary: dict,
            taskId: 9,
        })).toBeNull();
    });
});

describe("Dispatch simulation PRNG seeds, zero/extreme rates, clamping & replay tamper detection", () => {
    const pop = Array.from({ length: 30 }, (_, i) => ({
        id: `U${i + 1}`,
        tier: i < 10 ? "VIP" : "STD",
        spend: i === 0 ? 0 : i === 1 ? -99 : 15 + i * 2.5,
        auxSecret: 1000 + i,
        sat: (i % 5) + 1,
    }));

    const dict: VariableDictionary = {
        source: "sim-src",
        revision: 1,
        variables: [
            { field: "id", label: "ID", unit: "", kind: "identifier", categories: [], missing: [] },
            { field: "tier", label: "等级", unit: "", kind: "nominal", categories: [{ value: "VIP", label: "VIP" }, { value: "STD", label: "STD" }], missing: [] },
            { field: "spend", label: "支出", unit: "元", kind: "continuous", categories: [], missing: [-99] },
            { field: "auxSecret", label: "未绑定列", unit: "元", kind: "continuous", categories: [], missing: [] },
            {
                field: "sat",
                label: "满意度",
                unit: "",
                kind: "ordinal",
                categories: [1, 2, 3, 4, 5].map((v) => ({ value: v, label: `${v}分` })),
                missing: [],
            },
        ],
    };

    const { questionnaire: cleanQ } = autoBindQuestionnaireVariables({
        questionnaire: {
            title: "精准调研",
            welcomeText: cleanWelcome,
            endingText: "感谢您的配合！",
            questions: [
                { id: "q1", section: "main", type: "numeric", content: "您的支出是多少？", unit: "元", numericMin: 0, decimalPlaces: 0 },
                { id: "q2", section: "main", type: "scale", content: "您的满意度评分？", scaleMin: 1, scaleMax: 5 },
                { id: "q3", section: "background", type: "single", content: "您的等级是？", options: ["VIP", "STD"] },
            ],
        },
        dictionary: dict,
        taskId: 1,
    });

    test("seed=0, -0, negative, float, huge and NaN seeds are deterministic and pass replay verification", () => {
        const indices = Array.from({ length: 15 }, (_, i) => i);
        for (const seed of [0, -0, -1, -987654321, 3.1415926, 1e24, Number.NaN, Number.POSITIVE_INFINITY]) {
            const first = simulateMethodFieldwork({
                method: "simple",
                population: pop,
                indices,
                questionnaire: cleanQ,
                dictionary: dict,
                analysisTarget: { kind: "mean", field: "spend" },
                dispatchSeed: seed,
                dispatchedAt: "2026-11-23T00:00:00.000Z",
            });
            const second = simulateMethodFieldwork({
                method: "simple",
                population: pop,
                indices,
                questionnaire: cleanQ,
                dictionary: dict,
                analysisTarget: { kind: "mean", field: "spend" },
                dispatchSeed: seed,
                dispatchedAt: "2026-11-23T00:00:00.000Z",
            });
            expect(Number.isSafeInteger(first.dispatchSeed)).toBe(true);
            expect(Object.is(first.dispatchSeed, -0)).toBe(false);
            expect(first).toEqual(second);
            expect(verifyMethodFieldworkReplay({
                stored: first,
                expectedMethod: "simple",
                population: pop,
                indices,
                questionnaire: cleanQ,
                dictionary: dict,
                analysisTarget: { kind: "mean", field: "spend" },
            })).toBe(true);
        }

        // seed=0 and seed=1 produce distinct deterministic trajectories
        const s0 = simulateMethodFieldwork({
            method: "simple",
            population: pop,
            indices,
            questionnaire: cleanQ,
            dictionary: dict,
            dispatchSeed: 0,
            dispatchedAt: "2026-11-23T00:00:00.000Z",
        });
        const s1 = simulateMethodFieldwork({
            method: "simple",
            population: pop,
            indices,
            questionnaire: cleanQ,
            dictionary: dict,
            dispatchSeed: 1,
            dispatchedAt: "2026-11-23T00:00:00.000Z",
        });
        expect(s0.records.map((r) => r.durationSec)).not.toEqual(s1.records.map((r) => r.durationSec));
    });

    test("zero rates on a clean questionnaire achieve 100% valid completion and do not falsely range-block missing code -99", () => {
        const indices = Array.from({ length: 30 }, (_, i) => i);
        const zeroRateConfig = {
            version: 1 as const,
            preset: "balanced" as const,
            baseUnitNonResponseRate: 0,
            baseSpeederRate: 0,
            baseStraightlinerRate: 0,
            baseItemSkipRate: 0,
            contactCostPerUnit: 0,
            incentiveCostPerComplete: 0,
        };
        const res = simulateMethodFieldwork({
            method: "simple",
            population: pop,
            indices,
            questionnaire: cleanQ,
            dictionary: dict,
            analysisTarget: { kind: "mean", field: "spend" },
            fieldworkConfig: zeroRateConfig,
            dispatchSeed: 42,
        });
        expect(res.records.every((r) => r.disposition === "valid_complete")).toBe(true);
        // Row 0 has spend=0 (valid >= 0) and Row 1 has spend=-99 (declared missing code, NOT range-blocked!)
        expect(res.records.every((r) => r.rangeBlockedFields === undefined)).toBe(true);
        expect(res.records.every((r) => r.skippedFields === undefined)).toBe(true);

        // Materialization excludes row 1 (-99 declared missing) when requirePrimaryTargetValid=true
        const mat = materializeFieldworkSample({
            population: pop,
            samplingIndices: indices,
            fieldworkResult: res,
            questionnaire: cleanQ,
            dictionary: dict,
            frameFields: ["id", "tier"],
            analysisTarget: { kind: "mean", field: "spend" },
        });
        expect(mat.cleanedRows).toHaveLength(29);
        expect(mat.cleanedRows.some((r) => r.spend === 0)).toBe(true);
        expect(mat.cleanedRows.some((r) => r.spend === -99)).toBe(false);
        expect(mat.cleanedRows.every((r) => r.auxSecret === null)).toBe(true);
    });

    test("numeric clamping handles high numericMin-only, negative numericMax-only, tight integer grid and bad decimalPlaces", () => {
        const customPop = Array.from({ length: 40 }, (_, i) => ({
            id: `P${i}`,
            highFloor: 500 + i,
            negCeil: -30 - i,
            tightInt: 3,
            smallRatio: 0.25,
            scaleA: (i % 5) + 1,
            scaleB: ((i + 1) % 5) + 1,
        }));
        const customDict: VariableDictionary = {
            source: "clamp-src",
            revision: 1,
            variables: [
                { field: "id", label: "ID", unit: "", kind: "identifier", categories: [], missing: [] },
                { field: "highFloor", label: "高门槛", unit: "万", kind: "continuous", categories: [], missing: [] },
                { field: "negCeil", label: "负上限", unit: "度", kind: "continuous", categories: [], missing: [] },
                { field: "tightInt", label: "紧整数", unit: "个", kind: "continuous", categories: [], missing: [] },
                { field: "smallRatio", label: "小比例", unit: "", kind: "continuous", categories: [], missing: [] },
                { field: "scaleA", label: "量表A", unit: "", kind: "ordinal", categories: [1, 2, 3, 4, 5].map((v) => ({ value: v, label: `${v}` })), missing: [] },
                { field: "scaleB", label: "量表B", unit: "", kind: "ordinal", categories: [1, 2, 3, 4, 5].map((v) => ({ value: v, label: `${v}` })), missing: [] },
            ],
        };
        const { questionnaire } = autoBindQuestionnaireVariables({
            questionnaire: {
                title: "边界裁剪",
                welcomeText: cleanWelcome,
                endingText: "谢谢",
                questions: [
                    { id: "q1", type: "numeric", content: "高门槛", unit: "万", numericMin: 500, decimalPlaces: 200 },
                    { id: "q2", type: "numeric", content: "负上限", unit: "度", numericMax: -10, decimalPlaces: -4 },
                    { id: "q3", type: "numeric", content: "紧整数", unit: "个", numericMin: 1.2, numericMax: 4.8, decimalPlaces: 0 },
                    { id: "q4", type: "numeric", content: "小比例", unit: "", numericMin: 0, numericMax: 0.5, decimalPlaces: 2 },
                    { id: "q5", type: "scale", content: "量表A", scaleMin: 1, scaleMax: 5 },
                    { id: "q6", type: "scale", content: "量表B", scaleMin: 1, scaleMax: 5 },
                ],
            },
            dictionary: customDict,
            taskId: 2,
        });

        const sim = simulateMethodFieldwork({
            method: "simple",
            population: customPop,
            indices: Array.from({ length: 40 }, (_, i) => i),
            questionnaire,
            dictionary: customDict,
            fieldworkConfig: {
                preset: "balanced",
                baseUnitNonResponseRate: 0,
                baseSpeederRate: 0.35,
                baseStraightlinerRate: 0.35,
                baseItemSkipRate: 0,
                contactCostPerUnit: 1,
                incentiveCostPerComplete: 1,
            },
            dispatchSeed: 20261123,
        });

        const careless = sim.records.filter((r) => r.disposition === "careless_speeder" || r.disposition === "careless_straightliner");
        expect(careless.length).toBeGreaterThan(5);
        for (const rec of careless) {
            const ov = rec.carelessOverrides!;
            expect(Number(ov.highFloor)).toBeGreaterThanOrEqual(500);
            expect(Number(ov.negCeil)).toBeLessThanOrEqual(-10);
            expect(Number.isInteger(ov.tightInt)).toBe(true);
            expect(Number(ov.tightInt)).toBeGreaterThanOrEqual(2);
            expect(Number(ov.tightInt)).toBeLessThanOrEqual(4);
            expect(Number(ov.smallRatio)).toBeGreaterThanOrEqual(0);
            expect(Number(ov.smallRatio)).toBeLessThanOrEqual(0.5);
            if (rec.disposition === "careless_straightliner") {
                expect(ov.scaleA).toBe(1);
                expect(ov.scaleB).toBe(1);
            }
        }
        assertNoNonFiniteOrNegZero(sim);
    });

    test("unbound primary target does not leak fabricated carelessOverrides when dictionary is present", () => {
        const unboundQ: QuestionnaireData = {
            title: "漏绑核心指标",
            welcomeText: cleanWelcome,
            endingText: "感谢",
            questions: [
                cleanQ.questions[1]!,
                cleanQ.questions[2]!,
            ],
        };
        const sim = simulateMethodFieldwork({
            method: "simple",
            population: pop,
            indices: Array.from({ length: 20 }, (_, i) => i),
            questionnaire: unboundQ,
            dictionary: dict,
            analysisTarget: { kind: "proportion", field: "auxSecret", value: "1000" },
            fieldworkConfig: { baseUnitNonResponseRate: 0, baseSpeederRate: 0.35, baseStraightlinerRate: 0.35 },
            dispatchSeed: 77,
        });
        for (const rec of sim.records) {
            expect(rec.carelessOverrides?.auxSecret).toBeUndefined();
        }
    });

    test("verifyMethodFieldworkReplay detects tampering of invitedCount, method, seed, overrides and NaN", () => {
        const indices = [0, 1, 2, 3, 4, 5];
        const valid = simulateMethodFieldwork({
            method: "simple",
            population: pop,
            indices,
            questionnaire: cleanQ,
            dictionary: dict,
            analysisTarget: { kind: "mean", field: "spend" },
            dispatchSeed: 555,
            dispatchedAt: "2026-11-23T01:00:00.000Z",
        });

        expect(verifyMethodFieldworkReplay({
            stored: valid,
            expectedMethod: "simple",
            population: pop,
            indices,
            questionnaire: cleanQ,
            dictionary: dict,
            analysisTarget: { kind: "mean", field: "spend" },
        })).toBe(true);

        // Method mismatch
        expect(verifyMethodFieldworkReplay({
            stored: valid,
            expectedMethod: "pps",
            population: pop,
            indices,
            questionnaire: cleanQ,
            dictionary: dict,
            analysisTarget: { kind: "mean", field: "spend" },
        })).toBe(false);

        // Tampered invitedCount
        expect(verifyMethodFieldworkReplay({
            stored: { ...valid, invitedCount: 999 },
            population: pop,
            indices,
            questionnaire: cleanQ,
            dictionary: dict,
            analysisTarget: { kind: "mean", field: "spend" },
        })).toBe(false);

        // Tampered durationSec
        const tamperedDuration: MethodFieldworkResult = structuredClone(valid);
        tamperedDuration.records[0]!.durationSec += 1;
        expect(verifyMethodFieldworkReplay({
            stored: tamperedDuration,
            population: pop,
            indices,
            questionnaire: cleanQ,
            dictionary: dict,
            analysisTarget: { kind: "mean", field: "spend" },
        })).toBe(false);

        // Tampered non-integer seed or empty dispatchedAt or out-of-bounds index
        expect(verifyMethodFieldworkReplay({
            stored: { ...valid, dispatchSeed: 555.5 },
            population: pop,
            indices,
            questionnaire: cleanQ,
            dictionary: dict,
        })).toBe(false);
        expect(verifyMethodFieldworkReplay({
            stored: { ...valid, dispatchedAt: "   " },
            population: pop,
            indices,
            questionnaire: cleanQ,
            dictionary: dict,
        })).toBe(false);
        expect(verifyMethodFieldworkReplay({
            stored: valid,
            population: pop,
            indices: [0, 1, 2, 3, 4, 999],
            questionnaire: cleanQ,
            dictionary: dict,
        })).toBe(false);
    });
});

describe("Diagnostics mathematical invariants, zero-count guards, post-stratification & small-N FPC", () => {
    const strataPop = [
        // Stratum A: N_A = 6, values [10, 14, 18, 22, 26, 30], mean = 20
        { id: "A1", grp: "A", y: 10, bin: "yes", size: 1 },
        { id: "A2", grp: "A", y: 14, bin: "no", size: 2 },
        { id: "A3", grp: "A", y: 18, bin: "yes", size: 2 },
        { id: "A4", grp: "A", y: 22, bin: "no", size: 3 },
        { id: "A5", grp: "A", y: 26, bin: "no", size: 4 },
        { id: "A6", grp: "A", y: 30, bin: "no", size: 4 },
        // Stratum B: N_B = 4, values [100, 120, 140, 160], mean = 130
        { id: "B1", grp: "B", y: 100, bin: "yes", size: 5 },
        { id: "B2", grp: "B", y: 120, bin: "yes", size: 5 },
        { id: "B3", grp: "B", y: 140, bin: "yes", size: 10 },
        { id: "B4", grp: "B", y: 160, bin: "no", size: 14 },
    ];

    const qSimple: QuestionnaireData = {
        title: "诊断基准",
        welcomeText: cleanWelcome,
        endingText: "感谢参与",
        questions: [
            { id: "q1", type: "numeric", content: "y", unit: "" },
            { id: "q2", type: "single", content: "bin", options: ["yes", "no"] },
        ],
    };

    test("zero-count / single-respondent / N=1 census edge cases produce zero NaN or Infinity", () => {
        const emptyFw: MethodFieldworkResult = {
            method: "simple",
            dispatchSeed: 1,
            dispatchedAt: "2026-11-23T00:00:00Z",
            invitedCount: 0,
            records: [],
        };

        // 1. invitedCount = 0
        const d0 = buildMethodFieldworkDiagnostics({
            method: "simple",
            population: strataPop,
            samplingIndices: [],
            fieldworkResult: emptyFw,
            questionnaire: qSimple,
            frameFields: ["id", "grp"],
            identifierField: "id",
            analysisTarget: { kind: "mean", field: "y" },
        });
        expect(d0.invitedCount).toBe(0);
        expect(d0.contactedCount).toBe(0);
        expect(d0.completedRawCount).toBe(0);
        expect(d0.cleanedValidCount).toBe(0);
        expect(d0.effectiveRatePct).toBe(0);
        expect(d0.unitEffectiveCost).toBeNull();
        expect(d0.empiricalTargetVariance).toBeNull();
        expect(d0.empiricalTargetStdDev).toBeNull();
        expect(d0.maxStratumBiasPp).toBeNull();
        expect(d0.estimates.every((e) => e.estimate === null && e.standardError === null && e.halfWidth === null)).toBe(true);
        assertNoNonFiniteOrNegZero(d0);

        // 2. All not_contacted -> contactedCount = 0, completedRawCount = 0, cleanedValidCount = 0
        const allLost: MethodFieldworkResult = {
            method: "simple",
            dispatchSeed: 2,
            dispatchedAt: "2026-11-23T00:00:00Z",
            invitedCount: 2,
            records: [
                { populationIndex: 0, disposition: "not_contacted", durationSec: 0, answeredQuestionCount: 0 },
                { populationIndex: 6, disposition: "not_contacted", durationSec: 0, answeredQuestionCount: 0 },
            ],
        };
        const dLost = buildMethodFieldworkDiagnostics({
            method: "simple",
            population: strataPop,
            samplingIndices: [0, 6],
            fieldworkResult: allLost,
            questionnaire: qSimple,
            frameFields: ["id", "grp"],
            identifierField: "id",
            analysisTarget: { kind: "mean", field: "y" },
        });
        expect(dLost.contactedCount).toBe(0);
        expect(dLost.cleanedValidCount).toBe(0);
        expect(dLost.questionDiagnostics.every((q) => q.answerRatePct === 0)).toBe(true);
        expect(dLost.maxStratumBiasPp).toBeNull();
        assertNoNonFiniteOrNegZero(dLost);

        // 3. cleanedValidCount = 1 when N = 10 -> sample variance s^2 and respondent SE must be null!
        const singleValid: MethodFieldworkResult = {
            method: "simple",
            dispatchSeed: 3,
            dispatchedAt: "2026-11-23T00:00:00Z",
            invitedCount: 2,
            records: [
                { populationIndex: 0, disposition: "valid_complete", durationSec: 45, answeredQuestionCount: 2 },
                { populationIndex: 6, disposition: "refused", durationSec: 0, answeredQuestionCount: 0 },
            ],
        };
        const dSingle = buildMethodFieldworkDiagnostics({
            method: "simple",
            population: strataPop,
            samplingIndices: [0, 6],
            fieldworkResult: singleValid,
            questionnaire: qSimple,
            frameFields: ["id", "grp"],
            identifierField: "id",
            analysisTarget: { kind: "mean", field: "y" },
        });
        expect(dSingle.cleanedValidCount).toBe(1);
        expect(dSingle.empiricalTargetVariance).toBeNull();
        expect(dSingle.empiricalTargetStdDev).toBeNull();
        const cleanedEst = dSingle.estimates.find((e) => e.key === "cleaned_design")!;
        expect(cleanedEst.estimate).toBe(10);
        expect(cleanedEst.standardError).toBeNull();
        expect(cleanedEst.halfWidth).toBeNull();
        assertNoNonFiniteOrNegZero(dSingle);

        // 4. N = 1, n = 1 census -> SE = 0, halfWidth = 0
        const dSingletonCensus = buildMethodFieldworkDiagnostics({
            method: "simple",
            population: [strataPop[0]!],
            samplingIndices: [0],
            fieldworkResult: {
                method: "simple",
                dispatchSeed: 4,
                dispatchedAt: "2026-11-23T00:00:00Z",
                invitedCount: 1,
                records: [{ populationIndex: 0, disposition: "valid_complete", durationSec: 35, answeredQuestionCount: 2 }],
            },
            questionnaire: qSimple,
            frameFields: ["id", "grp"],
            identifierField: "id",
            analysisTarget: { kind: "mean", field: "y" },
        });
        expect(dSingletonCensus.estimates.find((e) => e.key === "cleaned_design")).toMatchObject({
            sampleSize: 1,
            estimate: 10,
            standardError: 0,
            halfWidth: 0,
        });
        assertNoNonFiniteOrNegZero(dSingletonCensus);
    });

    test("post-stratified calibration computes exact Nh/mh weights, within-stratum SE, and fails closed when a stratum has 0 respondents", () => {
        // Respondents: A1 (10), A3 (18) in Stratum A (N_A=6, m_A=2 -> ybar_A=14, s_A^2=32);
        //              B1 (100), B3 (140) in Stratum B (N_B=4, m_B=2 -> ybar_B=120, s_B^2=800);
        //              B4 refused.
        // Post-stratified estimate = 0.6 * 14 + 0.4 * 120 = 8.4 + 48 = 56.4
        // Within-stratum variance = 0.6^2 * (1 - 2/6) * (32 / 2) + 0.4^2 * (1 - 2/4) * (800 / 2)
        //                        = 0.36 * (2/3) * 16 + 0.16 * 0.5 * 400
        //                        = 3.84 + 32 = 35.84 -> SE = sqrt(35.84)
        const fwBothStrata: MethodFieldworkResult = {
            method: "simple",
            dispatchSeed: 10,
            dispatchedAt: "2026-11-23T00:00:00Z",
            invitedCount: 5,
            records: [
                { populationIndex: 0, disposition: "valid_complete", durationSec: 50, answeredQuestionCount: 2 },
                { populationIndex: 2, disposition: "valid_complete", durationSec: 50, answeredQuestionCount: 2 },
                { populationIndex: 6, disposition: "valid_complete", durationSec: 50, answeredQuestionCount: 2 },
                { populationIndex: 8, disposition: "valid_complete", durationSec: 50, answeredQuestionCount: 2 },
                { populationIndex: 9, disposition: "refused", durationSec: 0, answeredQuestionCount: 0 },
            ],
        };
        const diag = buildMethodFieldworkDiagnostics({
            method: "simple",
            population: strataPop,
            samplingIndices: [0, 2, 6, 8, 9],
            fieldworkResult: fwBothStrata,
            questionnaire: qSimple,
            frameFields: ["id", "grp"],
            identifierField: "id",
            analysisTarget: { kind: "mean", field: "y" },
            confidenceLevel: "95",
        });
        const cal = diag.estimates.find((e) => e.key === "nonresponse_calibrated")!;
        expect(cal.estimate!).toBeCloseTo(56.4, 12);
        expect(cal.standardError!).toBeCloseTo(Math.sqrt(35.84), 12);
        expect(cal.halfWidth!).toBeCloseTo(1.96 * Math.sqrt(35.84), 12);

        // Unequal-probability PPS post-stratification uses w_i^* = d_i * N_h / sum_{j in R_h} d_j
        // Stratum A probs [0.2, 0.4] -> d = [5, 2.5] -> ybar_A,pps = (5*10 + 2.5*18) / 7.5 = 95 / 7.5 = 38/3
        // Stratum B probs [0.25, 0.5] -> d = [4, 2] -> ybar_B,pps = (4*100 + 2*140) / 6 = 680 / 6 = 340/3
        // Overall calibrated PPS = 0.6 * (38/3) + 0.4 * (340/3) = 7.6 + 136/3 = 158.8 / 3 = 52.93333333333333
        const ppsDiag = buildMethodFieldworkDiagnostics({
            method: "pps",
            population: strataPop,
            samplingIndices: [0, 2, 6, 8, 9],
            inclusionProbabilities: [0.2, 0.4, 0.25, 0.5, 0.5],
            fieldworkResult: fwBothStrata,
            questionnaire: qSimple,
            frameFields: ["id", "grp"],
            identifierField: "id",
            analysisTarget: { kind: "mean", field: "y" },
            confidenceLevel: "95",
        });
        const ppsCal = ppsDiag.estimates.find((e) => e.key === "nonresponse_calibrated")!;
        expect(ppsCal.estimate!).toBeCloseTo(158.8 / 3, 12);
        assertNoNonFiniteOrNegZero(ppsDiag);

        // Empty stratum (\hat{\phi}_B = 0): all B respondents refused -> nonresponse_calibrated MUST fail closed (null), never Infinity/NaN!
        const fwEmptyB: MethodFieldworkResult = {
            method: "stratified",
            dispatchSeed: 11,
            dispatchedAt: "2026-11-23T00:00:00Z",
            invitedCount: 4,
            records: [
                { populationIndex: 0, disposition: "valid_complete", durationSec: 50, answeredQuestionCount: 2 },
                { populationIndex: 2, disposition: "valid_complete", durationSec: 50, answeredQuestionCount: 2 },
                { populationIndex: 6, disposition: "refused", durationSec: 0, answeredQuestionCount: 0 },
                { populationIndex: 8, disposition: "not_contacted", durationSec: 0, answeredQuestionCount: 0 },
            ],
        };
        const emptyStratumDiag = buildMethodFieldworkDiagnostics({
            method: "stratified",
            population: strataPop,
            samplingIndices: [0, 2, 6, 8],
            stratifyBy: "grp",
            layers: [
                { name: "A", count: 6, sampleCount: 2 },
                { name: "B", count: 4, sampleCount: 2 },
            ],
            fieldworkResult: fwEmptyB,
            questionnaire: qSimple,
            frameFields: ["id", "grp"],
            identifierField: "id",
            analysisTarget: { kind: "mean", field: "y" },
        });
        const stratCleaned = emptyStratumDiag.estimates.find((e) => e.key === "cleaned_design")!;
        const stratCal = emptyStratumDiag.estimates.find((e) => e.key === "nonresponse_calibrated")!;
        expect(stratCleaned.estimate).toBeNull();
        expect(stratCleaned.standardError).toBeNull();
        expect(stratCal.estimate).toBeNull();
        expect(stratCal.standardError).toBeNull();
        expect(stratCal.description).toContain("空层");
        assertNoNonFiniteOrNegZero(emptyStratumDiag);
    });

    test("zero within-stratum variance yields SE=0 despite large between-stratum differences, and full census n=N gives SE=0", () => {
        const zeroWithinPop = [
            { id: "1", grp: "A", y: 10 },
            { id: "2", grp: "A", y: 10 },
            { id: "3", grp: "A", y: 10 },
            { id: "4", grp: "A", y: 10 },
            { id: "5", grp: "B", y: 100 },
            { id: "6", grp: "B", y: 100 },
            { id: "7", grp: "B", y: 100 },
            { id: "8", grp: "B", y: 100 },
        ];
        const fw: MethodFieldworkResult = {
            method: "stratified",
            dispatchSeed: 20,
            dispatchedAt: "2026-11-23T00:00:00Z",
            invitedCount: 4,
            records: [0, 1, 4, 5].map((populationIndex) => ({
                populationIndex,
                disposition: "valid_complete" as const,
                durationSec: 40,
                answeredQuestionCount: 2,
            })),
        };
        const diag = buildMethodFieldworkDiagnostics({
            method: "stratified",
            population: zeroWithinPop,
            samplingIndices: [0, 1, 4, 5],
            stratifyBy: "grp",
            layers: [
                { name: "A", count: 4, sampleCount: 2 },
                { name: "B", count: 4, sampleCount: 2 },
            ],
            fieldworkResult: fw,
            questionnaire: qSimple,
            frameFields: ["id", "grp"],
            identifierField: "id",
            analysisTarget: { kind: "mean", field: "y" },
        });
        for (const key of ["cleaned_design", "nonresponse_calibrated", "full_invited_benchmark"] as const) {
            const item = diag.estimates.find((e) => e.key === key)!;
            expect(item.estimate).toBe(55);
            expect(item.standardError).toBe(0);
            expect(item.halfWidth).toBe(0);
        }

        // Full census (n = N) and over-length duplicate indices (n > N) never produce negative variance or NaN
        const allIdx = zeroWithinPop.map((_, i) => i);
        const censusDiag = buildMethodFieldworkDiagnostics({
            method: "pps",
            population: zeroWithinPop,
            samplingIndices: allIdx,
            inclusionProbabilities: allIdx.map(() => 1),
            fieldworkResult: {
                method: "pps",
                dispatchSeed: 21,
                dispatchedAt: "2026-11-23T00:00:00Z",
                invitedCount: allIdx.length,
                records: allIdx.map((populationIndex) => ({
                    populationIndex,
                    disposition: "valid_complete" as const,
                    durationSec: 40,
                    answeredQuestionCount: 2,
                })),
            },
            questionnaire: qSimple,
            frameFields: ["id", "grp"],
            identifierField: "id",
            analysisTarget: { kind: "mean", field: "y" },
        });
        expect(censusDiag.estimates.find((e) => e.key === "cleaned_design")).toMatchObject({
            estimate: 55,
            standardError: 0,
            halfWidth: 0,
        });

        // Duplicate indices with n > N
        const dupIdx = [...allIdx, 0, 4];
        const dupDiag = buildMethodFieldworkDiagnostics({
            method: "simple",
            population: zeroWithinPop,
            samplingIndices: dupIdx,
            fieldworkResult: {
                method: "simple",
                dispatchSeed: 22,
                dispatchedAt: "2026-11-23T00:00:00Z",
                invitedCount: dupIdx.length,
                records: dupIdx.map((populationIndex) => ({
                    populationIndex,
                    disposition: "valid_complete" as const,
                    durationSec: 40,
                    answeredQuestionCount: 2,
                })),
            },
            questionnaire: qSimple,
            frameFields: ["id", "grp"],
            identifierField: "id",
            analysisTarget: { kind: "mean", field: "y" },
        });
        assertNoNonFiniteOrNegZero(dupDiag);
    });

    test("proportion target unit scaling stays in [0, 1] and systematic benchmark reflects periodic design SE (ST-B7)", () => {
        // Periodic population [1, 0, 0, 1, 0, 0] with N=6, n=2, K=3 -> start means [1, 0, 0], E=1/3, SE = sqrt(2)/3
        const periodicPop = [
            { id: "1", grp: "A", hit: "是" },
            { id: "2", grp: "A", hit: "否" },
            { id: "3", grp: "A", hit: "否" },
            { id: "4", grp: "B", hit: "是" },
            { id: "5", grp: "B", hit: "否" },
            { id: "6", grp: "B", hit: "否" },
        ];
        const diag = buildMethodFieldworkDiagnostics({
            method: "systematic",
            population: periodicPop,
            samplingIndices: [0, 3],
            fieldworkResult: {
                method: "systematic",
                dispatchSeed: 30,
                dispatchedAt: "2026-11-23T00:00:00Z",
                invitedCount: 2,
                records: [
                    { populationIndex: 0, disposition: "valid_complete", durationSec: 30, answeredQuestionCount: 2 },
                    { populationIndex: 3, disposition: "valid_complete", durationSec: 30, answeredQuestionCount: 2 },
                ],
            },
            questionnaire: qSimple,
            frameFields: ["id", "grp"],
            identifierField: "id",
            analysisTarget: { kind: "proportion", field: "hit", value: "是" },
        });
        expect(diag.populationTruth!).toBeCloseTo(1 / 3, 12);
        const cleaned = diag.estimates.find((e) => e.key === "cleaned_design")!;
        expect(cleaned.estimate).toBe(1);
        const fullBench = diag.estimates.find((e) => e.key === "full_invited_benchmark")!;
        expect(fullBench.estimate).toBe(1);
        // Exact systematic SE on [1,0,0,1,0,0] with K=3 is sqrt(((1-1/3)^2 + (0-1/3)^2 + (0-1/3)^2)/3) = sqrt(2)/3
        expect(fullBench.standardError!).toBeCloseTo(Math.SQRT2 / 3, 12);
        assertNoNonFiniteOrNegZero(diag);
    });
});
