import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { experiment, savedAnalysis, task, topic } from "../../db/schema";
import type { AnalysisConfig, SavedAnalysisView, VariableDictionary } from "../../domain/variables/types";
import { canonicalJson, readVariableSource } from "../../server/variable-source";
import { ensureTaskIsOpen, hasTaskDeadlinePassed } from "./task-timing";
import { univariateService } from "./univariate-service";
import { WorkerServiceError } from "../../server/worker-service";
import { parseStoredWaves } from "./fieldwork-wave-service";

export const ANALYSIS_CAPACITY = 20;
export const MAX_ANALYSIS_REFERENCES = 10;
type Executor = Pick<typeof db, "select">;
type Experiment = typeof experiment.$inferSelect;
type Saved = typeof savedAnalysis.$inferSelect;

export class AnalysisConflict extends Error {
    constructor(message: string, public code = "VALIDATION_ERROR", public status = 400) { super(message); }
}

export function analysisView(row: Saved, record: Pick<Experiment, "samplingGeneration">, dictionary: VariableDictionary | null): SavedAnalysisView {
    return {
        id: row.id,
        waveNumber: row.waveNumber ?? row.config.waveNumber ?? 1,
        config: row.config,
        variable: row.variable,
        result: row.result,
        source: row.source,
        dictionaryRevision: row.dictionaryRevision,
        samplingGeneration: row.samplingGeneration,
        algorithmVersion: row.algorithmVersion,
        createdAt: row.createdAt.toISOString(),
        stale: row.samplingGeneration !== record.samplingGeneration || row.source !== dictionary?.source || row.dictionaryRevision !== dictionary.revision,
    };
}

export function parseAnalysisReferences(value: unknown): number[] {
    if (!Array.isArray(value) || value.length > MAX_ANALYSIS_REFERENCES || value.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(value).size !== value.length) {
        throw new AnalysisConflict("报告最多引用10条不重复的已保存分析");
    }
    return value;
}

export async function loadAnalysisReferences(record: Experiment, dictionary: VariableDictionary | null, ids: number[], executor: Executor = db) {
    if (!ids.length) return [];
    const rows = await executor.select().from(savedAnalysis).where(and(eq(savedAnalysis.experimentId, record.id), inArray(savedAnalysis.id, ids)));
    return ids.map(id => {
        const row = rows.find(item => item.id === id);
        if (!row) throw new AnalysisConflict("分析引用不存在或不属于当前实验", "INVALID_REFERENCE", 409);
        if (analysisView(row, record, dictionary).stale) throw new AnalysisConflict("分析引用已过期，请重新运行、替换或明确移除", "STALE_REFERENCE", 409);
        return row;
    });
}

export async function ownedAnalysisContext(studentId: number, classId: number, taskId: number, executor: Executor = db, lock = false) {
    const query = executor.select({ record: experiment, template: topic, deadline: task.deadline, openTime: task.openTime })
        .from(experiment).innerJoin(task, eq(experiment.taskId, task.id)).innerJoin(topic, eq(task.topicId, topic.id))
        .where(and(eq(experiment.studentId, studentId), eq(task.id, taskId), eq(task.classId, classId), eq(topic.status, 1)));
    const [row] = await (lock ? query.for("update", { of: experiment }) : query);
    if (!row) throw new AnalysisConflict("实验不存在或无权访问", "NOT_FOUND", 404);
    return row;
}

export async function listSavedAnalyses(studentId: number, classId: number, taskId: number) {
    const { record, template } = await ownedAnalysisContext(studentId, classId, taskId);
    const rows = await db.select().from(savedAnalysis).where(eq(savedAnalysis.experimentId, record.id)).orderBy(desc(savedAnalysis.id)).limit(ANALYSIS_CAPACITY);
    let dictionary = template.variableDictionary;
    try {
        if (dictionary && (template.variableRevision !== dictionary.revision || !template.excelFilePath
            || (await readVariableSource(template.excelFilePath, template.fieldMapping)).source !== dictionary.source)) dictionary = null;
    } catch { dictionary = null; }
    return { records: rows.map(row => analysisView(row, record, dictionary)), capacity: ANALYSIS_CAPACITY };
}

const ALLOWED_CONFIG_KEYS = new Set(["field", "method", "question", "weighted", "groupByField", "waveNumber", "datasetMode"]);

