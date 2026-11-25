import { and, eq, notInArray } from "drizzle-orm";
import { db } from "../../db";
import { experiment, experimentWave } from "../../db/schema";
import type { ExperimentWaveView, SamplePlanData, SamplingResultsData } from "../../domain/experiment/types";
import {
    buildMethodFieldworkDiagnostics,
    DEFAULT_CLEANING_CONFIG,
    resolveCleaningConfig,
    resolveFieldworkConfig,
    simulateMethodFieldwork,
    verifyMethodFieldworkReplay,
    type CleaningConfig,
    type FieldworkSimulationConfig,
    type MethodFieldworkDiagnostics,
    type MethodFieldworkResult,
    type StoredExperimentWave,
    type WaveFieldworkData,
} from "../../domain/fieldwork";
import { parseTopicFieldMapping } from "../../domain/statistics/population";
import type { VariableDictionary } from "../../domain/variables/types";
import { resolveAnalysisTarget } from "../../lib/analysis-target";
import type { QuestionnaireData } from "../../lib/questionnaire-types";
import { isCompletedSamplingResult, SAMPLING_METHODS, type SamplingMethod } from "../../lib/sampling-policy";
import { normalizeSamplePlanData } from "./sample-plan-display";
import { previewSamplingResults } from "./sampling-results-preview";
import { compactSamplingResults, hydrateSamplingResults } from "./sampling-storage";
import { parseStoredJson } from "./serialization";

type ExperimentRecord = typeof experiment.$inferSelect;
type DbExecutor = Pick<typeof db, "select" | "insert" | "update" | "delete">;

export function getFrameFieldsFromMapping(fieldMapping: unknown): {
    frameFields: string[];
    identifierField?: string;
} {
    const parsed = parseTopicFieldMapping(fieldMapping);
    const raw = fieldMapping && typeof fieldMapping === "object" && !Array.isArray(fieldMapping)
        ? (fieldMapping as Record<string, unknown>)
        : {};
    const identifierField = typeof raw.identifier === "string" && raw.identifier.trim()
        ? raw.identifier.trim()
        : undefined;
    const frameSet = new Set<string>();
    if (identifierField) frameSet.add(identifierField);
    for (const f of parsed?.stratified ?? []) frameSet.add(f);
    return { frameFields: [...frameSet], identifierField };
}

export function parseStoredWaves(raw: unknown): StoredExperimentWave[] {
    const parsed = parseStoredJson<unknown[]>(raw);
    if (!Array.isArray(parsed)) return [];
    const waves: StoredExperimentWave[] = [];
    for (const item of parsed) {
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;
        const rec = item as Record<string, unknown>;
        const waveNumber = Number(rec.waveNumber);
        if (!Number.isInteger(waveNumber) || waveNumber < 1) continue;
        const kind = rec.kind === "main" || rec.kind === "refinement" ? rec.kind : "pilot";
        const questionnaire = (rec.questionnaire && typeof rec.questionnaire === "object"
            ? rec.questionnaire
            : { title: "", welcomeText: "", endingText: "", questions: [] }) as QuestionnaireData;
        waves.push({
            waveNumber,
            kind,
            label: typeof rec.label === "string" && rec.label.trim() ? rec.label : `第 ${waveNumber} 轮`,
            questionnaire,
            samplePlan: rec.samplePlan && typeof rec.samplePlan === "object" ? (rec.samplePlan as Record<string, unknown>) : null,
            samplingResults: rec.samplingResults && typeof rec.samplingResults === "object" ? (rec.samplingResults as Record<string, unknown>) : null,
            fieldwork: rec.fieldwork && typeof rec.fieldwork === "object" ? (rec.fieldwork as WaveFieldworkData) : null,
            cleaningConfig: resolveCleaningConfig(rec.cleaningConfig),
            completedAt: typeof rec.completedAt === "string" ? rec.completedAt : null,
        });
    }
    return waves.sort((a, b) => a.waveNumber - b.waveNumber);
}

