import { expect, mock, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { assertTestDatabaseIsMigrated } from "./test-database-guard";
import * as schema from "./schema";
import { parseSpreadsheetFile } from "@/lib/spreadsheet";
import { suggestVariableDictionary } from "@/domain/experiment/variable-dictionary";
import { dictionaryDatasetRevision } from "@/server/variable-dictionary";
import { executeSamplingAction } from "@/student/experiment/sampling-service";
import type { ResearchSpec } from "@/domain/experiment/research-analysis";
import type { ResearchJob } from "@/student/experiment/research-job";
const required = process.env.REQUIRE_TEST_DATABASE === "1";
if (required && !process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is required for research DB tests");
const pgTest = required ? test : test.skip;
pgTest("research records have real PostgreSQL idempotency, CAS/source/class guards, strict envelopes and cascade cleanup", async () => {
    const dir = `/tmp/wj-research-db-${crypto.randomUUID()}`;
    mock.module("@/server/storage-files", () => ({ resolveStoragePath: (path: string) => `${dir}/${path}` }));
    const previousUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const { db, sqlClient, closeDatabase } = await import("./index");
    const { saveResearchRun, listResearchRuns } = await import("@/student/experiment/research-service");
    const { collectResearchReferences } = await import("@/student/experiment/research-records");
    const { runResearchJob } = await import("@/student/experiment/research-job");
    const uuid = crypto.randomUUID(); let teacherId: number | undefined, semesterId: number | undefined, topicId: number | undefined;
    const classIds: number[] = [], studentIds: number[] = [], taskIds: number[] = [];
    try {
        await assertTestDatabaseIsMigrated(sqlClient);
        const bytes = new TextEncoder().encode("id,x,group\n01,1,A\n02,2,B\n03,3,A\n04,4,B\n");
        await Bun.write(`${dir}/data.csv`, bytes);
        const mapping = { identifier: "id", numeric: ["x"], others: ["group"] };
        const population = await parseSpreadsheetFile(bytes.buffer, "data.csv", { numericFields: mapping.numeric });
        const dictionary = { ...suggestVariableDictionary({ columns: population.columns, rows: population.rows, identifier: "id", numeric: ["x"], datasetRevision: dictionaryDatasetRevision(bytes.buffer, "data.csv", mapping) }), revision: 1 };
        teacherId = (await db.insert(schema.teacher).values({ employeeId: `RA-${uuid}`, name: "DB研究验收", password: "test-only" }).returning())[0]!.id;
        semesterId = (await db.insert(schema.semester).values({ name: `RA-${uuid.slice(0, 8)}` }).returning())[0]!.id;
        for (const name of ["A", "B"]) classIds.push((await db.insert(schema.class_).values({ name, semesterId, teacherId }).returning())[0]!.id);
        studentIds.push((await db.insert(schema.student).values({ studentId: `RA-${uuid}`, name: "DB学生", password: "test-only", classId: classIds[0]! }).returning())[0]!.id);
        topicId = (await db.insert(schema.topic).values({ name: "研究成果验收", teacherId, status: 1, excelFilePath: "data.csv", excelRowCount: 4, fieldMapping: mapping, variableDictionary: dictionary, variableDictionaryRevision: 1 }).returning())[0]!.id;
        taskIds.push((await db.insert(schema.task).values({ topicId, classId: classIds[0]! }).returning())[0]!.id);
        const sampled = await executeSamplingAction({ method: "simple", rawParams: { sampleSize: 4, seed: 41 }, targetSampleSize: 4, population: population.rows, fieldMapping: mapping });
        if (!sampled.ok) throw new Error(sampled.errorMessage); const { data, ...section } = sampled.result;
        const at = new Date();
        const [record] = await db.insert(schema.experiment).values({ studentId: studentIds[0]!, taskId: taskIds[0]!, currentStage: 4, samplingRevision: 1, stage1CompletedAt: at, stage2CompletedAt: at, stage3CompletedAt: at,
            questionnaire: { title: "研究验收", welcomeText: "欢迎参加本次认知预试，请核对问卷表达，既有总体数据并不是试填答案。", endingText: "感谢完成本次认知预试，请明确确认结束，试填答案不会作为样本数据。", questions: Array.from({ length: 5 }, (_, i) => ({ id: `q${i}`, type: "boolean", content: "是否理解这次认知预试？" })) }, samplingResults: { simple: section }, reportContent: "保留的报告内容" }).returning();
        expect(record!.analysisReferences).toEqual([]);
        const spec: ResearchSpec = { schemaVersion: 1, method: "simple", variableId: "v_2", question: "实际样本均值是多少？", mode: "raw" };
        const request = { studentId: studentIds[0]!, taskId: taskIds[0]!, observedVersion: 1, requestKey: `r_${"a".repeat(32)}`, spec, authorize: async () => {} };
        const worker = { run: (job: ResearchJob) => runResearchJob(job) };
        const [one, two] = await Promise.all([saveResearchRun(request, worker), saveResearchRun(request, worker)]);
        expect(one.run.id).toBe(two.run.id); expect(one.run.result.mean).toBe(2.5);
        expect((await db.select().from(schema.researchAnalysisRun).where(eq(schema.researchAnalysisRun.experimentId, record!.id))).length).toBe(1);
        const [unchanged] = await db.select().from(schema.experiment).where(eq(schema.experiment.id, record!.id));
        expect(unchanged).toEqual(record);
        await expect(saveResearchRun({ ...request, spec: { ...spec, mode: "design-weighted" } }, worker)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
        expect((await collectResearchReferences(record!, dictionary, [one.run.id]))[0]).toEqual(one.run);
        await expect(collectResearchReferences(record!, dictionary, [crypto.randomUUID()])).rejects.toMatchObject({ code: "STALE_RESEARCH_REFERENCE" });
        async function constraint(op: () => PromiseLike<unknown>, errno: string) {
            try { await op(); throw new Error("expected PostgreSQL rejection"); } catch (cause) { expect((cause as any).cause?.errno ?? (cause as any).errno).toBe(errno); }
        }
        const duplicateId = crypto.randomUUID();
        await constraint(() => db.insert(schema.researchAnalysisRun).values({ id: duplicateId, experimentId: record!.id, requestKey: request.requestKey, inputVersion: 1, specHash: "c".repeat(64), document: { ...one.run, id: duplicateId } }), "23505");
        await constraint(() => db.execute(sql`update ${schema.researchAnalysisRun} set document=jsonb_set(document,'{schemaVersion}','null'::jsonb) where id=${one.run.id}`), "23514");
        await constraint(() => db.execute(sql`update ${schema.experiment} set analysis_references=to_jsonb('[]'::text) where id=${record!.id}`), "23514");
        let version = 1;
        for (const mutation of ["class", "source", "submit"] as const) {
            const ready = Promise.withResolvers<void>(), resume = Promise.withResolvers<void>();
            const pending = saveResearchRun({ ...request, observedVersion: version, requestKey: `r_${crypto.randomUUID().replaceAll("-", "")}` }, { run: async (job: ResearchJob) => { const result = await runResearchJob(job); ready.resolve(); await resume.promise; return result; } });
            // Attach rejection immediately; the controlled mutation happens outside the worker transaction.
            const outcome = pending.then(value => ({ value }), cause => ({ cause }));
            await ready.promise;
            if (mutation === "class") await db.update(schema.student).set({ classId: classIds[1]! }).where(eq(schema.student.id, studentIds[0]!));
            if (mutation === "source") await Bun.write(`${dir}/data.csv`, new TextDecoder().decode(bytes).replace("01,1", "01,9"));
            if (mutation === "submit") { await db.update(schema.experiment).set({ status: "submitted", version: ++version }).where(eq(schema.experiment.id, record!.id)); }
            resume.resolve(); const result = await outcome; expect("cause" in result).toBe(true);
            if (mutation === "class") await db.update(schema.student).set({ classId: classIds[0]! }).where(eq(schema.student.id, studentIds[0]!));
            if (mutation === "source") await Bun.write(`${dir}/data.csv`, bytes);
            if (mutation === "submit") await db.update(schema.experiment).set({ status: "in_progress", version: ++version }).where(eq(schema.experiment.id, record!.id));
            expect((await db.select().from(schema.researchAnalysisRun).where(eq(schema.researchAnalysisRun.experimentId, record!.id))).length).toBe(1);
        }
        expect((await listResearchRuns(request.studentId, request.taskId, request.authorize)).runs[0]!.current).toBe(true);
        await db.update(schema.experiment).set({ version: ++version, samplingRevision: version }).where(eq(schema.experiment.id, record!.id));
        expect((await listResearchRuns(request.studentId, request.taskId, request.authorize)).runs[0]!.current).toBe(false); // Same timestamp and exact sample, new monotone completion.
        const [newRecord] = await db.select().from(schema.experiment).where(eq(schema.experiment.id, record!.id));
        await expect(collectResearchReferences(newRecord!, dictionary, [one.run.id])).rejects.toMatchObject({ code: "STALE_RESEARCH_REFERENCE" });
        for (let i = 0; i < 29; i++) { const id = crypto.randomUUID(); await db.insert(schema.researchAnalysisRun).values({ id, experimentId: record!.id, requestKey: `r_${i.toString(16).padStart(32, "0")}`, inputVersion: 1, specHash: "d".repeat(64), document: { ...one.run, id } }); }
        await expect(saveResearchRun({ ...request, observedVersion: version, requestKey: `r_${"b".repeat(32)}` }, worker)).rejects.toMatchObject({ code: "RESEARCH_LIMIT" });
        await db.delete(schema.experiment).where(eq(schema.experiment.id, record!.id));
        expect(await db.select().from(schema.researchAnalysisRun).where(eq(schema.researchAnalysisRun.experimentId, record!.id))).toEqual([]);
    } finally {
        for (const id of taskIds) await db.delete(schema.task).where(eq(schema.task.id, id));
        for (const id of studentIds) await db.delete(schema.student).where(eq(schema.student.id, id));
        if (topicId) await db.delete(schema.topic).where(eq(schema.topic.id, topicId));
        for (const id of classIds) await db.delete(schema.class_).where(eq(schema.class_.id, id));
        if (semesterId) await db.delete(schema.semester).where(eq(schema.semester.id, semesterId));
        if (teacherId) await db.delete(schema.teacher).where(eq(schema.teacher.id, teacherId));
        await closeDatabase(); process.env.DATABASE_URL = previousUrl; await Bun.$`rm -rf ${dir}`.quiet();
    }
}, 30_000);
