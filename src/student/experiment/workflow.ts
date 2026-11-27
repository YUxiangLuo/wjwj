import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { experiment, student, task } from "../../db/schema";
import { ExperimentStatus } from "@/domain/experiment/status";

export async function getOrCreateStudentExperiment(studentId: number, taskId: number) {
    let [record] = await db
        .select()
        .from(experiment)
        .where(and(eq(experiment.studentId, studentId), eq(experiment.taskId, taskId)));

    if (record) {
        return record;
    }

    return db.transaction(async (tx) => {
        const [existingStudent] = await tx
            .select({ id: student.id })
            .from(student)
            .where(eq(student.id, studentId))
            .for("share");
        const [existingTask] = await tx
            .select({ id: task.id })
            .from(task)
            .where(eq(task.id, taskId))
            .for("share");
        if (!existingStudent || !existingTask) {
            return null;
        }

        const [created] = await tx
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

        [record] = await tx
            .select()
            .from(experiment)
            .where(and(eq(experiment.studentId, studentId), eq(experiment.taskId, taskId)));

        return record ?? null;
    });
}
