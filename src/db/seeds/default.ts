import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import * as XLSX from "xlsx";
import { closeDatabase, db } from "../index";
import { DEV_ADMIN_PASSWORD, DEV_AUTH_MODE } from "../../lib/dev-mode";
import { resolveDemoMode } from "../../lib/demo-mode";
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
import { calculateFinitePopulationSampleSize, calculateMeanEstimationSampleSize } from "../../student/experiment/sample-plan";
import { executeSamplingAction, type SamplingMethod } from "../../student/experiment/sampling-service";
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
    createDiningServicePopulation,
    createGraduateIntentionPopulation,
    createMeanPopulation,
    createPpsPopulation,
    DINING_POPULATION_PATH,
    DOGFOOD_COUNTS,
    DOGFOOD_NAMES,
    GUIDE_ATTACHMENT_PATH,
    QUESTIONNAIRE_TEMPLATE_ATTACHMENT_PATH,
    MEAN_POPULATION_PATH,
    PPS_POPULATION_PATH,
    PROPORTION_POPULATION_PATH,
    resolveSeedAnchor,
    shiftDays,
} from "./dogfood-fixtures";
import { DEMO_STUDENT_ACCOUNTS } from "./demo-accounts";
import { buildDefaultSamplingPolicy, type SamplingPolicyV1 } from "../../lib/sampling-policy";

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

const graduateQuestionnaire = {
    title: "毕业发展与就业准备调查（认知预试）",
    welcomeText: "您好！本问卷用于了解毕业生发展意向与就业准备情况。课堂预试答案不会进入正式估计，请按真实想法体验作答。",
    endingText: "感谢您的参与。您的反馈将帮助完善毕业发展服务，也将用于检查问题措辞和选项设置是否清晰。",
    questions: [
        { id: "gq1", type: "single", content: "您目前首选的毕业去向是？", options: ["直接就业", "考研", "考公", "出国深造", "灵活就业"] },
        { id: "gq2", type: "boolean", content: "您是否有过三个月以上的实习经历？" },
        { id: "gq3", type: "scale", content: "您对当前就业准备程度的评价？", scaleMin: 1, scaleMax: 5, scaleMinLabel: "尚未准备", scaleMaxLabel: "准备充分" },
        { id: "gq4", type: "multiple", content: "您最需要哪些就业支持？", options: ["职业测评", "简历辅导", "实习信息", "面试训练", "行业讲座"], minSelect: 1, maxSelect: 3 },
        { id: "gq5", type: "single", content: "您获取招聘信息的主要渠道是？", options: ["学校就业平台", "招聘网站", "社交媒体", "老师同学推荐", "企业宣讲会"] },
        { id: "gq6", type: "boolean", content: "您是否已经形成明确的毕业发展计划？" },
    ],
};

const diningQuestionnaire = {
    title: "校园餐厅午间服务体验调查（认知预试）",
    welcomeText: "您好！本问卷用于课堂演练校园餐厅服务调查。预试回答只帮助检查问卷可理解性，不会进入等待时间估计。",
    endingText: "感谢您完成体验。正式研究将以服务时段观测记录估计等待时间，并结合客流和开放窗口数解释结果。",
    questions: [
        { id: "dq1", type: "single", content: "您最常在哪个校区就餐？", options: ["东校区", "西校区"] },
        { id: "dq2", type: "single", content: "您通常到达餐厅的时间？", options: ["11:30前", "11:30-12:00", "12:00-12:30", "12:30后"] },
        { id: "dq3", type: "scale", content: "您对午间排队秩序的满意程度？", scaleMin: 1, scaleMax: 5, scaleMinLabel: "很不满意", scaleMaxLabel: "很满意" },
        { id: "dq4", type: "multiple", content: "哪些因素最影响您的餐厅选择？", options: ["等待时间", "价格", "口味", "距离", "座位"], minSelect: 1, maxSelect: 3 },
        { id: "dq5", type: "boolean", content: "您是否愿意错峰就餐以减少等待？" },
    ],
};

