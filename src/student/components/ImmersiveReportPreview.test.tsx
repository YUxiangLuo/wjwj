import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";
import type { ExperimentData } from "@/domain/experiment/types";
import { autoBindQuestionnaireVariables, DEFAULT_CLEANING_CONFIG, evaluateQuestionnaireBurden } from "@/domain/fieldwork";
import type { VariableDictionary } from "@/domain/variables/types";

const bootstrapDom = installDomGlobals("http://localhost/student");
const { cleanup, fireEvent, render } = await import("@testing-library/react");
const { ImmersiveReportPreview } = await import("./ImmersiveReportPreview");
bootstrapDom.restore();

let restoreDom: (() => void) | null = null;

beforeEach(() => {
    restoreDom = installDomGlobals("http://localhost/student").restore;
});

afterEach(async () => {
    cleanup();
    await new Promise((r) => setTimeout(r, 0));
    restoreDom?.();
    restoreDom = null;
});

const dict: VariableDictionary = {
    source: "h1",
    revision: 1,
    variables: [{ field: "budget", label: "预算", unit: "万元", kind: "continuous", categories: [], missing: [] }],
};

describe("ImmersiveReportPreview full-viewport & section navigation", () => {
    test("displays empirical variance s² label, infers target unit (万元) into waves, and advances via next-section CTA", () => {
        const { questionnaire } = autoBindQuestionnaireVariables({
            questionnaire: {
                title: "SaaS增购预算问卷",
                welcomeText: "<p>欢迎参与年度预算调研，感谢支持。</p>",
                endingText: "<p>感谢您的填写，祝工作顺利。</p>",
                questions: [
                    { id: "q1", type: "numeric", content: "下年度预算多少万元？", unit: "万元", decimalPlaces: 0 },
                ],
            },
            dictionary: dict,
            taskId: 3,
            targetField: "budget",
        });

        const experiment: ExperimentData = {
            id: 10,
            taskId: 3,
            version: 5,
            currentStage: 5,
            activeWaveNumber: 2,
            status: "in_progress",
            populationSize: 32,
            questionnaire,
            samplePlan: {
                estimationType: "mean",
                confidenceLevel: "95",
                marginOfError: 3,
                populationVariance: 238.28,
                varianceSource: "wave1_empirical",
                designEffect: 1,
                nonResponseRate: 0.25,
                recommendedSize: 20,
                finalSampleSize: 20,
            },
            samplingResults: {
                simple: { completed: true, sampleCount: 20 },
            },
            waves: [
                {
                    waveNumber: 1,
                    kind: "pilot",
                    label: "第 1 轮 · 首轮试投",
                    questionnaire,
                    samplePlan: null,
                    samplingResults: { simple: { completed: true, sampleCount: 12 } },
                    fieldwork: null,
                    cleaningConfig: { ...DEFAULT_CLEANING_CONFIG },
                    diagnostics: {
                        simple: {
                            method: "simple",
                            invitedCount: 12,
                            contactedCount: 12,
                            notContactedCount: 0,
                            refusedCount: 0,
                            breakoffCount: 0,
                            completedRawCount: 12,
                            speederCount: 0,
                            straightlinerCount: 0,
                            cleanedValidCount: 12,
                            effectiveRatePct: 100,
                            empiricalNonResponseRatePct: 0,
                            empiricalTargetVariance: 200,
                            empiricalTargetStdDev: 14.14,
                            totalEstimatedCost: 1000,
                            unitEffectiveCost: 83.3,
                            stratumField: null,
                            maxStratumBiasPp: null,
                            strata: [],
                            burden: evaluateQuestionnaireBurden(questionnaire, dict, { kind: "mean", field: "budget" }),
                            populationTruth: 28.38,
                            estimates: [
                                { key: "cleaned_design", label: "清洗后估计", description: "有效卷", sampleSize: 12, estimate: 27.5, standardError: 4.1, halfWidth: 8.0 },
                            ],
                            questionDiagnostics: [],
                            sampleAnomalies: [],
                        },
                    },
                    completedAt: "2026-11-23T00:00:00Z",
                },
            ],
            reportContent: "<p>正式决策报告正文内容</p>",
            stage1CompletedAt: "2026-11-23T00:00:00Z",
            stage2CompletedAt: "2026-11-23T00:05:00Z",
            stage3CompletedAt: "2026-11-23T00:10:00Z",
            stage4CompletedAt: "2026-11-23T00:15:00Z",
            analysisTarget: { inferred: false, target: { kind: "mean", field: "budget" } },
        };

        render(
            <ImmersiveReportPreview
                open
                experiment={experiment}
                taskName="SaaS增购调研"
                onClose={() => undefined}
            />,
        );

        const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
        expect(dialog !== null).toBe(true);
        expect(dialog.className).toContain("max-h-none");
        expect(dialog.textContent).toContain("首轮实测样本方差 s²");

        // Advance from Overview -> Waves via interactive footer CTA and verify inferred unit (万元)
        const nextBtn = document.querySelector('[data-testid="immersive-report-next-section"]') as HTMLButtonElement;
        expect(nextBtn !== null).toBe(true);
        fireEvent.click(nextBtn);
        expect(dialog.textContent).toContain("27.50万元");
    });
});
