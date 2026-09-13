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
    computeReadingPlan,
    createDiningServicePopulation,
    createGraduateIntentionPopulation,
    createMeanPopulation,
    createPpsPopulation,
    DINING_POPULATION_PATH,
    DOGFOOD_ANCHORS,
    DOGFOOD_COUNTS,
    DOGFOOD_NAMES,
    DOGFOOD_ROSTER,
    DOGFOOD_TEACHERS,
    EMPLOYMENT_POPULATION_PATH,
    GUIDE_ATTACHMENT_PATH,
    QUESTIONNAIRE_TEMPLATE_ATTACHMENT_PATH,
    READING_POPULATION_PATH,
    resolveSeedAnchor,
    shiftDays,
    STUDY_HOURS_POPULATION_PATH,
} from "./dogfood-fixtures";
import { DEMO_STUDENT_ACCOUNTS } from "./demo-accounts";
import { buildDefaultSamplingPolicy, type SamplingPolicyV1 } from "../../lib/sampling-policy";
import { buildPopulationNumericStats } from "../../domain/statistics/population";

const studyQuestionnaire = {
    title: "本科生学习投入调查（受访者视角试填）",
    welcomeText: "您好！本问卷属于「2026 校园学习与生活状况调查」的学习投入子课题，用于课堂受访者视角试填。预试答案不进入抽样或统计分析，请按真实情况体验作答。",
    endingText: "感谢您的认真作答。正式研究将以总体数据估计每周学习时长均值，本问卷只用于检查措辞与选项设置。",
    questions: [
        { id: "q1", type: "single", content: "您每天用于自主学习的时间？", options: [{ id: "o_1", label: "1小时以内" }, { id: "o_2", label: "1-2小时" }, { id: "o_3", label: "2-3小时" }, { id: "o_4", label: "3小时以上" }] },
        { id: "q2", type: "scale", content: "您对目前学习状态的满意程度？", scaleMin: 1, scaleMax: 5, scaleMinLabel: "非常不满意", scaleMaxLabel: "非常满意" },
        { id: "q3", type: "multiple", content: "您常用的学习资源有哪些？", options: [{ id: "o_1", label: "教材" }, { id: "o_2", label: "课程视频" }, { id: "o_3", label: "在线题库" }, { id: "o_4", label: "同伴讨论" }], minSelect: 1, maxSelect: 4 },
        { id: "q4", type: "boolean", content: "您是否制定每周学习计划？" },
        { id: "q5", type: "single", content: "您更喜欢哪种课堂组织方式？", options: [{ id: "o_1", label: "讲授" }, { id: "o_2", label: "讨论" }, { id: "o_3", label: "实验" }, { id: "o_4", label: "混合式" }] },
        { id: "q6", type: "scale", content: "课程作业负担是否合适？", scaleMin: 1, scaleMax: 5, scaleMinLabel: "过轻", scaleMaxLabel: "过重" },
        { id: "q7", type: "single", content: "您通常在哪里上自习？", options: [{ id: "o_1", label: "图书馆" }, { id: "o_2", label: "教室" }, { id: "o_3", label: "宿舍" }, { id: "o_4", label: "其他" }] },
        { id: "q8", type: "boolean", content: "您是否参加过统计调查实习？" },
    ],
};

const readingQuestionnaire = {
    title: "学生课外阅读调查（受访者视角试填）",
    welcomeText: "您好！本问卷属于「2026 校园学习与生活状况调查」的阅读行为子课题，用于课堂受访者视角试填。",
    endingText: "感谢您的参与。正式研究将估计每周课外阅读时长均值，并说明总体中零值较多的处理方式。",
    questions: [
        { id: "rq1", type: "single", content: "您平均每周课外阅读时长？", options: [{ id: "o_1", label: "几乎不阅读" }, { id: "o_2", label: "1小时以内" }, { id: "o_3", label: "1-3小时" }, { id: "o_4", label: "3-5小时" }, { id: "o_5", label: "5小时以上" }] },
        { id: "rq2", type: "multiple", content: "您主要阅读哪类材料？", options: [{ id: "o_1", label: "专业教材" }, { id: "o_2", label: "学术论文" }, { id: "o_3", label: "文学读物" }, { id: "o_4", label: "新闻资讯" }, { id: "o_5", label: "其他" }], minSelect: 1, maxSelect: 3 },
        { id: "rq3", type: "scale", content: "您对自己阅读量的满意程度？", scaleMin: 1, scaleMax: 5, scaleMinLabel: "很不满意", scaleMaxLabel: "很满意" },
        { id: "rq4", type: "boolean", content: "您是否使用图书馆纸质藏书？" },
        { id: "rq5", type: "single", content: "您更常在哪里阅读？", options: [{ id: "o_1", label: "图书馆" }, { id: "o_2", label: "宿舍" }, { id: "o_3", label: "教室" }, { id: "o_4", label: "通勤途中" }, { id: "o_5", label: "其他" }] },
    ],
};

