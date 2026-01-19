/**
 * Enhanced Database Seed Script
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
    console.log("🌱 Starting comprehensive database seed...\n");

    const defaultPassword = "password123";
    const hashedPassword = await Bun.password.hash(defaultPassword);

    // ==========================================
    // 1. System Config & Admin
    // ==========================================
    console.log("🔧 Seeding System Config & Admin...");

    // System Config
    const configs = [
        { key: "system_name", value: "Academic Research Platform", desc: "System Name" },
        { key: "allow_student_login", value: "true", valueType: "boolean", desc: "Allow student login switch" },
        { key: "max_upload_size", value: "10", valueType: "number", desc: "Max upload size in MB" }
    ];

    for (const c of configs) {
        await db.insert(systemConfig).values({
            configKey: c.key,
            configValue: c.value,
            valueType: c.valueType,
            description: c.desc
        }).onDuplicateKeyUpdate({ set: { configValue: c.value } });
    }

    // Admin
    await db.insert(admin).values({
        username: "admin",
        password: hashedPassword,
        isFirstLogin: 0
    }).onDuplicateKeyUpdate({ set: { username: "admin" } });

    // ==========================================
    // 2. Semesters
    // ==========================================
    console.log("📅 Seeding Semesters...");

    // Previous Semester
    let [prevSem] = await db.select().from(semester).where(eq(semester.name, "2023-2024 Spring"));
    if (!prevSem) {
        const [res] = await db.insert(semester).values({ name: "2023-2024 Spring", isCurrent: 0 });
        prevSem = { id: res.insertId, name: "2023-2024 Spring" } as any;
    }

    // Current Semester
    let [currSem] = await db.select().from(semester).where(eq(semester.name, "2024-2025 Fall"));
    if (!currSem) {
        const [res] = await db.insert(semester).values({ name: "2024-2025 Fall", isCurrent: 1 });
        currSem = { id: res.insertId, name: "2024-2025 Fall" } as any;
    }

    if (!prevSem || !currSem) throw new Error("Failed to initialize semesters");

    // ==========================================
    // 3. Teachers & Assistants
    // ==========================================
    console.log("👨‍🏫 Seeding Teachers & Assistants...");

    const teachersData = [
        { id: "T001", name: "Prof. Zhang" },
        { id: "T002", name: "Dr. Li" },
        { id: "T003", name: "Instructor Wang" }
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
        { account: "A001", name: "Assistant Xiao" },
        { account: "A002", name: "Assistant Chen" }
    ];

    const assistantIds: number[] = [];

    for (const a of assistantsData) {
        let [exist] = await db.select().from(assistant).where(eq(assistant.account, a.account));
        if (!exist) {
            const [res] = await db.insert(assistant).values({
                account: a.account,
                name: a.name,
                password: hashedPassword,
                creatorTeacherId: teacherIds[0]!, // Linked to Prof. Zhang
                isFirstLogin: 0
            });
            assistantIds.push(res.insertId);
        } else {
            assistantIds.push(exist.id);
        }
    }

    // ==========================================
    // 4. Classes
    // ==========================================
    console.log("🏫 Seeding Classes...");

    const classesData = [
        { name: "Statistics 101-A", sem: currSem.id, teacher: teacherIds[0]! },
        { name: "Statistics 101-B", sem: currSem.id, teacher: teacherIds[1]! },
        { name: "Market Research 202", sem: prevSem.id, teacher: teacherIds[0]! }
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
    // 5. Students
    // ==========================================
    console.log("👨‍🎓 Seeding Students...");

    const studentIds: number[] = [];

    // Create 10 students for Class A (Current)
    for (let i = 1; i <= 10; i++) {
        const sid = `202400${i}`;
        let [exist] = await db.select().from(student).where(eq(student.studentId, sid));
        if (!exist) {
            const [res] = await db.insert(student).values({
                studentId: sid,
                name: `Student ${i}`,
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
        reason: "Schedule conflict",
        operatedBy: 1, // Admin ID
        transferredAt: new Date()
    });

    // ==========================================
    // 6. Topics & Resources
    // ==========================================
    console.log("📚 Seeding Topics & Resources...");

    const topicsData = [
        { name: "Consumer Behavior Analysis", teacher: teacherIds[0]!, status: 1 },
        { name: "Online Shopping Trends", teacher: teacherIds[1]!, status: 1 },
        { name: "Market Research Basics", teacher: teacherIds[0]!, status: 1 },
        { name: "Data Analysis Fundamentals", teacher: teacherIds[1]!, status: 1 },
        { name: "Social Media Impact (Draft)", teacher: teacherIds[0]!, status: 0 }
    ];

    const topicIds: number[] = [];

    for (const t of topicsData) {
        const [res] = await db.insert(topic).values({
            teacherId: t.teacher,
            name: t.name,
            description: `# ${t.name}\n\nObjective: Understand the core factors...`,
            status: t.status,
            excelRowCount: 10000,
            excelFilePath: "/uploads/population.xlsx",
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
            fileName: "guidelines.pdf",
            filePath: "/uploads/guidelines.pdf",
            fileType: "application/pdf",
            fileSize: 1024 * 1024
        });

        // Add recommended questions
        await db.insert(topicRecommendQuestion).values([
            { topicId: res.insertId, questionType: 1, content: "What is your age range?", options: ["18-25", "26-35", "36+"], sortOrder: 1 },
            { topicId: res.insertId, questionType: 2, content: "Which products do you prefer?", options: ["Electronics", "Fashion", "Home"], sortOrder: 2 }
        ]);
    }

    // ==========================================
    // 7. Tasks (Topic -> Class)
    // ==========================================
    console.log("📋 Seeding Tasks...");

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
        console.log(`   Assigned Topic ${tid} to Class ${classIds[0]} -> Task ${taskRes.insertId}`);
    }

    // ==========================================
    // 8. Experiments & Submissions
    // ==========================================
    console.log("🧪 Seeding Experiments & Submissions...");

    // Scenario A: Student 1 - Just Started
    await db.insert(experiment).values({
        studentId: studentIds[0]!,
        taskId: taskIds[0]!,
        currentStage: 1,
        status: 0,
        questionnaire: { title: "My Survey", questions: [] }
    }).onDuplicateKeyUpdate({ set: { currentStage: 1 } });

    // Scenario B: Student 2 - Completed & Submitted
    const [expRes2] = await db.insert(experiment).values({
        studentId: studentIds[1]!,
        taskId: taskIds[0]!,
        currentStage: 4,
        status: 1, // Submitted
        questionnaire: { title: "Finished Survey", count: 10 },
        samplePlan: { method: "Random", size: 100 },
        reportContent: "## Final Report\n\nResult analysis...",
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
                teacherComment: "Good job!",
                status: 2, // Graded
                gradedByType: 1, // Teacher
                gradedById: teacherIds[0]!,
                gradedAt: new Date()
            });
        }
    }

    // ==========================================
    // 9. System Logs & Notifications
    // ==========================================
    console.log("📢 Seeding Logs & Notifications...");

    // Announcements
    const [annoRes] = await db.insert(announcement).values({
        title: "System Maintenance Notice",
        content: "The system will be updated tonight.",
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
        title: "New Task Available",
        content: "You have a new task: Consumer Behavior Analysis",
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
        detail: { name: "Consumer Behavior Analysis" },
        ipAddress: "127.0.0.1"
    });

    console.log("\n✅ Comprehensive Seed Completed Successfully!");
    console.log("==========================================");
    console.log(`🔑 Default Password: ${defaultPassword}`);
    console.log(`👤 Admin: admin`);
    console.log(`👨‍🏫 Teachers: ${teachersData.map(t => t.id).join(", ")}`);
    console.log(`👨‍🎓 Students: 2024001 - 2024010`);
    console.log("==========================================");

    process.exit(0);
}

seed().catch((err) => {
    console.error("❌ Seed Failed:", err);
    process.exit(1);
});
