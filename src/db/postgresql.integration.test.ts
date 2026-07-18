import { SQL } from "bun";
import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import * as schema from "./schema";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
if (process.env.REQUIRE_TEST_DATABASE === "1" && !testDatabaseUrl) {
    throw new Error("TEST_DATABASE_URL is required for bun run test:db");
}
const postgresqlTest = testDatabaseUrl ? test : test.skip;

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
    let taskId: number | undefined;
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
            .values({ name: semesterName })
            .returning({ id: schema.semester.id });
        semesterId = createdSemester!.id;
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
            .values({ teacherId, name: "PostgreSQL topic", status: 1 })
            .returning({ id: schema.topic.id });
        topicId = createdTopic!.id;
        const [createdTask] = await database
            .insert(schema.task)
            .values({ topicId, classId })
            .returning({ id: schema.task.id });
        taskId = createdTask!.id;

        const [createdExperiment] = await database
            .insert(schema.experiment)
            .values({ studentId, taskId })
            .returning({ id: schema.experiment.id, version: schema.experiment.version });
        expect(createdExperiment?.version).toBe(1);

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

        process.env.DATABASE_URL = testDatabaseUrl!;
        const [{ listTeacherTasks }, applicationDatabase] = await Promise.all([
            import("../teacher/topic/query-service"),
            import("./index"),
        ]);
        closeApplicationDatabase = applicationDatabase.closeDatabase;
        const taskRows = await listTeacherTasks(teacherId);
        const taskRow = taskRows.find((row) => row.id === taskId);
        expect(taskRow).toMatchObject({
            topic: "PostgreSQL topic",
            className: "PostgreSQL class",
            total: 1,
            completed: 0,
            pending: 0,
        });
    } finally {
        await closeApplicationDatabase?.();
        if (taskId) await database.delete(schema.task).where(eq(schema.task.id, taskId));
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
