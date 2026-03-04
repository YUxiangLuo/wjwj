import { and, count, eq } from "drizzle-orm";
import { db } from "./index";
import {
    assistant,
    assistantClass,
    class_,
    experiment,
    semester,
    student,
    submission,
    systemConfig,
    task,
    teacher,
    topic,
} from "./schema";

async function seedTeacherE2E() {
    console.log("🌱 Initializing teacher e2e database...\n");

    const defaultPassword = "123456";
    const passwordHash = await Bun.password.hash(defaultPassword);

    await db.insert(systemConfig).values([
        { configKey: "login.max_fail_count", configValue: "5", valueType: "number", description: "最大登录失败次数" },
        { configKey: "login.lock_duration_minutes", configValue: "30", valueType: "number", description: "账号锁定时长(分钟)" },
        { configKey: "session.teacher_timeout_minutes", configValue: "120", valueType: "number", description: "教师会话超时(分钟)" },
    ]);

    const [teacherInsert] = await db.insert(teacher).values({
        employeeId: "teacher",
        name: "E2E教师",
        password: passwordHash,
        isFirstLogin: 0,
        status: 1,
    });
    const teacherId = teacherInsert.insertId as number;

    const [assistantInsert] = await db.insert(assistant).values({
        account: "assistant",
        name: "E2E助教",
        password: passwordHash,
        creatorTeacherId: teacherId,
        isFirstLogin: 0,
        status: 1,
    });
    const assistantId = assistantInsert.insertId as number;

    const [semesterInsert] = await db.insert(semester).values({
        name: "2026-2027学年 第一学期",
        isCurrent: 1,
    });
    const semesterId = semesterInsert.insertId as number;

    const [classInsert] = await db.insert(class_).values({
        name: "E2E 教师班级",
        semesterId,
        teacherId,
    });
    const classId = classInsert.insertId as number;

    await db.insert(assistantClass).values({
        assistantId,
        classId,
    });

    const [studentInsert] = await db.insert(student).values({
        studentId: "student-e2e",
        name: "E2E学生",
        password: passwordHash,
        classId,
        isFirstLogin: 0,
        status: 1,
    });
    const studentId = studentInsert.insertId as number;

    const [topicInsert] = await db.insert(topic).values({
        teacherId,
        name: "E2E 抽样课题",
        description: "用于教师端 E2E 测试",
        status: 1,
        excelRowCount: 1000,
        fieldMapping: { stratified: ["gender"] },
    });
    const topicId = topicInsert.insertId as number;

    const now = new Date();
    const deadline = new Date(now);
    deadline.setDate(deadline.getDate() + 7);

    const [taskInsert] = await db.insert(task).values({
        topicId,
        classId,
        openTime: now,
        deadline,
    });
    const taskId = taskInsert.insertId as number;

    const [experimentInsert] = await db.insert(experiment).values({
        studentId,
        taskId,
        currentStage: 4,
        status: 1,
        questionnaire: { title: "E2E问卷", questions: [] },
        samplePlan: { method: "simple", sampleSize: 30 },
        reportContent: "这是一段用于教师端 E2E 测试的实验报告内容，长度超过一百字，以确保系统在读取实验数据时具备完整上下文。该内容仅用于自动化验证。",
        stage1CompletedAt: now,
        stage2CompletedAt: now,
        stage3CompletedAt: now,
        stage4CompletedAt: now,
    });
    const experimentId = experimentInsert.insertId as number;

    await db.insert(submission).values({
        experimentId,
        status: 1,
        submittedAt: now,
    });

    const [pendingForTeacher] = await db
        .select({ count: count() })
        .from(submission)
        .innerJoin(experiment, eq(submission.experimentId, experiment.id))
        .innerJoin(task, eq(experiment.taskId, task.id))
        .innerJoin(class_, eq(task.classId, class_.id))
        .where(and(eq(submission.status, 1), eq(class_.teacherId, teacherId)));

    console.log("✅ Teacher e2e seed completed.");
    console.log("------------------------------------------");
    console.log(`Teacher: teacher / ${defaultPassword}`);
    console.log(`Assistant: assistant / ${defaultPassword}`);
    console.log(`Pending submissions for teacher: ${pendingForTeacher?.count ?? 0}`);
    console.log("------------------------------------------");
}

seedTeacherE2E().then(() => {
    process.exit(0);
}).catch((err) => {
    console.error("❌ Teacher e2e seed failed:", err);
    process.exit(1);
});
