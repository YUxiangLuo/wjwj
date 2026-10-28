import { and, eq, inArray } from "drizzle-orm";
import { db, closeDatabase } from "../src/db";
import { experiment, samplingAttempt, student, task, teacher, topic } from "../src/db/schema";
import { validateDatabaseConfirmation } from "../src/db/destructive-confirmation";
import { acquireStorageMutationLock } from "../src/db/storage-mutation-lock";
import { createYouthHappinessPopulation, DOGFOOD_NAMES, HAPPINESS_POPULATION_PATH } from "../src/db/seeds/dogfood-fixtures";
import { createHappinessDictionary, happinessFieldMapping, happinessQuestionnaire, HAPPINESS_DESCRIPTION } from "../src/db/seeds/happiness-topic";
import { buildHappinessWorkbook } from "../src/db/seeds/happiness-materials";
import { validateDictionary } from "../src/domain/variables/dictionary";
import { readVariableSource } from "../src/server/variable-source";
import { resolveStoragePath } from "../src/server/storage-files";
import { deleteAuditEventsForEntities } from "../src/server/audit-event";
import { clearUserSessionsForUser } from "../src/server/user-session";
import { STUDENT_USER_TYPE } from "../src/student/routes/auth";
import { ensureImmutableFile } from "./immutable-file";

// Run only during a maintenance window after a paired database/storage backup.
// Default is read-only; --apply additionally requires the exact database name.
async function refresh() {
    if (process.env.DEMO_MODE !== "1") throw new Error("仅允许在 DEMO_MODE=1 的演示环境更新");
    const apply = process.argv.includes("--apply");
    if (process.argv.slice(2).some(arg => arg !== "--apply")) throw new Error("用法：bun scripts/refresh-happiness-demo.ts [--apply]");
    if (apply) {
        const confirmation = validateDatabaseConfirmation(process.env.DATABASE_URL ?? "", process.env.CONFIRM_DATABASE_NAME);
        if (confirmation) throw new Error(confirmation);
    }
    const result = await db.transaction(async tx => {
        await acquireStorageMutationLock(tx);
        const matches = await tx.select({ id: topic.id, path: topic.excelFilePath, revision: topic.variableRevision })
            .from(topic).innerJoin(teacher, eq(teacher.id, topic.teacherId))
            .where(and(eq(topic.name, DOGFOOD_NAMES.topicA), eq(teacher.employeeId, "T001"))).for("update", { of: topic });
        if (matches.length !== 1) throw new Error("必须恰好匹配 T001 的一个青年幸福感演示课题");
        const selected = matches[0]!;
        if (!["/storage/topics/seed-population-youth-happiness.xlsx", "/storage/topics/seed-population-youth-happiness-v2.xlsx", HAPPINESS_POPULATION_PATH].includes(selected.path ?? "")) {
            throw new Error("总体文件不是已知 seed 文件，拒绝覆盖教师自定义课题");
        }
        const tasks = await tx.select({ id: task.id, classId: task.classId }).from(task).where(eq(task.topicId, selected.id)).for("update");
        const taskIds = tasks.map(row => row.id);
        const records = taskIds.length ? await tx.select({ id: experiment.id, status: experiment.status }).from(experiment)
            .where(inArray(experiment.taskId, taskIds)).for("update") : [];
        const preview = { topicId: selected.id, taskIds, resetExperiments: records.length,
            statuses: records.reduce<Record<string, number>>((counts, row) => { counts[row.status] = (counts[row.status] ?? 0) + 1; return counts; }, {}),
            populationRows: 240, variables: 14, recommendedQuestions: 14, populationPath: HAPPINESS_POPULATION_PATH };
        console.log(JSON.stringify({ mode: apply ? "apply" : "preview", ...preview }));
        if (!apply) return;

        const target = resolveStoragePath(HAPPINESS_POPULATION_PATH);
        const bytes = buildHappinessWorkbook(createYouthHappinessPopulation());
        await ensureImmutableFile(target, bytes);
        const source = await readVariableSource(HAPPINESS_POPULATION_PATH, happinessFieldMapping);
        const dictionary = validateDictionary(createHappinessDictionary(source.source, selected.revision + 1), source.rows, source.source);
        const ids = records.map(row => row.id);
        const attempts = ids.length ? await tx.select({ id: samplingAttempt.id }).from(samplingAttempt).where(inArray(samplingAttempt.experimentId, ids)) : [];
        if (ids.length) await tx.delete(experiment).where(inArray(experiment.id, ids));
        await deleteAuditEventsForEntities(tx, "sampling_attempt", attempts.map(row => row.id));
        await deleteAuditEventsForEntities(tx, "experiment", ids);
        await tx.update(topic).set({
            description: HAPPINESS_DESCRIPTION, excelFilePath: HAPPINESS_POPULATION_PATH,
            excelRowCount: 240, fieldMapping: happinessFieldMapping,
            recommendQuestions: happinessQuestionnaire.questions,
            variableDictionary: dictionary, variableRevision: dictionary.revision, updatedAt: new Date(),
        }).where(eq(topic.id, selected.id));
        // Old student tabs must not write a pre-reset draft back into a fresh run.
        const affectedStudents = tasks.length ? await tx.select({ id: student.id }).from(student)
            .where(inArray(student.classId, tasks.map(row => row.classId))) : [];
        for (const row of affectedStudents) await clearUserSessionsForUser(STUDENT_USER_TYPE, row.id, tx);
        return { updated: true, resetExperiments: ids.length, revokedStudentSessionsFor: affectedStudents.length, dictionaryRevision: dictionary.revision };
    });
    if (result) console.log(JSON.stringify(result));
}

try { await refresh(); }
catch (cause) { console.error(cause); process.exitCode = 1; }
finally { await closeDatabase(); }