export function parseAnalysisRequest(body: unknown): { requestId: string; observedVersion: number; config: AnalysisConfig } {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new AnalysisConflict("分析请求格式无效");
    const input = body as Record<string, unknown>;
    if (Object.keys(input).sort().join(",") !== "config,observedVersion,requestId" || typeof input.requestId !== "string" || !/^[a-zA-Z0-9-]{8,80}$/.test(input.requestId) || !Number.isSafeInteger(input.observedVersion) || Number(input.observedVersion) < 1) {
        throw new AnalysisConflict("分析请求编号或版本无效");
    }
    const rawConfig = input.config as Record<string, unknown>;
    if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
        throw new AnalysisConflict("请填写5–500字研究问题、已完成样本、变量与分析口径");
    }
    for (const k of Object.keys(rawConfig)) {
        if (!ALLOWED_CONFIG_KEYS.has(k)) throw new AnalysisConflict("分析配置包含未知字段");
    }
    if (
        typeof rawConfig.question !== "string" || rawConfig.question.trim().length < 5 || rawConfig.question.trim().length > 500
        || typeof rawConfig.field !== "string" || !rawConfig.field
        || typeof rawConfig.weighted !== "boolean"
        || !["simple", "systematic", "pps", "stratified"].includes(String(rawConfig.method))
    ) {
        throw new AnalysisConflict("请填写5–500字研究问题、已完成样本、变量与分析口径");
    }
    if (rawConfig.groupByField !== undefined && rawConfig.groupByField !== "" && typeof rawConfig.groupByField !== "string") {
        throw new AnalysisConflict("分组变量格式无效");
    }
    if (
        rawConfig.waveNumber !== undefined
        && (!Number.isSafeInteger(rawConfig.waveNumber) || Number(rawConfig.waveNumber) < 1 || Number(rawConfig.waveNumber) > 4)
    ) {
        throw new AnalysisConflict("实验波次编号无效");
    }
    if (rawConfig.datasetMode !== undefined && rawConfig.datasetMode !== "cleaned_respondents" && rawConfig.datasetMode !== "full_invited") {
        throw new AnalysisConflict("数据集口径无效");
    }

    const normalizedConfig: AnalysisConfig = {
        question: rawConfig.question.trim(),
        method: rawConfig.method as AnalysisConfig["method"],
        field: rawConfig.field,
        weighted: rawConfig.weighted,
        ...(typeof rawConfig.groupByField === "string" && rawConfig.groupByField.trim() ? { groupByField: rawConfig.groupByField } : {}),
        ...(typeof rawConfig.waveNumber === "number" ? { waveNumber: rawConfig.waveNumber } : {}),
        ...(rawConfig.datasetMode === "cleaned_respondents" || rawConfig.datasetMode === "full_invited" ? { datasetMode: rawConfig.datasetMode } : {}),
    };

    return { requestId: input.requestId, observedVersion: input.observedVersion as number, config: normalizedConfig };
}

function isEditableAnalysisStage(record: Experiment) {
    if (!["in_progress", "rejected"].includes(record.status)) return false;
    return record.currentStage === 5 && !record.stage5CompletedAt;
}

