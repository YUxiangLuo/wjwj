import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { experiment, researchAnalysisRun, student, task, topic } from "@/db/schema";
import { RESEARCH_METHODS, ResearchAnalysisError, type ResearchSpec, type ResearchRun } from "@/domain/experiment/research-analysis";
import { readStoredVariableDictionary, dictionaryDatasetRevisionFromHash } from "@/server/variable-dictionary";
import { resolveStoragePath } from "@/server/storage-files";
import { resolveSamplingPolicy } from "@/lib/sampling-policy";
import { MAX_SPREADSHEET_UPLOAD_BYTES } from "@/lib/spreadsheet";
import { WorkerService, type ServiceWorker } from "@/server/worker-service";
import { readResearchRun, isResearchRunCurrent } from "./research-records";
import { researchHash } from "./research-source";
import type { ResearchJob, ResearchJobResult } from "./research-job";

type ReadDb = Pick<typeof db, "select">;
export async function loadResearchContext(studentId: number, taskId: number, database: ReadDb = db, lock = false) {
    const query = database.select({ record: experiment, classId: student.classId, deadline: task.deadline, openTime: task.openTime,
        variableDictionary: topic.variableDictionary, variableDictionaryRevision: topic.variableDictionaryRevision, samplingPolicy: topic.samplingPolicy,
        excelFilePath: topic.excelFilePath, fieldMapping: topic.fieldMapping, populationSize: topic.excelRowCount,
    }).from(experiment).innerJoin(task, eq(task.id, experiment.taskId)).innerJoin(topic, eq(topic.id, task.topicId)).innerJoin(student, eq(student.id, experiment.studentId))
        .where(and(eq(experiment.studentId, studentId), eq(experiment.taskId, taskId), eq(student.classId, task.classId), eq(topic.status, 1)));
    const [ctx] = await (lock ? query.for("update") : query);
    if (!ctx) throw new ResearchAnalysisError("任务或实验不存在", "NOT_FOUND", 404);
    if (ctx.openTime && (!Number.isFinite(ctx.openTime.getTime()) || ctx.openTime.getTime() > Date.now())) throw new ResearchAnalysisError("任务尚未开放或时间配置无效", "TASK_NOT_OPEN");
    return ctx;
}
export type ResearchContext = Awaited<ReturnType<typeof loadResearchContext>>;
export async function verifyResearchDictionary(ctx: ResearchContext) {
    const read = readStoredVariableDictionary(ctx.variableDictionary, ctx.variableDictionaryRevision);
    if (!read.ok) throw new ResearchAnalysisError(read.message, read.code, read.status);
    if (!read.value) throw new ResearchAnalysisError("自主分析需要教师确认变量字典；不影响原有对照分析及实验提交", "NO_DICTIONARY");
    if (!ctx.excelFilePath) throw new ResearchAnalysisError("缺少总体来源文件", "READ_FAILED");
    try {
        const file = Bun.file(resolveStoragePath(ctx.excelFilePath));
        if (file.size > MAX_SPREADSHEET_UPLOAD_BYTES) throw new Error("oversized source");
        const bytes = await file.arrayBuffer(); if (bytes.byteLength > MAX_SPREADSHEET_UPLOAD_BYTES) throw new Error("oversized source");
        const sha = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
        if (dictionaryDatasetRevisionFromHash(sha, ctx.excelFilePath, ctx.fieldMapping) !== read.value.datasetRevision) throw new ResearchAnalysisError("总体来源与字典已改变，请联系教师检查", "DATASET_CHANGED");
        return read.value;
    } catch (cause) {
        if (cause instanceof ResearchAnalysisError) throw cause;
        throw new ResearchAnalysisError("无法读取总体来源文件，请联系教师", "READ_FAILED", 422);
    }
}
function writable(ctx: ResearchContext, version: number) {
    if (ctx.record.version !== version) throw new ResearchAnalysisError("实验版本已改变，请保留报告草稿后明确加载最新版本", "VERSION_CONFLICT");
    if (!["in_progress", "rejected"].includes(ctx.record.status) || ctx.record.currentStage !== 4 || !ctx.record.stage3CompletedAt || !Number.isInteger(ctx.record.samplingRevision) || ctx.record.samplingRevision < 1) throw new ResearchAnalysisError("请在已完成抽样的分析阶段运行，已提交成果不能改写", "EXPERIMENT_LOCKED");
    if (ctx.deadline && (!Number.isFinite(ctx.deadline.getTime()) || ctx.deadline.getTime() < Date.now())) throw new ResearchAnalysisError("任务已截止或时间配置无效", "TASK_DEADLINE");
}
export function createResearchWorkerService(createWorker = () => new Worker(new URL("./research-worker.ts", import.meta.url).href) as ServiceWorker) {
    return new WorkerService<ResearchJob, ResearchJobResult>({ createWorker, queueLimit: 2, timeoutMs: 30_000, code: "RESEARCH", label: "自主分析" });
}
const key = Symbol.for("wj.research-service");
const services = globalThis as typeof globalThis & { [key]?: ReturnType<typeof createResearchWorkerService> };
services[key]?.close();
export const researchWorkerService = createResearchWorkerService(); services[key] = researchWorkerService;