const graduateQuestionnaire = {
    title: "毕业发展与就业准备调查（受访者视角试填）",
    welcomeText: "您好！本问卷用于了解毕业生发展意向与就业准备情况。课堂预试答案不会进入正式估计，请按真实想法体验作答。",
    endingText: "感谢您的参与。您的反馈将帮助完善毕业发展服务，也将用于检查问题措辞和选项设置是否清晰。",
    questions: [
        { id: "gq1", type: "single", content: "您目前首选的毕业去向是？", options: [{ id: "o_1", label: "直接就业" }, { id: "o_2", label: "考研" }, { id: "o_3", label: "考公" }, { id: "o_4", label: "出国深造" }, { id: "o_5", label: "灵活就业" }] },
        { id: "gq2", type: "boolean", content: "您是否有过三个月以上的实习经历？" },
        { id: "gq3", type: "scale", content: "您对当前就业准备程度的评价？", scaleMin: 1, scaleMax: 5, scaleMinLabel: "尚未准备", scaleMaxLabel: "准备充分" },
        { id: "gq4", type: "multiple", content: "您最需要哪些就业支持？", options: [{ id: "o_1", label: "职业测评" }, { id: "o_2", label: "简历辅导" }, { id: "o_3", label: "实习信息" }, { id: "o_4", label: "面试训练" }, { id: "o_5", label: "行业讲座" }], minSelect: 1, maxSelect: 3 },
        { id: "gq5", type: "single", content: "您获取招聘信息的主要渠道是？", options: [{ id: "o_1", label: "学校就业平台" }, { id: "o_2", label: "招聘网站" }, { id: "o_3", label: "社交媒体" }, { id: "o_4", label: "老师同学推荐" }, { id: "o_5", label: "企业宣讲会" }] },
        { id: "gq6", type: "boolean", content: "您是否已经形成明确的毕业发展计划？" },
    ],
};

const diningQuestionnaire = {
    title: "食堂午间服务体验调查（受访者视角试填）",
    welcomeText: "您好！本问卷用于课堂演练食堂午间服务调查。预试回答只帮助检查问卷可理解性，不会进入等待时间估计。",
    endingText: "感谢您完成体验。正式研究将以服务时段观测记录估计等待时间，并结合客流量和开放窗口数解释结果。",
    questions: [
        { id: "dq1", type: "single", content: "您最常在哪个校区的食堂就餐？", options: [{ id: "o_1", label: "东校区" }, { id: "o_2", label: "西校区" }] },
        { id: "dq2", type: "single", content: "您通常到达食堂的时间？", options: [{ id: "o_1", label: "11:30前" }, { id: "o_2", label: "11:30-12:00" }, { id: "o_3", label: "12:00-12:30" }, { id: "o_4", label: "12:30后" }] },
        { id: "dq3", type: "scale", content: "您对午间排队秩序的满意程度？", scaleMin: 1, scaleMax: 5, scaleMinLabel: "很不满意", scaleMaxLabel: "很满意" },
        { id: "dq4", type: "multiple", content: "哪些因素最影响您的食堂选择？", options: [{ id: "o_1", label: "等待时间" }, { id: "o_2", label: "价格" }, { id: "o_3", label: "口味" }, { id: "o_4", label: "距离" }, { id: "o_5", label: "座位" }], minSelect: 1, maxSelect: 3 },
        { id: "dq5", type: "boolean", content: "您是否愿意错峰就餐以减少等待？" },
    ],
};