export function ensureActiveWave(
    record: Pick<ExperimentRecord, "wavesData" | "activeWaveNumber" | "questionnaire" | "samplePlan" | "samplingResults">,
): { waves: StoredExperimentWave[]; activeWave: StoredExperimentWave } {
    const waves = parseStoredWaves(record.wavesData);
    const targetNum = Math.max(1, Number(record.activeWaveNumber) || 1);
    let activeWave = waves.find((w) => w.waveNumber === targetNum);

    if (!activeWave) {
        const baseQuestionnaire = (parseStoredJson<QuestionnaireData>(record.questionnaire) ?? {
            title: "",
            welcomeText: "",
            endingText: "",
            questions: [],
        });
        activeWave = {
            waveNumber: targetNum,
            kind: targetNum === 1 ? "pilot" : targetNum === 2 ? "main" : "refinement",
            label: targetNum === 1 ? "第 1 轮 · 首轮试投" : targetNum === 2 ? "第 2 轮 · 调优正式投放" : `第 ${targetNum} 轮 · 进阶微调`,
            questionnaire: baseQuestionnaire,
            samplePlan: targetNum === 1 ? parseStoredJson<Record<string, unknown>>(record.samplePlan) : null,
            samplingResults: targetNum === 1 ? compactSamplingResults(parseStoredJson(record.samplingResults)) : null,
            fieldwork: null,
            cleaningConfig: { ...DEFAULT_CLEANING_CONFIG },
            completedAt: null,
        };
        waves.push(activeWave);
        waves.sort((a, b) => a.waveNumber - b.waveNumber);
    }

    return { waves, activeWave };
}

export function buildWaveDiagnosticsMap(params: {
    wave: StoredExperimentWave;
    population: Array<Record<string, unknown>>;
    fieldMapping: unknown;
    fieldworkConfig: unknown;
    dictionary?: VariableDictionary | null;
}): Partial<Record<SamplingMethod, MethodFieldworkDiagnostics>> {
    const diagnostics: Partial<Record<SamplingMethod, MethodFieldworkDiagnostics>> = {};
    if (!params.wave.fieldwork?.methods || !params.wave.samplingResults || params.population.length === 0) {
        return diagnostics;
    }

    const { frameFields, identifierField } = getFrameFieldsFromMapping(params.fieldMapping);
    const analysisTarget = resolveAnalysisTarget(params.fieldMapping)?.target ?? null;
    const confidenceLevel = typeof params.wave.samplePlan?.confidenceLevel === "string"
        ? params.wave.samplePlan.confidenceLevel
        : "95";

    for (const method of SAMPLING_METHODS) {
        const fw = params.wave.fieldwork.methods[method];
        const sr = (params.wave.samplingResults as Record<string, unknown>)[method] as Record<string, unknown> | undefined;
        if (!fw || !sr || !Array.isArray(sr.indices)) continue;
        const diagParams: Parameters<typeof buildMethodFieldworkDiagnostics>[0] & { sizeField?: string } = {
            method,
            population: params.population,
            samplingIndices: sr.indices as number[],
            sizeField: typeof sr.sizeField === "string" ? sr.sizeField : undefined,
            inclusionProbabilities: Array.isArray(sr.inclusionProbabilities) ? (sr.inclusionProbabilities as number[]) : undefined,
            stratifyBy: typeof sr.stratifyBy === "string" ? sr.stratifyBy : undefined,
            layers: Array.isArray(sr.layers) ? (sr.layers as Array<{ name: string; count: number; sampleCount: number }>) : undefined,
            fieldworkResult: fw,
            cleaningConfig: params.wave.cleaningConfig,
            fieldworkConfig: params.fieldworkConfig,
            questionnaire: params.wave.questionnaire,
            dictionary: params.dictionary,
            frameFields,
            identifierField,
            analysisTarget,
            confidenceLevel,
        };
        diagnostics[method] = buildMethodFieldworkDiagnostics(diagParams);
    }

    return diagnostics;
}