export async function createSavedAnalysis(studentId: number, classId: number, taskId: number, body: unknown, signal?: AbortSignal) {
    const request = parseAnalysisRequest(body);
    const initial = await ownedAnalysisContext(studentId, classId, taskId);
    const fingerprint = canonicalJson({ config: request.config, observedVersion: request.observedVersion });
    const existing = async (executor: Executor) => (await executor.select().from(savedAnalysis).where(and(eq(savedAnalysis.experimentId, initial.record.id), eq(savedAnalysis.requestId, request.requestId))))[0];
    const retry = (row: Saved, record: Experiment, dictionary: VariableDictionary | null) => {
        if (row.requestFingerprint !== fingerprint) throw new AnalysisConflict("同一请求编号不能用于不同配置或版本", "REQUEST_CONFLICT", 409);
        return analysisView(row, record, dictionary);
    };
    const previous = await existing(db);
    if (previous) return retry(previous, initial.record, initial.template.variableDictionary);
    const openError = ensureTaskIsOpen(initial.openTime);
    if (openError || hasTaskDeadlinePassed(initial.deadline)) throw new AnalysisConflict("任务未开放或已截止", "TASK_DEADLINE", 409);
    if (initial.record.version !== request.observedVersion) throw new AnalysisConflict("实验版本已变化，请刷新核对", "VERSION_CONFLICT", 409);
    if (!isEditableAnalysisStage(initial.record)) {
        throw new AnalysisConflict("请在可编辑的第五阶段（商务分析与报告）执行分析", "EXPERIMENT_LOCKED", 409);
    }
    const dictionary = initial.template.variableDictionary;
    if (!dictionary || dictionary.revision !== initial.template.variableRevision || !initial.template.excelFilePath) {
        throw new AnalysisConflict("当前任务没有有效的已确认变量字典", "DICTIONARY_CONFLICT", 409);
    }
    const variable = dictionary.variables.find(item => item.field === request.config.field);
    if (!variable || variable.kind === "identifier") throw new AnalysisConflict("所选变量不可用于分析");
    if (request.config.groupByField) {
        const groupVariable = dictionary.variables.find(item => item.field === request.config.groupByField);
        if (!groupVariable || (groupVariable.kind !== "nominal" && groupVariable.kind !== "ordinal")) {
            throw new AnalysisConflict("分组维度须为字典中的名义或有序分类变量");
        }
        if (request.config.groupByField === request.config.field) {
            throw new AnalysisConflict("分组维度不能与目标分析变量相同");
        }
    }

    const waves = parseStoredWaves(initial.record.wavesData);
    const activeWaveNum = Math.max(1, initial.record.activeWaveNumber ?? 2);
    const chosenWaveNumber = request.config.waveNumber ?? activeWaveNum;
    let chosenWave: ReturnType<typeof parseStoredWaves>[number] | undefined;
    let samplingContainer: Record<string, Record<string, unknown>> | null;
    if (waves.length > 0) {
        chosenWave = waves.find((w) => w.waveNumber === chosenWaveNumber);
        if (!chosenWave) throw new AnalysisConflict("指定的实验波次不存在");
        samplingContainer = chosenWave.samplingResults as Record<string, Record<string, unknown>> | null;
    } else {
        if (request.config.waveNumber !== undefined && request.config.waveNumber !== activeWaveNum) {
            throw new AnalysisConflict("指定的实验波次不存在");
        }
        samplingContainer = initial.record.samplingResults as Record<string, Record<string, unknown>> | null;
    }
    const samplingResult = samplingContainer?.[request.config.method];
    if (!samplingResult) throw new AnalysisConflict("请先完成所选波次与抽样方法");
    if (
        request.config.datasetMode === "cleaned_respondents"
        && (!chosenWave?.fieldwork?.methods?.[request.config.method] || !chosenWave?.questionnaire)
    ) {
        throw new AnalysisConflict("所选波次与抽样方法尚未生成问卷发放回收记录，无法按质检有效答卷口径分析", "MISSING_FIELDWORK", 409);
    }

    let data: Awaited<ReturnType<typeof univariateService.run>>;
    try {
        data = await univariateService.run({
            populationPath: initial.template.excelFilePath,
            fieldMapping: initial.template.fieldMapping,
            fieldworkConfig: initial.template.fieldworkConfig,
            dictionary,
            config: request.config,
            samplingResult,
            fieldworkResult: chosenWave?.fieldwork?.methods?.[request.config.method] ?? null,
            cleaningConfig: chosenWave?.cleaningConfig ?? null,
            questionnaire: chosenWave?.questionnaire ?? null,
        }, {
            key: `${initial.record.id}:${request.requestId}:${fingerprint}`,
            signal,
        });
    } catch (cause) {
        if (cause instanceof WorkerServiceError) {
            if (cause.code === "SOURCE_MISMATCH") {
                throw new AnalysisConflict("总体文件或字段解释已变化，请联系教师重新确认来源", "SOURCE_CONFLICT", 409);
            }
            if (cause.code === "INVALID_ANALYSIS_INPUT") {
                throw new AnalysisConflict(cause.message, cause.code, 400);
            }
            if ([
                "MISSING_FIELDWORK",
                "EMPTY_RESPONDENTS",
                "EMPTY_STRATUM_RESPONDENTS",
                "INVALID_GROUP_VARIABLE",
                "REPLAY_MISMATCH",
                "INVALID_SAMPLE",
            ].includes(cause.code)) {
                throw new AnalysisConflict(cause.message, cause.code, 409);
            }
        }
        throw cause;
    }
    return db.transaction(async tx => {
        const current = await ownedAnalysisContext(studentId, classId, taskId, tx, true);
        const duplicate = await existing(tx);
        if (duplicate) return retry(duplicate, current.record, current.template.variableDictionary);
        if (current.record.version !== request.observedVersion || !isEditableAnalysisStage(current.record)) {
            throw new AnalysisConflict("计算期间实验版本或状态已变化", "VERSION_CONFLICT", 409);
        }
        if (current.record.samplingGeneration !== initial.record.samplingGeneration) throw new AnalysisConflict("计算期间抽样来源已变化", "SAMPLING_CONFLICT", 409);
        if (current.template.variableRevision !== dictionary.revision || current.template.variableDictionary?.source !== dictionary.source || !current.template.excelFilePath) {
            throw new AnalysisConflict("计算期间变量字典已变化", "DICTIONARY_CONFLICT", 409);
        }
        if ((await readVariableSource(current.template.excelFilePath, current.template.fieldMapping)).source !== dictionary.source) {
            throw new AnalysisConflict("总体文件已变化", "SOURCE_CONFLICT", 409);
        }
        const records = await tx.select({ id: savedAnalysis.id }).from(savedAnalysis).where(eq(savedAnalysis.experimentId, current.record.id)).limit(ANALYSIS_CAPACITY);
        if (records.length >= ANALYSIS_CAPACITY) throw new AnalysisConflict("当前实验已达到20条分析记录上限，历史分析不会被覆盖", "ANALYSIS_CAPACITY", 409);
        const [saved] = await tx.insert(savedAnalysis).values({
            experimentId: current.record.id,
            waveNumber: chosenWaveNumber,
            requestId: request.requestId,
            requestFingerprint: fingerprint,
            samplingGeneration: current.record.samplingGeneration,
            source: dictionary.source,
            dictionaryRevision: dictionary.revision,
            config: request.config,
            variable,
            result: data.result,
            evidence: data.evidence,
            algorithmVersion: data.algorithmVersion,
        }).returning();
        return analysisView(saved!, current.record, dictionary);
    });
}
