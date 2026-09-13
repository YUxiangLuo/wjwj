import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { experiment, savedAnalysis, task, topic } from "../../db/schema";
import type { AnalysisConfig, SavedAnalysisView, VariableDictionary } from "../../domain/variables/types";
import { canonicalJson, readVariableSource } from "../../server/variable-source";
import { ensureTaskIsOpen, hasTaskDeadlinePassed } from "./task-timing";
import { univariateService } from "./univariate-service";

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
        id: row.id, config: row.config, variable: row.variable, result: row.result,
        source: row.source, dictionaryRevision: row.dictionaryRevision, samplingGeneration: row.samplingGeneration,
        algorithmVersion: row.algorithmVersion, createdAt: row.createdAt.toISOString(),
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
    if (dictionary && (!template.excelFilePath || (await readVariableSource(template.excelFilePath, template.fieldMapping)).source !== dictionary.source)) dictionary = null;
    return { records: rows.map(row => analysisView(row, record, dictionary)), capacity: ANALYSIS_CAPACITY };
}

export function parseAnalysisRequest(body: unknown): { requestId: string; observedVersion: number; config: AnalysisConfig } {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new AnalysisConflict("分析请求格式无效");
    const input = body as Record<string, unknown>;
    if (Object.keys(input).sort().join(",") !== "config,observedVersion,requestId" || typeof input.requestId !== "string" || !/^[a-zA-Z0-9-]{8,80}$/.test(input.requestId) || !Number.isSafeInteger(input.observedVersion) || Number(input.observedVersion) < 1) throw new AnalysisConflict("分析请求编号或版本无效");
    const config = input.config as AnalysisConfig;
    if (!config || typeof config !== "object" || Object.keys(config).sort().join(",") !== "field,method,question,weighted"
        || typeof config.question !== "string" || config.question.trim().length < 5 || config.question.trim().length > 500
        || typeof config.field !== "string" || !config.field || typeof config.weighted !== "boolean"
        || !["simple", "systematic", "pps", "stratified"].includes(config.method)) throw new AnalysisConflict("请填写5–500字研究问题、已完成样本、变量与分析口径");
    return { requestId: input.requestId, observedVersion: input.observedVersion as number, config: { ...config, question: config.question.trim() } };
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
    if (initial.record.currentStage !== 4 || !["in_progress", "rejected"].includes(initial.record.status) || initial.record.stage4CompletedAt) throw new AnalysisConflict("请在可编辑的第四阶段执行分析", "EXPERIMENT_LOCKED", 409);
    const dictionary = initial.template.variableDictionary;
    if (!dictionary || dictionary.revision !== initial.template.variableRevision || !initial.template.excelFilePath) throw new AnalysisConflict("当前任务没有有效的已确认变量字典", "DICTIONARY_CONFLICT", 409);
    const variable = dictionary.variables.find(item => item.field === request.config.field);
    if (!variable || variable.kind === "identifier") throw new AnalysisConflict("所选变量不可用于分析");
    const samplingResult = (initial.record.samplingResults as Record<string, Record<string, unknown>> | null)?.[request.config.method];
    if (!samplingResult) throw new AnalysisConflict("请先完成所选抽样方法");
    const data = await univariateService.run({ populationPath: initial.template.excelFilePath, fieldMapping: initial.template.fieldMapping, dictionary, config: request.config, samplingResult }, {
        key: `${initial.record.id}:${request.requestId}:${fingerprint}`, signal,
    });
    return db.transaction(async tx => {
        const current = await ownedAnalysisContext(studentId, classId, taskId, tx, true);
        const duplicate = await existing(tx);
        if (duplicate) return retry(duplicate, current.record, current.template.variableDictionary);
        if (current.record.version !== request.observedVersion || current.record.currentStage !== 4 || !["in_progress", "rejected"].includes(current.record.status) || current.record.stage4CompletedAt) throw new AnalysisConflict("计算期间实验版本或状态已变化", "VERSION_CONFLICT", 409);
        if (current.record.samplingGeneration !== initial.record.samplingGeneration) throw new AnalysisConflict("计算期间抽样来源已变化", "SAMPLING_CONFLICT", 409);
        if (current.template.variableRevision !== dictionary.revision || current.template.variableDictionary?.source !== dictionary.source || !current.template.excelFilePath) throw new AnalysisConflict("计算期间变量字典已变化", "DICTIONARY_CONFLICT", 409);
        if ((await readVariableSource(current.template.excelFilePath, current.template.fieldMapping)).source !== dictionary.source) throw new AnalysisConflict("总体文件已变化", "SOURCE_CONFLICT", 409);
        const records = await tx.select({ id: savedAnalysis.id }).from(savedAnalysis).where(eq(savedAnalysis.experimentId, current.record.id)).limit(ANALYSIS_CAPACITY);
        if (records.length >= ANALYSIS_CAPACITY) throw new AnalysisConflict("当前实验已达到20条分析记录上限，历史分析不会被覆盖", "ANALYSIS_CAPACITY", 409);
        const [saved] = await tx.insert(savedAnalysis).values({
            experimentId: current.record.id, requestId: request.requestId, requestFingerprint: fingerprint,
            samplingGeneration: current.record.samplingGeneration, source: dictionary.source, dictionaryRevision: dictionary.revision,
            config: request.config, variable, result: data.result, evidence: data.evidence, algorithmVersion: data.algorithmVersion,
        }).returning();
        return analysisView(saved!, current.record, dictionary);
    });
}
