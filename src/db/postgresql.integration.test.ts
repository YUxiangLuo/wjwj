import { SQL } from "bun";
import { expect, test } from "bun:test";
import { and, count, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import * as schema from "./schema";
import { buildAtomicFailedLoginUpdate } from "../server/login-lockout";
import { MAX_SAMPLING_ATTEMPTS_PER_EXPERIMENT, trimSamplingAttempts } from "../student/experiment/sampling-attempt-retention";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
const requireTestDatabase = process.env.REQUIRE_TEST_DATABASE === "1";
if (requireTestDatabase && !testDatabaseUrl) {
    throw new Error("TEST_DATABASE_URL is required for bun run test:db");
}
// Database integration must run in its dedicated command/process. Running it
// inside the broad unit suite allows unrelated mock.module() registrations to
// replace the real database client before the concurrency assertions execute.
const postgresqlTest = requireTestDatabase ? test : test.skip;

postgresqlTest("PostgreSQL preserves the application database contract", async () => {
    const sqlClient = new SQL(testDatabaseUrl!);
    const database = drizzle(sqlClient, { schema });
    const suffix = crypto.randomUUID();
    const username = `PgCase_${suffix}`;
    const sessionToken = `integration-${suffix}`;
    const employeeId = `PG-${suffix}`;
    const semesterName = `PG-${suffix.slice(0, 8)}`;
    const studentNumber = `PG student ${suffix}`;
    let teacherId: number | undefined;
    let semesterId: number | undefined;
    let classId: number | undefined;
    let studentId: number | undefined;
    let topicId: number | undefined;
    let unassignedTopicId: number | undefined;
    let taskId: number | undefined;
    let raceTaskId: number | undefined;
    let closeApplicationDatabase: (() => Promise<void>) | undefined;

    try {
        const [createdAdmin] = await database
            .insert(schema.admin)
            .values({ username, password: "initial-password" })
            .returning({
                id: schema.admin.id,
                createdAt: schema.admin.createdAt,
                updatedAt: schema.admin.updatedAt,
            });

        expect(createdAdmin?.id).toBeNumber();

        const [caseInsensitiveAdmin] = await database
            .select({ id: schema.admin.id })
            .from(schema.admin)
            .where(eq(schema.admin.username, username.toUpperCase()));
        expect(caseInsensitiveAdmin?.id).toBe(createdAdmin!.id);

        const explicitUpdatedAt = new Date(createdAdmin!.updatedAt.getTime() + 1_000);
        const [updatedAdmin] = await database
            .update(schema.admin)
            .set({ password: "updated-password", updatedAt: explicitUpdatedAt })
            .where(eq(schema.admin.id, createdAdmin!.id))
            .returning({ updatedAt: schema.admin.updatedAt });
        expect(updatedAdmin!.updatedAt.toISOString()).toBe(explicitUpdatedAt.toISOString());

        const failureTime = new Date("2029-06-01T12:00:00.000Z");
        await Promise.all(Array.from({ length: 5 }, () =>
            database
                .update(schema.admin)
                .set(buildAtomicFailedLoginUpdate(schema.admin, failureTime))
                .where(eq(schema.admin.id, createdAdmin!.id))
        ));
        const [lockedAdmin] = await database
            .select({ loginFailCount: schema.admin.loginFailCount, lockedUntil: schema.admin.lockedUntil })
            .from(schema.admin)
            .where(eq(schema.admin.id, createdAdmin!.id));
        expect(lockedAdmin?.loginFailCount).toBe(5);
        expect(lockedAdmin?.lockedUntil?.toISOString()).toBe("2029-06-01T12:30:00.000Z");

        const expiresAt = new Date("2030-06-01T12:34:56.789Z");
        await database.insert(schema.userSession).values({
            sessionToken,
            userType: 1,
            userId: createdAdmin!.id,
            expiresAt,
        });
        const [session] = await database
            .select({ expiresAt: schema.userSession.expiresAt })
            .from(schema.userSession)
            .where(eq(schema.userSession.sessionToken, sessionToken));
        expect(session?.expiresAt.toISOString()).toBe(expiresAt.toISOString());

        const [createdTeacher] = await database
            .insert(schema.teacher)
            .values({ employeeId, name: "PostgreSQL teacher", password: "test-password" })
            .returning({ id: schema.teacher.id });
        teacherId = createdTeacher!.id;
        const [createdSemester] = await database
            .insert(schema.semester)
            .values({ name: semesterName, isCurrent: 1 })
            .returning({ id: schema.semester.id });
        semesterId = createdSemester!.id;
        let duplicateCurrentRejected = false;
        try {
            await database.insert(schema.semester).values({
                name: `${semesterName}-duplicate-current`,
                isCurrent: 1,
            });
        } catch {
            duplicateCurrentRejected = true;
        }
        expect(duplicateCurrentRejected).toBe(true);
        const [createdClass] = await database
            .insert(schema.class_)
            .values({ name: "PostgreSQL class", semesterId, teacherId })
            .returning({ id: schema.class_.id });
        classId = createdClass!.id;
        const [createdStudent] = await database
            .insert(schema.student)
            .values({
                studentId: studentNumber,
                name: "PostgreSQL student",
                password: "test-password",
                classId,
            })
            .returning({ id: schema.student.id });
        studentId = createdStudent!.id;
        const [createdTopic] = await database
            .insert(schema.topic)
            .values({
                teacherId,
                name: "PostgreSQL topic",
                status: 1,
                fieldMapping: { identifier: "student_id", numeric: ["score"] },
                weightConfig: { questionnaire: 30, process: 30, report: 40 },
                recommendQuestions: [{ id: "q1", type: "boolean", content: "测试题" }],
            })
            .returning({ id: schema.topic.id });
        topicId = createdTopic!.id;
        const [createdUnassignedTopic] = await database
            .insert(schema.topic)
            .values({ teacherId, name: "PostgreSQL unassigned topic", status: 0 })
            .returning({ id: schema.topic.id });
        unassignedTopicId = createdUnassignedTopic!.id;
        const [createdTask] = await database
            .insert(schema.task)
            .values({ topicId, classId })
            .returning({ id: schema.task.id });
        taskId = createdTask!.id;

        const [createdExperiment] = await database
            .insert(schema.experiment)
            .values({
                studentId,
                taskId,
                questionnaire: { title: "测试问卷", questions: [] },
                samplePlan: { confidenceLevel: "95", marginOfError: 5, finalSampleSize: 10 },
                samplingResults: { simple: { completed: true, data: [] } },
                submissionSnapshot: { studentName: "PostgreSQL student" },
            })
            .returning({ id: schema.experiment.id, version: schema.experiment.version });
        expect(createdExperiment?.version).toBe(1);

        const [createdAttempt] = await database
            .insert(schema.samplingAttempt)
            .values({
                experimentId: createdExperiment!.id,
                method: "simple",
                seed: 2026,
                sampleCount: 2,
                details: { completed: true },
            })
            .returning({ id: schema.samplingAttempt.id, details: schema.samplingAttempt.details });
        expect(createdAttempt?.id).toBeNumber();
        expect(createdAttempt?.details).toEqual({ completed: true });

        await database.insert(schema.samplingAttempt).values(Array.from({ length: 105 }, (_, index) => ({
            experimentId: createdExperiment!.id,
            method: "simple" as const,
            seed: 10_000 + index,
            sampleCount: 2,
            details: { completed: true, index },
        })));
        await trimSamplingAttempts(database, createdExperiment!.id);
        const [retainedAttempts] = await database
            .select({ value: count() })
            .from(schema.samplingAttempt)
            .where(eq(schema.samplingAttempt.experimentId, createdExperiment!.id));
        expect(retainedAttempts?.value).toBe(MAX_SAMPLING_ATTEMPTS_PER_EXPERIMENT);

        const systematicResult = { completed: true, sampleCount: 2, serverGenerated: true };
        await database
            .update(schema.experiment)
            .set({
                samplingResults: sql`jsonb_set(
                    coalesce(${schema.experiment.samplingResults}, '{}'::jsonb),
                    array[${"systematic"}]::text[],
                    ${systematicResult}::jsonb,
                    true
                )`,
            })
            .where(eq(schema.experiment.id, createdExperiment!.id));
        const [mergedSamplingResults] = await database
            .select({ samplingResults: schema.experiment.samplingResults })
            .from(schema.experiment)
            .where(eq(schema.experiment.id, createdExperiment!.id));
        expect(mergedSamplingResults?.samplingResults).toEqual({
            simple: { completed: true, data: [] },
            systematic: { completed: true, sampleCount: 2, serverGenerated: true },
        });

        const [jsonTypes] = await sqlClient`
            SELECT
                jsonb_typeof(t.field_mapping) AS field_mapping_type,
                jsonb_typeof(t.weight_config) AS weight_config_type,
                jsonb_typeof(t.recommend_questions) AS recommend_questions_type,
                jsonb_typeof(e.questionnaire) AS questionnaire_type,
                jsonb_typeof(e.sample_plan) AS sample_plan_type,
                jsonb_typeof(e.sampling_results) AS sampling_results_type,
                jsonb_typeof(e.submission_snapshot) AS submission_snapshot_type
            FROM topic t
            JOIN task tk ON tk.topic_id = t.id
            JOIN experiment e ON e.task_id = tk.id
            WHERE e.id = ${createdExperiment!.id}
        `;
        expect(jsonTypes).toEqual({
            field_mapping_type: "object",
            weight_config_type: "object",
            recommend_questions_type: "array",
            questionnaire_type: "object",
            sample_plan_type: "object",
            sampling_results_type: "object",
            submission_snapshot_type: "object",
        });

        const [nativeJsonRead] = await database
            .select({
                fieldMapping: schema.topic.fieldMapping,
                recommendQuestions: schema.topic.recommendQuestions,
            })
            .from(schema.topic)
            .where(eq(schema.topic.id, topicId));
        expect(nativeJsonRead?.fieldMapping).toEqual({
            identifier: "student_id",
            numeric: ["score"],
        });
        expect(nativeJsonRead?.recommendQuestions).toEqual([
            { id: "q1", type: "boolean", content: "测试题" },
        ]);

        const staleUpdate = await database
            .update(schema.experiment)
            .set({ version: 2 })
            .where(and(
                eq(schema.experiment.id, createdExperiment!.id),
                eq(schema.experiment.version, 0),
            ))
            .returning({ id: schema.experiment.id });
        expect(staleUpdate).toHaveLength(0);

        const [versionedExperiment] = await database
            .update(schema.experiment)
            .set({ version: 2 })
            .where(and(
                eq(schema.experiment.id, createdExperiment!.id),
                eq(schema.experiment.version, 1),
            ))
            .returning({ version: schema.experiment.version });
        expect(versionedExperiment?.version).toBe(2);
        let invalidScoreRejected = false;
        try {
            await database
                .update(schema.experiment)
                .set({ totalScore: "101" })
                .where(eq(schema.experiment.id, createdExperiment!.id));
        } catch {
            invalidScoreRejected = true;
        }
        expect(invalidScoreRejected).toBe(true);

        await database
            .update(schema.topic)
            .set({
                status: 1,
                excelFilePath: `/storage/integration-${suffix}.csv`,
                fieldMapping: { identifier: "student_id", stratified: ["group"], numeric: ["score"] },
                weightConfig: { questionnaire: 30, process: 30, report: 40 },
            })
            .where(eq(schema.topic.id, unassignedTopicId));

        process.env.DATABASE_URL = testDatabaseUrl!;
        const [
            { listTeacherTasks },
            { requireTopicOwner },
            { publishTopicTasks },
            { softDeleteTeacherTopic },
            applicationDatabase,
        ] = await Promise.all([
            import("../teacher/topic/query-service"),
            import("../teacher/topic/access"),
            import("../teacher/topic/task-service"),
            import("../teacher/topic/manage-service"),
            import("./index"),
        ]);
        closeApplicationDatabase = applicationDatabase.closeDatabase;
        expect((await requireTopicOwner(topicId, teacherId))?.hasTasks).toBe(true);
        expect((await requireTopicOwner(unassignedTopicId, teacherId))?.hasTasks).toBe(false);
        const taskRows = await listTeacherTasks(teacherId);
        const taskRow = taskRows.find((row) => row.id === taskId);
        expect(taskRow).toMatchObject({
            topic: "PostgreSQL topic",
            className: "PostgreSQL class",
            total: 1,
            completed: 0,
            pending: 0,
        });

        const [publishRace, deleteRace] = await Promise.all([
            publishTopicTasks({ teacherId, topicId: unassignedTopicId, classIds: [classId] }),
            softDeleteTeacherTopic({ teacherId, topicId: unassignedTopicId }),
        ]);
        const [raceTopic] = await database
            .select({ deletedAt: schema.topic.deletedAt })
            .from(schema.topic)
            .where(eq(schema.topic.id, unassignedTopicId));
        const raceTasks = await database
            .select({ id: schema.task.id })
            .from(schema.task)
            .where(eq(schema.task.topicId, unassignedTopicId));
        raceTaskId = raceTasks[0]?.id;
        expect(Number(publishRace.ok) + Number(deleteRace.ok)).toBe(1);
        expect(Boolean(raceTopic?.deletedAt) && raceTasks.length > 0).toBe(false);
    } finally {
        await closeApplicationDatabase?.();
        if (raceTaskId) await database.delete(schema.task).where(eq(schema.task.id, raceTaskId));
        if (taskId) await database.delete(schema.task).where(eq(schema.task.id, taskId));
        if (unassignedTopicId) await database.delete(schema.topic).where(eq(schema.topic.id, unassignedTopicId));
        if (topicId) await database.delete(schema.topic).where(eq(schema.topic.id, topicId));
        if (studentId) await database.delete(schema.student).where(eq(schema.student.id, studentId));
        if (classId) await database.delete(schema.class_).where(eq(schema.class_.id, classId));
        if (semesterId) await database.delete(schema.semester).where(eq(schema.semester.id, semesterId));
        if (teacherId) await database.delete(schema.teacher).where(eq(schema.teacher.id, teacherId));
        await database.delete(schema.userSession).where(eq(schema.userSession.sessionToken, sessionToken));
        await database.delete(schema.admin).where(eq(schema.admin.username, username));
        await sqlClient.close();
    }
});
