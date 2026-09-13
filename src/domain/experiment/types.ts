import type { ResolvedAnalysisTarget, ResolvedStudyContract } from "../../lib/analysis-target";
import type { QuestionnaireData } from "../../lib/questionnaire-types";
import type { SamplingMethod, SamplingPolicyV1 } from "../../lib/sampling-policy";

export type MethodKey = SamplingMethod;

export type ExperimentStatus = import("./status").ExperimentStatusValue;

export type TaskStatus = "not_started" | ExperimentStatus;

export interface SamplePlanData {
    estimationType?: "proportion" | "mean";
    advancedPlanSource?: "cost" | "multivar" | "cv" | "cluster";
    advancedPlans?: import("./planning-types").AdvancedPlanSnapshot[];
    confidenceLevel: string;
    marginOfError: number;
    populationVariance?: number;
    designEffect: number;
    nonResponseRate: number;
    recommendedSize: number;
    finalSampleSize: number;
}

export interface SamplingResultsData {
    simple?: { completed: boolean; sampleCount: number; seed?: number; indices?: number[]; data?: unknown[] };
    systematic?: {
        completed: boolean;
        /** Fractional K=N/n written by the exact-n algorithm. */
        interval?: number;
        /** Legacy integer interval retained for stored snapshot compatibility. */
        kValue?: number;
        sampleCount: number;
        seed?: number;
        indices?: number[];
        randomStart?: number;
        /** Legacy selected starting index. */
        startIndex?: number;
        data?: unknown[];
    };
    pps?: {
        completed?: boolean;
        unavailable?: boolean;
        unavailableReason?: string;
        sizeField?: string;
        sampleCount?: number;
        seed?: number;
        randomStart?: number;
        inclusionProbabilities?: number[];
        probabilitySummary?: {
            populationCount: number;
            probabilitySum: number;
            minInclusionProbability: number;
            maxInclusionProbability: number;
            certaintyUnitCount: number;
        };
        probabilityPreview?: Array<{
            samplePosition: number;
            sizeValue: number;
            inclusionProbability: number;
            designWeight: number;
        }>;
        indices?: number[];
        data?: unknown[];
    };
    stratified?: {
        completed: boolean;
        stratifyBy: string;
        layers: Array<{ name: string; count: number; ratio: number; sampleCount: number }>;
        sampleCount?: number;
        seed?: number;
        indices?: number[];
        data?: unknown[];
    };
}

export interface ExperimentData {
    id: number;
    taskId: number;
    version: number;
    currentStage: number;
    status: ExperimentStatus;
    rejectReason?: string | null;
    questionnaire: QuestionnaireData | null;
    samplePlan: SamplePlanData | null;
    samplingResults: SamplingResultsData | null;
    reportContent: string | null;
    analysisReferences: string[];
    stage1CompletedAt: string | null;
    stage2CompletedAt: string | null;
    stage3CompletedAt: string | null;
    stage4CompletedAt: string | null;
    populationSize: number;
    analysisTarget?: ResolvedAnalysisTarget | null;
    studyContract?: ResolvedStudyContract | null;
    samplingPolicy?: SamplingPolicyV1;
}
