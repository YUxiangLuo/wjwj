/**
 * Enhanced Database Seed Script (Chinese Localization)
 * Covers all system tables with realistic relationship data and user flows.
 * Run with: bun run src/db/seed.ts
 */

import { db } from "./index";
import {
    admin,
    teacher,
    assistant,
    student,
    semester,
    class_,
    assistantClass,
    studentTransfer,
    topic,
    topicAttachment,
    topicRecommendQuestion,
    task,
    experiment,
    submission,
    announcement,
    announcementRead,
    systemConfig,
    notification,
    operationLog,
    loginLog
} from "./schema";
import { eq, and } from "drizzle-orm";

async function seed() {
    console.log("🌱 开始初始化数据库数据...\n");

    const defaultPassword = "123456";
    const hashedPassword = await Bun.password.hash(defaultPassword);

    // ==========================================
    // 1. 系统配置 & 管理员
    // ==========================================
    console.log("🔧 初始化系统配置与管理员...");

    // System Config
    const configs = [
        { key: "system_name", value: "抽样统计虚拟仿真实验教学系统", desc: "系统名称" },
        { key: "allow_student_login", value: "true", valueType: "boolean", desc: "允许学生登录开关" },
        { key: "max_upload_size", value: "10", valueType: "number", desc: "最大上传限制(MB)" },
        { key: "login.max_fail_count", value: "5", valueType: "number", desc: "最大登录失败次数" },
        { key: "login.lock_duration_minutes", value: "30", valueType: "number", desc: "账号锁定时间(分钟)" },
        { key: "session.admin_timeout_minutes", value: "30", valueType: "number", desc: "管理员会话超时时间" },
        { key: "session.teacher_timeout_minutes", value: "120", valueType: "number", desc: "教师会话超时时间" },
        { key: "session.student_timeout_minutes", value: "240", valueType: "number", desc: "学生会话超时时间" }
    ];

    for (const c of configs) {
        await db.insert(systemConfig).values({
            configKey: c.key,
            configValue: c.value,
            valueType: c.valueType,
            description: c.desc
        }).onDuplicateKeyUpdate({ set: { configValue: c.value, valueType: c.valueType } });
    }

    // Admin
    await db.insert(admin).values({
        username: "admin",
        password: hashedPassword,
        isFirstLogin: 0
    }).onDuplicateKeyUpdate({ set: { username: "admin" } });

    // ==========================================
    // 2. 学期
    // ==========================================
    console.log("📅 初始化学期数据...");

    // Previous Semester
    let [prevSem] = await db.select().from(semester).where(eq(semester.name, "2023-2024学年 第二学期"));
    if (!prevSem) {
        const [res] = await db.insert(semester).values({ name: "2023-2024学年 第二学期", isCurrent: 0 });
        prevSem = { id: res.insertId, name: "2023-2024学年 第二学期" } as any;
    }

    // Current Semester
    let [currSem] = await db.select().from(semester).where(eq(semester.name, "2024-2025学年 第一学期"));
    if (!currSem) {
        const [res] = await db.insert(semester).values({ name: "2024-2025学年 第一学期", isCurrent: 1 });
        currSem = { id: res.insertId, name: "2024-2025学年 第一学期" } as any;
    }

    if (!prevSem || !currSem) throw new Error("学期初始化失败");

    // ==========================================
    // 3. 教师 & 助教
    // ==========================================
    console.log("👨‍🏫 初始化教师与助教数据...");

    const teachersData = [
        { id: "teacher", name: "演示教师" },
        { id: "T002", name: "李博士" },
        { id: "T003", name: "王讲师" }
    ];

    const teacherIds: number[] = [];

    for (const t of teachersData) {
        let [exist] = await db.select().from(teacher).where(eq(teacher.employeeId, t.id));
        if (!exist) {
            const [res] = await db.insert(teacher).values({
                employeeId: t.id,
                name: t.name,
                password: hashedPassword,
                isFirstLogin: 0,
                status: 1
            });
            teacherIds.push(res.insertId);
        } else {
            teacherIds.push(exist.id);
        }
    }

    // Assistants for T001
    const assistantsData = [
        { account: "assistant", name: "演示助教" },
        { account: "A002", name: "助教小陈" }
    ];

    const assistantIds: number[] = [];

    for (const a of assistantsData) {
        let [exist] = await db.select().from(assistant).where(eq(assistant.account, a.account));
        if (!exist) {
            const [res] = await db.insert(assistant).values({
                account: a.account,
                name: a.name,
                password: hashedPassword,
                creatorTeacherId: teacherIds[0]!, // Linked to Demo Teacher
                isFirstLogin: 0
            });
            assistantIds.push(res.insertId);
        } else {
            assistantIds.push(exist.id);
        }
    }

    // ==========================================
    // 4. 班级
    // ==========================================
    console.log("🏫 初始化班级数据...");

    const classesData = [
        { name: "统计学原理 A班", sem: currSem.id, teacher: teacherIds[0]! },
        { name: "统计学原理 B班", sem: currSem.id, teacher: teacherIds[1]! },
        { name: "市场调研实务", sem: prevSem.id, teacher: teacherIds[0]! }
    ];

    const classIds: number[] = [];

    for (const c of classesData) {
        let [exist] = await db.select().from(class_).where(and(
            eq(class_.name, c.name),
            eq(class_.semesterId, c.sem)
        ));

        if (!exist) {
            const [res] = await db.insert(class_).values({
                name: c.name,
                semesterId: c.sem,
                teacherId: c.teacher
            });
            classIds.push(res.insertId);
        } else {
            classIds.push(exist.id);
        }
    }

    // Assign Assistant to Class A
    await db.insert(assistantClass).values({
        assistantId: assistantIds[0]!,
        classId: classIds[0]!
    }).onDuplicateKeyUpdate({ set: { assistantId: assistantIds[0]! } });

    // ==========================================
    // 5. 学生
    // ==========================================
    console.log("👨‍🎓 初始化学生数据...");

    const studentIds: number[] = [];
    const studentNames = ["演示学生", "钱二", "孙三", "李四", "周五", "吴六", "郑七", "王八", "冯九", "陈十"];

    // Create 10 students for Class A (Current)
    for (let i = 1; i <= 10; i++) {
        // First student uses "student", others use "202400x"
        const sid = i === 1 ? "student" : `202400${i}`;
        let [exist] = await db.select().from(student).where(eq(student.studentId, sid));
        if (!exist) {
            const [res] = await db.insert(student).values({
                studentId: sid,
                name: studentNames[i - 1] ?? "Student",
                password: hashedPassword,
                classId: classIds[0]!,
                isFirstLogin: 0,
                status: 1
            });
            studentIds.push(res.insertId);
        } else {
            studentIds.push(exist.id);
        }
    }

    // Create a transfer record: Student 10 transferred from Class B to Class A
    /* (Assuming Student 10 was in Class B previously, strictly we should just insert the log) */
    await db.insert(studentTransfer).values({
        studentId: studentIds[9]!,
        fromClassId: classIds[1]!,
        toClassId: classIds[0]!,
        reason: "课程时间冲突",
        operatedBy: 1, // Admin ID
        transferredAt: new Date()
    });

    // ==========================================
    // 6. 课题 & 资源
    // ==========================================
    console.log("📚 初始化课题与资源...");

    const topicsData = [
        { name: "消费者行为分析实验", teacher: teacherIds[0]!, status: 1 },
        { name: "大学生网购趋势调查", teacher: teacherIds[1]!, status: 1 },
        { name: "市场调研基础方法", teacher: teacherIds[0]!, status: 1 },
        { name: "数据分析基础实战", teacher: teacherIds[1]!, status: 1 },
        { name: "社交媒体影响力分析(草稿)", teacher: teacherIds[0]!, status: 0 }
    ];

    const topicIds: number[] = [];

    for (const t of topicsData) {
        const [res] = await db.insert(topic).values({
            teacherId: t.teacher,
            name: t.name,
            description: `# ${t.name}\n\n**实验目标**：\n1. 掌握基本的抽样调查方法\n2. 学会设计有效的调查问卷\n3. 能够对收集到的数据进行初步分析\n\n**实验要求**：\n请根据给定的背景资料，设计一份不少于10道题目的调查问卷，并完成后续的抽样与分析报告。`,
            status: t.status,
            excelRowCount: 10000,
            excelFilePath: "/storage/uploads/population.xlsx",
            fieldMapping: {
                "id": "id",
                "stratified": ["gender", "education"],
                "numerical": ["age", "income"],
                "text": []
            }
        });
        topicIds.push(res.insertId);

        // Add dummy attachments
        await db.insert(topicAttachment).values({
            topicId: res.insertId,
            fileName: "实验指导书.pdf",
            filePath: "/storage/uploads/guidelines.pdf",
            fileType: "application/pdf",
            fileSize: 1024 * 1024
        });

        // Add recommended questions
        await db.insert(topicRecommendQuestion).values([
            { topicId: res.insertId, questionType: 1, content: "您的年龄段是？", options: ["18-25岁", "26-35岁", "36岁及以上"], sortOrder: 1 },
            { topicId: res.insertId, questionType: 2, content: "您平时更倾向于购买哪类产品？", options: ["电子数码", "服饰鞋包", "家居生活", "美妆护肤"], sortOrder: 2 }
        ]);
    }

    // ==========================================
    // 7. 任务 (课题 -> 班级)
    // ==========================================
    console.log("📋 初始化任务分配...");

    const now = new Date();
    const deadline = new Date(now);
    deadline.setDate(deadline.getDate() + 30);

    const taskIds: number[] = [];

    // Assign 4 Topics to Class A (ensuring students have at least 4 tasks)
    // We use the first 4 topics which we ensured are published (well, the first 4 in our list above are status 1)
    const topicsToAssign = topicIds.slice(0, 4);

    for (const tid of topicsToAssign) {
        const [taskRes] = await db.insert(task).values({
            topicId: tid,
            classId: classIds[0]!,
            openTime: now,
            deadline: deadline
        }).onDuplicateKeyUpdate({ set: { deadline: deadline } });

        taskIds.push(taskRes.insertId);
    }

    // ==========================================
    // 8. 实验 & 提交记录
    // ==========================================
    console.log("🧪 初始化实验记录与提交...");

    // Scenario A: Student 1 - Just Started
    await db.insert(experiment).values({
        studentId: studentIds[0]!,
        taskId: taskIds[0]!,
        currentStage: 1,
        status: 0,
        questionnaire: { title: "我的调查问卷", questions: [] }
    }).onDuplicateKeyUpdate({ set: { currentStage: 1 } });

    // Scenario B: Student 2 - Completed & Submitted
    const [expRes2] = await db.insert(experiment).values({
        studentId: studentIds[1]!,
        taskId: taskIds[0]!,
        currentStage: 4,
        status: 1, // Submitted
        questionnaire: { title: "已完成的问卷", count: 10 },
        samplePlan: { method: "简单随机抽样", size: 100 },
        reportContent: "## 实验总结报告\n\n本次实验通过对目标人群的随机抽样调查，发现...\n\n### 1. 数据分析\n大部分受访者倾向于...\n\n### 2. 结论与建议\n建议后续...",
        stage1CompletedAt: new Date(),
        stage2CompletedAt: new Date(),
        stage3CompletedAt: new Date(),
        stage4CompletedAt: new Date(),
        version: 1
    }).onDuplicateKeyUpdate({ set: { status: 1 } });

    // Submission for Student 2
    if (expRes2.insertId || expRes2.affectedRows > 0) {
        // Need to fetch ID if it was an update, but for seed we assume insert mainly
        // If idempotent update, we search:
        const [exp] = await db.select().from(experiment)
            .where(and(eq(experiment.studentId, studentIds[1]!), eq(experiment.taskId, taskIds[0]!)));

        if (exp) {
            await db.insert(submission).values({
                experimentId: exp.id,
                scoreQuestionnaire: "90.00",
                scoreProcess: "85.50",
                scoreReport: "88.00",
                totalScore: "87.83",
                teacherComment: "实验设计规范，分析深入，做得很好！",
                status: 2, // Graded
                gradedByType: 1, // Teacher
                gradedById: teacherIds[0]!,
                gradedAt: new Date()
            });
        }
    }

    // ==========================================
    // 9. 系统日志 & 通知
    // ==========================================
    console.log("📢 初始化日志与通知...");

    // Announcements
    const [annoRes] = await db.insert(announcement).values({
        title: "系统维护通知",
        content: "系统将于今晚24:00进行即行维护升级，预计耗时2小时，请各位师生提前保存数据。",
        status: 1
    });

    // Announcement Read
    await db.insert(announcementRead).values({
        announcementId: annoRes.insertId,
        userType: 1, // Teacher
        userId: teacherIds[0]!
    });

    // Notifications
    await db.insert(notification).values({
        receiverType: 2, // Student
        receiverId: studentIds[0]!,
        type: "TASK_ASSIGNED",
        title: "新任务发布",
        content: "您有一个新的实验任务：消费者行为分析实验，请及时完成。",
        isRead: 0
    });

    // Login Logs
    await db.insert(loginLog).values({
        userType: 2,
        userId: studentIds[0]!,
        loginAt: new Date(),
        ipAddress: "127.0.0.1",
        userAgent: "Mozilla/5.0..."
    });

    // Operation Logs
    await db.insert(operationLog).values({
        userType: 1,
        userId: teacherIds[0]!,
        action: "CREATE_TOPIC",
        targetType: "topic",
        targetId: topicIds[0]!,
        detail: { name: "消费者行为分析实验" },
        ipAddress: "127.0.0.1"
    });

    console.log("\n✅ 数据库初始化完成 (演示版)!");
    console.log("==========================================");
    console.log(`🔑 通用密码: ${defaultPassword}`);
    console.log(`👤 管理员: admin`);
    console.log(`👨‍🏫 演示教师: teacher (其他: T002...)`);
    console.log(`👨‍🎓 演示学生: student (其他: 2024002...)`);
    console.log("==========================================");

    process.exit(0);
}

seed().catch((err) => {
    console.error("❌ 初始化失败:", err);
    process.exit(1);
});
