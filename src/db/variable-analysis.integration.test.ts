import { SQL } from "bun";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import * as schema from "./schema";
import { assertTestDatabaseIsMigrated } from "./test-database-guard";

const required = process.env.REQUIRE_TEST_DATABASE === "1";
const url = process.env.TEST_DATABASE_URL?.trim();
if (required && !url) throw new Error("TEST_DATABASE_URL is required for bun run test:db");
const pgTest = required ? test : test.skip;

let application: typeof import("./index");
let service: typeof import("../student/experiment/saved-analysis-service");
let sampling: typeof import("../student/experiment/sampling-service");
let variableSource: typeof import("../server/variable-source");
let raw: SQL;
const fixtures: Array<{ semester: number; teacher: number; cls: number; topic: number; task: number; students: number[] }> = [];
const files: string[] = [];

beforeAll(async () => {
    if (!required) return;
    process.env.DATABASE_URL = url!;
    application = await import("./index");
    raw = new SQL(url!);
    await assertTestDatabaseIsMigrated(raw);
    [service, sampling, variableSource] = await Promise.all([
        import("../student/experiment/saved-analysis-service"),
        import("../student/experiment/sampling-service"),
        import("../server/variable-source"),
    ]);
});

afterEach(async () => {
    if (!required) return;
    for (const ids of fixtures) {
        await application.db.delete(schema.task).where(eq(schema.task.id, ids.task));
        await application.db.delete(schema.topic).where(eq(schema.topic.id, ids.topic));
        for (const id of ids.students) await application.db.delete(schema.student).where(eq(schema.student.id, id));
        await application.db.delete(schema.class_).where(eq(schema.class_.id, ids.cls));
        await application.db.delete(schema.teacher).where(eq(schema.teacher.id, ids.teacher));
        await application.db.delete(schema.semester).where(eq(schema.semester.id, ids.semester));
    }
    fixtures.length = 0;
    for (const path of files) await Bun.file(path).delete().catch(() => {});
    files.length = 0;
});

afterAll(async () => {
    if (!required) return;
    await application?.closeDatabase();
    await raw?.close();
});

async function fixture() {
    const suffix = crypto.randomUUID().slice(0, 8);
    const storagePath = `/storage/test/variable-analysis-${suffix}.csv`;
    const absolutePath = `${process.cwd()}${storagePath}`;
    await Bun.write(absolutePath, "id,value,group\n1,10,A\n2,20,A\n3,30,B\n4,40,B\n5,50,B\n");
    files.push(absolutePath);
    const mapping = { identifier: "id", numeric: ["value"], stratified: ["group"], others: [] };
    const source = await variableSource.readVariableSource(storagePath, mapping);
    const dictionary = {
        source: source.source,
        revision: 1,
        variables: [
            { field: "id", label: "ID", unit: "", kind: "identifier" as const, categories: [], missing: [null] },
            { field: "value", label: "Value", unit: "points", kind: "continuous" as const, categories: [], missing: [null] },
            { field: "group", label: "Group", unit: "", kind: "nominal" as const, categories: [{ value: "A", label: "A" }, { value: "B", label: "B" }], missing: [null] },
        ],
    };
    const replay = await sampling.executeSamplingAction({
        method: "simple", rawParams: { sampleSize: 3, seed: 1701 }, targetSampleSize: 3,
        population: source.designRows, fieldMapping: mapping,
    });
    if (!replay.ok) throw new Error(replay.errorMessage);
    const { data: _data, ...storedResult } = replay.result;

    const [semester] = await application.db.insert(schema.semester).values({ name: `va-${suffix}` }).returning();
    const [teacher] = await application.db.insert(schema.teacher).values({ employeeId: `t-${suffix}`, name: "分析教师", password: "unused" }).returning();
    const [cls] = await application.db.insert(schema.class_).values({ name: "分析班级", semesterId: semester!.id, teacherId: teacher!.id }).returning();
    const students = await application.db.insert(schema.student).values([0, 1].map(i => ({ studentId: `s-${suffix}-${i}`, name: `学生${i}`, password: "unused", classId: cls!.id }))).returning();
    const [topic] = await application.db.insert(schema.topic).values({
        teacherId: teacher!.id, name: "变量分析", status: 1, excelFilePath: storagePath, excelRowCount: 5,
        fieldMapping: mapping, variableDictionary: dictionary, variableRevision: 1,
    }).returning();
    const [task] = await application.db.insert(schema.task).values({ topicId: topic!.id, classId: cls!.id }).returning();
    const [experiment] = await application.db.insert(schema.experiment).values({
        studentId: students[0]!.id, taskId: task!.id, currentStage: 4, status: "in_progress", samplingGeneration: 1,
        samplingResults: { simple: { ...storedResult, serverGenerated: true } },
    }).returning();
    fixtures.push({ semester: semester!.id, teacher: teacher!.id, cls: cls!.id, topic: topic!.id, task: task!.id, students: students.map(row => row.id) });
    const body = (requestId: string, question = "What is the sample mean?") => ({
        requestId, observedVersion: experiment!.version,
        config: { question, field: "value", method: "simple" as const, weighted: false },
    });
    return { semester: semester!, cls: cls!, students, task: task!, topic: topic!, experiment: experiment!, dictionary, mapping, storagePath, body, storedResult };
}

