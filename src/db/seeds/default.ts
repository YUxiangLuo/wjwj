import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import * as XLSX from "xlsx";
import { closeDatabase, db } from "../index";
import { DEV_ADMIN_PASSWORD, DEV_AUTH_MODE } from "../../lib/dev-mode";
import {
    admin,
    announcement,
    class_,
    experiment,
    semester,
    student,
    task,
    teacher,
    topic,
    topicAttachment,
} from "../schema";
import type { SubmissionSnapshot } from "../../student/experiment/submit-service";

/**
 * Student-side dogfood seed.
 *
 * Accounts (initial password = student ID / employee ID / admin123 in DEV):
 *   S010 林清  not started on the open task — full happy path
 *   S011 周宁  questionnaire saved — resume from sample planning
 *   S012 吴敏  submitted
 *   S013 郑华  graded
 *   S014 孙琪  rejected — can revise and resubmit
 *   S015 马丽  disabled — login must fail
 *
 * Tasks on 统计学一班:
 *   校园学习体验抽样调查     open now
 *   已截止的课堂练习         deadline passed
 *   下学期预告课题           not open yet
 *   已撤销的示范课题         topic soft-deleted
 */

const questionnaire = {
    title: "校园学习体验调查",
    welcomeText: "您好！本问卷用于了解同学们的校园学习体验，所有数据仅用于课堂统计实验。请根据真实情况作答。",
    endingText: "感谢您的认真作答，您的反馈将帮助我们更好地理解抽样调查与统计推断。",
    questions: [
        { id: "q1", type: "single", content: "您每天用于自主学习的时间？", options: ["1小时以内", "1-2小时", "2-3小时", "3小时以上"] },
        { id: "q2", type: "scale", content: "您对目前学习状态的满意程度？", scaleMin: 1, scaleMax: 5, scaleMinLabel: "非常不满意", scaleMaxLabel: "非常满意" },
        { id: "q3", type: "multiple", content: "您常用的学习资源有哪些？", options: ["教材", "课程视频", "在线题库", "同伴讨论"], minSelect: 1, maxSelect: 4 },
        { id: "q4", type: "boolean", content: "您是否制定每周学习计划？" },
        { id: "q5", type: "single", content: "您更喜欢哪种课堂组织方式？", options: ["讲授", "讨论", "实验", "混合式"] },
        { id: "q6", type: "scale", content: "课程作业负担是否合适？", scaleMin: 1, scaleMax: 5, scaleMinLabel: "过轻", scaleMaxLabel: "过重" },
        { id: "q7", type: "single", content: "您通常在哪里上自习？", options: ["图书馆", "教室", "宿舍", "其他"] },
        { id: "q8", type: "boolean", content: "您是否参加过统计调查实习？" },
    ],
};

// N=200, 95%, ±5%, deff=1, nrr=0 → recommended n=132
const samplePlan = {
    estimationType: "proportion" as const,
    confidenceLevel: "95",
    marginOfError: 5,
    designEffect: 1,
    nonResponseRate: 0,
    recommendedSize: 132,
    finalSampleSize: 132,
};

const samplingResults = {
    simple: { completed: true, sampleCount: 132, seed: 2026 },
    systematic: { completed: true, interval: 200 / 132, sampleCount: 132, seed: 2026, randomStart: 0.7 },
    pps: { completed: true, sizeField: "月生活费", sampleCount: 132, seed: 2026 },
    stratified: {
        completed: true,
        stratifyBy: "年级",
        layers: [
            { name: "大一", count: 80, ratio: 0.4, sampleCount: 53 },
            { name: "大二", count: 60, ratio: 0.3, sampleCount: 40 },
            { name: "大三", count: 40, ratio: 0.2, sampleCount: 26 },
            { name: "大四", count: 20, ratio: 0.1, sampleCount: 13 },
        ],
        sampleCount: 132,
        seed: 2026,
    },
};

const reportContent = `<h2>实验目的</h2><p>本实验通过校园学习体验调查，完整练习问卷设计、样本量规划、四种抽样方法和结果分析。</p><h2>方法与结果</h2><p>在百分之九十五置信水平和百分之五允许误差下确定样本量 132，并分别使用简单随机、系统、PPS 和分层抽样。对不同方法的样本构成与总体分布进行了比较。</p><h2>结论</h2><p>分层抽样能够稳定保持各年级比例，简单随机抽样实现方便。实际调查中应结合总体结构、抽样框质量和执行成本选择方法。</p>`;

const weightConfig = { questionnaire: 30, process: 30, report: 40 };