export async function listResearchRuns(studentId: number, taskId: number, authorize: () => Promise<void>) {
    const ctx = await loadResearchContext(studentId, taskId);
    const rows = await db.select().from(researchAnalysisRun).where(eq(researchAnalysisRun.experimentId, ctx.record.id)).orderBy(researchAnalysisRun.createdAt).limit(31);
    if (rows.length > 30) throw new ResearchAnalysisError("分析记录超过当前容量，请联系管理员", "INVALID_RESEARCH_STORAGE");
    let dictionary = null, sourceError: string | null = null;
    try { dictionary = await verifyResearchDictionary(ctx); } catch (cause) { if (!(cause instanceof ResearchAnalysisError)) throw cause; sourceError = cause.message; }
    const latest = await loadResearchContext(studentId, taskId);
    await authorize();
    if (latest.record.id !== ctx.record.id || latest.record.version !== ctx.record.version || latest.excelFilePath !== ctx.excelFilePath || latest.populationSize !== ctx.populationSize || !Bun.deepEquals(latest.fieldMapping, ctx.fieldMapping) || !Bun.deepEquals(latest.variableDictionary, ctx.variableDictionary) || latest.variableDictionaryRevision !== ctx.variableDictionaryRevision || !Bun.deepEquals(latest.record.samplingResults, ctx.record.samplingResults) || latest.record.samplingRevision !== ctx.record.samplingRevision) sourceError = "核对期间实验来源已改变，请刷新后查看当前状态";
    const results = ctx.record.samplingResults as Record<string, any> | null;
    return { dictionary, sourceError, references: ctx.record.analysisReferences,
        methods: RESEARCH_METHODS.filter(m => resolveSamplingPolicy(ctx.samplingPolicy).methods[m] !== "disabled" && results?.[m]?.completed === true && results[m]?.unavailable !== true),
        runs: rows.map(row => { const run = readResearchRun(row.document); return { run, current: !sourceError && isResearchRunCurrent(latest.record, dictionary, run) }; }) };
}
export async function saveResearchRun(params: { studentId: number; taskId: number; observedVersion: number; requestKey: string; spec: ResearchSpec; signal?: AbortSignal; authorize: () => Promise<void> }, worker: Pick<typeof researchWorkerService, "run"> = researchWorkerService) {
    const ctx = await loadResearchContext(params.studentId, params.taskId), specHash = researchHash(params.spec);
    function replay(row: typeof researchAnalysisRun.$inferSelect) {
        if (row.specHash !== specHash || row.inputVersion !== params.observedVersion) throw new ResearchAnalysisError("同一请求身份不能用于不同配置或输入版本", "IDEMPOTENCY_CONFLICT");
        return readResearchRun(row.document);
    }
    const existing = await db.select().from(researchAnalysisRun).where(eq(researchAnalysisRun.experimentId, ctx.record.id)).limit(31);
    const prior = existing.find(row => row.requestKey === params.requestKey);
    if (prior) return { run: replay(prior), replayed: true };
    writable(ctx, params.observedVersion);
    if (resolveSamplingPolicy(ctx.samplingPolicy).methods[params.spec.method] === "disabled") throw new ResearchAnalysisError("此抽样方法未启用", "SAMPLING_METHOD_DISABLED");
    if (existing.length >= 30) throw new ResearchAnalysisError("每个实验最多保存30条分析；现有成果不会被自动删除", "RESEARCH_LIMIT");
    const output = await worker.run({ spec: params.spec, samplingRevision: ctx.record.samplingRevision, stage3CompletedAt: ctx.record.stage3CompletedAt!.toISOString(), source: { experimentId: ctx.record.id, taskId: params.taskId, version: ctx.record.version, status: ctx.record.status, questionnaire: ctx.record.questionnaire, samplingResults: ctx.record.samplingResults, submissionSnapshot: null,
        variableDictionary: ctx.variableDictionary, variableDictionaryRevision: ctx.variableDictionaryRevision, fieldMapping: ctx.fieldMapping, excelFilePath: ctx.excelFilePath, populationSize: ctx.populationSize, type: params.spec.method } }, { signal: params.signal });
    await params.authorize();
    if (!output.ok) throw new ResearchAnalysisError(output.message, output.code, output.status);
    return db.transaction(async tx => {
        const fresh = await loadResearchContext(params.studentId, params.taskId, tx, true);
        const rows = await tx.select().from(researchAnalysisRun).where(eq(researchAnalysisRun.experimentId, fresh.record.id)).limit(31);
        const prior = rows.find(r => r.requestKey === params.requestKey); if (prior) return { run: replay(prior), replayed: true };
        writable(fresh, params.observedVersion);
        if (resolveSamplingPolicy(fresh.samplingPolicy).methods[params.spec.method] === "disabled") throw new ResearchAnalysisError("此抽样方法未启用", "SAMPLING_METHOD_DISABLED");
        if (params.signal?.aborted) throw new ResearchAnalysisError("分析已取消，未保存结果", "RESEARCH_CANCELLED");
        if (rows.length >= 30) throw new ResearchAnalysisError("每个实验最多保存30条分析；现有成果不会被自动删除", "RESEARCH_LIMIT");
        const dictionary = await verifyResearchDictionary(fresh);
        const run: ResearchRun = { ...output.run, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
        if (researchHash(run.spec) !== specHash || !Bun.deepEquals(run.variable, dictionary.variables.find(v => v.id === params.spec.variableId)) || run.source.datasetRevision !== dictionary.datasetRevision || run.source.dictionaryRevision !== dictionary.revision || run.source.populationSize !== fresh.populationSize
            || dictionaryDatasetRevisionFromHash(run.source.populationFileSha256, fresh.excelFilePath!, fresh.fieldMapping) !== dictionary.datasetRevision) throw new ResearchAnalysisError("计算结果与请求或来源证据不一致，未保存", "RESEARCH_SOURCE_CHANGED");
        if (!isResearchRunCurrent(fresh.record, dictionary, run)) throw new ResearchAnalysisError("计算期间来源或样本已改变，结果未保存，请重新核对后运行", "RESEARCH_SOURCE_CHANGED");
        readResearchRun(run);
        // Reserve space for PostgreSQL JSONB's textual separators (DB cap: 64 KiB).
        if (new TextEncoder().encode(JSON.stringify(run)).byteLength > 60 * 1024) throw new ResearchAnalysisError("结果超过保存容量，请核对类别标签或选择其他变量；不会截断类别", "RESEARCH_RESULT_TOO_LARGE", 413);
        if (params.signal?.aborted) throw new ResearchAnalysisError("分析已取消，未保存结果", "RESEARCH_CANCELLED");
        await tx.insert(researchAnalysisRun).values({ id: run.id, experimentId: fresh.record.id, requestKey: params.requestKey, inputVersion: params.observedVersion, specHash, document: run });
        return { run, replayed: false };
    });
}