const weightConfig = { questionnaire: 30, process: 30, report: 40 };
const defaultSamplingPolicy = buildDefaultSamplingPolicy();
const noPpsSamplingPolicy = buildDefaultSamplingPolicy({ ppsEnabled: false });
const stratifiedRequiredPolicy: SamplingPolicyV1 = {
    version: 1,
    methods: { ...defaultSamplingPolicy.methods, stratified: "required" },
};
const ppsRequiredPolicy: SamplingPolicyV1 = {
    version: 1,
    methods: { ...defaultSamplingPolicy.methods, pps: "required" },
};
const ppsPopulationForPlan = createPpsPopulation();
const { recommendedSize: ppsMeanRecommendedSize, populationVariance: weeklyHoursVariance } = computePpsMeanPlan(ppsPopulationForPlan);
const learningPlan = {
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

const calculatedGraduateSize = calculateFinitePopulationSampleSize({
    confidenceLevel: "95",
    marginOfError: 5,
    populationSize: 160,
    designEffect: 1,
    nonResponseRate: 0,
});
if (calculatedGraduateSize === null) throw new Error("Dogfood graduate proportion plan could not be calculated");
const graduateRecommendedSize: number = calculatedGraduateSize;
const graduatePlan = {
    estimationType: "proportion" as const,
    confidenceLevel: "95",
    marginOfError: 5,
    designEffect: 1,
    nonResponseRate: 0,
    recommendedSize: graduateRecommendedSize,
    finalSampleSize: graduateRecommendedSize,
};

const diningPopulationForPlan = createDiningServicePopulation();
const diningWaitValues = diningPopulationForPlan.map((row) => Number(row.等待分钟));
const diningWaitMean = diningWaitValues.reduce((sum, value) => sum + value, 0) / diningWaitValues.length;
const diningWaitVariance = diningWaitValues.reduce((sum, value) => sum + (value - diningWaitMean) ** 2, 0) / (diningWaitValues.length - 1);
const calculatedDiningSize = calculateMeanEstimationSampleSize({
    confidenceLevel: "95",
    marginOfError: 1.5,
    populationSize: diningPopulationForPlan.length,
    populationVariance: diningWaitVariance,
    designEffect: 1,
    nonResponseRate: 0,
});
if (calculatedDiningSize === null) throw new Error("Dogfood dining mean plan could not be calculated");
const diningRecommendedSize: number = calculatedDiningSize;
const diningPlan = {
    estimationType: "mean" as const,
    confidenceLevel: "95",
    marginOfError: 1.5,
    populationVariance: diningWaitVariance,
    designEffect: 1,
    nonResponseRate: 0,
    recommendedSize: diningRecommendedSize,
    finalSampleSize: diningRecommendedSize,
};

const reportContent = `<h2>实验目的</h2><p>本实验对照虚拟总体中每周学习时长的均值，比较四种抽样设计。问卷阶段是认知预试，答案不进入估计。</p><h2>方法与结果</h2><p>在百分之九十五置信水平和绝对误差限 2 下确定样本量，分别使用简单随机、系统、PPS 和分层抽样。PPS 使用月生活费作为规模变量，避免与对照变量循环。对不同方法的样本构成、每周学习时长与总体分布进行了比较，并记录随机种子以保证结果可复现。</p><h2>结论</h2><p>分层抽样能够稳定保持各层比例，简单随机抽样实现方便。实际调查中应结合总体结构、抽样框质量和执行成本选择方法，同时完整说明误差限和无回答率假设。</p>`;
const meanReportContent = `<h2>实验目的</h2><p>本实验以每周阅读时长的均值为估计目标，使用总体方差估计、绝对误差限和有限总体校正确定样本量，并比较可执行抽样方法的结果。</p><h2>方法与结果</h2><p>总体中每周阅读时长包含零值，且没有其他对每个单位都为正数的数值字段，因此不存在合格的 PPS 规模变量。实验模板按规则将 PPS 设为不适用，随后完成简单随机、系统和按学院分层抽样。</p><h2>结论</h2><p>均值估计流程使用样本量 15。三种启用方法均保留随机种子和完整样本行；PPS 未启用是由总体数据条件决定的有效策略，而不是执行失败。分析时应明确记录这一限制，避免为完成形式而选用不满足正值条件的规模变量。</p>`;
const graduateReportContent = `<h2>研究问题</h2><p>本研究估计某综合大学本届毕业生中计划直接就业的学生比例，分析单位为一名毕业生。</p><h2>抽样设计</h2><p>以学院进行分层，并使用求职准备度作为 PPS 规模变量。目标类别属于分类变量，因此样本量规划采用最保守比例方差，误差限按百分点解释。</p><h2>结果解释</h2><p>比较四种抽样方法的直接就业比例、设计标准误与总体已知比例。结果仅代表该虚拟总体和当前抽样设计，不应外推到其他学校或毕业年份。</p>`;
const diningReportContent = `<h2>研究问题</h2><p>本研究估计校园餐厅工作日午间高峰服务时段的平均等待分钟数，分析单位是一个十五分钟服务时段，而不是一名学生。</p><h2>抽样设计</h2><p>按校区分层，并以客流量作为 PPS 规模变量，比较简单随机、系统、PPS 与分层抽样。</p><h2>结果解释</h2><p>等待时间会同时受到时段、客流量和开放窗口数影响。单次样本的均值差异不能直接解释为餐厅服务质量的因果差异。</p>`;

const ppsFieldMapping = {
    identifier: "编号",
    numeric: ["每周学习时长", "月生活费", "学习满意度"],
    stratified: ["年级", "性别"],
    others: ["专业"],
    analysisTarget: { kind: "mean" as const, field: "每周学习时长" },
    studyContract: {
        version: 1 as const,
        researchQuestion: "该校学生每周学习时长的平均水平是多少？",
        targetPopulation: "该校全体学生",
        unitOfAnalysis: "一名学生",
        target: { kind: "mean" as const, field: "每周学习时长" },
    },
};
const meanFieldMapping = {
    identifier: "编号",
    numeric: ["每周阅读时长"],
    stratified: ["学院", "是否住宿"],
    others: ["年级"],
    analysisTarget: { kind: "mean" as const, field: "每周阅读时长" },
    studyContract: {
        version: 1 as const,
        researchQuestion: "该校学生每周阅读时长的平均水平是多少？",
        targetPopulation: "该校全体学生",
        unitOfAnalysis: "一名学生",
        target: { kind: "mean" as const, field: "每周阅读时长" },
    },
};

const graduateFieldMapping = {
    identifier: "样本编号",
    numeric: ["每周职业准备时长", "求职准备度"],
    stratified: ["学院", "培养层次"],
    others: ["毕业去向意向", "是否有实习经历"],
    analysisTarget: { kind: "proportion" as const, field: "毕业去向意向", value: "直接就业" },
    studyContract: {
        version: 1 as const,
        researchQuestion: "某综合大学2026届毕业生中，计划直接就业的学生比例是多少？",
        targetPopulation: "某综合大学2026届全体毕业生",
        unitOfAnalysis: "一名毕业生",
        target: { kind: "proportion" as const, field: "毕业去向意向", value: "直接就业" },
    },
};

const diningFieldMapping = {
    identifier: "记录编号",
    numeric: ["等待分钟", "客流量", "开放窗口数"],
    stratified: ["校区", "餐厅"],
    others: ["观测时段", "星期"],
    analysisTarget: { kind: "mean" as const, field: "等待分钟" },
    studyContract: {
        version: 1 as const,
        researchQuestion: "本学期工作日午间高峰时段的平均排队等待时间是多少？",
        targetPopulation: "本学期两校区餐厅工作日午间高峰的全部服务时段",
        unitOfAnalysis: "一个15分钟餐厅服务时段",
        target: { kind: "mean" as const, field: "等待分钟" },
    },
};

async function writePopulationFixtures(
    ppsPopulation: Array<Record<string, unknown>>,
    meanPopulation: Array<Record<string, unknown>>,
    graduatePopulation: Array<Record<string, unknown>>,
    diningPopulation: Array<Record<string, unknown>>,
) {
    const ppsTarget = resolve(process.cwd(), PPS_POPULATION_PATH.slice(1));
    const meanTarget = resolve(process.cwd(), MEAN_POPULATION_PATH.slice(1));
    const graduateTarget = resolve(process.cwd(), PROPORTION_POPULATION_PATH.slice(1));
    const diningTarget = resolve(process.cwd(), DINING_POPULATION_PATH.slice(1));
    await mkdir(dirname(ppsTarget), { recursive: true });

    const ppsWorkbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(ppsWorkbook, XLSX.utils.json_to_sheet(ppsPopulation), "总体数据");
    await Bun.write(ppsTarget, XLSX.write(ppsWorkbook, { type: "buffer", bookType: "xlsx" }));

    for (const [target, population] of [
        [meanTarget, meanPopulation],
        [graduateTarget, graduatePopulation],
        [diningTarget, diningPopulation],
    ] as const) {
        const sheet = XLSX.utils.json_to_sheet(population);
        await Bun.write(target, `\uFEFF${XLSX.utils.sheet_to_csv(sheet)}`);
    }

    for (const path of [ppsTarget, meanTarget, graduateTarget, diningTarget]) {
        const file = Bun.file(path);
        if (!(await file.exists()) || file.size <= 0) throw new Error(`Failed to write seed fixture: ${path}`);
    }
}

function guideSourceFile() {
    return Bun.file(resolve(process.cwd(), "public/templates/数据上传规范.pdf"));
}

function questionnaireTemplateSourceFile() {
    return Bun.file(resolve(process.cwd(), "public/templates/调查问卷设计规范与模板.docx"));
}

async function preflightGuideSource() {
    for (const sourceFile of [guideSourceFile(), questionnaireTemplateSourceFile()]) {
        if (!(await sourceFile.exists()) || sourceFile.size <= 0) {
            throw new Error(`Required seed attachment is missing or empty: ${sourceFile.name}`);
        }
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

    const questionnaireSource = questionnaireTemplateSourceFile();
    const questionnaireTarget = resolve(process.cwd(), QUESTIONNAIRE_TEMPLATE_ATTACHMENT_PATH.slice(1));
    await mkdir(dirname(questionnaireTarget), { recursive: true });
    await Bun.write(questionnaireTarget, questionnaireSource);
    const questionnaireFile = Bun.file(questionnaireTarget);
    if (!(await questionnaireFile.exists()) || questionnaireFile.size <= 0) {
        throw new Error(`Failed to write seed attachment: ${questionnaireTarget}`);
    }
    await db.insert(topicAttachment).values({
        topicId,
        fileName: "调查问卷设计规范与模板.docx",
        filePath: QUESTIONNAIRE_TEMPLATE_ATTACHMENT_PATH,
        fileType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        fileSize: questionnaireFile.size,
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
    graduatePopulation: Array<Record<string, unknown>>,
    diningPopulation: Array<Record<string, unknown>>,
) {
    const n = ppsMeanRecommendedSize;
    const [grade1 = 0, grade2 = 0, grade3 = 0, grade4 = 0] = allocateIntegerShares(n, [0.4, 0.3, 0.2, 0.1]);
    const [college1 = 0, college2 = 0, college3 = 0] = allocateIntegerShares(meanRecommendedSize, [1 / 3, 1 / 3, 1 / 3]);
    const graduateCollegeCounts = allocateIntegerShares(graduateRecommendedSize, [0.25, 0.25, 0.25, 0.25]);
    const diningCampusCounts = allocateIntegerShares(diningRecommendedSize, [0.5, 0.5]);
    const learningResults = {
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

    const graduateResults = {
        simple: await runSampling({ method: "simple", rawParams: { sampleSize: graduateRecommendedSize, seed: 202621 }, targetSampleSize: graduateRecommendedSize, population: graduatePopulation, fieldMapping: graduateFieldMapping }),
        systematic: await runSampling({ method: "systematic", rawParams: { seed: 202622 }, targetSampleSize: graduateRecommendedSize, population: graduatePopulation, fieldMapping: graduateFieldMapping }),
        pps: await runSampling({ method: "pps", rawParams: { sampleSize: graduateRecommendedSize, sizeField: "求职准备度", seed: 202623 }, targetSampleSize: graduateRecommendedSize, population: graduatePopulation, fieldMapping: graduateFieldMapping }),
        stratified: await runSampling({
            method: "stratified",
            rawParams: {
                stratifyBy: "学院",
                seed: 202624,
                layers: ["文学院", "理学院", "商学院", "工学院"].map((name, index) => ({
                    name,
                    ratio: 0.25,
                    sampleCount: graduateCollegeCounts[index] ?? 0,
                })),
            },
            targetSampleSize: graduateRecommendedSize,
            population: graduatePopulation,
            fieldMapping: graduateFieldMapping,
        }),
    };

    const diningResults = {
        simple: await runSampling({ method: "simple", rawParams: { sampleSize: diningRecommendedSize, seed: 202631 }, targetSampleSize: diningRecommendedSize, population: diningPopulation, fieldMapping: diningFieldMapping }),
        systematic: await runSampling({ method: "systematic", rawParams: { seed: 202632 }, targetSampleSize: diningRecommendedSize, population: diningPopulation, fieldMapping: diningFieldMapping }),
        pps: await runSampling({ method: "pps", rawParams: { sampleSize: diningRecommendedSize, sizeField: "客流量", seed: 202633 }, targetSampleSize: diningRecommendedSize, population: diningPopulation, fieldMapping: diningFieldMapping }),
        stratified: await runSampling({
            method: "stratified",
            rawParams: {
                stratifyBy: "校区",
                seed: 202634,
                layers: ["东校区", "西校区"].map((name, index) => ({
                    name,
                    ratio: 0.5,
                    sampleCount: diningCampusCounts[index] ?? 0,
                })),
            },
            targetSampleSize: diningRecommendedSize,
            population: diningPopulation,
            fieldMapping: diningFieldMapping,
        }),
    };

    return { learningResults, meanResults, graduateResults, diningResults };
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

function assertCompleteSubmission(
    submissionQuestionnaire: unknown,
    samplePlan: unknown,
    samplingResults: unknown,
    populationSize: number,
    submissionReport: string,
    samplingPolicy: SamplingPolicyV1,
) {
    const errors = [
        validateQuestionnaireForSubmit(submissionQuestionnaire),
        validateSamplePlanForSubmit(samplePlan, populationSize),
        validateSamplingResultsForSubmit(samplingResults, (samplePlan as { finalSampleSize: number }).finalSampleSize, populationSize, samplingPolicy),
        validateReportForSubmit(submissionReport),
    ].filter(Boolean);
    if (errors.length) throw new Error(`Invalid dogfood submission fixture: ${errors.join("; ")}`);
}

function snapshot(params: {
    topicName: string;
    studentName: string;
    populationSize: number;
    questionnaire: Record<string, unknown>;
    samplePlan: Record<string, unknown>;
    samplingResults: Record<string, unknown>;
    reportContent: string;
    samplingPolicy?: SamplingPolicyV1;
}): SubmissionSnapshot {
    return {
        topicName: params.topicName,
        studentName: params.studentName,
        populationSize: params.populationSize,
        questionnaire: params.questionnaire,
        samplePlan: params.samplePlan,
        samplingResults: params.samplingResults,
        reportContent: params.reportContent,
        weightConfig,
        samplingPolicy: params.samplingPolicy ?? defaultSamplingPolicy,
    };
}

async function seed() {
    const anchor = resolveSeedAnchor(process.env.SEED_NOW);
    const day = (offset: number) => shiftDays(anchor, offset);
    const demoSeedMode = resolveDemoMode(process.env);
    if (!demoSeedMode) {
        throw new Error("完整 dogfood fixture 只能通过 DEMO_MODE=1 的 db:seed:demo 写入；生产环境请运行 db:bootstrap-admin");
    }
    console.log(`Seed anchor: ${anchor.toISOString()}`);
    await preflightGuideSource();

    const generatedAdminPassword = DEV_AUTH_MODE ? DEV_ADMIN_PASSWORD : `Bootstrap!${crypto.randomUUID()}`;
    const adminInitialPassword = process.env.SEED_ADMIN_PASSWORD?.trim() || generatedAdminPassword;
    const ppsPopulation = createPpsPopulation();
    const meanPopulation = createMeanPopulation();
    const graduatePopulation = createGraduateIntentionPopulation();
    const diningPopulation = createDiningServicePopulation();
    await writePopulationFixtures(ppsPopulation, meanPopulation, graduatePopulation, diningPopulation);
    const { learningResults, meanResults, graduateResults, diningResults } = await buildSamplingFixtures(
        ppsPopulation,
        meanPopulation,
        graduatePopulation,
        diningPopulation,
    );
    assertCompleteSubmission(questionnaire, learningPlan, learningResults, ppsPopulation.length, reportContent, defaultSamplingPolicy);
    assertCompleteSubmission(questionnaire, meanPlan, meanResults, meanPopulation.length, meanReportContent, noPpsSamplingPolicy);
    assertCompleteSubmission(graduateQuestionnaire, graduatePlan, graduateResults, graduatePopulation.length, graduateReportContent, stratifiedRequiredPolicy);
    assertCompleteSubmission(diningQuestionnaire, diningPlan, diningResults, diningPopulation.length, diningReportContent, ppsRequiredPolicy);
    const compactLearningResults = compactSamplingResults(learningResults);
    const compactLearningChoiceResults = compactSamplingResults({
        simple: learningResults.simple,
        systematic: learningResults.systematic,
    });
    const compactMeanResults = compactSamplingResults(meanResults);
    const compactGraduateResults = compactSamplingResults(graduateResults);
    const compactDiningResults = compactSamplingResults(diningResults);
    if (!compactLearningResults || !compactLearningChoiceResults || !compactMeanResults || !compactGraduateResults || !compactDiningResults) {
        throw new Error("Dogfood sampling fixtures could not be compacted");
    }

    await db.insert(admin).values({
        username: "admin",
        password: await Bun.password.hash(adminInitialPassword),
        createdAt: anchor,
        updatedAt: anchor,
    });

    const teacherSeeds = [
        { employeeId: "T001", name: "张岚", status: 1 },
        { employeeId: "T002", name: "李文博", status: 1 },
        { employeeId: "T003", name: "周妍", status: 1 },
        { employeeId: "T004", name: "停用教师", status: 0 },
    ];
    const teacherRows = await db.insert(teacher).values(await Promise.all(teacherSeeds.map(async (item) => ({
        employeeId: item.employeeId,
        name: item.name,
        password: await Bun.password.hash(item.employeeId),
        status: item.status,
        createdAt: anchor,
        updatedAt: anchor,
    })))).returning();
    const teachersById = Object.fromEntries(teacherRows.map((row) => [row.employeeId, row]));

    const semesterRows = await db.insert(semester).values([
        { name: DOGFOOD_NAMES.currentSemester, isCurrent: 1, createdAt: day(-60), updatedAt: anchor },
        { name: DOGFOOD_NAMES.previousSemester, isCurrent: 0, createdAt: day(-240), updatedAt: day(-60) },
        { name: DOGFOOD_NAMES.oldSemester, isCurrent: 0, createdAt: day(-600), updatedAt: day(-240) },
    ]).returning();
    const semesterByName = Object.fromEntries(semesterRows.map((row) => [row.name, row]));
    const classRows = await db.insert(class_).values([
        { name: DOGFOOD_NAMES.mainClass, semesterId: semesterByName[DOGFOOD_NAMES.currentSemester]!.id, teacherId: teachersById.T001!.id, createdAt: day(-45), updatedAt: day(-45) },
        { name: DOGFOOD_NAMES.secondaryClass, semesterId: semesterByName[DOGFOOD_NAMES.currentSemester]!.id, teacherId: teachersById.T001!.id, createdAt: day(-42), updatedAt: day(-42) },
        { name: DOGFOOD_NAMES.dataScienceClass, semesterId: semesterByName[DOGFOOD_NAMES.currentSemester]!.id, teacherId: teachersById.T002!.id, createdAt: day(-35), updatedAt: day(-35) },
        { name: DOGFOOD_NAMES.oldClass, semesterId: semesterByName[DOGFOOD_NAMES.previousSemester]!.id, teacherId: teachersById.T003!.id, createdAt: day(-220), updatedAt: day(-220) },
    ]).returning();
    const classByName = Object.fromEntries(classRows.map((row) => [row.name, row]));

    const studentSeeds = [
        ...DEMO_STUDENT_ACCOUNTS.map((account) => ({
            ...account,
            className: DOGFOOD_NAMES.mainClass,
            status: 1,
        })),
        { studentId: "S011", name: "周宁", className: DOGFOOD_NAMES.mainClass, status: 1 },
        { studentId: "S018", name: "备用学生", className: DOGFOOD_NAMES.mainClass, status: 1 },
        { studentId: "S019", name: "停用学生", className: DOGFOOD_NAMES.mainClass, status: 0 },
        { studentId: "P101", name: "赵一凡", className: DOGFOOD_NAMES.secondaryClass, status: 1 },
        { studentId: "P102", name: "钱思远", className: DOGFOOD_NAMES.secondaryClass, status: 1 },
        { studentId: "P103", name: "孙若溪", className: DOGFOOD_NAMES.secondaryClass, status: 1 },
        { studentId: "P104", name: "李安然", className: DOGFOOD_NAMES.secondaryClass, status: 1 },
        { studentId: "P105", name: "周嘉禾", className: DOGFOOD_NAMES.secondaryClass, status: 1 },
        { studentId: "P106", name: "吴书宁", className: DOGFOOD_NAMES.secondaryClass, status: 1 },
    ];
    const studentRows = await db.insert(student).values(await Promise.all(studentSeeds.map(async (item) => ({
        studentId: item.studentId,
        name: item.name,
        email: `${item.studentId.toLowerCase()}@example.edu`,
        password: await Bun.password.hash(item.studentId),
        status: item.status,
        classId: classByName[item.className]!.id,
        createdAt: day(-40),
        updatedAt: anchor,
    })))).returning();
    const studentsById = Object.fromEntries(studentRows.map((row) => [row.studentId, row]));

    const validTopicValues = {
        teacherId: teachersById.T001!.id,
        excelFilePath: PPS_POPULATION_PATH,
        excelRowCount: 200,
        fieldMapping: ppsFieldMapping,
        weightConfig,
        recommendQuestions: questionnaire.questions,
        samplingPolicy: defaultSamplingPolicy,
        status: 1,
        createdAt: day(-20),
        updatedAt: day(-7),
    };
    const topicRows = await db.insert(topic).values([
        { ...validTopicValues, name: DOGFOOD_NAMES.topicA, description: "估计本科生每周学习时长均值，并用月生活费演示 PPS 规模变量选择。" },
        { ...validTopicValues, name: DOGFOOD_NAMES.topicB, description: "估计学生每周阅读时长均值；总体包含零值且没有合格的正值 PPS 规模变量。", excelFilePath: MEAN_POPULATION_PATH, excelRowCount: 24, fieldMapping: meanFieldMapping, samplingPolicy: noPpsSamplingPolicy },
        { teacherId: teachersById.T001!.id, name: DOGFOOD_NAMES.topicC, description: "正在设计图书馆座位与空间使用调查，尚未上传总体数据。", status: 0, createdAt: day(-3), updatedAt: day(-3) },
        { ...validTopicValues, name: DOGFOOD_NAMES.topicD, description: "上一轮校内通勤调查，保留用于演示已截止任务。" },
        { ...validTopicValues, name: DOGFOOD_NAMES.topicE, description: "面向新生的数字素养调查，演示尚未开放任务。" },
        {
            teacherId: teachersById.T001!.id,
            name: DOGFOOD_NAMES.topicH,
            description: "估计2026届毕业生中计划直接就业的比例，覆盖分类目标、比例样本量和 PPS 可用流程。",
            excelFilePath: PROPORTION_POPULATION_PATH,
            excelRowCount: 160,
            fieldMapping: graduateFieldMapping,
            weightConfig,
            recommendQuestions: graduateQuestionnaire.questions,
            samplingPolicy: stratifiedRequiredPolicy,
            status: 1,
            createdAt: day(-16),
            updatedAt: day(-5),
        },
        {
            teacherId: teachersById.T001!.id,
            name: DOGFOOD_NAMES.topicI,
            description: "以15分钟服务时段为分析单位估计午间等待时间，展示非人员总体与连续变量均值流程。",
            excelFilePath: DINING_POPULATION_PATH,
            excelRowCount: 96,
            fieldMapping: diningFieldMapping,
            weightConfig,
            recommendQuestions: diningQuestionnaire.questions,
            samplingPolicy: ppsRequiredPolicy,
            status: 1,
            createdAt: day(-12),
            updatedAt: day(-4),
        },
    ]).returning();
    const topicsByName = Object.fromEntries(topicRows.map((row) => [row.name, row]));
    await copyGuideAttachment(topicsByName[DOGFOOD_NAMES.topicA]!.id);

    const mainClassId = classByName[DOGFOOD_NAMES.mainClass]!.id;
    const secondaryClassId = classByName[DOGFOOD_NAMES.secondaryClass]!.id;
    const taskRows = await db.insert(task).values([
        { topicId: topicsByName[DOGFOOD_NAMES.topicA]!.id, classId: mainClassId, openTime: day(-7), deadline: day(30), createdAt: day(-7), updatedAt: day(-7) },
        { topicId: topicsByName[DOGFOOD_NAMES.topicB]!.id, classId: mainClassId, openTime: null, deadline: null, createdAt: day(-6), updatedAt: day(-6) },
        { topicId: topicsByName[DOGFOOD_NAMES.topicD]!.id, classId: mainClassId, openTime: day(-14), deadline: day(-1), createdAt: day(-14), updatedAt: day(-1) },
        { topicId: topicsByName[DOGFOOD_NAMES.topicE]!.id, classId: mainClassId, openTime: day(7), deadline: day(30), createdAt: day(-1), updatedAt: day(-1) },
        { topicId: topicsByName[DOGFOOD_NAMES.topicH]!.id, classId: mainClassId, openTime: day(-5), deadline: day(35), createdAt: day(-5), updatedAt: day(-5) },
        { topicId: topicsByName[DOGFOOD_NAMES.topicI]!.id, classId: secondaryClassId, openTime: day(-4), deadline: day(21), createdAt: day(-4), updatedAt: day(-4) },
    ]).returning();
    const tasksByTopicId = Object.fromEntries(taskRows.map((row) => [row.topicId, row]));
    const taskFor = (topicName: string) => tasksByTopicId[topicsByName[topicName]!.id]!;
    const aTask = taskFor(DOGFOOD_NAMES.topicA);

    const learningCompletedBase = {
        currentStage: 4,
        questionnaire,
        samplePlan: learningPlan,
        samplingResults: compactLearningResults,
        reportContent,
        stage1CompletedAt: day(-5),
        stage2CompletedAt: day(-4),
        stage3CompletedAt: day(-3),
        stage4CompletedAt: day(-2),
    } as const;
    const learningSnapshot = (studentId: string, topicName: string = DOGFOOD_NAMES.topicA) => snapshot({
        topicName,
        studentName: studentsById[studentId]!.name,
        populationSize: 200,
        questionnaire,
        samplePlan: learningPlan,
        samplingResults: compactLearningResults,
        reportContent,
    });
    const graduateCompletedBase = {
        currentStage: 4,
        questionnaire: graduateQuestionnaire,
        samplePlan: graduatePlan,
        samplingResults: compactGraduateResults,
        reportContent: graduateReportContent,
        stage1CompletedAt: day(-4),
        stage2CompletedAt: day(-3),
        stage3CompletedAt: day(-2),
        stage4CompletedAt: day(-1),
    } as const;
    const graduateSnapshot = (studentId: string) => snapshot({
        topicName: DOGFOOD_NAMES.topicH,
        studentName: studentsById[studentId]!.name,
        populationSize: 160,
        questionnaire: graduateQuestionnaire,
        samplePlan: graduatePlan,
        samplingResults: compactGraduateResults,
        reportContent: graduateReportContent,
        samplingPolicy: stratifiedRequiredPolicy,
    });
    const diningCompletedBase = {
        currentStage: 4,
        questionnaire: diningQuestionnaire,
        samplePlan: diningPlan,
        samplingResults: compactDiningResults,
        reportContent: diningReportContent,
        stage1CompletedAt: day(-4),
        stage2CompletedAt: day(-3),
        stage3CompletedAt: day(-2),
        stage4CompletedAt: day(-1),
    } as const;
    const diningSnapshot = (studentId: string) => snapshot({
        topicName: DOGFOOD_NAMES.topicI,
        studentName: studentsById[studentId]!.name,
        populationSize: 96,
        questionnaire: diningQuestionnaire,
        samplePlan: diningPlan,
        samplingResults: compactDiningResults,
        reportContent: diningReportContent,
        samplingPolicy: ppsRequiredPolicy,
    });

    const experimentRows = await db.insert(experiment).values([
        { studentId: studentsById.S011!.id, taskId: aTask.id, currentStage: 1, status: "in_progress", questionnaire, createdAt: day(-2), updatedAt: day(-2) },
        { studentId: studentsById.S012!.id, taskId: aTask.id, currentStage: 2, status: "in_progress", questionnaire, stage1CompletedAt: day(-2), createdAt: day(-3), updatedAt: day(-2) },
        { studentId: studentsById.S013!.id, taskId: aTask.id, currentStage: 3, status: "in_progress", questionnaire, samplePlan: learningPlan, stage1CompletedAt: day(-3), stage2CompletedAt: day(-2), createdAt: day(-4), updatedAt: day(-2) },
        { ...learningCompletedBase, samplingResults: compactLearningChoiceResults, studentId: studentsById.S014!.id, taskId: aTask.id, status: "in_progress", reportContent: "<p>已按模板要求完成简单随机与系统抽样，正在比较所选方法并撰写实验报告。</p>", stage4CompletedAt: null, createdAt: day(-6), updatedAt: day(-1) },
        { ...learningCompletedBase, studentId: studentsById.S015!.id, taskId: aTask.id, status: "submitted", submissionSnapshot: learningSnapshot("S015"), submittedAt: day(-1), createdAt: day(-7), updatedAt: day(-1) },
        { ...learningCompletedBase, studentId: studentsById.S016!.id, taskId: aTask.id, status: "graded", submissionSnapshot: learningSnapshot("S016"), submittedAt: day(-2), scoreQuestionnaire: "92", scoreProcess: "88", scoreReport: "90", totalScore: "90.00", teacherComment: "结构完整，抽样方法比较清楚。", gradedByTeacherId: teachersById.T001!.id, gradedAt: day(-1), createdAt: day(-7), updatedAt: day(-1) },
        { ...learningCompletedBase, studentId: studentsById.S017!.id, taskId: aTask.id, version: 2, status: "rejected", submissionSnapshot: learningSnapshot("S017"), submittedAt: day(-2), rejectReason: "请补充已选抽样方法的比较，并说明方法选择依据。", gradedByTeacherId: teachersById.T001!.id, gradedAt: day(-1), createdAt: day(-7), updatedAt: day(-1) },
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
            submissionSnapshot: snapshot({ topicName: DOGFOOD_NAMES.topicB, studentName: studentsById.S015!.name, populationSize: 24, questionnaire, samplePlan: meanPlan, samplingResults: compactMeanResults, reportContent: meanReportContent, samplingPolicy: noPpsSamplingPolicy }),
            submittedAt: day(-1),
            createdAt: day(-6),
            updatedAt: day(-1),
        },
        { studentId: studentsById.S010!.id, taskId: taskFor(DOGFOOD_NAMES.topicH).id, currentStage: 2, status: "in_progress", questionnaire: graduateQuestionnaire, stage1CompletedAt: day(-2), createdAt: day(-4), updatedAt: day(-2) },
        { ...graduateCompletedBase, studentId: studentsById.S012!.id, taskId: taskFor(DOGFOOD_NAMES.topicH).id, status: "in_progress", reportContent: "<p>已完成毕业去向比例的四种抽样，正在比较结果。</p>", stage4CompletedAt: null, createdAt: day(-5), updatedAt: day(-1) },
        { ...graduateCompletedBase, studentId: studentsById.S015!.id, taskId: taskFor(DOGFOOD_NAMES.topicH).id, status: "submitted", submissionSnapshot: graduateSnapshot("S015"), submittedAt: day(-1), createdAt: day(-5), updatedAt: day(-1) },
        { ...graduateCompletedBase, studentId: studentsById.S016!.id, taskId: taskFor(DOGFOOD_NAMES.topicH).id, status: "graded", submissionSnapshot: graduateSnapshot("S016"), submittedAt: day(-2), scoreQuestionnaire: "88", scoreProcess: "90", scoreReport: "86", totalScore: "87.80", teacherComment: "比例目标和百分点误差解释准确，建议补充目标总体边界。", gradedByTeacherId: teachersById.T001!.id, gradedAt: day(-1), createdAt: day(-5), updatedAt: day(-1) },
        { studentId: studentsById.P101!.id, taskId: taskFor(DOGFOOD_NAMES.topicI).id, currentStage: 1, status: "in_progress", questionnaire: diningQuestionnaire, createdAt: day(-2), updatedAt: day(-2) },
        { ...diningCompletedBase, studentId: studentsById.P102!.id, taskId: taskFor(DOGFOOD_NAMES.topicI).id, status: "submitted", submissionSnapshot: diningSnapshot("P102"), submittedAt: day(-1), createdAt: day(-4), updatedAt: day(-1) },
        { ...diningCompletedBase, studentId: studentsById.P103!.id, taskId: taskFor(DOGFOOD_NAMES.topicI).id, version: 2, status: "rejected", submissionSnapshot: diningSnapshot("P103"), submittedAt: day(-2), rejectReason: "请区分服务时段与就餐学生两个分析单位，并补充客流量作为规模变量的理由。", gradedByTeacherId: teachersById.T001!.id, gradedAt: day(-1), createdAt: day(-4), updatedAt: day(-1) },
    ]).returning({ id: experiment.id, studentId: experiment.studentId, taskId: experiment.taskId });

    const auditedRuns = [
        { studentId: "S015", taskId: aTask.id, results: learningResults },
        { studentId: "S015", taskId: taskFor(DOGFOOD_NAMES.topicH).id, results: graduateResults },
        { studentId: "P102", taskId: taskFor(DOGFOOD_NAMES.topicI).id, results: diningResults },
    ];
    const auditedMethods = auditedRuns.flatMap((auditedRun, runIndex) => {
        const auditedExperiment = experimentRows.find((row) => (
            row.studentId === studentsById[auditedRun.studentId]!.id && row.taskId === auditedRun.taskId
        ));
        if (!auditedExperiment) throw new Error(`Dogfood audited experiment is missing: ${auditedRun.studentId}`);
        return (["simple", "systematic", "pps", "stratified"] as const).map((method, methodIndex) => {
            const result = auditedRun.results[method] as Record<string, unknown>;
            return {
                experimentId: auditedExperiment.id,
                method,
                seed: Number(result.seed),
                sampleCount: Number(result.sampleCount),
                details: buildSamplingAttemptDetails(result),
                createdAt: new Date(day(-1).getTime() - ((runIndex + 1) * 10 + 3 - methodIndex) * 60_000),
            };
        });
    });
    await db.insert(samplingAttempt).values(auditedMethods);

    await db.insert(announcement).values([
        { title: "2026-2027-1 学期实验平台开放", content: "本学期实验包含学习投入、毕业去向和餐厅服务三类研究场景。请先核对研究问题、目标总体和分析单位，再选择抽样设计。", targetScope: "all", status: 1, createdAt: day(-8), updatedAt: day(-8) },
        { title: "学生端：完成实验前请检查估计目标", content: `学习投入课题推荐样本量为 ${ppsMeanRecommendedSize}；毕业去向课题使用比例估计，误差限按百分点解释。问卷均为认知预试，不直接进入估计。`, targetScope: "student", status: 1, createdAt: day(-6), updatedAt: day(-6) },
        { title: "教师端：本周批改与课堂演示安排", content: "批改列表已准备待批改、已批改和已驳回示例。课堂演示可比较人员总体与服务时段总体，以及均值和比例两类估计目标。", targetScope: "teacher", status: 1, createdAt: day(-5), updatedAt: day(-5) },
        { title: "数据使用说明", content: "演示总体均为合成数据，不包含真实学生或个人信息。导出样本仅用于课堂练习。", targetScope: "all", status: 1, createdAt: day(-4), updatedAt: day(-4) },
        { title: "公告草稿", content: "未发布公告不应出现在学生或教师首页。", targetScope: "all", status: 0, createdAt: day(-1), updatedAt: day(-1) },
    ]);

    console.log("Seed completed.");
    console.log(`Counts: ${Object.entries(DOGFOOD_COUNTS).map(([key, value]) => `${key}=${value}`).join(" ")}`);
    console.log("Admin: admin (demo-ready; password configured by the explicit demo seed command)");
    console.log("Teachers: T001 / T001 (fixed demo); T002 / T002; T003 / T003; T004 disabled");
    console.log(`Random demo students: ${DEMO_STUDENT_ACCOUNTS.map((account) => account.studentId).join(", ")} in ${DOGFOOD_NAMES.mainClass}`);
}

try {
    await seed();
} catch (error) {
    console.error("Seed failed:", error);
    process.exitCode = 1;
} finally {
    await closeDatabase();
}