/** Hold the experiment row so a service write blocks on its own `FOR UPDATE`. */
async function holdExperimentRow(experimentId: number) {
    const acquired = Promise.withResolvers<void>();
    const release = Promise.withResolvers<((tx: { unsafe: (query: string, values?: unknown[]) => Promise<unknown> }) => Promise<void>) | null>();
    let holderPid = 0;
    const done = raw.begin(async tx => {
        const [backend] = await tx`SELECT pg_backend_pid() AS pid`;
        holderPid = backend.pid;
        await tx`SELECT id FROM experiment WHERE id = ${experimentId} FOR UPDATE`;
        acquired.resolve();
        const mutate = await release.promise;
        if (mutate) await mutate(tx as unknown as { unsafe: (query: string, values?: unknown[]) => Promise<unknown> });
    });
    await acquired.promise;
    return {
        holderPid,
        async commit(mutate?: (tx: { unsafe: (query: string, values?: unknown[]) => Promise<unknown> }) => Promise<void>) {
            release.resolve(mutate ?? null);
            await done;
        },
    };
}

async function waitForBlocked(holderPid: number) {
    const until = Date.now() + 5000;
    while (Date.now() < until) {
        const rows = await raw`SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND ${holderPid} = ANY(pg_blocking_pids(pid))`;
        if (rows.length) return;
        await Bun.sleep(10);
    }
    throw new Error("Timed out waiting for the analysis write transaction to block on the held row");
}

/** Clone one real saved analysis into extra rows without running the worker again. */
async function cloneAnalyses(experimentId: number, count: number, prefix: string) {
    const [template] = await application.db.select().from(schema.savedAnalysis).where(eq(schema.savedAnalysis.experimentId, experimentId)).limit(1);
    if (!template) throw new Error("cloneAnalyses requires one real saved analysis");
    return application.db.insert(schema.savedAnalysis).values(Array.from({ length: count }, (_, index) => ({
        experimentId, requestId: `${prefix}-${index}-${crypto.randomUUID()}`,
        requestFingerprint: template.requestFingerprint, samplingGeneration: template.samplingGeneration,
        source: template.source, dictionaryRevision: template.dictionaryRevision, config: template.config,
        variable: template.variable, result: template.result, evidence: template.evidence,
        algorithmVersion: template.algorithmVersion,
    }))).returning();
}