export function hydrateWaveViews(params: {
    waves: StoredExperimentWave[];
    population: Array<Record<string, unknown>>;
    populationSize: number | null;
    fieldMapping: unknown;
    fieldworkConfig: unknown;
    dictionary?: VariableDictionary | null;
}): ExperimentWaveView[] {
    return params.waves.map((wave) => {
        const hydratedSampling = params.population.length > 0 && wave.samplingResults
            ? hydrateSamplingResults(wave.samplingResults, params.population)
            : { ok: true as const, value: wave.samplingResults };
        const samplingPreview = hydratedSampling.ok
            ? (previewSamplingResults(hydratedSampling.value) as SamplingResultsData | null)
            : null;
        const diagnostics = params.population.length > 0
            ? buildWaveDiagnosticsMap({
                wave,
                population: params.population,
                fieldMapping: params.fieldMapping,
                fieldworkConfig: params.fieldworkConfig,
                dictionary: params.dictionary,
            })
            : {};

        return {
            waveNumber: wave.waveNumber,
            kind: wave.kind,
            label: wave.label,
            questionnaire: wave.questionnaire,
            samplePlan: normalizeSamplePlanData(wave.samplePlan, params.populationSize) as SamplePlanData | null,
            samplingResults: samplingPreview,
            fieldwork: wave.fieldwork,
            cleaningConfig: resolveCleaningConfig(wave.cleaningConfig),
            diagnostics,
            completedAt: wave.completedAt,
        };
    });
}

export function simulateWaveDispatchForCompletedMethods(params: {
    wave: StoredExperimentWave;
    population: Array<Record<string, unknown>>;
    fieldMapping: unknown;
    fieldworkConfig: FieldworkSimulationConfig | unknown;
    dictionary?: VariableDictionary | null;
    seed?: number;
}): { ok: true; fieldwork: WaveFieldworkData } | { ok: false; message: string } {
    const sr = params.wave.samplingResults;
    if (!sr || typeof sr !== "object") {
        return { ok: false, message: "请先执行至少一种抽样方法获取受访者名单后再发放问卷" };
    }
    const target = resolveAnalysisTarget(params.fieldMapping)?.target ?? null;
    const baseSeed = params.seed ?? crypto.getRandomValues(new Uint32Array(1))[0]!;
    const nowIso = new Date().toISOString();
    const methods: Partial<Record<SamplingMethod, MethodFieldworkResult>> = {};
    let dispatchedCount = 0;

    for (const method of SAMPLING_METHODS) {
        const section = (sr as Record<string, unknown>)[method] as Record<string, unknown> | undefined;
        if (!isCompletedSamplingResult(section) || !Array.isArray(section?.indices)) continue;
        methods[method] = simulateMethodFieldwork({
            method,
            population: params.population,
            indices: section.indices as number[],
            questionnaire: params.wave.questionnaire,
            dictionary: params.dictionary,
            analysisTarget: target,
            fieldworkConfig: resolveFieldworkConfig(params.fieldworkConfig),
            dispatchSeed: baseSeed,
            dispatchedAt: nowIso,
        });
        dispatchedCount += 1;
    }

    if (dispatchedCount === 0) {
        return { ok: false, message: "当前波次尚无有效入样名单，请先执行抽样" };
    }

    return { ok: true, fieldwork: { methods } };
}

export function verifyExperimentWavesReplay(params: {
    waves: StoredExperimentWave[];
    population: Array<Record<string, unknown>>;
    fieldMapping: unknown;
    fieldworkConfig: unknown;
    dictionary?: VariableDictionary | null;
}): boolean {
    const target = resolveAnalysisTarget(params.fieldMapping)?.target ?? null;
    for (const wave of params.waves) {
        if (!wave.fieldwork?.methods) continue;
        for (const method of SAMPLING_METHODS) {
            const fw = wave.fieldwork.methods[method];
            if (!fw) continue;
            if (fw.method !== method) return false;
            const section = (wave.samplingResults as Record<string, unknown> | null)?.[method] as Record<string, unknown> | undefined;
            if (!section || !Array.isArray(section.indices)) return false;
            const replayParams: Parameters<typeof verifyMethodFieldworkReplay>[0] & { expectedMethod?: SamplingMethod } = {
                stored: fw,
                expectedMethod: method,
                population: params.population,
                indices: section.indices as number[],
                questionnaire: wave.questionnaire,
                dictionary: params.dictionary,
                analysisTarget: target,
                fieldworkConfig: params.fieldworkConfig,
            };
            const valid = verifyMethodFieldworkReplay(replayParams);
            if (!valid) return false;
        }
    }
    return true;
}

