import { SQL } from "bun";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
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
let submitService: typeof import("../student/experiment/submit-service");
let updateService: typeof import("../student/experiment/update-service");
let raw: SQL;
const fixtures: Array<{ semester: number; teacher: number; cls: number; topic: number; task: number; students: number[] }> = [];
const files: string[] = [];

beforeAll(async () => {
    if (!required) return;
    process.env.DATABASE_URL = url!;
    application = await import("./index");
    raw = new SQL(url!);
    await assertTestDatabaseIsMigrated(raw);
    [service, sampling, variableSource, submitService, updateService] = await Promise.all([
        import("../student/experiment/saved-analysis-service"),
        import("../student/experiment/sampling-service"),
        import("../server/variable-source"),
        import("../student/experiment/submit-service"),
        import("../student/experiment/update-service"),
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

pgTest("A06 replacing the population before the request maps to a 409 source conflict", async () => {
    const f = await fixture();
    // 请求前就换掉字节：此时工作线程内的来源校验先于事务校验触发，必须同样返回 409 SOURCE_CONFLICT。
    await Bun.write(`${process.cwd()}${f.storagePath}`, "id,value,group\n1,11,A\n2,20,A\n3,30,B\n4,40,B\n5,50,B\n");
    const outcome = await service.createSavedAnalysis(f.students[0]!.id, f.cls.id, f.task.id, f.body(`a06-src-early-${crypto.randomUUID()}`))
        .then(value => ({ value, error: null }), error => ({ value: null, error }));
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

pgTest("A06 a worker failure is surfaced and never persisted as a saved analysis", async () => {
    const f = await fixture();
    // 存储水合合法但重演不匹配的抽样记录（伪造种子）：失败必须来自 Worker
    await application.db.update(schema.experiment).set({
        samplingResults: { simple: { ...f.storedResult, serverGenerated: true, seed: 999_999 } },
    }).where(eq(schema.experiment.id, f.experiment.id));
    const [current] = await application.db.select().from(schema.experiment).where(eq(schema.experiment.id, f.experiment.id));
    await expect(service.createSavedAnalysis(f.students[0]!.id, f.cls.id, f.task.id, {
        requestId: `a06-fail-${crypto.randomUUID()}`, observedVersion: current!.version,
        config: { question: "失败的 Worker 结果不能落库？", field: "value", method: "simple", weighted: false },
    })).rejects.toMatchObject({ code: "REPLAY_MISMATCH" });
    expect(await application.db.select().from(schema.savedAnalysis).where(eq(schema.savedAnalysis.experimentId, f.experiment.id))).toHaveLength(0);
}, 20_000);

pgTest("A06 an interrupted commit is recoverable by retrying the same request exactly once", async () => {
    const f = await fixture();
    const body = f.body(`a06-interrupt-${crypto.randomUUID()}`);
    const trigger = `test_fail_saved_analysis_${crypto.randomUUID().slice(0, 8)}`;
    await raw.unsafe(`CREATE FUNCTION ${trigger}() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'simulated commit interruption'; END; $$ LANGUAGE plpgsql`);
    await raw.unsafe(`CREATE TRIGGER ${trigger} BEFORE INSERT ON saved_analysis FOR EACH ROW EXECUTE FUNCTION ${trigger}()`);
    try {
        // 计算完成但写入失败：请求必须以错误结束且无半条记录
        await expect(service.createSavedAnalysis(f.students[0]!.id, f.cls.id, f.task.id, body)).rejects.toThrow();
        expect(await application.db.select().from(schema.savedAnalysis).where(eq(schema.savedAnalysis.experimentId, f.experiment.id))).toHaveLength(0);
    } finally {
        await raw.unsafe(`DROP TRIGGER IF EXISTS ${trigger} ON saved_analysis`);
        await raw.unsafe(`DROP FUNCTION IF EXISTS ${trigger}()`);
    }
    // 相同请求重试可恢复，且最终最多一条
    const recovered = await service.createSavedAnalysis(f.students[0]!.id, f.cls.id, f.task.id, body);
    const retried = await service.createSavedAnalysis(f.students[0]!.id, f.cls.id, f.task.id, body);
    expect(retried.id).toBe(recovered.id);
    expect(await application.db.select().from(schema.savedAnalysis).where(eq(schema.savedAnalysis.experimentId, f.experiment.id))).toHaveLength(1);
}, 20_000);

/** Complete, submittable experiment built on the shared fixture (plan R05/R07). */
async function submittableFixture() {
    const f = await fixture();
    // 真实保存一条分析，用于验证附录不参与正文长度且随提交冻结
    const saved = await service.createSavedAnalysis(f.students[0]!.id, f.cls.id, f.task.id, f.body(`r07-seed-${crypto.randomUUID()}`));
    await application.db.update(schema.savedAnalysis).set({ evidence: { analysisNote: "用于验证长附录的冻结与字数隔离。".repeat(300) } }).where(eq(schema.savedAnalysis.id, saved.id));

    const target = 4;
    const replay = async (method: "simple" | "systematic") => {
        const loaded = await variableSource.readVariableSource(f.storagePath, f.mapping);
        const result = await sampling.executeSamplingAction({ method, population: loaded.designRows, fieldMapping: f.mapping, targetSampleSize: target, rawParams: { seed: 1701, sampleSize: target } });
        if (!result.ok) throw new Error(result.errorMessage);
        const { data: _data, ...stored } = result.result;
        return { ...stored, serverGenerated: true };
    };
    const questionnaire = {
        title: "空功能预试",
        welcomeText: "欢迎参加本次调查，请根据真实情况回答所有问题，答案仅用于课堂试填与理解题目。",
        endingText: "感谢您的参与，本次试填到此结束，结果不会进入估计与报告。",
        questions: Array.from({ length: 5 }, (_, index) => ({ id: `q${index}`, type: "boolean", content: `第${index + 1}题是否完成？` })),
    };
    const samplePlan = { estimationType: "mean", confidenceLevel: "95", marginOfError: 10, populationVariance: 200, designEffect: 1, nonResponseRate: 0, recommendedSize: 4, finalSampleSize: 4 };
    const [record] = await application.db.update(schema.experiment).set({
        status: "in_progress", currentStage: 4, version: f.experiment.version + 1,
        questionnaire, samplePlan,
        samplingResults: { simple: await replay("simple"), systematic: await replay("systematic") },
        reportContent: `<p>${"报告正文用于验证冻结与提交路径。".repeat(9)}</p>`,
        analysisReferences: [], submissionSnapshot: null, submittedAt: null,
        stage1CompletedAt: new Date(), stage2CompletedAt: new Date(), stage3CompletedAt: new Date(), stage4CompletedAt: new Date(),
    }).where(eq(schema.experiment.id, f.experiment.id)).returning();
    // 与已保存分析共用同一字段解释，来源哈希必须一致，否则引用会被判过期
    const fieldMapping = f.mapping;
    const taskInfo = {
        taskId: f.task.id, topicName: "变量分析", populationSize: 5,
        weightConfig: { questionnaire: 30, process: 30, report: 40 }, fieldMapping,
        excelFilePath: f.storagePath, variableDictionary: f.dictionary, variableRevision: 1,
        className: "分析班级", teacherName: "分析教师",
    };
    return { ...f, record: record!, taskInfo, student: { studentId: "s-r05", name: "学生0" }, savedAnalysisId: saved.id };
}

pgTest("R05 a submit and an upstream reopen serialise into exactly one legal state", async () => {
    for (let round = 0; round < 10; round += 1) {
        const f = await submittableFixture();
        const lock = await holdExperimentRow(f.experiment.id);
        const submitOutcome = submitService.submitStudentExperiment({
            experimentRecord: f.record, observedVersion: f.record.version, taskInfo: f.taskInfo, student: f.student,
        }).then(value => ({ value, error: null }), error => ({ value: null, error }));
        const reopen = updateService.buildStageReopenUpdates({ experimentRecord: f.record, stage: 3, deadlinePassed: false });
        if (!reopen.ok) throw new Error(reopen.message);
        const reopenOutcome = application.db.update(schema.experiment).set(reopen.updates).where(and(
            eq(schema.experiment.id, f.record.id), eq(schema.experiment.version, f.record.version),
            eq(schema.experiment.status, f.record.status), eq(schema.experiment.currentStage, f.record.currentStage),
        )).returning().then(rows => ({ value: rows, error: null }), error => ({ value: null, error }));
        try {
            await waitForBlocked(lock.holderPid);
        } finally {
            await lock.commit();
        }
        const [submitResult, reopenResult] = await Promise.all([submitOutcome, reopenOutcome]);
        const [state] = await application.db.select().from(schema.experiment).where(eq(schema.experiment.id, f.experiment.id));
        const submitWon = submitResult.error === null && (submitResult.value as { ok: boolean }).ok === true;
        const reopenWon = reopenResult.error === null && (reopenResult.value as unknown[]).length === 1;
        expect([submitWon, reopenWon].filter(Boolean), `round ${round}`).toHaveLength(1);
        if (submitWon) {
            expect(state!.status, `round ${round}`).toBe("submitted");
            expect(state!.submissionSnapshot, `round ${round}`).toBeTruthy();
            expect(state!.samplingGeneration, `round ${round}`).toBe(f.record.samplingGeneration);
        } else {
            expect(state!.status, `round ${round}`).toBe("in_progress");
            expect(state!.currentStage, `round ${round}`).toBe(3);
            expect(state!.analysisReferences, `round ${round}`).toEqual([]);
            expect(state!.samplingGeneration, `round ${round}`).toBe(f.record.samplingGeneration + 1);
            expect(state!.submissionSnapshot, `round ${round}`).toBeNull();
        }
    }
}, 40_000);

pgTest("R05 an admitted reopen invalidates a later submit and a committed submit blocks the reopen", async () => {
    // 顺序一：重开先提交完成，随后以旧版本提交必须失败
    const first = await submittableFixture();
    const lock = await holdExperimentRow(first.experiment.id);
    const reopen = updateService.buildStageReopenUpdates({ experimentRecord: first.record, stage: 3, deadlinePassed: false });
    if (!reopen.ok) throw new Error(reopen.message);
    const reopenPending = (async () => application.db.update(schema.experiment).set(reopen.updates).where(eq(schema.experiment.id, first.record.id)))();
    try {
        await waitForBlocked(lock.holderPid);
    } finally {
        await lock.commit();
    }
    await reopenPending;
    const staleSubmit = await submitService.submitStudentExperiment({ experimentRecord: first.record, observedVersion: first.record.version, taskInfo: first.taskInfo, student: first.student });
    expect(staleSubmit).toMatchObject({ ok: false });
    const [afterReopen] = await application.db.select().from(schema.experiment).where(eq(schema.experiment.id, first.experiment.id));
    expect(afterReopen!.status).toBe("in_progress");
    expect(afterReopen!.submissionSnapshot).toBeNull();

    // 顺序二：提交先完成，随后的重开（基于旧版本）不能产生任何状态
    const second = await submittableFixture();
    const submitted = await submitService.submitStudentExperiment({ experimentRecord: second.record, observedVersion: second.record.version, taskInfo: second.taskInfo, student: second.student });
    expect(submitted).toMatchObject({ ok: true });
    const lateReopen = updateService.buildStageReopenUpdates({ experimentRecord: second.record, stage: 3, deadlinePassed: false });
    if (!lateReopen.ok) throw new Error(lateReopen.message);
    const lateRows = await application.db.update(schema.experiment).set(lateReopen.updates).where(and(
        eq(schema.experiment.id, second.record.id), eq(schema.experiment.version, second.record.version),
        eq(schema.experiment.status, second.record.status), eq(schema.experiment.currentStage, second.record.currentStage),
    )).returning();
    expect(lateRows).toHaveLength(0);
    const [afterSubmit] = await application.db.select().from(schema.experiment).where(eq(schema.experiment.id, second.experiment.id));
    expect(afterSubmit!.status).toBe("submitted");
    expect((afterSubmit!.submissionSnapshot as { reportContent?: string }).reportContent).toContain("报告正文用于验证冻结与提交路径");
}, 30_000);

pgTest("R07 the frozen appendix never counts toward report length and reference-free submits stay valid", async () => {
    const f = await submittableFixture();
    const reload = async () => (await application.db.select().from(schema.experiment).where(eq(schema.experiment.id, f.experiment.id)))[0]!;

    // 正文 99 字 + 长附录：必须以正文字数拒绝，不以附录补齐
    await application.db.update(schema.experiment).set({ reportContent: `<p>${"字".repeat(99)}</p>`, analysisReferences: [f.savedAnalysisId] }).where(eq(schema.experiment.id, f.experiment.id));
    const shortRecord = await reload();
    expect(await submitService.submitStudentExperiment({ experimentRecord: shortRecord, observedVersion: shortRecord.version, taskInfo: f.taskInfo, student: f.student })).toMatchObject({ ok: false, code: "INCOMPLETE" });
    const [short] = await application.db.select().from(schema.experiment).where(eq(schema.experiment.id, f.experiment.id));
    expect(short!.status).toBe("in_progress");
    expect(short!.submissionSnapshot).toBeNull();

    // 正文 100 字 + 同一长附录：提交成功且附录随快照冻结
    await application.db.update(schema.experiment).set({ reportContent: `<p>${"字".repeat(100)}</p>` }).where(eq(schema.experiment.id, f.experiment.id));
    const record = await reload();
    expect(await submitService.submitStudentExperiment({ experimentRecord: record, observedVersion: record.version, taskInfo: f.taskInfo, student: f.student })).toMatchObject({ ok: true });
    const [submitted] = await application.db.select().from(schema.experiment).where(eq(schema.experiment.id, f.experiment.id));
    const snapshot = submitted!.submissionSnapshot as {
        reportContent: string;
        analysisAppendices: Array<{ id: number; evidence: unknown }>;
        targetMetrics: {
            confidenceLevel: string;
            unit: string;
            populationValue: number;
            methods: { simple: { estimate: number; standardError: number; marginOfError: number; sampleSize: number } };
        };
    };
    expect(snapshot.reportContent).toBe(`<p>${"字".repeat(100)}</p>`);
    expect(snapshot.analysisAppendices.map(item => item.id)).toEqual([f.savedAnalysisId]);
    expect(JSON.stringify(snapshot.analysisAppendices[0]!.evidence)).toContain("长附录");
    expect(snapshot.targetMetrics.unit).toBe("points");
    expect(snapshot.targetMetrics.confidenceLevel).toBe("95");
    expect(snapshot.targetMetrics.populationValue).toBe(30);
    expect(snapshot.targetMetrics.methods.simple.sampleSize).toBe(4);
    const sampledValues = (f.record.samplingResults as { simple: { indices: number[] } }).simple.indices.map(index => [10, 20, 30, 40, 50][index]!);
    const expectedMean = sampledValues.reduce((sum, value) => sum + value, 0) / sampledValues.length;
    // 教学系统拥有完整虚拟总体，因此设计 SE 使用已知总体 S²=250，而不是样本方差估计。
    const expectedStandardError = Math.sqrt((1 - sampledValues.length / 5) * 250 / sampledValues.length);
    expect(snapshot.targetMetrics.methods.simple.estimate).toBeCloseTo(expectedMean, 12);
    expect(snapshot.targetMetrics.methods.simple.standardError).toBeCloseTo(expectedStandardError, 12);
    expect(snapshot.targetMetrics.methods.simple.marginOfError).toBeCloseTo(1.96 * expectedStandardError, 12);

    const studentToken = await session(3, f.students[0]!.id);
    const teacherToken = await session(2, f.cls.teacherId);
    const { submissionByTaskRoutes } = await import("../student/routes/submissions");
    const { gradingDetailRoutes } = await import("../teacher/routes/grading");
    const { withTeacherAuth } = await import("../teacher/routes/auth");
    const studentResponse = await submissionByTaskRoutes.GET!(routeRequest("GET", { id: String(f.task.id) }, { cookie: `student_session=${studentToken}` }));
    expect(studentResponse.status).toBe(200);
    const studentBody = await studentResponse.json() as { data: { snapshot: { targetMetrics: unknown } } };
    expect(studentBody.data.snapshot.targetMetrics).toEqual(snapshot.targetMetrics);
    const teacherResponse = await withTeacherAuth(gradingDetailRoutes).GET!(routeRequest("GET", { id: String(f.experiment.id) }, { cookie: `teacher_session=${teacherToken}` }));
    expect(teacherResponse.status).toBe(200);
    const teacherBody = await teacherResponse.json() as { data: { targetMetrics: unknown } };
    expect(teacherBody.data.targetMetrics).toEqual(snapshot.targetMetrics);

    // 不引用任何分析仍可提交
    const empty = await submittableFixture();
    await application.db.update(schema.experiment).set({ analysisReferences: [] }).where(eq(schema.experiment.id, empty.experiment.id));
    const [emptyRecord] = await application.db.select().from(schema.experiment).where(eq(schema.experiment.id, empty.experiment.id));
    expect(await submitService.submitStudentExperiment({ experimentRecord: emptyRecord!, observedVersion: emptyRecord!.version, taskInfo: empty.taskInfo, student: empty.student })).toMatchObject({ ok: true });
    const [emptySubmitted] = await application.db.select().from(schema.experiment).where(eq(schema.experiment.id, empty.experiment.id));
    expect((emptySubmitted!.submissionSnapshot as { analysisAppendices: unknown[] }).analysisAppendices).toEqual([]);
}, 30_000);

pgTest("F-R1-01 mean planning variance is verified against the current population at stage 2", async () => {
    const f = await fixture();
    // 回到可完成阶段 2 的状态（阶段 1 已完成），随后走真实路由。
    await application.db.update(schema.experiment).set({
        currentStage: 2, status: "in_progress", version: f.experiment.version + 1,
        stage1CompletedAt: new Date(), stage2CompletedAt: null, stage3CompletedAt: null, stage4CompletedAt: null,
        samplePlan: null, samplingResults: null, reportContent: null, analysisReferences: [],
        questionnaire: {
            title: "方差复核", welcomeText: "欢迎参加本次方差复核预试，请按真实情况回答所有问题，答案只用于课堂试填。",
            endingText: "感谢参与本次试填，结果不会进入估计或报告。",
            questions: Array.from({ length: 5 }, (_, index) => ({ id: `q${index}`, type: "boolean", content: `第${index + 1}题是否完成？` })),
        },
    }).where(eq(schema.experiment.id, f.experiment.id));
    const token = await session(3, f.students[0]!.id);
    const { stageCompleteRoutes } = await import("../student/routes/experiment");
    const { buildPopulationNumericStats } = await import("../domain/statistics/population");
    const { calculateMeanEstimationSampleSize } = await import("../student/experiment/sample-plan");
    const reload = async () => (await application.db.select().from(schema.experiment).where(eq(schema.experiment.id, f.experiment.id)))[0]!;
    const loaded = await variableSource.readVariableSource(f.storagePath, f.mapping);
    const rawVariance = buildPopulationNumericStats(loaded.rows, ["value"])["value"]!;
    const actualVariance = rawVariance.variance * (rawVariance.count - 1) / rawVariance.count;
    const planFor = (variance: number) => {
        const recommendedSize = calculateMeanEstimationSampleSize({ confidenceLevel: "95", marginOfError: 10, populationSize: 5, populationVariance: variance, designEffect: 1, nonResponseRate: 0 })!;
        return { estimationType: "mean", confidenceLevel: "95", marginOfError: 10, populationVariance: variance, designEffect: 1, nonResponseRate: 0, recommendedSize, finalSampleSize: recommendedSize };
    };
    const complete = async (variance: number) => {
        const current = await reload();
        return stageCompleteRoutes.POST!(routeRequest("POST", { id: String(f.task.id), stage: "2" }, { cookie: `student_session=${token}`, body: { observedVersion: current.version, samplePlan: planFor(variance) } }));
    };
    const forged = await complete(1e-6);
    expect(forged.status).toBe(400);
    expect(await forged.json()).toMatchObject({ error: { message: expect.stringContaining("总体方差与当前总体不一致") } });
    expect((await reload()).stage2CompletedAt).toBeNull();
    const accepted = await complete(actualVariance);
    expect(accepted.status).toBe(200);
    expect((await reload()).stage2CompletedAt).not.toBeNull();
}, 30_000);

pgTest("F-R1-01 submit re-checks the mean planning variance after a forged update", async () => {
    const f = await submittableFixture();
    const { calculateMeanEstimationSampleSize } = await import("../student/experiment/sample-plan");
    const reload = async () => (await application.db.select().from(schema.experiment).where(eq(schema.experiment.id, f.experiment.id)))[0]!;
    const original = await reload();
    const truePlan = original.samplePlan as Record<string, unknown>;
    const forgedRecommended = calculateMeanEstimationSampleSize({ confidenceLevel: "95", marginOfError: 10, populationSize: 5, populationVariance: 1e-6, designEffect: 1, nonResponseRate: 0 })!;
    // 保留真实目标样本量（抽样结果需与其一致），只伪造方差与建议样本量。
    await application.db.update(schema.experiment).set({ samplePlan: { ...truePlan, populationVariance: 1e-6, recommendedSize: forgedRecommended, finalSampleSize: truePlan.finalSampleSize } }).where(eq(schema.experiment.id, f.experiment.id));
    const forgedRecord = await reload();
    const rejected = await submitService.submitStudentExperiment({ experimentRecord: forgedRecord, observedVersion: forgedRecord.version, taskInfo: f.taskInfo, student: f.student });
    expect(rejected).toMatchObject({ ok: false, code: "INCOMPLETE" });
    if (rejected.ok) throw new Error("expected the forged plan to be rejected");
    expect(rejected.message).toContain("总体方差与当前总体不一致");
    expect((await reload()).status).toBe("in_progress");
    await application.db.update(schema.experiment).set({ samplePlan: truePlan }).where(eq(schema.experiment.id, f.experiment.id));
    const restoredRecord = await reload();
    expect(await submitService.submitStudentExperiment({ experimentRecord: restoredRecord, observedVersion: restoredRecord.version, taskInfo: f.taskInfo, student: f.student })).toMatchObject({ ok: true });
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
