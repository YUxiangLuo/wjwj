
import { db } from "../../db";
import { experiment, submission, student, task } from "../../db/schema";
import { eq, and } from "drizzle-orm";

async function run() {
    console.log("Adding pending submissions...");

    // Find student 3 and 4
    const students = await db.select().from(student).limit(5);
    const tasks = await db.select().from(task).limit(1);

    if (students.length < 4 || tasks.length === 0) {
        console.log("Not enough data to add submissions. Need at least 4 students and 1 task.");
        process.exit(1);
    }

    const taskId = tasks[0]!.id;

    // Student 3 - Pending Submission
    const s3 = students[2]!;
    await db.insert(experiment).values({
        studentId: s3.id,
        taskId: taskId,
        currentStage: 4,
        status: 1, // Submitted
        questionnaire: { title: "S3 Survey", questions: [] },
        version: 1,
        stage1CompletedAt: new Date()
    }).onConflictDoUpdate({
        target: [experiment.studentId, experiment.taskId],
        set: { status: 1 },
    });

    const [exp3] = await db.select().from(experiment)
        .where(and(eq(experiment.studentId, s3.id), eq(experiment.taskId, taskId)));

    if (exp3) {
        await db.insert(submission).values({
            experimentId: exp3.id,
            status: 1, // Pending
            submittedAt: new Date()
        });
        console.log(`Added pending submission for Student ${s3.name}`);
    }

    // Student 4 - Pending Submission
    const s4 = students[3]!;
    await db.insert(experiment).values({
        studentId: s4.id,
        taskId: taskId,
        currentStage: 4,
        status: 1,
        questionnaire: { title: "S4 Survey", questions: [] },
        version: 1,
        stage1CompletedAt: new Date()
    }).onConflictDoUpdate({
        target: [experiment.studentId, experiment.taskId],
        set: { status: 1 },
    });

    const [exp4] = await db.select().from(experiment)
        .where(and(eq(experiment.studentId, s4.id), eq(experiment.taskId, taskId)));

    if (exp4) {
        await db.insert(submission).values({
            experimentId: exp4.id,
            status: 1, // Pending
            submittedAt: new Date()
        });
        console.log(`Added pending submission for Student ${s4.name}`);
    }

    console.log("Done.");
    process.exit(0);
}

run();
