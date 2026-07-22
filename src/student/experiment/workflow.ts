import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { experiment } from "../../db/schema";
import { ExperimentStatus } from "./status";

export async function getOrCreateStudentExperiment(studentId: number, taskId: number) {
    let [record] = await db
        .select()
        .from(experiment)
        .where(and(eq(experiment.studentId, studentId), eq(experiment.taskId, taskId)));

    if (record) {
        return record;
    }

    const [created] = await db
        .insert(experiment)
        .values({
            studentId,
            taskId,
            currentStage: 1,
            status: ExperimentStatus.IN_PROGRESS,
        })
        .onConflictDoNothing({ target: [experiment.studentId, experiment.taskId] })
        .returning();

    if (created) {
        return created;
    }

    [record] = await db
        .select()
        .from(experiment)
        .where(and(eq(experiment.studentId, studentId), eq(experiment.taskId, taskId)));

    return record ?? null;
}