const digitalLiteracyQuestionnaire = {
    title: "新生数字素养调查（设计阶段）",
    welcomeText: "您好！本问卷仍在设计中，用于课堂讨论问题措辞与选项设置。",
    endingText: "感谢您的参与。本模板尚未上传总体数据，因此不会发布为实验任务。",
    questions: [
        { id: "lq1", type: "scale", content: "您对常用学习平台的熟练程度？", scaleMin: 1, scaleMax: 5, scaleMinLabel: "不熟练", scaleMaxLabel: "非常熟练" },
        { id: "lq2", type: "multiple", content: "您使用过哪些数据工具？", options: [{ id: "o_1", label: "电子表格" }, { id: "o_2", label: "统计软件" }, { id: "o_3", label: "在线问卷" }, { id: "o_4", label: "数据可视化工具" }], minSelect: 1, maxSelect: 3 },
        { id: "lq3", type: "boolean", content: "您是否了解学术引用规范？" },
        { id: "lq4", type: "single", content: "您获取信息的主要渠道？", options: [{ id: "o_1", label: "图书馆资源" }, { id: "o_2", label: "搜索引擎" }, { id: "o_3", label: "社交媒体" }, { id: "o_4", label: "课程平台" }, { id: "o_5", label: "同学交流" }] },
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
const { recommendedSize: readingRecommendedSize, populationVariance: readingPopulationVariance } = computeReadingPlan();
const readingPlan = {
    estimationType: "mean" as const,
    confidenceLevel: "95",
    marginOfError: 2,
    populationVariance: readingPopulationVariance,
    designEffect: 1,
    nonResponseRate: 0,
    recommendedSize: readingRecommendedSize,
    finalSampleSize: readingRecommendedSize,
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
const diningWaitVariance = buildPopulationNumericStats(diningPopulationForPlan, ["等待分钟"])["等待分钟"]!.variance;
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

const reportContent = `<h2>实验目的</h2><p>本实验属于「2026 校园学习与生活状况调查」，对照虚拟总体中每周学习时长的均值，比较四种抽样设计。问卷阶段是受访者视角试填，答案不进入估计。</p><h2>方法与结果</h2><p>在百分之九十五置信水平和绝对误差限 2 下确定样本量，分别使用简单随机、系统、PPS 和分层抽样。PPS 使用月生活费作为规模变量，避免与对照变量循环。对不同方法的样本构成、每周学习时长与总体分布进行了比较，并记录随机种子以保证结果可复现。</p><h2>结论</h2><p>分层抽样能够稳定保持各层比例，简单随机抽样实现方便。实际调查中应结合总体结构、抽样框质量和执行成本选择方法，同时完整说明误差限和无回答率假设。</p>`;
const readingReportContent = `<h2>实验目的</h2><p>本实验以每周阅读时长的均值为估计目标，使用总体方差估计、绝对误差限和有限总体校正确定样本量，并比较可执行抽样方法的结果。</p><h2>方法与结果</h2><p>总体中每周阅读时长包含零值，且没有其他对每个单位都为正数的数值字段，因此不存在合格的 PPS 规模变量。实验模板按规则将 PPS 设为不适用，随后完成简单随机、系统和按学院分层抽样。</p><h2>结论</h2><p>均值估计流程使用样本量 ${readingRecommendedSize}。三种启用方法均保留随机种子和完整样本行；PPS 未启用是由总体数据条件决定的有效策略，而不是执行失败。分析时应明确记录这一限制，避免为完成形式而选用不满足正值条件的规模变量。</p>`;
const graduateReportContent = `<h2>研究问题</h2><p>本研究估计某综合大学本届毕业生中计划直接就业的学生比例，分析单位为一名毕业生。</p><h2>抽样设计</h2><p>以学院进行分层，并使用求职准备度作为 PPS 规模变量。目标类别属于分类变量，因此样本量规划采用最保守比例方差，误差限按百分点解释。</p><h2>结果解释</h2><p>比较四种抽样方法的直接就业比例、设计标准误与总体已知比例。结果仅代表该虚拟总体和当前抽样设计，不应外推到其他学校或毕业年份。</p>`;
const diningReportContent = `<h2>研究问题</h2><p>本研究估计校园食堂工作日午间高峰服务时段的平均等待分钟数，分析单位是一个十五分钟服务时段，而不是一名学生。</p><h2>抽样设计</h2><p>按校区分层，并以客流量作为 PPS 规模变量，比较简单随机、系统、PPS 与分层抽样。</p><h2>结果解释</h2><p>等待时间会同时受到时段、客流量和开放窗口数影响。单次样本的均值差异不能直接解释为食堂服务质量的因果差异。</p>`;

const studyFieldMapping = {
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
const readingFieldMapping = {
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
    stratified: ["校区", "食堂"],
    others: ["观测时段", "星期"],
    analysisTarget: { kind: "mean" as const, field: "等待分钟" },
    studyContract: {
        version: 1 as const,
        researchQuestion: "本学期工作日午间高峰时段食堂的平均排队等待时间是多少？",
        targetPopulation: "本学期两校区食堂工作日午间高峰的全部服务时段",
        unitOfAnalysis: "一个15分钟食堂服务时段",
        target: { kind: "mean" as const, field: "等待分钟" },
    },
};

async function writePopulationFixtures(
    ppsPopulation: Array<Record<string, unknown>>,
    meanPopulation: Array<Record<string, unknown>>,
    graduatePopulation: Array<Record<string, unknown>>,
    diningPopulation: Array<Record<string, unknown>>,
) {
    const ppsTarget = resolve(process.cwd(), STUDY_HOURS_POPULATION_PATH.slice(1));
    const meanTarget = resolve(process.cwd(), READING_POPULATION_PATH.slice(1));
    const graduateTarget = resolve(process.cwd(), EMPLOYMENT_POPULATION_PATH.slice(1));
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
    const [college1 = 0, college2 = 0, college3 = 0] = allocateIntegerShares(readingRecommendedSize, [1 / 3, 1 / 3, 1 / 3]);
    const graduateCollegeCounts = allocateIntegerShares(graduateRecommendedSize, [0.25, 0.25, 0.25, 0.25]);
    const diningCampusCounts = allocateIntegerShares(diningRecommendedSize, [0.5, 0.5]);
    const learningResults = {
        simple: await runSampling({ method: "simple", rawParams: { sampleSize: n, seed: 202601 }, targetSampleSize: n, population: ppsPopulation, fieldMapping: studyFieldMapping }),
        systematic: await runSampling({ method: "systematic", rawParams: { seed: 202602 }, targetSampleSize: n, population: ppsPopulation, fieldMapping: studyFieldMapping }),
        pps: await runSampling({ method: "pps", rawParams: { sampleSize: n, sizeField: "月生活费", seed: 202603 }, targetSampleSize: n, population: ppsPopulation, fieldMapping: studyFieldMapping }),
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
            fieldMapping: studyFieldMapping,
        }),
    };

    const meanResults = {
        simple: await runSampling({ method: "simple", rawParams: { sampleSize: readingRecommendedSize, seed: 202611 }, targetSampleSize: readingRecommendedSize, population: meanPopulation, fieldMapping: readingFieldMapping }),
        systematic: await runSampling({ method: "systematic", rawParams: { seed: 202612 }, targetSampleSize: readingRecommendedSize, population: meanPopulation, fieldMapping: readingFieldMapping }),
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
            targetSampleSize: readingRecommendedSize,
            population: meanPopulation,
            fieldMapping: readingFieldMapping,
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
    assertCompleteSubmission(studyQuestionnaire, learningPlan, learningResults, ppsPopulation.length, reportContent, defaultSamplingPolicy);
    assertCompleteSubmission(readingQuestionnaire, readingPlan, meanResults, meanPopulation.length, readingReportContent, noPpsSamplingPolicy);
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

    const teacherRows = await db.insert(teacher).values(await Promise.all(DOGFOOD_TEACHERS.map(async (item) => ({
        employeeId: item.employeeId,
        name: item.name,
        password: await Bun.password.hash(item.employeeId),
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

    // 主班承载主任务；副班承载服务时段课题；数据科学班用于演示"新建空班级"；
    // 历史班保留上学期已截止任务与归档成绩。
    const classRows = await db.insert(class_).values([
        { name: DOGFOOD_NAMES.mainClass, semesterId: semesterByName[DOGFOOD_NAMES.currentSemester]!.id, teacherId: teachersById.T001!.id, createdAt: day(-45), updatedAt: day(-45) },
        { name: DOGFOOD_NAMES.secondaryClass, semesterId: semesterByName[DOGFOOD_NAMES.currentSemester]!.id, teacherId: teachersById.T001!.id, createdAt: day(-42), updatedAt: day(-42) },
        { name: DOGFOOD_NAMES.dataScienceClass, semesterId: semesterByName[DOGFOOD_NAMES.currentSemester]!.id, teacherId: teachersById.T002!.id, createdAt: day(-35), updatedAt: day(-35) },
        { name: DOGFOOD_NAMES.historyClass, semesterId: semesterByName[DOGFOOD_NAMES.previousSemester]!.id, teacherId: teachersById.T003!.id, createdAt: day(-220), updatedAt: day(-220) },
    ]).returning();
    const classByName = Object.fromEntries(classRows.map((row) => [row.name, row]));

    const rosterByClass = [
        { className: DOGFOOD_NAMES.mainClass, members: DOGFOOD_ROSTER.main },
        { className: DOGFOOD_NAMES.secondaryClass, members: DOGFOOD_ROSTER.secondary },
        { className: DOGFOOD_NAMES.historyClass, members: DOGFOOD_ROSTER.history },
    ] as const;
    const studentRows = await db.insert(student).values(await Promise.all(rosterByClass.flatMap((group) => (
        group.members.map(async (member) => ({
            studentId: member.studentId,
            name: member.name,
            email: `${member.studentId.toLowerCase()}@example.edu`,
            password: await Bun.password.hash(member.studentId),
            classId: classByName[group.className]!.id,
            createdAt: day(-40),
            updatedAt: anchor,
        }))
    )))).returning();
    const studentsById = Object.fromEntries(studentRows.map((row) => [row.studentId, row]));

    const validTopicValues = {
        teacherId: teachersById.T001!.id,
        excelFilePath: STUDY_HOURS_POPULATION_PATH,
        excelRowCount: ppsPopulation.length,
        fieldMapping: studyFieldMapping,
        weightConfig,
        recommendQuestions: studyQuestionnaire.questions,
        samplingPolicy: defaultSamplingPolicy,
        status: 1,
        createdAt: day(-20),
        updatedAt: day(-7),
    };
    const topicRows = await db.insert(topic).values([
        { ...validTopicValues, name: DOGFOOD_NAMES.topicA, description: "「2026 校园学习与生活状况调查」主课题：估计本科生每周学习时长均值，并用月生活费演示 PPS 规模变量选择。" },
        {
            teacherId: teachersById.T001!.id,
            name: DOGFOOD_NAMES.topicB,
            description: "子课题：估计学生每周课外阅读时长均值。总体含零值且没有合格的正值规模变量，用于演示 PPS 不适用与小总体普查提示。",
            excelFilePath: READING_POPULATION_PATH,
            excelRowCount: meanPopulation.length,
            fieldMapping: readingFieldMapping,
            weightConfig,
            recommendQuestions: readingQuestionnaire.questions,
            samplingPolicy: noPpsSamplingPolicy,
            status: 1,
            createdAt: day(-18),
            updatedAt: day(-6),
        },
        {
            teacherId: teachersById.T001!.id,
            name: DOGFOOD_NAMES.topicE,
            description: "面向新生的数字素养调查，仍在设计阶段：问卷已就绪但尚未上传总体数据，因此不能发布。",
            weightConfig,
            recommendQuestions: digitalLiteracyQuestionnaire.questions,
            samplingPolicy: defaultSamplingPolicy,
            status: 0,
            createdAt: day(-3),
            updatedAt: day(-3),
        },
        {
            teacherId: teachersById.T001!.id,
            name: DOGFOOD_NAMES.topicC,
            description: "子课题：估计2026届毕业生中计划直接就业的比例，覆盖分类目标、比例样本量和分层必做流程。",
            excelFilePath: EMPLOYMENT_POPULATION_PATH,
            excelRowCount: graduatePopulation.length,
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
            name: DOGFOOD_NAMES.topicD,
            description: "子课题：以十五分钟服务时段为分析单位估计食堂午间平均等待时间，演示非人员总体与 PPS 必做流程。",
            excelFilePath: DINING_POPULATION_PATH,
            excelRowCount: diningPopulation.length,
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

    // 一个课题可以分派到多个班级：主班是进行中的主任务，历史班保留上学期已截止任务，
    // 副班拿到一份尚未开放的比例任务。
    const taskRows = await db.insert(task).values([
        { topicId: topicsByName[DOGFOOD_NAMES.topicA]!.id, classId: classByName[DOGFOOD_NAMES.mainClass]!.id, openTime: day(-7), deadline: day(30), createdAt: day(-7), updatedAt: day(-7) },
        { topicId: topicsByName[DOGFOOD_NAMES.topicA]!.id, classId: classByName[DOGFOOD_NAMES.historyClass]!.id, openTime: day(-200), deadline: day(-190), createdAt: day(-200), updatedAt: day(-190) },
        { topicId: topicsByName[DOGFOOD_NAMES.topicB]!.id, classId: classByName[DOGFOOD_NAMES.mainClass]!.id, openTime: null, deadline: null, createdAt: day(-6), updatedAt: day(-6) },
        { topicId: topicsByName[DOGFOOD_NAMES.topicC]!.id, classId: classByName[DOGFOOD_NAMES.mainClass]!.id, openTime: day(-5), deadline: day(35), createdAt: day(-5), updatedAt: day(-5) },
        { topicId: topicsByName[DOGFOOD_NAMES.topicC]!.id, classId: classByName[DOGFOOD_NAMES.secondaryClass]!.id, openTime: day(7), deadline: day(35), createdAt: day(-2), updatedAt: day(-2) },
        { topicId: topicsByName[DOGFOOD_NAMES.topicD]!.id, classId: classByName[DOGFOOD_NAMES.secondaryClass]!.id, openTime: day(-4), deadline: day(21), createdAt: day(-4), updatedAt: day(-4) },
    ]).returning();
    const taskFor = (topicName: string, className: string) => {
        const row = taskRows.find((item) => (
            item.topicId === topicsByName[topicName]!.id && item.classId === classByName[className]!.id
        ));
        if (!row) throw new Error(`Seed task is missing: ${topicName} / ${className}`);
        return row;
    };
    const aTask = taskFor(DOGFOOD_NAMES.topicA, DOGFOOD_NAMES.mainClass);

    const learningCompletedBase = {
        currentStage: 4,
        questionnaire: studyQuestionnaire,
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
        questionnaire: studyQuestionnaire,
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
        topicName: DOGFOOD_NAMES.topicC,
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
        topicName: DOGFOOD_NAMES.topicD,
        studentName: studentsById[studentId]!.name,
        populationSize: 96,
        questionnaire: diningQuestionnaire,
        samplePlan: diningPlan,
        samplingResults: compactDiningResults,
        reportContent: diningReportContent,
        samplingPolicy: ppsRequiredPolicy,
    });

    const experimentRows = await db.insert(experiment).values([
        // 主任务：10 名主班学生精确覆盖 8 个进度桶（3 人未开始）。
        { studentId: studentsById[DOGFOOD_ANCHORS.stage1]!.id, taskId: aTask.id, currentStage: 1, status: "in_progress", questionnaire: studyQuestionnaire, createdAt: day(-2), updatedAt: day(-2) },
        { studentId: studentsById.S2602!.id, taskId: aTask.id, currentStage: 2, status: "in_progress", questionnaire: studyQuestionnaire, stage1CompletedAt: day(-2), createdAt: day(-3), updatedAt: day(-2) },
        { studentId: studentsById.S2603!.id, taskId: aTask.id, currentStage: 3, status: "in_progress", questionnaire: studyQuestionnaire, samplePlan: learningPlan, stage1CompletedAt: day(-3), stage2CompletedAt: day(-2), createdAt: day(-4), updatedAt: day(-2) },
        { ...learningCompletedBase, samplingResults: compactLearningChoiceResults, studentId: studentsById[DOGFOOD_ANCHORS.choicePair]!.id, taskId: aTask.id, status: "in_progress", reportContent: "<p>已按模板要求完成简单随机与系统抽样，正在比较所选方法并撰写实验报告。</p>", stage4CompletedAt: null, createdAt: day(-6), updatedAt: day(-1) },
        { ...learningCompletedBase, studentId: studentsById[DOGFOOD_ANCHORS.submitted]!.id, taskId: aTask.id, status: "submitted", submissionSnapshot: learningSnapshot(DOGFOOD_ANCHORS.submitted), submittedAt: day(-1), createdAt: day(-7), updatedAt: day(-1) },
        { ...learningCompletedBase, studentId: studentsById[DOGFOOD_ANCHORS.graded]!.id, taskId: aTask.id, status: "graded", submissionSnapshot: learningSnapshot(DOGFOOD_ANCHORS.graded), submittedAt: day(-2), scoreQuestionnaire: "92", scoreProcess: "88", scoreReport: "90", totalScore: "90.00", teacherComment: "结构完整，抽样方法比较清楚。", gradedByTeacherId: teachersById.T001!.id, gradedAt: day(-1), createdAt: day(-7), updatedAt: day(-1) },
        { ...learningCompletedBase, studentId: studentsById[DOGFOOD_ANCHORS.rejected]!.id, taskId: aTask.id, version: 2, status: "rejected", submissionSnapshot: learningSnapshot(DOGFOOD_ANCHORS.rejected), submittedAt: day(-2), rejectReason: "请补充已选抽样方法的比较，并说明方法选择依据。", gradedByTeacherId: teachersById.T001!.id, gradedAt: day(-1), createdAt: day(-7), updatedAt: day(-1) },
        // 阅读子课题：PPS 不适用的终态样本（需要说明策略而不是执行失败）。
        {
            studentId: studentsById[DOGFOOD_ANCHORS.submitted]!.id,
            taskId: taskFor(DOGFOOD_NAMES.topicB, DOGFOOD_NAMES.mainClass).id,
            currentStage: 4,
            status: "submitted",
            questionnaire: readingQuestionnaire,
            samplePlan: readingPlan,
            samplingResults: compactMeanResults,
            reportContent: readingReportContent,
            stage1CompletedAt: day(-5),
            stage2CompletedAt: day(-4),
            stage3CompletedAt: day(-3),
            stage4CompletedAt: day(-2),
            submissionSnapshot: snapshot({ topicName: DOGFOOD_NAMES.topicB, studentName: studentsById[DOGFOOD_ANCHORS.submitted]!.name, populationSize: 24, questionnaire: readingQuestionnaire, samplePlan: readingPlan, samplingResults: compactMeanResults, reportContent: readingReportContent, samplingPolicy: noPpsSamplingPolicy }),
            submittedAt: day(-1),
            createdAt: day(-6),
            updatedAt: day(-1),
        },
        // 就业比例子课题：进行中、待批改、已批改各一份。
        { studentId: studentsById[DOGFOOD_ANCHORS.stage1]!.id, taskId: taskFor(DOGFOOD_NAMES.topicC, DOGFOOD_NAMES.mainClass).id, currentStage: 2, status: "in_progress", questionnaire: graduateQuestionnaire, stage1CompletedAt: day(-2), createdAt: day(-4), updatedAt: day(-2) },
        { ...graduateCompletedBase, studentId: studentsById[DOGFOOD_ANCHORS.submitted]!.id, taskId: taskFor(DOGFOOD_NAMES.topicC, DOGFOOD_NAMES.mainClass).id, status: "submitted", submissionSnapshot: graduateSnapshot(DOGFOOD_ANCHORS.submitted), submittedAt: day(-1), createdAt: day(-5), updatedAt: day(-1) },
        { ...graduateCompletedBase, studentId: studentsById[DOGFOOD_ANCHORS.graded]!.id, taskId: taskFor(DOGFOOD_NAMES.topicC, DOGFOOD_NAMES.mainClass).id, status: "graded", submissionSnapshot: graduateSnapshot(DOGFOOD_ANCHORS.graded), submittedAt: day(-2), scoreQuestionnaire: "88", scoreProcess: "90", scoreReport: "86", totalScore: "87.80", teacherComment: "比例目标和百分点误差解释准确，建议补充目标总体边界。", gradedByTeacherId: teachersById.T001!.id, gradedAt: day(-1), createdAt: day(-5), updatedAt: day(-1) },
        // 服务时段子课题（副班）：覆盖进行中、待批改、已批改、已驳回。
        { studentId: studentsById.P2601!.id, taskId: taskFor(DOGFOOD_NAMES.topicD, DOGFOOD_NAMES.secondaryClass).id, currentStage: 1, status: "in_progress", questionnaire: diningQuestionnaire, createdAt: day(-2), updatedAt: day(-2) },
        { ...diningCompletedBase, studentId: studentsById[DOGFOOD_ANCHORS.auditedSecondary]!.id, taskId: taskFor(DOGFOOD_NAMES.topicD, DOGFOOD_NAMES.secondaryClass).id, status: "submitted", submissionSnapshot: diningSnapshot(DOGFOOD_ANCHORS.auditedSecondary), submittedAt: day(-1), createdAt: day(-4), updatedAt: day(-1) },
        { ...diningCompletedBase, studentId: studentsById.P2603!.id, taskId: taskFor(DOGFOOD_NAMES.topicD, DOGFOOD_NAMES.secondaryClass).id, status: "graded", submissionSnapshot: diningSnapshot("P2603"), submittedAt: day(-1), scoreQuestionnaire: "86", scoreProcess: "92", scoreReport: "88", totalScore: "88.60", teacherComment: "分析单位界定清楚，建议补充时段代表性说明。", gradedByTeacherId: teachersById.T001!.id, gradedAt: day(-1), createdAt: day(-4), updatedAt: day(-1) },
        { ...diningCompletedBase, studentId: studentsById.P2604!.id, taskId: taskFor(DOGFOOD_NAMES.topicD, DOGFOOD_NAMES.secondaryClass).id, version: 2, status: "rejected", submissionSnapshot: diningSnapshot("P2604"), submittedAt: day(-2), rejectReason: "请区分服务时段与就餐学生两个分析单位，并补充客流量作为规模变量的理由。", gradedByTeacherId: teachersById.T001!.id, gradedAt: day(-1), createdAt: day(-4), updatedAt: day(-1) },
        // 历史班：上学期同一主课题的归档成绩。
        { ...learningCompletedBase, studentId: studentsById.H2501!.id, taskId: taskFor(DOGFOOD_NAMES.topicA, DOGFOOD_NAMES.historyClass).id, status: "graded", submissionSnapshot: learningSnapshot("H2501"), submittedAt: day(-192), scoreQuestionnaire: "90", scoreProcess: "85", scoreReport: "88", totalScore: "87.70", teacherComment: "上学期归档样本，作为历史班级的对照数据。", gradedByTeacherId: teachersById.T003!.id, gradedAt: day(-191), createdAt: day(-198), updatedAt: day(-191) },
        { ...learningCompletedBase, studentId: studentsById.H2502!.id, taskId: taskFor(DOGFOOD_NAMES.topicA, DOGFOOD_NAMES.historyClass).id, status: "graded", submissionSnapshot: learningSnapshot("H2502"), submittedAt: day(-192), scoreQuestionnaire: "84", scoreProcess: "88", scoreReport: "86", totalScore: "86.00", teacherComment: "上学期归档样本，抽样方法比较略显简略。", gradedByTeacherId: teachersById.T003!.id, gradedAt: day(-191), createdAt: day(-198), updatedAt: day(-191) },
    ]).returning({ id: experiment.id, studentId: experiment.studentId, taskId: experiment.taskId });

    // 三组服务端抽样审计记录：主课题、比例子课题、服务时段子课题各四次方法执行。
    const auditedRuns = [
        { studentId: DOGFOOD_ANCHORS.submitted, topicName: DOGFOOD_NAMES.topicA, className: DOGFOOD_NAMES.mainClass, results: learningResults },
        { studentId: DOGFOOD_ANCHORS.submitted, topicName: DOGFOOD_NAMES.topicC, className: DOGFOOD_NAMES.mainClass, results: graduateResults },
        { studentId: DOGFOOD_ANCHORS.auditedSecondary, topicName: DOGFOOD_NAMES.topicD, className: DOGFOOD_NAMES.secondaryClass, results: diningResults },
    ];
    const auditedMethods = auditedRuns.flatMap((auditedRun, runIndex) => {
        const auditedExperiment = experimentRows.find((row) => (
            row.studentId === studentsById[auditedRun.studentId]!.id
            && row.taskId === taskFor(auditedRun.topicName, auditedRun.className).id
        ));
        if (!auditedExperiment) throw new Error(`Seed audited experiment is missing: ${auditedRun.studentId}/${auditedRun.topicName}`);
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
        { title: "2026-2027-1 学期实验平台开放", content: "本学期「2026 校园学习与生活状况调查」包含学习投入、阅读行为、毕业去向和食堂服务四个子课题。请先核对研究问题、目标总体和分析单位，再选择抽样设计。", targetScope: "all", status: 1, createdAt: day(-8), updatedAt: day(-8) },
        { title: "学生端：主任务截止时间提醒", content: `学习投入课题推荐样本量为 ${ppsMeanRecommendedSize}，按绝对误差限 2 小时规划。阅读行为课题总体只有 24 个单位，属于小总体，规划结果会提示接近普查。`, targetScope: "student", status: 1, createdAt: day(-6), updatedAt: day(-6) },
        { title: "教师端：本周批改与课堂演示安排", content: "批改列表已准备待批改、已批改和已驳回示例。课堂演示可比较人员总体与服务时段总体，以及均值、比例两类估计目标，并观察未开放任务与历史归档班级。", targetScope: "teacher", status: 1, createdAt: day(-5), updatedAt: day(-5) },
        { title: "数据使用说明", content: "演示总体均为合成数据，不包含真实学生或个人信息。导出样本仅用于课堂练习。", targetScope: "all", status: 1, createdAt: day(-4), updatedAt: day(-4) },
        { title: "公告草稿", content: "未发布公告不应出现在学生或教师首页。", targetScope: "all", status: 0, createdAt: day(-1), updatedAt: day(-1) },
    ]);

    console.log("Seed completed.");
    console.log(`Counts: ${Object.entries(DOGFOOD_COUNTS).map(([key, value]) => `${key}=${value}`).join(" ")}`);
    console.log("Admin: admin (demo-ready; password configured by the explicit demo seed command)");
    console.log("Teachers: T001 / T001 (fixed demo); T002 / T002; T003 / T003");
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