function routeRequest(method: string, params: Record<string, string>, options: { cookie?: string; body?: unknown } = {}) {
    const request = new Request("http://localhost", {
        method,
        headers: { "Content-Type": "application/json", ...(options.cookie ? { cookie: options.cookie } : {}) },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    (request as Request & { params: Record<string, string> }).params = params;
    return request;
}

async function session(userType: number, userId: number) {
    const token = crypto.randomUUID();
    await application.db.insert(schema.userSession).values({ userType, userId, sessionToken: token, expiresAt: new Date(Date.now() + 60_000) });
    return token;
}

pgTest("concurrent retries with the same request are idempotent and changed identity conflicts", async () => {
    const f = await fixture();
    const request = f.body(`same-${crypto.randomUUID()}`);
    const results = await Promise.all(Array.from({ length: 4 }, () => service.createSavedAnalysis(f.students[0]!.id, f.cls.id, f.task.id, request)));
    expect(new Set(results.map(row => row.id)).size).toBe(1);
    expect(await application.db.select().from(schema.savedAnalysis).where(eq(schema.savedAnalysis.experimentId, f.experiment.id))).toHaveLength(1);
    await expect(service.createSavedAnalysis(f.students[0]!.id, f.cls.id, f.task.id, { ...request, config: { ...request.config, question: "A genuinely different research question" } }))
        .rejects.toMatchObject({ code: "REQUEST_CONFLICT", status: 409 });
}, 20_000);

pgTest("analysis creation denies a different owner", async () => {
    const f = await fixture();
    await expect(service.createSavedAnalysis(f.students[1]!.id, f.cls.id, f.task.id, f.body(`owner-${crypto.randomUUID()}`)))
        .rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
});

pgTest("the capacity-20 boundary is serialized under concurrent writes", async () => {
    const f = await fixture();
    const first = await service.createSavedAnalysis(f.students[0]!.id, f.cls.id, f.task.id, f.body(`seed-${crypto.randomUUID()}`));
    const [template] = await application.db.select().from(schema.savedAnalysis).where(eq(schema.savedAnalysis.id, first.id));
    await application.db.insert(schema.savedAnalysis).values(Array.from({ length: 18 }, (_, index) => ({
        experimentId: f.experiment.id, requestId: `prefill-${index}-${crypto.randomUUID()}`,
        requestFingerprint: template!.requestFingerprint, samplingGeneration: template!.samplingGeneration,
        source: template!.source, dictionaryRevision: template!.dictionaryRevision, config: template!.config,
        variable: template!.variable, result: template!.result, evidence: template!.evidence,
        algorithmVersion: template!.algorithmVersion,
    })));
    const settled = await Promise.allSettled(["a", "b"].map(label => service.createSavedAnalysis(
        f.students[0]!.id, f.cls.id, f.task.id, f.body(`${label}-${crypto.randomUUID()}`),
    )));
    expect(settled.filter(item => item.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter(item => item.status === "rejected").map(item => (item as PromiseRejectedResult).reason.code)).toEqual(["ANALYSIS_CAPACITY"]);
    expect(await application.db.select().from(schema.savedAnalysis).where(eq(schema.savedAnalysis.experimentId, f.experiment.id))).toHaveLength(20);
}, 20_000);

pgTest("a new sampling generation makes saved analysis stale and rejects old references", async () => {
    const f = await fixture();
    const saved = await service.createSavedAnalysis(f.students[0]!.id, f.cls.id, f.task.id, f.body(`generation-${crypto.randomUUID()}`));
    const [current] = await application.db.update(schema.experiment).set({ samplingGeneration: 2, analysisReferences: [saved.id] })
        .where(eq(schema.experiment.id, f.experiment.id)).returning();
    const listed = await service.listSavedAnalyses(f.students[0]!.id, f.cls.id, f.task.id);
    expect(listed.records).toHaveLength(1);
    expect(listed.records[0]!.stale).toBe(true);
    await expect(service.loadAnalysisReferences(current!, f.dictionary, [saved.id]))
        .rejects.toMatchObject({ code: "STALE_REFERENCE", status: 409 });
});

pgTest("a missing population keeps saved results readable but stale", async () => {
    const f = await fixture();
    const saved = await service.createSavedAnalysis(f.students[0]!.id, f.cls.id, f.task.id, f.body(`missing-${crypto.randomUUID()}`));
    await Bun.file(files[0]!).delete();
    const listed = await service.listSavedAnalyses(f.students[0]!.id, f.cls.id, f.task.id);
    expect(listed.records[0]).toMatchObject({ id: saved.id, result: saved.result, stale: true });
});

pgTest("A05 analysis request identity binds config and observed version, and new identities stay independent", async () => {
    const f = await fixture();
    const body = f.body(`a05-${crypto.randomUUID()}`);
    const first = await service.createSavedAnalysis(f.students[0]!.id, f.cls.id, f.task.id, body);
    // 同一身份同一请求重试：只存一次并返回同一行
    const retry = await service.createSavedAnalysis(f.students[0]!.id, f.cls.id, f.task.id, body);
    expect(retry.id).toBe(first.id);
    // 同一身份不能改 observedVersion
    await expect(service.createSavedAnalysis(f.students[0]!.id, f.cls.id, f.task.id, { ...body, observedVersion: body.observedVersion + 1 }))
        .rejects.toMatchObject({ code: "REQUEST_CONFLICT", status: 409 });
    // 同一身份不能改配置
    await expect(service.createSavedAnalysis(f.students[0]!.id, f.cls.id, f.task.id, { ...body, config: { ...body.config, question: "另一个明显不同的研究问题？" } }))
        .rejects.toMatchObject({ code: "REQUEST_CONFLICT", status: 409 });
    // 新身份同配置：新记录，旧记录全部字段不变
    const before = await application.db.select().from(schema.savedAnalysis).where(eq(schema.savedAnalysis.id, first.id));
    const second = await service.createSavedAnalysis(f.students[0]!.id, f.cls.id, f.task.id, f.body(`a05b-${crypto.randomUUID()}`));
    expect(second.id).not.toBe(first.id);
    expect(await application.db.select().from(schema.savedAnalysis).where(eq(schema.savedAnalysis.id, first.id))).toEqual(before);
    expect(await application.db.select().from(schema.savedAnalysis).where(eq(schema.savedAnalysis.experimentId, f.experiment.id))).toHaveLength(2);
}, 20_000);

pgTest("A06 an upstream resample during the write lock rejects the analysis", async () => {
    const f = await fixture();
    const lock = await holdExperimentRow(f.experiment.id);
    const pending = service.createSavedAnalysis(f.students[0]!.id, f.cls.id, f.task.id, f.body(`a06-gen-${crypto.randomUUID()}`))
        .then(value => ({ value, error: null }), error => ({ value: null, error }));
    await waitForBlocked(lock.holderPid);
    await lock.commit(async tx => { await tx.unsafe("UPDATE experiment SET sampling_generation = sampling_generation + 1, analysis_references = '[]'::jsonb WHERE id = $1", [f.experiment.id]); });
    const outcome = await pending;
    expect(outcome.error).toMatchObject({ code: "SAMPLING_CONFLICT", status: 409 });
    expect(await application.db.select().from(schema.savedAnalysis).where(eq(schema.savedAnalysis.experimentId, f.experiment.id))).toHaveLength(0);
}, 15_000);

pgTest("A06 replacing the population while the write lock is held rejects the analysis", async () => {
    const f = await fixture();
    const lock = await holdExperimentRow(f.experiment.id);
    const pending = service.createSavedAnalysis(f.students[0]!.id, f.cls.id, f.task.id, f.body(`a06-src-${crypto.randomUUID()}`))
        .then(value => ({ value, error: null }), error => ({ value: null, error }));
    await waitForBlocked(lock.holderPid);
    // 不依赖行锁的变更：同一路径直接换字节
    await Bun.write(`${process.cwd()}${f.storagePath}`, "id,value,group\n1,11,A\n2,20,A\n3,30,B\n4,40,B\n5,50,B\n");
    await lock.commit();
    const outcome = await pending;
    expect(outcome.error).toMatchObject({ code: "SOURCE_CONFLICT", status: 409 });
    expect(await application.db.select().from(schema.savedAnalysis).where(eq(schema.savedAnalysis.experimentId, f.experiment.id))).toHaveLength(0);
}, 15_000);

pgTest("A06 a successful request can be retried after the task closes, while a new request is rejected", async () => {
    const f = await fixture();
    const body = f.body(`a06-retry-${crypto.randomUUID()}`);
    const saved = await service.createSavedAnalysis(f.students[0]!.id, f.cls.id, f.task.id, body);
    await application.db.update(schema.task).set({ deadline: new Date(Date.now() - 60_000) }).where(eq(schema.task.id, f.task.id));
    // 已成功请求的重试是只读返回，不再重复计算或写入
    await expect(service.createSavedAnalysis(f.students[0]!.id, f.cls.id, f.task.id, body)).resolves.toMatchObject({ id: saved.id });
    // 新请求在截止后被拒绝
    await expect(service.createSavedAnalysis(f.students[0]!.id, f.cls.id, f.task.id, f.body(`a06-new-${crypto.randomUUID()}`)))
        .rejects.toMatchObject({ code: "TASK_DEADLINE", status: 409 });
});

pgTest("A06 (open) a deadline crossing while waiting for the write lock follows admission-time semantics", async () => {
    const f = await fixture();
    const lock = await holdExperimentRow(f.experiment.id);
    const body = f.body(`a06-deadline-${crypto.randomUUID()}`);
    const pending = service.createSavedAnalysis(f.students[0]!.id, f.cls.id, f.task.id, body)
        .then(value => ({ value, error: null }), error => ({ value: null, error }));
    await waitForBlocked(lock.holderPid);
    await lock.commit(async tx => { await tx.unsafe("UPDATE task SET deadline = $2 WHERE id = $1", [f.task.id, new Date(Date.now() - 60_000)]); });
    const outcome = await pending;
    // 请求在截止前被受理后，写锁等待中跨过截止时刻仍会落库。这与阶段完成路径的
    // "admit once" 约定一致；是否需要写前再拒止属于待产品确认的问题，测试只锁定当前行为。
    expect(outcome.error).toBeNull();
    expect(await application.db.select().from(schema.savedAnalysis).where(eq(schema.savedAnalysis.experimentId, f.experiment.id))).toHaveLength(1);
}, 15_000);

pgTest("A07 capacity counts stale records, retries still return the original, and reopening cannot bypass the limit", async () => {
    const f = await fixture();
    const firstBody = f.body(`a07-first-${crypto.randomUUID()}`);
    const first = await service.createSavedAnalysis(f.students[0]!.id, f.cls.id, f.task.id, firstBody);
    await cloneAnalyses(f.experiment.id, 19, "a07");
    expect(await application.db.select().from(schema.savedAnalysis).where(eq(schema.savedAnalysis.experimentId, f.experiment.id))).toHaveLength(20);
    // 上游重开使历史记录过期，但容量不被释放
    await application.db.update(schema.experiment).set({ samplingGeneration: f.experiment.samplingGeneration + 1 }).where(eq(schema.experiment.id, f.experiment.id));
    const listed = await service.listSavedAnalyses(f.students[0]!.id, f.cls.id, f.task.id);
    expect(listed.records.every(record => record.stale)).toBe(true);
    // 重试已成功请求仍返回原记录（只读，不受容量与过期影响）
    await expect(service.createSavedAnalysis(f.students[0]!.id, f.cls.id, f.task.id, firstBody)).resolves.toMatchObject({ id: first.id });
    // 新身份在满额时被拒绝，历史记录不被覆盖
    await expect(service.createSavedAnalysis(f.students[0]!.id, f.cls.id, f.task.id, f.body(`a07-overflow-${crypto.randomUUID()}`)))
        .rejects.toMatchObject({ code: "ANALYSIS_CAPACITY", status: 409 });
    expect(await application.db.select().from(schema.savedAnalysis).where(eq(schema.savedAnalysis.experimentId, f.experiment.id))).toHaveLength(20);
}, 20_000);

pgTest("R01 references accept at most 10 unique owned analyses and reject illegal ids without partial updates", async () => {
    const f = await fixture();
    const seed = await service.createSavedAnalysis(f.students[0]!.id, f.cls.id, f.task.id, f.body(`r01-${crypto.randomUUID()}`));
    const extra = await cloneAnalyses(f.experiment.id, 11, "r01");
    const [current] = await application.db.select().from(schema.experiment).where(eq(schema.experiment.id, f.experiment.id));
    const validate = async (ids: unknown) => service.loadAnalysisReferences(current!, f.dictionary, service.parseAnalysisReferences(ids));

    expect(await validate([])).toHaveLength(0);
    expect(await validate([seed.id])).toHaveLength(1);
    expect(await validate(extra.slice(0, 10).map(row => row.id))).toHaveLength(10);
    await expect(validate(extra.map(row => row.id))).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(validate([seed.id, seed.id])).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(validate([0])).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(validate([1.5])).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(validate([seed.id, 9_999_999])).rejects.toMatchObject({ code: "INVALID_REFERENCE", status: 409 });

    // 同一任务下其他学生的实验记录即使 ID 存在也不能被引用
    const [otherExperiment] = await application.db.insert(schema.experiment).values({
        studentId: f.students[1]!.id, taskId: f.task.id, currentStage: 4, status: "in_progress", samplingGeneration: 1,
        samplingResults: { simple: { ...f.storedResult, serverGenerated: true } },
    }).returning();
    const [foreign] = await application.db.insert(schema.savedAnalysis).values({
        experimentId: otherExperiment!.id, requestId: `r01-foreign-${crypto.randomUUID()}`,
        requestFingerprint: extra[0]!.requestFingerprint, samplingGeneration: extra[0]!.samplingGeneration,
        source: extra[0]!.source, dictionaryRevision: extra[0]!.dictionaryRevision, config: extra[0]!.config,
        variable: extra[0]!.variable, result: extra[0]!.result, evidence: extra[0]!.evidence, algorithmVersion: extra[0]!.algorithmVersion,
    }).returning();
    await expect(validate([foreign!.id])).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
    // 失败不部分更新
    expect((await application.db.select().from(schema.experiment).where(eq(schema.experiment.id, f.experiment.id)))[0]!.analysisReferences).toEqual([]);
}, 20_000);

pgTest("R03 reopening stage 3 clears references and permanently stales history, while stage 4 alone does not", async () => {
    const f = await fixture();
    const saved = await service.createSavedAnalysis(f.students[0]!.id, f.cls.id, f.task.id, f.body(`r03-${crypto.randomUUID()}`));
    await application.db.update(schema.experiment).set({ analysisReferences: [saved.id], currentStage: 4, stage3CompletedAt: new Date(), stage4CompletedAt: new Date() }).where(eq(schema.experiment.id, f.experiment.id));
    let [record] = await application.db.select().from(schema.experiment).where(eq(schema.experiment.id, f.experiment.id));

    // 仅重开阶段 4：引用与代次保持不变
    const stage4 = await import("../student/experiment/update-service").then(module => module.buildStageReopenUpdates({ experimentRecord: record!, stage: 4, deadlinePassed: false }));
    expect(stage4.ok).toBe(true);
    if (!stage4.ok) return;
    await application.db.update(schema.experiment).set(stage4.updates).where(eq(schema.experiment.id, f.experiment.id));
    [record] = await application.db.select().from(schema.experiment).where(eq(schema.experiment.id, f.experiment.id));
    expect(record!.analysisReferences).toEqual([saved.id]);
    expect((await service.listSavedAnalyses(f.students[0]!.id, f.cls.id, f.task.id)).records[0]!.stale).toBe(false);

    // 重开阶段 3：清引用、代次 +1、历史永久过期；同种子重抽不复活
    const stage3 = await import("../student/experiment/update-service").then(module => module.buildStageReopenUpdates({ experimentRecord: record!, stage: 3, deadlinePassed: false }));
    expect(stage3.ok).toBe(true);
    if (!stage3.ok) return;
    expect(stage3.updates.analysisReferences).toEqual([]);
    await application.db.update(schema.experiment).set(stage3.updates).where(eq(schema.experiment.id, f.experiment.id));
    const [after] = await application.db.select().from(schema.experiment).where(eq(schema.experiment.id, f.experiment.id));
    expect(after!.samplingGeneration).toBe(f.experiment.samplingGeneration + 1);
    expect((await service.listSavedAnalyses(f.students[0]!.id, f.cls.id, f.task.id)).records[0]!.stale).toBe(true);
    await expect(service.loadAnalysisReferences(after!, f.dictionary, [saved.id])).rejects.toMatchObject({ code: "STALE_REFERENCE" });
}, 20_000);

pgTest("R04 submitted details read the frozen snapshot after dictionary and analysis mutations, and reject a missing file", async () => {
    const f = await fixture();
    const saved = await service.createSavedAnalysis(f.students[0]!.id, f.cls.id, f.task.id, f.body(`r04-${crypto.randomUUID()}`));
    const [row] = await application.db.select().from(schema.savedAnalysis).where(eq(schema.savedAnalysis.id, saved.id));
    const fileHash = new Bun.CryptoHasher("sha256").update(await Bun.file(`${process.cwd()}${f.storagePath}`).arrayBuffer()).digest("hex");
    const snapshot = {
        topicName: "冻结模板", studentName: "学生0", populationSize: 5,
        questionnaire: { title: "冻结问卷", welcomeText: "w", endingText: "e", questions: [] },
        samplePlan: { confidenceLevel: "95", marginOfError: 5, designEffect: 1, nonResponseRate: 0, recommendedSize: 3, finalSampleSize: 3 },
        samplingResults: { simple: { ...f.storedResult, serverGenerated: true } },
        reportContent: "<p>冻结报告正文</p>",
        weightConfig: { questionnaire: 30, process: 30, report: 40 },
        samplingPolicy: { version: 1, methods: { simple: "required", systematic: "optional", pps: "disabled", stratified: "optional" } },
        variableDictionary: f.dictionary,
        analysisAppendices: [{ ...service.analysisView(row!, f.experiment, f.dictionary), evidence: row!.evidence, stale: false }],
        className: "分析班级", teacherName: "分析教师", populationFileSha256: fileHash, parserVersion: "raw-values-v1", samplingAlgorithmVersion: "sampling-v2",
    };
    await application.db.update(schema.experiment).set({
        status: "submitted", version: f.experiment.version + 1, submissionSnapshot: snapshot, submittedAt: new Date(),
    }).where(eq(schema.experiment.id, f.experiment.id));

    // 提交后修改当前字典并删除分析表：读取仍必须来自冻结快照
    await application.db.update(schema.topic).set({ variableDictionary: { source: "mutated", revision: 99, variables: [] }, variableRevision: 99 }).where(eq(schema.topic.id, f.topic.id));
    await application.db.delete(schema.savedAnalysis).where(eq(schema.savedAnalysis.experimentId, f.experiment.id));

    const { submissionByTaskRoutes } = await import("../student/routes/submissions");
    const { gradingDetailRoutes } = await import("../teacher/routes/grading");
    const { withTeacherAuth } = await import("../teacher/routes/auth");
    const studentToken = await session(3, f.students[0]!.id);
    const teacherToken = await session(2, f.cls.teacherId);

    const studentResponse = await submissionByTaskRoutes.GET!(routeRequest("GET", { id: String(f.task.id) }, { cookie: `student_session=${studentToken}` }));
    expect(studentResponse.status).toBe(200);
    const studentBody = await studentResponse.json() as { data: { snapshot: { analysisAppendices: Array<{ id: number; result: unknown; variable: { label: string } }> } } };
    expect(studentBody.data.snapshot.analysisAppendices.map(item => item.id)).toEqual([saved.id]);
    expect(studentBody.data.snapshot.analysisAppendices[0]!.result).toEqual(saved.result);
    expect(studentBody.data.snapshot.analysisAppendices[0]!.variable.label).toBe("Value");

    const gradingResponse = await withTeacherAuth(gradingDetailRoutes).GET!(routeRequest("GET", { id: String(f.experiment.id) }, { cookie: `teacher_session=${teacherToken}` }));
    expect(gradingResponse.status).toBe(200);
    const gradingBody = await gradingResponse.json() as { data: { analysisAppendices: Array<{ id: number }> } };
    expect(gradingBody.data.analysisAppendices.map(item => item.id)).toEqual([saved.id]);

    // 总体文件缺失：冻结样本无法恢复，明确拒绝而不是用当前字典补齐
    await Bun.file(`${process.cwd()}${f.storagePath}`).delete();
    const missingStudent = await submissionByTaskRoutes.GET!(routeRequest("GET", { id: String(f.task.id) }, { cookie: `student_session=${studentToken}` }));
    expect(missingStudent.status).toBe(409);
    const missingTeacher = await withTeacherAuth(gradingDetailRoutes).GET!(routeRequest("GET", { id: String(f.experiment.id) }, { cookie: `teacher_session=${teacherToken}` }));
    expect(missingTeacher.status).toBe(409);
}, 30_000);

pgTest("a version change while analysis waits for its write lock rejects the result", async () => {
    const f = await fixture();
    const acquired = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let holderPid = 0;
    const held = raw.begin(async tx => {
        const [backend] = await tx`SELECT pg_backend_pid() AS pid`;
        holderPid = backend.pid;
        await tx`SELECT id FROM experiment WHERE id = ${f.experiment.id} FOR UPDATE`;
        acquired.resolve();
        await release.promise;
        await tx`UPDATE experiment SET version = version + 1 WHERE id = ${f.experiment.id}`;
    });
    await acquired.promise;
    const pending = service.createSavedAnalysis(f.students[0]!.id, f.cls.id, f.task.id, f.body(`race-${crypto.randomUUID()}`))
        .then(value => ({ value, error: null }), error => ({ value: null, error }));
    try {
        let blocked = false;
        const until = Date.now() + 5000;
        while (Date.now() < until) {
            const rows = await raw`SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND ${holderPid} = ANY(pg_blocking_pids(pid))`;
            if (rows.length) { blocked = true; break; }
            await Bun.sleep(10);
        }
        expect(blocked).toBe(true);
    } finally { release.resolve(); await held; }
    const outcome = await pending;
    expect(outcome.error).toMatchObject({ code: "VERSION_CONFLICT", status: 409 });
    expect(await application.db.select().from(schema.savedAnalysis).where(eq(schema.savedAnalysis.experimentId, f.experiment.id))).toHaveLength(0);
}, 10_000);