async function writePopulationFixture() {
    const storagePath = "/storage/topics/seed-population.xlsx";
    const absolutePath = resolve(process.cwd(), storagePath.slice(1));
    await mkdir(dirname(absolutePath), { recursive: true });

    const gradePlan = [
        ...Array.from({ length: 80 }, () => "大一"),
        ...Array.from({ length: 60 }, () => "大二"),
        ...Array.from({ length: 40 }, () => "大三"),
        ...Array.from({ length: 20 }, () => "大四"),
    ];
    const majors = ["统计学", "经济学", "管理学", "计算机"];
    const rows = gradePlan.map((年级, index) => ({
        编号: index + 1,
        年级,
        专业: majors[index % majors.length],
        性别: index % 2 === 0 ? "男" : "女",
        每周学习时长: 6 + (index % 28),
        月生活费: 800 + (index % 20) * 180,
        学习满意度: 1 + (index % 5),
    }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "总体数据");
    await Bun.write(absolutePath, XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
    return storagePath;
}

async function copyGuideAttachment(topicId: number) {
    const source = resolve(process.cwd(), "public/templates/数据上传规范.pdf");
    const storagePath = "/storage/uploads/seed-topic-guide.pdf";
    const target = resolve(process.cwd(), storagePath.slice(1));
    await mkdir(dirname(target), { recursive: true });
    const file = Bun.file(source);
    if (await file.exists()) {
        await Bun.write(target, file);
        const size = (await file.stat()).size;
        await db.insert(topicAttachment).values({
            topicId,
            fileName: "课题说明与数据规范.pdf",
            filePath: storagePath,
            fileType: "application/pdf",
            fileSize: size,
        });
    }
}

async function seed() {
    const generatedAdminPassword = DEV_AUTH_MODE ? DEV_ADMIN_PASSWORD : `Bootstrap!${crypto.randomUUID()}`;
    const adminInitialPassword = process.env.SEED_ADMIN_PASSWORD?.trim() || generatedAdminPassword;
    const adminPassword = await Bun.password.hash(adminInitialPassword);
    const teacherInitialPassword = "T001";
    const teacherPassword = await Bun.password.hash(teacherInitialPassword);
    const populationPath = await writePopulationFixture();
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1_000);
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1_000);
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000);
    const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000);

    await db.insert(admin).values({ username: "admin", password: adminPassword, isFirstLogin: 1 });
    const [teacherRow] = await db.insert(teacher).values({
        employeeId: "T001",
        name: "张老师",
        password: teacherPassword,
        isFirstLogin: 1,
    }).returning();
    const [semesterRow] = await db.insert(semester).values({
        name: "2026-2027-1",
        isCurrent: 1,
    }).returning();
    const [classRow] = await db.insert(class_).values({
        name: "统计学一班",
        semesterId: semesterRow!.id,
        teacherId: teacherRow!.id,
    }).returning();

    const studentSeeds = [
        { studentId: "S010", name: "林清", email: "s010@example.edu", status: 1 },
        { studentId: "S011", name: "周宁", email: "s011@example.edu", status: 1 },
        { studentId: "S012", name: "吴敏", email: "s012@example.edu", status: 1 },
        { studentId: "S013", name: "郑华", email: "s013@example.edu", status: 1 },
        { studentId: "S014", name: "孙琪", email: "s014@example.edu", status: 1 },
        { studentId: "S015", name: "马丽", email: "s015@example.edu", status: 0 },
    ];
    const studentPasswords = await Promise.all(studentSeeds.map((item) => Bun.password.hash(item.studentId)));
    const studentRows = await db.insert(student).values(studentSeeds.map((item, index) => ({
        studentId: item.studentId,
        name: item.name,
        email: item.email,
        status: item.status,
        password: studentPasswords[index]!,
        isFirstLogin: 1,
        classId: classRow!.id,
    }))).returning();

    const fieldMapping = {
        identifier: "编号",
        numeric: ["每周学习时长", "月生活费", "学习满意度"],
        stratified: ["年级", "性别"],
        others: ["专业"],
    };

    const [openTopic] = await db.insert(topic).values({
        teacherId: teacherRow!.id,
        name: "校园学习体验抽样调查",
        description: "围绕校园学习体验完成问卷、样本量规划、四种抽样方法和统计分析。总体 200 人，年级分布不均，便于比较按比例分配与奈曼分配。",
        excelFilePath: populationPath,
        excelRowCount: 200,
        fieldMapping,
        weightConfig,
        recommendQuestions: questionnaire.questions,
        status: 1,
    }).returning();
    await copyGuideAttachment(openTopic!.id);

    const [closedTopic] = await db.insert(topic).values({
        teacherId: teacherRow!.id,
        name: "已截止的课堂练习",
        description: "用于验证截止后不可再进入实验。",
        excelFilePath: populationPath,
        excelRowCount: 200,
        fieldMapping,
        weightConfig,
        recommendQuestions: questionnaire.questions.slice(0, 5),
        status: 1,
    }).returning();

    const [futureTopic] = await db.insert(topic).values({
        teacherId: teacherRow!.id,
        name: "下学期预告课题",
        description: "尚未开放，学生只能查看课题信息。",
        excelFilePath: populationPath,
        excelRowCount: 200,
        fieldMapping,
        weightConfig,
        recommendQuestions: questionnaire.questions.slice(0, 5),
        status: 1,
    }).returning();

    const [deletedTopic] = await db.insert(topic).values({
        teacherId: teacherRow!.id,
        name: "已撤销的示范课题",
        description: "课题已删除，任务大厅应给出不可进入提示。",
        excelFilePath: populationPath,
        excelRowCount: 200,
        fieldMapping,
        weightConfig,
        status: 1,
        deletedAt: yesterday,
    }).returning();

    const [openTask] = await db.insert(task).values({
        topicId: openTopic!.id,
        classId: classRow!.id,
        openTime: yesterday,
        deadline: nextMonth,
    }).returning();
    await db.insert(task).values({
        topicId: closedTopic!.id,
        classId: classRow!.id,
        openTime: lastWeek,
        deadline: yesterday,
    });
    await db.insert(task).values({
        topicId: futureTopic!.id,
        classId: classRow!.id,
        openTime: nextWeek,
        deadline: nextMonth,
    });
    await db.insert(task).values({
        topicId: deletedTopic!.id,
        classId: classRow!.id,
        openTime: lastWeek,
        deadline: nextMonth,
    });

    const byId = Object.fromEntries(studentRows.map((row) => [row.studentId, row]));

    await db.insert(experiment).values({
        studentId: byId.S011!.id,
        taskId: openTask!.id,
        currentStage: 2,
        status: "in_progress",
        questionnaire,
        stage1CompletedAt: yesterday,
    });

    const submittedSnapshot = {
        topicName: openTopic!.name,
        studentName: byId.S012!.name,
        populationSize: 200,
        questionnaire,
        samplePlan,
        samplingResults,
        reportContent,
        weightConfig,
    } satisfies SubmissionSnapshot;

    await db.insert(experiment).values({
        studentId: byId.S012!.id,
        taskId: openTask!.id,
        currentStage: 4,
        status: "submitted",
        questionnaire,
        samplePlan,
        samplingResults,
        reportContent,
        stage1CompletedAt: yesterday,
        stage2CompletedAt: yesterday,
        stage3CompletedAt: yesterday,
        stage4CompletedAt: yesterday,
        submissionSnapshot: submittedSnapshot,
        submittedAt: now,
    });

    await db.insert(experiment).values({
        studentId: byId.S013!.id,
        taskId: openTask!.id,
        currentStage: 4,
        status: "graded",
        questionnaire,
        samplePlan,
        samplingResults,
        reportContent,
        stage1CompletedAt: yesterday,
        stage2CompletedAt: yesterday,
        stage3CompletedAt: yesterday,
        stage4CompletedAt: yesterday,
        submissionSnapshot: { ...submittedSnapshot, studentName: byId.S013!.name },
        submittedAt: yesterday,
        scoreQuestionnaire: "88",
        scoreProcess: "92",
        scoreReport: "90",
        totalScore: "90.00",
        teacherComment: "结构完整，方法比较清楚。",
        gradedByTeacherId: teacherRow!.id,
        gradedAt: now,
    });

    await db.insert(experiment).values({
        studentId: byId.S014!.id,
        taskId: openTask!.id,
        currentStage: 4,
        status: "rejected",
        questionnaire,
        samplePlan,
        samplingResults,
        reportContent,
        stage1CompletedAt: yesterday,
        stage2CompletedAt: yesterday,
        stage3CompletedAt: yesterday,
        stage4CompletedAt: yesterday,
        rejectReason: "请补充四种抽样方法的比较，并说明分层分配依据。",
    });

    await db.insert(announcement).values([
        {
            title: "欢迎使用抽样调查虚拟实验系统",
            content: "请按顺序完成四个实验阶段。系统只在点击“完成并进入下一步”时保存当前阶段。",
            targetScope: "all",
            status: 1,
        },
        {
            title: "学生端实验提示",
            content: "主任务总体 200 人，推荐样本量 132。请先看课题附件再开始问卷设计。",
            targetScope: "student",
            status: 1,
        },
        {
            title: "仅教师可见公告",
            content: "这条公告不应出现在学生任务大厅。",
            targetScope: "teacher",
            status: 1,
        },
    ]);

    console.log("Seed completed.");
    console.log(`Admin: admin / ${adminInitialPassword} (password change required on first login)`);
    console.log(`Teacher: T001 / ${teacherInitialPassword} (password change required on first login)`);
    console.log("Students: S010–S015, initial password equals student ID.");
    console.log("S010 not started | S011 questionnaire done | S012 submitted | S013 graded | S014 rejected | S015 disabled");
}

try {
    await seed();
} catch (error) {
    console.error("Seed failed:", error);
    process.exitCode = 1;
} finally {
    await closeDatabase();
}