export function getVerifiedWave1EmpiricalVariances(params: {
    waves: StoredExperimentWave[];
    population: Array<Record<string, unknown>>;
    fieldMapping: unknown;
    fieldworkConfig: unknown;
    dictionary?: VariableDictionary | null;
}): number[] {
    const wave1 = params.waves.find((w) => w.waveNumber === 1);
    if (!wave1) return [];
    const diagMap = buildWaveDiagnosticsMap({
        wave: wave1,
        population: params.population,
        fieldMapping: params.fieldMapping,
        fieldworkConfig: params.fieldworkConfig,
        dictionary: params.dictionary,
    });
    const variances: number[] = [];
    for (const method of ["simple", "stratified", "systematic", "pps"] as const) {
        const variance = diagMap[method]?.empiricalTargetVariance;
        if (variance != null && Number.isFinite(variance) && variance > 0 && !variances.includes(variance)) {
            variances.push(variance);
        }
    }
    return variances;
}

export function getVerifiedWave1EmpiricalVariance(params: {
    waves: StoredExperimentWave[];
    population: Array<Record<string, unknown>>;
    fieldMapping: unknown;
    fieldworkConfig: unknown;
    dictionary?: VariableDictionary | null;
    plannedVariance?: number | null;
}): number | null {
    const variances = getVerifiedWave1EmpiricalVariances(params);
    if (variances.length === 0) return null;
    const planned = params.plannedVariance;
    if (planned != null && Number.isFinite(planned) && planned > 0) {
        return variances.find((v) => Math.abs(planned - v) / v <= 1e-6) ?? null;
    }
    return variances[0] ?? null;
}

export async function syncExperimentWaveRow(
    executor: DbExecutor,
    experimentId: number,
    wave: StoredExperimentWave,
    diagnosticsSummary?: unknown,
) {
    const now = new Date();
    const completedDate = wave.completedAt ? new Date(wave.completedAt) : null;
    const existing = await executor
        .select({ id: experimentWave.id })
        .from(experimentWave)
        .where(and(eq(experimentWave.experimentId, experimentId), eq(experimentWave.waveNumber, wave.waveNumber)));

    if (existing.length > 0) {
        await executor
            .update(experimentWave)
            .set({
                kind: wave.kind,
                label: wave.label,
                questionnaireSnapshot: wave.questionnaire,
                samplePlan: wave.samplePlan,
                samplingResults: wave.samplingResults,
                fieldworkResults: wave.fieldwork,
                cleaningConfig: wave.cleaningConfig as CleaningConfig,
                ...(diagnosticsSummary !== undefined ? { diagnosticsSummary } : {}),
                completedAt: completedDate,
                updatedAt: now,
            })
            .where(and(eq(experimentWave.experimentId, experimentId), eq(experimentWave.waveNumber, wave.waveNumber)));
    } else {
        await executor.insert(experimentWave).values({
            experimentId,
            waveNumber: wave.waveNumber,
            kind: wave.kind,
            label: wave.label,
            questionnaireSnapshot: wave.questionnaire,
            samplePlan: wave.samplePlan,
            samplingResults: wave.samplingResults,
            fieldworkResults: wave.fieldwork,
            cleaningConfig: wave.cleaningConfig as CleaningConfig,
            diagnosticsSummary: diagnosticsSummary ?? null,
            completedAt: completedDate,
        });
    }
}

export async function syncExperimentWavesSnapshot(
    executor: DbExecutor,
    experimentId: number,
    waves: StoredExperimentWave[],
) {
    if (waves.length === 0) {
        await executor.delete(experimentWave).where(eq(experimentWave.experimentId, experimentId));
        return;
    }
    const keepNumbers = waves.map((w) => w.waveNumber);
    await executor
        .delete(experimentWave)
        .where(and(eq(experimentWave.experimentId, experimentId), notInArray(experimentWave.waveNumber, keepNumbers)));
    for (const wave of waves) {
        await syncExperimentWaveRow(executor, experimentId, wave);
    }
}
