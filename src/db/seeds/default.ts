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
} from "../schema";
import type { SubmissionSnapshot } from "../../student/experiment/submit-service";

const questionnaire = {
    title: "校园学习体验调查",
    welcomeText: "您好！本问卷用于了解同学们的校园学习体验，所有数据仅用于课堂统计实验。",
    endingText: "感谢您的认真作答，您的反馈将帮助我们更好地理解抽样调查与统计推断。",
    questions: [
        { id: "q1", type: "single", content: "您每天用于自主学习的时间？", options: ["1小时以内", "1-2小时", "2-3小时", "3小时以上"] },
        { id: "q2", type: "scale", content: "您对目前学习状态的满意程度？", scaleMin: 1, scaleMax: 5 },
        { id: "q3", type: "multiple", content: "您常用的学习资源有哪些？", options: ["教材", "课程视频", "在线题库", "同伴讨论"], minSelect: 1, maxSelect: 4 },
        { id: "q4", type: "boolean", content: "您是否制定每周学习计划？" },
        { id: "q5", type: "single", content: "您更喜欢哪种课堂组织方式？", options: ["讲授", "讨论", "实验", "混合式"] },
    ],
};

const samplePlan = {
    estimationType: "proportion",
    confidenceLevel: "95",
    marginOfError: 5,
    designEffect: 1,
    nonResponseRate: 0,
    recommendedSize: 132,
    finalSampleSize: 100,
};

const samplingResults = {
    simple: { completed: true, sampleCount: 100, seed: 2026 },
    systematic: { completed: true, interval: 2, sampleCount: 100, seed: 2026, randomStart: 1 },
    pps: { completed: true, sizeField: "月生活费", sampleCount: 100, seed: 2026 },
    stratified: {
        completed: true,
        stratifyBy: "年级",
        layers: [
            { name: "大一", count: 50, ratio: 0.25, sampleCount: 25 },
            { name: "大二", count: 50, ratio: 0.25, sampleCount: 25 },
            { name: "大三", count: 50, ratio: 0.25, sampleCount: 25 },
            { name: "大四", count: 50, ratio: 0.25, sampleCount: 25 },
        ],
        sampleCount: 100,
        seed: 2026,
    },
};

const reportContent = `<h2>实验目的</h2><p>本实验通过校园学习体验调查，完整练习问卷设计、样本量规划、四种抽样方法和结果分析。</p><h2>方法与结果</h2><p>在百分之九十五置信水平和百分之五允许误差下确定样本量，并分别使用简单随机、系统、PPS和分层抽样。对不同方法的样本构成与总体分布进行了比较。</p><h2>结论</h2><p>分层抽样能够稳定保持各年级比例，简单随机抽样实现方便。实际调查中应结合总体结构、抽样框质量和执行成本选择方法。</p>`;

async function writePopulationFixture() {
    const storagePath = "/storage/topics/seed-population.xlsx";
    const absolutePath = resolve(process.cwd(), storagePath.slice(1));
    await mkdir(dirname(absolutePath), { recursive: true });
    const grades = ["大一", "大二", "大三", "大四"];
    const majors = ["统计学", "经济学", "管理学", "计算机"];
    const rows = Array.from({ length: 200 }, (_, index) => ({
        编号: index + 1,
        年级: grades[index % grades.length],
        专业: majors[(index * 3) % majors.length],
        每周学习时长: 8 + (index % 24),
        月生活费: 1_200 + (index % 12) * 150,
        学习满意度: 1 + (index % 5),
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "总体数据");
    await Bun.write(absolutePath, XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
    return storagePath;
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
        { studentId: "S001", name: "李明", email: "s001@example.edu" },
        { studentId: "S002", name: "王芳", email: "s002@example.edu" },
        { studentId: "S003", name: "陈晨", email: "s003@example.edu" },
        { studentId: "S004", name: "赵悦", email: "s004@example.edu" },
    ];
    const studentPasswords = await Promise.all(studentSeeds.map((item) => Bun.password.hash(item.studentId)));
    const studentRows = await db.insert(student).values(studentSeeds.map((item, index) => ({
        ...item,
        password: studentPasswords[index]!,
        isFirstLogin: 1,
        classId: classRow!.id,
    }))).returning();
    const weightConfig = { questionnaire: 30, process: 30, report: 40 };
    const [topicRow] = await db.insert(topic).values({
        teacherId: teacherRow!.id,
        name: "校园学习体验抽样调查",
        description: "围绕校园学习体验完成问卷、样本量规划、四种抽样方法和统计分析。",
        excelFilePath: populationPath,
        excelRowCount: 200,
        fieldMapping: {
            identifier: "编号",
            numeric: ["每周学习时长", "月生活费", "学习满意度"],
            stratified: ["年级"],
            others: ["专业"],
        },
        weightConfig,
        recommendQuestions: questionnaire.questions,
        status: 1,
    }).returning();
    const [taskRow] = await db.insert(task).values({
        topicId: topicRow!.id,
        classId: classRow!.id,
        openTime: yesterday,
        deadline: nextMonth,
    }).returning();

    await db.insert(experiment).values({
        studentId: studentRows[0]!.id,
        taskId: taskRow!.id,
        currentStage: 2,
        status: "in_progress",
        questionnaire,
        stage1CompletedAt: yesterday,
    });

    const snapshot = {
        topicName: topicRow!.name,
        studentName: studentRows[1]!.name,
        populationSize: 200,
        questionnaire,
        samplePlan,
        samplingResults,
        reportContent,
        weightConfig,
    } satisfies SubmissionSnapshot;
    await db.insert(experiment).values({
        studentId: studentRows[1]!.id,
        taskId: taskRow!.id,
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
        submissionSnapshot: snapshot,
        submittedAt: now,
    });
    await db.insert(experiment).values({
        studentId: studentRows[2]!.id,
        taskId: taskRow!.id,
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
        submissionSnapshot: { ...snapshot, studentName: studentRows[2]!.name },
        submittedAt: yesterday,
        scoreQuestionnaire: "88",
        scoreProcess: "92",
        scoreReport: "90",
        totalScore: "90.00",
        teacherComment: "结构完整，方法比较清楚。",
        gradedByTeacherId: teacherRow!.id,
        gradedAt: now,
    });
    await db.insert(announcement).values({
        title: "欢迎使用抽样调查虚拟实验系统",
        content: "请按顺序完成四个实验阶段。系统只在点击“完成并进入下一步”时保存当前阶段。",
        targetScope: "all",
        status: 1,
    });

    console.log("Seed completed.");
    console.log(`Admin: admin / ${adminInitialPassword} (password change required on first login)`);
    console.log(`Teacher: T001 / ${teacherInitialPassword} (password change required on first login)`);
    console.log("Students: initial password equals each student ID (password change required on first login)");
}

try {
    await seed();
} catch (error) {
    console.error("Seed failed:", error);
    process.exitCode = 1;
} finally {
    await closeDatabase();
}
