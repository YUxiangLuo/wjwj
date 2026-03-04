import { and, count, eq } from "drizzle-orm";
import { db } from "../index";
import {
    notification,
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
} from "../schema";

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

    const [assistant2Insert] = await db.insert(assistant).values({
        account: "assistant2",
        name: "E2E助教2",
        password: passwordHash,
        creatorTeacherId: teacherId,
        isFirstLogin: 0,
        status: 0,
    });
    const assistant2Id = assistant2Insert.insertId as number;

    const [semesterInsert] = await db.insert(semester).values({
        name: "2026-2027学年 第一学期",
        isCurrent: 1,
    });
    const semesterId = semesterInsert.insertId as number;

    const [classInsert] = await db.insert(class_).values({
        name: "E2E 教师班级A",
        semesterId,
        teacherId,
    });
    const classAId = classInsert.insertId as number;

    const [classBInsert] = await db.insert(class_).values({
        name: "E2E 教师班级B",
        semesterId,
        teacherId,
    });
    const classBId = classBInsert.insertId as number;

    await db.insert(assistantClass).values({
        assistantId,
        classId: classAId,
    });

    await db.insert(assistantClass).values({
        assistantId,
        classId: classBId,
    });

    const [studentInsert] = await db.insert(student).values({
        studentId: "student-e2e",
        name: "E2E学生",
        password: passwordHash,
        classId: classAId,
        isFirstLogin: 0,
        status: 1,
    });
    const studentA1Id = studentInsert.insertId as number;

    const [studentA2Insert] = await db.insert(student).values({
        studentId: "student-a2",
        name: "E2E学生A2",
        password: passwordHash,
        classId: classAId,
        isFirstLogin: 0,
        status: 1,
    });
    const studentA2Id = studentA2Insert.insertId as number;

    const [studentB1Insert] = await db.insert(student).values({
        studentId: "student-b1",
        name: "E2E学生B1",
        password: passwordHash,
        classId: classBId,
        isFirstLogin: 0,
        status: 1,
    });
    const studentB1Id = studentB1Insert.insertId as number;

    const [studentB2Insert] = await db.insert(student).values({
        studentId: "student-b2",
        name: "E2E学生B2",
        password: passwordHash,
        classId: classBId,
        isFirstLogin: 0,
        status: 1,
    });
    const studentB2Id = studentB2Insert.insertId as number;

    const [topicInsert] = await db.insert(topic).values({
        teacherId,
        name: "E2E 抽样课题",
        description: "用于教师端 E2E 测试",
        status: 1,
        excelFilePath: "/storage/uploads/population.xlsx",
        excelRowCount: 1000,
        fieldMapping: { identifier: "id", stratified: ["gender"], numeric: ["age"], others: ["income"] },
        weightConfig: { questionnaire: 30, process: 30, report: 40 },
    });
    const topicAId = topicInsert.insertId as number;

    const [topicBInsert] = await db.insert(topic).values({
        teacherId,
        name: "E2E 市场分析课题",
        description: "用于导出与筛选的第二课题",
        status: 1,
        excelFilePath: "/storage/uploads/population.xlsx",
        excelRowCount: 1000,
        fieldMapping: { identifier: "id", stratified: ["education"], numeric: ["income"], others: ["age"] },
        weightConfig: { questionnaire: 25, process: 35, report: 40 },
    });
    const topicBId = topicBInsert.insertId as number;

    await db.insert(topic).values({
        teacherId,
        name: "E2E 草稿课题",
        description: "用于草稿相关测试",
        status: 0,
    });

    const now = new Date();
    const deadline = new Date(now);
    deadline.setDate(deadline.getDate() + 7);

    const [taskAClassAInsert] = await db.insert(task).values({
        topicId: topicAId,
        classId: classAId,
        openTime: now,
        deadline,
    });
    const taskAClassAId = taskAClassAInsert.insertId as number;

    const [taskAClassBInsert] = await db.insert(task).values({
        topicId: topicAId,
        classId: classBId,
        openTime: now,
        deadline,
    });
    const taskAClassBId = taskAClassBInsert.insertId as number;

    const [taskBClassAInsert] = await db.insert(task).values({
        topicId: topicBId,
        classId: classAId,
        openTime: now,
        deadline,
    });
    const taskBClassAId = taskBClassAInsert.insertId as number;

    const [experimentInsert] = await db.insert(experiment).values({
        studentId: studentA1Id,
        taskId: taskAClassAId,
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
    const experimentPendingId = experimentInsert.insertId as number;

    const [experimentGradedInsert] = await db.insert(experiment).values({
        studentId: studentA2Id,
        taskId: taskAClassAId,
        currentStage: 4,
        status: 1,
        questionnaire: { title: "E2E问卷-已批改", questions: [] },
        samplePlan: { method: "stratified", sampleSize: 40 },
        reportContent: "已批改提交对应的报告内容。",
        stage1CompletedAt: now,
        stage2CompletedAt: now,
        stage3CompletedAt: now,
        stage4CompletedAt: now,
    });
    const experimentGradedId = experimentGradedInsert.insertId as number;

    const [experimentRejectedInsert] = await db.insert(experiment).values({
        studentId: studentB1Id,
        taskId: taskAClassBId,
        currentStage: 4,
        status: 1,
        questionnaire: { title: "E2E问卷-已驳回", questions: [] },
        samplePlan: { method: "systematic", sampleSize: 25 },
        reportContent: "已驳回提交对应的报告内容。",
        stage1CompletedAt: now,
        stage2CompletedAt: now,
        stage3CompletedAt: now,
        stage4CompletedAt: now,
    });
    const experimentRejectedId = experimentRejectedInsert.insertId as number;

    const [experimentPending2Insert] = await db.insert(experiment).values({
        studentId: studentB2Id,
        taskId: taskAClassBId,
        currentStage: 4,
        status: 1,
        questionnaire: { title: "E2E问卷-待批改2", questions: [] },
        samplePlan: { method: "simple", sampleSize: 20 },
        reportContent: "第二条待批改提交内容。",
        stage1CompletedAt: now,
        stage2CompletedAt: now,
        stage3CompletedAt: now,
        stage4CompletedAt: now,
    });
    const experimentPending2Id = experimentPending2Insert.insertId as number;

    const [experimentTopicBInsert] = await db.insert(experiment).values({
        studentId: studentA1Id,
        taskId: taskBClassAId,
        currentStage: 4,
        status: 1,
        questionnaire: { title: "E2E问卷-课题B", questions: [] },
        samplePlan: { method: "stratified", sampleSize: 35 },
        reportContent: "课题B提交内容。",
        stage1CompletedAt: now,
        stage2CompletedAt: now,
        stage3CompletedAt: now,
        stage4CompletedAt: now,
    });
    const experimentTopicBId = experimentTopicBInsert.insertId as number;

    await db.insert(submission).values({
        experimentId: experimentPendingId,
        status: 1,
        submittedAt: now,
    });

    await db.insert(submission).values({
        experimentId: experimentPending2Id,
        status: 1,
        submittedAt: now,
    });

    await db.insert(submission).values({
        experimentId: experimentGradedId,
        scoreQuestionnaire: "90",
        scoreProcess: "88",
        scoreReport: "92",
        totalScore: "90",
        teacherComment: "教师已完成评分",
        status: 2,
        gradedByType: 2,
        gradedById: teacherId,
        submittedAt: now,
        gradedAt: now,
    });

    await db.insert(submission).values({
        experimentId: experimentRejectedId,
        scoreQuestionnaire: "60",
        scoreProcess: "58",
        scoreReport: "62",
        totalScore: "60",
        teacherComment: "请补充样本分层解释",
        rejectReason: "报告中缺少抽样过程说明，请完善后重新提交。",
        status: 3,
        gradedByType: 3,
        gradedById: assistantId,
        submittedAt: now,
        gradedAt: now,
    });

    await db.insert(submission).values({
        experimentId: experimentTopicBId,
        scoreQuestionnaire: "85",
        scoreProcess: "84",
        scoreReport: "88",
        totalScore: "85.8",
        teacherComment: "课题B评分完成",
        status: 2,
        gradedByType: 2,
        gradedById: teacherId,
        submittedAt: now,
        gradedAt: now,
    });

    await db.insert(notification).values([
        {
            receiverType: 2,
            receiverId: teacherId,
            type: "TASK_PUBLISHED",
            title: "E2E 新任务通知",
            content: "课题任务已发布到班级A与班级B",
            relatedType: "task",
            relatedId: taskAClassAId,
            isRead: 0,
        },
        {
            receiverType: 2,
            receiverId: teacherId,
            type: "SUBMISSION_PENDING",
            title: "E2E 待批改提醒",
            content: "当前有待批改作业，请及时处理。",
            relatedType: "submission",
            relatedId: 1,
            isRead: 1,
            readAt: now,
        },
        {
            receiverType: 3,
            receiverId: assistantId,
            type: "ASSISTANT_NOTICE",
            title: "E2E 助教通知",
            content: "您有新的批改任务分配。",
            relatedType: "task",
            relatedId: taskAClassBId,
            isRead: 0,
        },
        {
            receiverType: 3,
            receiverId: assistant2Id,
            type: "ASSISTANT_NOTICE",
            title: "E2E 助教2通知",
            content: "该账号用于停用态测试。",
            relatedType: "task",
            relatedId: taskBClassAId,
            isRead: 0,
        },
    ]);

    const [pendingForTeacher] = await db
        .select({ count: count() })
        .from(submission)
        .innerJoin(experiment, eq(submission.experimentId, experiment.id))
        .innerJoin(task, eq(experiment.taskId, task.id))
        .innerJoin(class_, eq(task.classId, class_.id))
        .where(and(eq(submission.status, 1), eq(class_.teacherId, teacherId)));

    const [gradedForTeacher] = await db
        .select({ count: count() })
        .from(submission)
        .innerJoin(experiment, eq(submission.experimentId, experiment.id))
        .innerJoin(task, eq(experiment.taskId, task.id))
        .innerJoin(class_, eq(task.classId, class_.id))
        .where(and(eq(submission.status, 2), eq(class_.teacherId, teacherId)));

    const [rejectedForTeacher] = await db
        .select({ count: count() })
        .from(submission)
        .innerJoin(experiment, eq(submission.experimentId, experiment.id))
        .innerJoin(task, eq(experiment.taskId, task.id))
        .innerJoin(class_, eq(task.classId, class_.id))
        .where(and(eq(submission.status, 3), eq(class_.teacherId, teacherId)));

    console.log("✅ Teacher e2e seed completed.");
    console.log("------------------------------------------");
    console.log(`Teacher: teacher / ${defaultPassword}`);
    console.log(`Assistant: assistant / ${defaultPassword}`);
    console.log(`Disabled assistant: assistant2 / ${defaultPassword}`);
    console.log(`Pending submissions for teacher: ${pendingForTeacher?.count ?? 0}`);
    console.log(`Graded submissions for teacher: ${gradedForTeacher?.count ?? 0}`);
    console.log(`Rejected submissions for teacher: ${rejectedForTeacher?.count ?? 0}`);
    console.log("------------------------------------------");
}

seedTeacherE2E().then(() => {
    process.exit(0);
}).catch((err) => {
    console.error("❌ Teacher e2e seed failed:", err);
    process.exit(1);
});
