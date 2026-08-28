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
    samplingAttempt,
    semester,
    student,
    task,
    teacher,
    topic,
    topicAttachment,
} from "../schema";
import { calculateMeanEstimationSampleSize } from "../../student/experiment/sample-plan";
import { executeSamplingAction, type SamplingMethod } from "../../student/experiment/sampling-service";
import { PPS_UNAVAILABLE_REASON } from "../../student/experiment/sampling-messages";
import {
    validateQuestionnaireForSubmit,
    validateReportForSubmit,
    validateSamplePlanForSubmit,
    validateSamplingResultsForSubmit,
} from "../../student/experiment/submit-validation";
import type { SubmissionSnapshot } from "../../student/experiment/submit-service";
import { compactSamplingResults } from "../../student/experiment/sampling-storage";
import {
    allocateIntegerShares,
    computePpsMeanPlan,
    createMeanPopulation,
    createPpsPopulation,
    DOGFOOD_COUNTS,
    DOGFOOD_NAMES,
    GUIDE_ATTACHMENT_PATH,
    MEAN_POPULATION_PATH,
    PPS_POPULATION_PATH,
    resolveSeedAnchor,
    shiftDays,
} from "./dogfood-fixtures";

const questionnaire = {
    title: "校园学习体验调查（认知预试）",
    welcomeText: "您好！本问卷用于课堂认知预试，帮助练习问卷设计。预试答案不进入抽样或统计分析。请根据真实情况作答。",
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

const weightConfig = { questionnaire: 30, process: 30, report: 40 };
const ppsPopulationForPlan = createPpsPopulation();
const { recommendedSize: ppsMeanRecommendedSize, populationVariance: weeklyHoursVariance } = computePpsMeanPlan(ppsPopulationForPlan);
const proportionPlan = {
    estimationType: "mean" as const,
    confidenceLevel: "95",
    marginOfError: 2,
    populationVariance: weeklyHoursVariance,
    designEffect: 1,
    nonResponseRate: 0,
    recommendedSize: ppsMeanRecommendedSize,
    finalSampleSize: ppsMeanRecommendedSize,
};
const calculatedMeanSize = calculateMeanEstimationSampleSize({
    confidenceLevel: "95",
    marginOfError: 2,
    populationSize: 24,
    populationVariance: 36,
    designEffect: 1,
    nonResponseRate: 0,
});
if (calculatedMeanSize === null) throw new Error("Dogfood mean sample plan could not be calculated");
const meanRecommendedSize: number = calculatedMeanSize;
const meanPlan = {
    estimationType: "mean" as const,
    confidenceLevel: "95",
    marginOfError: 2,
    populationVariance: 36,
    designEffect: 1,
    nonResponseRate: 0,
    recommendedSize: meanRecommendedSize,
    finalSampleSize: meanRecommendedSize,
};

const reportContent = `<h2>实验目的</h2><p>本实验对照虚拟总体中每周学习时长的均值，比较四种抽样设计。问卷阶段是认知预试，答案不进入估计。</p><h2>方法与结果</h2><p>在百分之九十五置信水平和绝对误差限 2 下确定样本量，分别使用简单随机、系统、PPS 和分层抽样。PPS 使用月生活费作为规模变量，避免与对照变量循环。对不同方法的样本构成、每周学习时长与总体分布进行了比较，并记录随机种子以保证结果可复现。</p><h2>结论</h2><p>分层抽样能够稳定保持各层比例，简单随机抽样实现方便。实际调查中应结合总体结构、抽样框质量和执行成本选择方法，同时完整说明误差限和无回答率假设。</p>`;
const meanReportContent = `<h2>实验目的</h2><p>本实验以每周阅读时长的均值为估计目标，使用总体方差估计、绝对误差限和有限总体校正确定样本量，并比较可执行抽样方法的结果。</p><h2>方法与结果</h2><p>总体中每周阅读时长包含零值，且没有其他对每个单位都为正数的数值字段，因此不存在合格的 PPS 规模变量。系统按规则将 PPS 标记为不可用并跳过该方法，随后完成简单随机、系统和按学院分层抽样。</p><h2>结论</h2><p>均值估计流程使用样本量 15。三种可用方法均保留随机种子和完整样本行；PPS 的跳过是由总体数据条件决定的有效结果，而不是执行失败。分析时应明确记录这一限制，避免为完成形式而选用不满足正值条件的规模变量。</p>`;

const ppsFieldMapping = {
    identifier: "编号",
    numeric: ["每周学习时长", "月生活费", "学习满意度"],
    stratified: ["年级", "性别"],
    others: ["专业"],
    analysisTarget: { kind: "mean" as const, field: "每周学习时长" },
};
const meanFieldMapping = {
    identifier: "编号",
    numeric: ["每周阅读时长"],
    stratified: ["学院", "是否住宿"],
    others: ["年级"],
    analysisTarget: { kind: "mean" as const, field: "每周阅读时长" },
};

async function writePopulationFixtures(
    ppsPopulation: Array<Record<string, unknown>>,
    meanPopulation: Array<Record<string, unknown>>,
) {
    const ppsTarget = resolve(process.cwd(), PPS_POPULATION_PATH.slice(1));
    const meanTarget = resolve(process.cwd(), MEAN_POPULATION_PATH.slice(1));
    await mkdir(dirname(ppsTarget), { recursive: true });

    const ppsWorkbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(ppsWorkbook, XLSX.utils.json_to_sheet(ppsPopulation), "总体数据");
    await Bun.write(ppsTarget, XLSX.write(ppsWorkbook, { type: "buffer", bookType: "xlsx" }));

    const meanSheet = XLSX.utils.json_to_sheet(meanPopulation);
    await Bun.write(meanTarget, `\uFEFF${XLSX.utils.sheet_to_csv(meanSheet)}`);

    for (const path of [ppsTarget, meanTarget]) {
        const file = Bun.file(path);
        if (!(await file.exists()) || file.size <= 0) throw new Error(`Failed to write seed fixture: ${path}`);
    }
}

function guideSourceFile() {
    return Bun.file(resolve(process.cwd(), "public/templates/数据上传规范.pdf"));
}

async function preflightGuideSource() {
    const sourceFile = guideSourceFile();
    if (!(await sourceFile.exists()) || sourceFile.size <= 0) {
        throw new Error(`Required seed attachment is missing or empty: ${sourceFile.name}`);
    }
}

async function copyGuideAttachment(topicId: number) {
    const sourceFile = guideSourceFile();
    const source = sourceFile.name;
    if (!(await sourceFile.exists())) {
        throw new Error(`Required seed attachment is missing: ${source}`);
    }

    const target = resolve(process.cwd(), GUIDE_ATTACHMENT_PATH.slice(1));
    await mkdir(dirname(target), { recursive: true });
    await Bun.write(target, sourceFile);
    const targetFile = Bun.file(target);
    if (!(await targetFile.exists()) || targetFile.size <= 0) {
        throw new Error(`Failed to write seed attachment: ${target}`);
    }
    await db.insert(topicAttachment).values({
        topicId,
        fileName: "课题说明与数据规范.pdf",
        filePath: GUIDE_ATTACHMENT_PATH,
        fileType: "application/pdf",
        fileSize: targetFile.size,
    });
}

async function runSampling(params: {
    method: SamplingMethod;
    rawParams: Record<string, unknown>;
    targetSampleSize: number;
    population: Array<Record<string, unknown>>;
    fieldMapping: unknown;
}) {
    const executed = await executeSamplingAction(params);
    if (!executed.ok) throw new Error(`Seed ${params.method} sampling failed: ${executed.errorMessage}`);
    return { ...executed.result, serverGenerated: true };
}

async function buildSamplingFixtures(
    ppsPopulation: Array<Record<string, unknown>>,
    meanPopulation: Array<Record<string, unknown>>,
) {
    const n = ppsMeanRecommendedSize;
    const [grade1 = 0, grade2 = 0, grade3 = 0, grade4 = 0] = allocateIntegerShares(n, [0.4, 0.3, 0.2, 0.1]);
    const [college1 = 0, college2 = 0, college3 = 0] = allocateIntegerShares(meanRecommendedSize, [1 / 3, 1 / 3, 1 / 3]);
    const proportionResults = {
        simple: await runSampling({ method: "simple", rawParams: { sampleSize: n, seed: 202601 }, targetSampleSize: n, population: ppsPopulation, fieldMapping: ppsFieldMapping }),
        systematic: await runSampling({ method: "systematic", rawParams: { seed: 202602 }, targetSampleSize: n, population: ppsPopulation, fieldMapping: ppsFieldMapping }),
        pps: await runSampling({ method: "pps", rawParams: { sampleSize: n, sizeField: "月生活费", seed: 202603 }, targetSampleSize: n, population: ppsPopulation, fieldMapping: ppsFieldMapping }),
        stratified: await runSampling({
            method: "stratified",
            rawParams: {
                stratifyBy: "年级",
                seed: 202604,
                layers: [
                    { name: "大一", ratio: 0.4, sampleCount: grade1 },
                    { name: "大二", ratio: 0.3, sampleCount: grade2 },
                    { name: "大三", ratio: 0.2, sampleCount: grade3 },
                    { name: "大四", ratio: 0.1, sampleCount: grade4 },
                ],
            },
            targetSampleSize: n,
            population: ppsPopulation,
            fieldMapping: ppsFieldMapping,
        }),
    };

    const meanResults = {
        simple: await runSampling({ method: "simple", rawParams: { sampleSize: meanRecommendedSize, seed: 202611 }, targetSampleSize: meanRecommendedSize, population: meanPopulation, fieldMapping: meanFieldMapping }),
        systematic: await runSampling({ method: "systematic", rawParams: { seed: 202612 }, targetSampleSize: meanRecommendedSize, population: meanPopulation, fieldMapping: meanFieldMapping }),
        pps: { unavailable: true, unavailableReason: PPS_UNAVAILABLE_REASON, serverGenerated: true },
        stratified: await runSampling({
            method: "stratified",
            rawParams: {
                stratifyBy: "学院",
                seed: 202614,
                layers: [
                    { name: "文学院", ratio: 1 / 3, sampleCount: college1 },
                    { name: "理学院", ratio: 1 / 3, sampleCount: college2 },
                    { name: "商学院", ratio: 1 / 3, sampleCount: college3 },
                ],
            },
            targetSampleSize: meanRecommendedSize,
            population: meanPopulation,
            fieldMapping: meanFieldMapping,
        }),
    };

    return { proportionResults, meanResults };
}

function buildSamplingAttemptDetails(result: Record<string, unknown>) {
    const {
        data: _data,
        indices: _indices,
        inclusionProbabilities: _inclusionProbabilities,
        serverGenerated: _serverGenerated,
        seed: _seed,
        sampleCount: _sampleCount,
        ...details
    } = result;
    return details;
}

function assertCompleteSubmission(samplePlan: unknown, samplingResults: unknown, populationSize: number, submissionReport: string) {
    const errors = [
        validateQuestionnaireForSubmit(questionnaire),
        validateSamplePlanForSubmit(samplePlan, populationSize),
        validateSamplingResultsForSubmit(samplingResults, (samplePlan as { finalSampleSize: number }).finalSampleSize, populationSize),
        validateReportForSubmit(submissionReport),
    ].filter(Boolean);
    if (errors.length) throw new Error(`Invalid dogfood submission fixture: ${errors.join("; ")}`);
}

function snapshot(params: {
    topicName: string;
    studentName: string;
    populationSize: number;
    samplePlan: typeof proportionPlan | typeof meanPlan;
    samplingResults: Record<string, unknown>;
    reportContent: string;
}): SubmissionSnapshot {
    return {
        topicName: params.topicName,
        studentName: params.studentName,
        populationSize: params.populationSize,
        questionnaire,
        samplePlan: params.samplePlan,
        samplingResults: params.samplingResults,
        reportContent: params.reportContent,
        weightConfig,
    };
}

async function seed() {
    const anchor = resolveSeedAnchor(process.env.SEED_NOW);
    const day = (offset: number) => shiftDays(anchor, offset);
    console.log(`Seed anchor: ${anchor.toISOString()}`);
    await preflightGuideSource();

    const generatedAdminPassword = DEV_AUTH_MODE ? DEV_ADMIN_PASSWORD : `Bootstrap!${crypto.randomUUID()}`;
    const adminInitialPassword = process.env.SEED_ADMIN_PASSWORD?.trim() || generatedAdminPassword;
    const ppsPopulation = createPpsPopulation();
    const meanPopulation = createMeanPopulation();
    await writePopulationFixtures(ppsPopulation, meanPopulation);
    const { proportionResults, meanResults } = await buildSamplingFixtures(ppsPopulation, meanPopulation);
    assertCompleteSubmission(proportionPlan, proportionResults, ppsPopulation.length, reportContent);
    assertCompleteSubmission(meanPlan, meanResults, meanPopulation.length, meanReportContent);
    const compactProportionResults = compactSamplingResults(proportionResults);
    const compactMeanResults = compactSamplingResults(meanResults);
    if (!compactProportionResults || !compactMeanResults) throw new Error("Dogfood sampling fixtures could not be compacted");

    await db.insert(admin).values({
        username: "admin",
        password: await Bun.password.hash(adminInitialPassword),
        isFirstLogin: 1,
        loginFailCount: 0,
        lockedUntil: null,
        createdAt: anchor,
        updatedAt: anchor,
    });

    const teacherSeeds = [
        { employeeId: "T001", name: "张老师", password: "Teacher!2026", isFirstLogin: 0, status: 1 },
        { employeeId: "T002", name: "李老师", password: "T002", isFirstLogin: 1, status: 1 },
        { employeeId: "T003", name: "停用教师", password: "T003", isFirstLogin: 1, status: 0 },
    ];
    const teacherRows = await db.insert(teacher).values(await Promise.all(teacherSeeds.map(async (item) => ({
        employeeId: item.employeeId,
        name: item.name,
        password: await Bun.password.hash(item.password),
        isFirstLogin: item.isFirstLogin,
        status: item.status,
        loginFailCount: 0,
        lockedUntil: null,
        createdAt: anchor,
        updatedAt: anchor,
    })))).returning();
    const teachersById = Object.fromEntries(teacherRows.map((row) => [row.employeeId, row]));

    const semesterRows = await db.insert(semester).values([
        { name: DOGFOOD_NAMES.currentSemester, isCurrent: 1, createdAt: day(-60), updatedAt: anchor },
        { name: DOGFOOD_NAMES.oldSemester, isCurrent: 0, createdAt: day(-240), updatedAt: day(-60) },
    ]).returning();
    const semesterByName = Object.fromEntries(semesterRows.map((row) => [row.name, row]));
    const classRows = await db.insert(class_).values([
        { name: DOGFOOD_NAMES.mainClass, semesterId: semesterByName[DOGFOOD_NAMES.currentSemester]!.id, teacherId: teachersById.T001!.id, createdAt: day(-45), updatedAt: day(-45) },
        { name: DOGFOOD_NAMES.oldClass, semesterId: semesterByName[DOGFOOD_NAMES.oldSemester]!.id, teacherId: teachersById.T002!.id, createdAt: day(-220), updatedAt: day(-220) },
    ]).returning();
    const classByName = Object.fromEntries(classRows.map((row) => [row.name, row]));

    const studentSeeds = [
        { studentId: "S010", name: "林清", password: "Student!010", isFirstLogin: 0, status: 1, loginFailCount: 0, lockedUntil: null, deletedAt: null },
        { studentId: "S011", name: "周宁", password: "S011", isFirstLogin: 1, status: 1, loginFailCount: 0, lockedUntil: null, deletedAt: null },
        { studentId: "S012", name: "吴敏", password: "Student!012", isFirstLogin: 0, status: 1, loginFailCount: 0, lockedUntil: null, deletedAt: null },
        { studentId: "S013", name: "郑华", password: "Student!013", isFirstLogin: 0, status: 1, loginFailCount: 0, lockedUntil: null, deletedAt: null },
        { studentId: "S014", name: "孙琪", password: "Student!014", isFirstLogin: 0, status: 1, loginFailCount: 0, lockedUntil: null, deletedAt: null },
        { studentId: "S015", name: "马丽", password: "Student!015", isFirstLogin: 0, status: 1, loginFailCount: 0, lockedUntil: null, deletedAt: null },
        { studentId: "S016", name: "陈晨", password: "Student!016", isFirstLogin: 0, status: 1, loginFailCount: 0, lockedUntil: null, deletedAt: null },
        { studentId: "S017", name: "何静", password: "Student!017", isFirstLogin: 0, status: 1, loginFailCount: 0, lockedUntil: null, deletedAt: null },
        { studentId: "S018", name: "锁定学生", password: "S018", isFirstLogin: 1, status: 1, loginFailCount: 5, lockedUntil: day(1), deletedAt: null },
        { studentId: "S019", name: "停用学生", password: "S019", isFirstLogin: 1, status: 0, loginFailCount: 0, lockedUntil: null, deletedAt: null },
        { studentId: "S020", name: "已删学生", password: "S020", isFirstLogin: 1, status: 0, loginFailCount: 0, lockedUntil: null, deletedAt: day(-2) },
    ];
    const studentRows = await db.insert(student).values(await Promise.all(studentSeeds.map(async (item) => ({
        studentId: item.studentId,
        name: item.name,
        email: `${item.studentId.toLowerCase()}@example.edu`,
        password: await Bun.password.hash(item.password),
        isFirstLogin: item.isFirstLogin,
        status: item.status,
        loginFailCount: item.loginFailCount,
        lockedUntil: item.lockedUntil,
        deletedAt: item.deletedAt,
        classId: classByName[DOGFOOD_NAMES.mainClass]!.id,
        createdAt: day(-40),
        updatedAt: item.deletedAt ?? anchor,
    })))).returning();
    const studentsById = Object.fromEntries(studentRows.map((row) => [row.studentId, row]));

    const validTopicValues = {
        teacherId: teachersById.T001!.id,
        excelFilePath: PPS_POPULATION_PATH,
        excelRowCount: 200,
        fieldMapping: ppsFieldMapping,
        weightConfig,
        recommendQuestions: questionnaire.questions,
        status: 1,
        createdAt: day(-20),
        updatedAt: day(-7),
    };
    const topicRows = await db.insert(topic).values([
        { ...validTopicValues, name: DOGFOOD_NAMES.topicA, description: "已发布的均值对照流程；对照每周学习时长，PPS 使用月生活费作为规模变量。" },
        { ...validTopicValues, name: DOGFOOD_NAMES.topicB, description: "已发布的均值估计流程；总体含一个零值，因此没有可用 PPS 规模变量。", excelFilePath: MEAN_POPULATION_PATH, excelRowCount: 24, fieldMapping: meanFieldMapping },
        { teacherId: teachersById.T001!.id, name: DOGFOOD_NAMES.topicC, description: "未发布且未分配任务的编辑草稿。", status: 0, createdAt: day(-3), updatedAt: day(-3) },
        { ...validTopicValues, name: DOGFOOD_NAMES.topicD, description: "已截止任务的发布课题。" },
        { ...validTopicValues, name: DOGFOOD_NAMES.topicE, description: "尚未到开放时间的发布课题。" },
        { ...validTopicValues, name: DOGFOOD_NAMES.topicF, description: "课题已软删除，但保留任务和历史提交用于过滤校验。", deletedAt: day(-2), updatedAt: day(-2) },
        { ...validTopicValues, name: DOGFOOD_NAMES.topicG, description: "课题仍发布，但任务已软删除并保留历史提交。" },
    ]).returning();
    const topicsByName = Object.fromEntries(topicRows.map((row) => [row.name, row]));
    await copyGuideAttachment(topicsByName[DOGFOOD_NAMES.topicA]!.id);

    const mainClassId = classByName[DOGFOOD_NAMES.mainClass]!.id;
    const taskRows = await db.insert(task).values([
        { topicId: topicsByName[DOGFOOD_NAMES.topicA]!.id, classId: mainClassId, openTime: day(-7), deadline: day(30), createdAt: day(-7), updatedAt: day(-7) },
        { topicId: topicsByName[DOGFOOD_NAMES.topicB]!.id, classId: mainClassId, openTime: null, deadline: null, createdAt: day(-6), updatedAt: day(-6) },
        { topicId: topicsByName[DOGFOOD_NAMES.topicD]!.id, classId: mainClassId, openTime: day(-14), deadline: day(-1), createdAt: day(-14), updatedAt: day(-1) },
        { topicId: topicsByName[DOGFOOD_NAMES.topicE]!.id, classId: mainClassId, openTime: day(7), deadline: day(30), createdAt: day(-1), updatedAt: day(-1) },
        { topicId: topicsByName[DOGFOOD_NAMES.topicF]!.id, classId: mainClassId, openTime: day(-10), deadline: day(30), createdAt: day(-10), updatedAt: day(-2) },
        { topicId: topicsByName[DOGFOOD_NAMES.topicG]!.id, classId: mainClassId, openTime: day(-10), deadline: day(30), deletedAt: day(-2), createdAt: day(-10), updatedAt: day(-2) },
    ]).returning();
    const tasksByTopicId = Object.fromEntries(taskRows.map((row) => [row.topicId, row]));
    const taskFor = (topicName: string) => tasksByTopicId[topicsByName[topicName]!.id]!;
    const aTask = taskFor(DOGFOOD_NAMES.topicA);

    const completedBase = {
        currentStage: 4,
        questionnaire,
        samplePlan: proportionPlan,
        samplingResults: compactProportionResults,
        reportContent,
        stage1CompletedAt: day(-5),
        stage2CompletedAt: day(-4),
        stage3CompletedAt: day(-3),
        stage4CompletedAt: day(-2),
    } as const;
    const proportionSnapshot = (studentId: string, topicName: string = DOGFOOD_NAMES.topicA) => snapshot({
        topicName,
        studentName: studentsById[studentId]!.name,
        populationSize: 200,
        samplePlan: proportionPlan,
        samplingResults: compactProportionResults,
        reportContent,
    });

    const experimentRows = await db.insert(experiment).values([
        { studentId: studentsById.S011!.id, taskId: aTask.id, currentStage: 1, status: "in_progress", questionnaire, createdAt: day(-2), updatedAt: day(-2) },
        { studentId: studentsById.S012!.id, taskId: aTask.id, currentStage: 2, status: "in_progress", questionnaire, stage1CompletedAt: day(-2), createdAt: day(-3), updatedAt: day(-2) },
        { studentId: studentsById.S013!.id, taskId: aTask.id, currentStage: 3, status: "in_progress", questionnaire, samplePlan: proportionPlan, stage1CompletedAt: day(-3), stage2CompletedAt: day(-2), createdAt: day(-4), updatedAt: day(-2) },
        { ...completedBase, studentId: studentsById.S014!.id, taskId: aTask.id, status: "in_progress", reportContent: "<p>四种抽样已完成，正在撰写实验报告。</p>", stage4CompletedAt: null, createdAt: day(-6), updatedAt: day(-1) },
        { ...completedBase, studentId: studentsById.S015!.id, taskId: aTask.id, status: "submitted", submissionSnapshot: proportionSnapshot("S015"), submittedAt: day(-1), createdAt: day(-7), updatedAt: day(-1) },
        { ...completedBase, studentId: studentsById.S016!.id, taskId: aTask.id, status: "graded", submissionSnapshot: proportionSnapshot("S016"), submittedAt: day(-2), scoreQuestionnaire: "92", scoreProcess: "88", scoreReport: "90", totalScore: "90.00", teacherComment: "结构完整，抽样方法比较清楚。", gradedByTeacherId: teachersById.T001!.id, gradedAt: day(-1), createdAt: day(-7), updatedAt: day(-1) },
        { ...completedBase, studentId: studentsById.S017!.id, taskId: aTask.id, version: 2, status: "rejected", submissionSnapshot: proportionSnapshot("S017"), submittedAt: day(-2), rejectReason: "请补充四种抽样方法的比较，并说明分层分配依据。", gradedByTeacherId: teachersById.T001!.id, gradedAt: day(-1), createdAt: day(-7), updatedAt: day(-1) },
        { ...completedBase, studentId: studentsById.S020!.id, taskId: aTask.id, status: "submitted", submissionSnapshot: proportionSnapshot("S020"), submittedAt: day(-3), createdAt: day(-8), updatedAt: day(-3) },
        {
            studentId: studentsById.S015!.id,
            taskId: taskFor(DOGFOOD_NAMES.topicB).id,
            currentStage: 4,
            status: "submitted",
            questionnaire,
            samplePlan: meanPlan,
            samplingResults: compactMeanResults,
            reportContent: meanReportContent,
            stage1CompletedAt: day(-5),
            stage2CompletedAt: day(-4),
            stage3CompletedAt: day(-3),
            stage4CompletedAt: day(-2),
            submissionSnapshot: snapshot({ topicName: DOGFOOD_NAMES.topicB, studentName: studentsById.S015!.name, populationSize: 24, samplePlan: meanPlan, samplingResults: compactMeanResults, reportContent: meanReportContent }),
            submittedAt: day(-1),
            createdAt: day(-6),
            updatedAt: day(-1),
        },
        { ...completedBase, studentId: studentsById.S015!.id, taskId: taskFor(DOGFOOD_NAMES.topicF).id, status: "submitted", submissionSnapshot: proportionSnapshot("S015", DOGFOOD_NAMES.topicF), submittedAt: day(-3), createdAt: day(-9), updatedAt: day(-3) },
        { ...completedBase, studentId: studentsById.S016!.id, taskId: taskFor(DOGFOOD_NAMES.topicG).id, status: "submitted", submissionSnapshot: proportionSnapshot("S016", DOGFOOD_NAMES.topicG), submittedAt: day(-3), createdAt: day(-9), updatedAt: day(-3) },
    ]).returning({ id: experiment.id, studentId: experiment.studentId, taskId: experiment.taskId });

    const auditedExperiment = experimentRows.find((row) => (
        row.studentId === studentsById.S015!.id && row.taskId === aTask.id
    ));
    if (!auditedExperiment) throw new Error("Dogfood audited experiment is missing");
    const auditedMethods = (["simple", "systematic", "pps", "stratified"] as const).map((method, index) => {
        const result = proportionResults[method] as Record<string, unknown>;
        return {
            experimentId: auditedExperiment.id,
            method,
            seed: Number(result.seed),
            sampleCount: Number(result.sampleCount),
            details: buildSamplingAttemptDetails(result),
            createdAt: new Date(day(-1).getTime() - (3 - index) * 60_000),
        };
    });
    await db.insert(samplingAttempt).values(auditedMethods);

    await db.insert(announcement).values([
        { title: "欢迎使用抽样调查虚拟实验系统", content: "请按顺序完成四个实验阶段，并留意任务开放时间和截止时间。", targetScope: "all", status: 1, createdAt: day(-6), updatedAt: day(-6) },
        { title: "学生端实验提示", content: `均值对照任务推荐样本量为 ${ppsMeanRecommendedSize}；请先查看课题附件再开始实验。问卷是预试，不进入估计。`, targetScope: "student", status: 1, createdAt: day(-5), updatedAt: day(-5) },
        { title: "教师端批改提示", content: "批改列表包含待批改、已批改和已驳回状态，软删数据不应出现。", targetScope: "teacher", status: 1, createdAt: day(-4), updatedAt: day(-4) },
        { title: "公告草稿", content: "未发布公告不应出现在学生或教师首页。", targetScope: "all", status: 0, createdAt: day(-1), updatedAt: day(-1) },
    ]);

    console.log("Seed completed.");
    console.log(`Counts: ${Object.entries(DOGFOOD_COUNTS).map(([key, value]) => `${key}=${value}`).join(" ")}`);
    console.log(`Admin: admin / ${adminInitialPassword} (first-login)`);
    console.log("Teachers: T001 / Teacher!2026 (returning); T002 / T002 (first-login); T003 / T003 (disabled)");
    console.log("Students: S010 / Student!010; S011 / S011 (first-login); S012-S017 / Student!<suffix>; S018 locked; S019 disabled; S020 deleted");
}

try {
    await seed();
} catch (error) {
    console.error("Seed failed:", error);
    process.exitCode = 1;
} finally {
    await closeDatabase();
}
