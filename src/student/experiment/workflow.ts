import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { assistantClass, experiment, notification } from "../../db/schema";
import { ExperimentStatus } from "./status";

async function notifyUser(
    receiverType: number,
    receiverId: number,
    payload: { type: string; title: string; content: string; relatedType?: string; relatedId?: number }
) {
    await db.insert(notification).values({
        receiverType,
        receiverId,
        type: payload.type,
        title: payload.title,
        content: payload.content,
        relatedType: payload.relatedType,
        relatedId: payload.relatedId,
    });
}

export async function getOrCreateStudentExperiment(studentId: number, taskId: number) {
    let [record] = await db
        .select()
        .from(experiment)
        .where(and(eq(experiment.studentId, studentId), eq(experiment.taskId, taskId)));

    if (record) {
        return record;
    }

    try {
        const [result] = await db.insert(experiment).values({
            studentId,
            taskId,
            currentStage: 0,
            status: ExperimentStatus.IN_PROGRESS,
        });

        [record] = await db.select().from(experiment).where(eq(experiment.id, result.insertId));
    } catch (error: unknown) {
        if (error && typeof error === "object" && "code" in error && error.code === "ER_DUP_ENTRY") {
            [record] = await db
                .select()
                .from(experiment)
                .where(and(eq(experiment.studentId, studentId), eq(experiment.taskId, taskId)));
        } else {
            throw error;
        }
    }

    return record ?? null;
}

export async function notifySubmissionReviewers(params: {
    classId: number | null;
    teacherId: number | null;
    submissionId: number;
    studentIdText: string;
    studentName: string;
    topicName: string;
}) {
    const studentName = params.studentName || params.studentIdText;

    if (params.teacherId) {
        await notifyUser(2, params.teacherId, {
            type: "NEW_SUBMISSION",
            title: "有新作业提交",
            content: `学生「${studentName}」提交了「${params.topicName}」`,
            relatedType: "submission",
            relatedId: params.submissionId,
        });
    }

    if (!params.classId) {
        return;
    }

    const assistantRows = await db
        .select({ assistantId: assistantClass.assistantId })
        .from(assistantClass)
        .where(eq(assistantClass.classId, params.classId));

    const assistantIds = Array.from(new Set(assistantRows.map((row) => row.assistantId)));
    for (const assistantId of assistantIds) {
        await notifyUser(3, assistantId, {
            type: "NEW_SUBMISSION",
            title: "有新作业提交",
            content: `学生「${studentName}」提交了「${params.topicName}」`,
            relatedType: "submission",
            relatedId: params.submissionId,
        });
    }
}
