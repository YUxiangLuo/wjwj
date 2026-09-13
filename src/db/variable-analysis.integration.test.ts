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
    return { semester: semester!, cls: cls!, students, task: task!, experiment: experiment!, dictionary, body };
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
