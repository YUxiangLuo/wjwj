import { and, count, eq } from "drizzle-orm";
import { db } from "../index";
import {
    announcement,
    assistant,
    assistantClass,
    class_,
    experiment,
    notification,
    semester,
    student,
    submission,
    systemConfig,
    task,
    teacher,
    topic,
} from "../schema";

async function seedStudentE2E() {
    console.log("🌱 Initializing student e2e database...\n");

    const defaultPassword = "123456";
    const passwordHash = await Bun.password.hash(defaultPassword);

    await db.insert(systemConfig).values([
        { configKey: "login.max_fail_count", configValue: "5", valueType: "number", description: "最大登录失败次数" },
        { configKey: "login.lock_duration_minutes", configValue: "30", valueType: "number", description: "账号锁定时长(分钟)" },
        { configKey: "session.student_timeout_minutes", configValue: "240", valueType: "number", description: "学生会话超时(分钟)" },
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
        name: "E2E 学生班级A",
        semesterId,
        teacherId,
    });
    const classAId = classInsert.insertId as number;

    await db.insert(assistantClass).values({
        assistantId,
        classId: classAId,
    });

    // Active student (main test account)
    const [studentInsert] = await db.insert(student).values({
        studentId: "student",
        name: "E2E学生",
        password: passwordHash,
        classId: classAId,
        isFirstLogin: 0,
        status: 1,
    });
    const studentMainId = studentInsert.insertId as number;

    // Disabled student
    await db.insert(student).values({
        studentId: "student-disabled",
        name: "E2E禁用学生",
        password: passwordHash,
        classId: classAId,
        isFirstLogin: 0,
        status: 0,
    });

    // Topic A: published, with tasks assigned
    const [topicAInsert] = await db.insert(topic).values({
        teacherId,
        name: "E2E 抽样课题A",
        description: "用于学生端 E2E 测试的抽样课题A，测试学生任务列表和任务详情页面。",
        status: 1,
        excelFilePath: "/storage/uploads/population.xlsx",
        excelRowCount: 1000,
        fieldMapping: { identifier: "id", stratified: ["gender"], numeric: ["age"], others: ["income"] },
        weightConfig: { questionnaire: 30, process: 30, report: 40 },
    });
    const topicAId = topicAInsert.insertId as number;

    // Topic B: published, another topic for variety
    const [topicBInsert] = await db.insert(topic).values({
        teacherId,
        name: "E2E 市场分析课题",
        description: "用于学生端 E2E 测试的第二课题，测试多任务场景。",
        status: 1,
        excelFilePath: "/storage/uploads/population.xlsx",
        excelRowCount: 1000,
        fieldMapping: { identifier: "id", stratified: ["education"], numeric: ["income"], others: ["age"] },
        weightConfig: { questionnaire: 25, process: 35, report: 40 },
    });
    const topicBId = topicBInsert.insertId as number;

    const now = new Date();
    const deadline = new Date(now);
    deadline.setDate(deadline.getDate() + 7);

    // Task for topic A in class A (student will have submitted + graded submission)
    const [taskAInsert] = await db.insert(task).values({
        topicId: topicAId,
        classId: classAId,
        openTime: now,
        deadline,
    });
    const taskAId = taskAInsert.insertId as number;

    // Task for topic B in class A (student will have submitted + rejected submission)
    const [taskBInsert] = await db.insert(task).values({
        topicId: topicBId,
        classId: classAId,
        openTime: now,
        deadline,
    });
    const taskBId = taskBInsert.insertId as number;

    // Experiment for task A: completed and graded
    const [experimentAInsert] = await db.insert(experiment).values({
        studentId: studentMainId,
        taskId: taskAId,
        currentStage: 4,
        status: 1,
        questionnaire: { title: "E2E问卷-课题A", questions: [] },
        samplePlan: { method: "simple", sampleSize: 30 },
        reportContent: "这是一段用于学生端 E2E 测试的实验报告内容，长度超过一百字，以确保系统在读取实验数据时具备完整上下文。该内容仅用于自动化验证。",
        stage1CompletedAt: now,
        stage2CompletedAt: now,
        stage3CompletedAt: now,
        stage4CompletedAt: now,
    });
    const experimentAId = experimentAInsert.insertId as number;

    // Experiment for task B: completed and rejected
    const [experimentBInsert] = await db.insert(experiment).values({
        studentId: studentMainId,
        taskId: taskBId,
        currentStage: 4,
        status: 1,
        questionnaire: { title: "E2E问卷-课题B", questions: [] },
        samplePlan: { method: "stratified", sampleSize: 40 },
        reportContent: "课题B提交内容，用于测试被驳回的场景。",
        stage1CompletedAt: now,
        stage2CompletedAt: now,
        stage3CompletedAt: now,
        stage4CompletedAt: now,
    });
    const experimentBId = experimentBInsert.insertId as number;

    // Submission for task A: graded
    await db.insert(submission).values({
        experimentId: experimentAId,
        scoreQuestionnaire: "90",
        scoreProcess: "88",
        scoreReport: "92",
        totalScore: "90",
        teacherComment: "实验完成良好，数据分析准确。",
        status: 2,
        gradedByType: 2,
        gradedById: teacherId,
        submittedAt: now,
        gradedAt: now,
    });

    // Submission for task B: rejected
    await db.insert(submission).values({
        experimentId: experimentBId,
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

    // Notifications for the student
    await db.insert(notification).values([
        {
            receiverType: 4,
            receiverId: studentMainId,
            type: "GRADING_COMPLETED",
            title: "作业已批改",
            content: "你在「E2E 抽样课题A」的作业已被批改，请查看成绩。",
            relatedType: "task",
            relatedId: taskAId,
            isRead: 0,
        },
        {
            receiverType: 4,
            receiverId: studentMainId,
            type: "SUBMISSION_REJECTED",
            title: "作业被驳回",
            content: "你在「E2E 市场分析课题」的作业被驳回，请查看原因并重新提交。",
            relatedType: "task",
            relatedId: taskBId,
            isRead: 0,
        },
        {
            receiverType: 4,
            receiverId: studentMainId,
            type: "TASK_PUBLISHED",
            title: "新任务发布",
            content: "新任务已发布到你的班级，请及时查看。",
            relatedType: "task",
            relatedId: taskAId,
            isRead: 1,
            readAt: now,
        },
    ]);

    // Announcement
    await db.insert(announcement).values({
        title: "E2E 系统通知公告",
        content: "本学期实验系统已上线，请同学们及时完成实验任务。如有问题请联系任课教师。",
        status: 1,
    });

    console.log("✅ Student e2e seed completed.");
    console.log("------------------------------------------");
    console.log(`Student: student / ${defaultPassword}`);
    console.log(`Disabled student: student-disabled / ${defaultPassword}`);
    console.log(`Tasks: ${taskAId} (graded), ${taskBId} (rejected)`);
    console.log(`Semester id: ${semesterId}, class id: ${classAId}`);
    console.log("------------------------------------------");
}

seedStudentE2E().then(() => {
    process.exit(0);
}).catch((err) => {
    console.error("❌ Student e2e seed failed:", err);
    process.exit(1);
});
