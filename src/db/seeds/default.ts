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
import { calculateFinitePopulationSampleSize } from "../../student/experiment/sample-plan";
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
    computeDiningPlan,
    computeYouthHappinessPlan,
    computeReadingPlan,
    createDiningServicePopulation,
    createGreenCommutePopulation,
    createGraduateIntentionPopulation,
    createMeanPopulation,
    createYouthHappinessPopulation,
    DINING_PPS_SIZE_FIELD,
    DINING_POPULATION_PATH,
    DOGFOOD_ANCHORS,
    DOGFOOD_COUNTS,
    DOGFOOD_NAMES,
    DOGFOOD_ROSTER,
    DOGFOOD_TEACHERS,
    EMPLOYMENT_POPULATION_PATH,
    GREEN_COMMUTE_POPULATION_PATH,
    GUIDE_ATTACHMENT_PATH,
    HAPPINESS_POPULATION_PATH,
    QUESTIONNAIRE_TEMPLATE_ATTACHMENT_PATH,
    READING_POPULATION_PATH,
    resolveSeedAnchor,
    shiftDays,
} from "./dogfood-fixtures";
import { DEMO_STUDENT_ACCOUNTS } from "./demo-accounts";
import { buildDefaultSamplingPolicy, type SamplingPolicyV1 } from "../../lib/sampling-policy";

const happinessQuestionnaire = {
    title: "青年幸福感调查（受访者视角试填）",
    welcomeText: "您好！本调查用于了解18—35岁青年对近期生活的总体评价及相关生活感受。课堂预试答案不会进入正式估计；题目不用于心理诊断，您可以跳出任何令您不适的作答情境。",
    endingText: "感谢您的认真作答。正式研究的主指标是0—10分生活幸福感自评，结论只描述本次合成总体，不用于个体诊断或因果判断。",
    questions: [
        { id: "hq1", section: "screening", type: "boolean", content: "您是否已年满18岁且不超过35岁？" },
        { id: "hq2", section: "main", type: "numeric", content: "总体而言，您对目前生活的幸福感评价是多少分？", unit: "分", numericMin: 0, numericMax: 10, decimalPlaces: 1 },
        { id: "hq3", section: "main", type: "scale", content: "过去一个月，您感受到来自家人、朋友或同伴的支持程度如何？", scaleMin: 1, scaleMax: 5, scaleMinLabel: "很少支持", scaleMaxLabel: "很多支持" },
        { id: "hq4", section: "main", type: "scale", content: "您如何评价自己目前的健康状况？", scaleMin: 1, scaleMax: 5, scaleMinLabel: "很差", scaleMaxLabel: "很好" },
        { id: "hq5", section: "main", type: "scale", content: "过去一个月，经济压力给您带来的困扰程度如何？", scaleMin: 1, scaleMax: 5, scaleMinLabel: "几乎没有", scaleMaxLabel: "非常严重" },
        { id: "hq6", section: "main", type: "multiple", content: "目前哪些方面最影响您的生活感受？（最多选三项）", options: ["学习或工作", "收入与支出", "身体健康", "家庭关系", "朋友与社交", "居住环境"], minSelect: 1, maxSelect: 3 },
        { id: "hq7", section: "background", type: "single", content: "您目前的主要状态是？", options: ["在校学习", "稳定就业", "灵活就业", "求职或待业"] },
        { id: "hq8", section: "background", type: "single", content: "您目前主要居住地属于？", options: ["城区", "县镇", "农村"] },
    ],
};

const readingQuestionnaire = {
    title: "学生课外阅读调查（受访者视角试填）",
    welcomeText: "您好！本问卷用于了解学生在正常教学周的课外阅读情况。课堂预试答案不会进入正式估计，请将确实没有课外阅读记录为0小时。",
    endingText: "感谢您的参与。正式研究将估计每周课外阅读时长均值，并说明总体中零值较多的处理方式。",
    questions: [
        { id: "rq1", section: "main", type: "numeric", content: "在一个正常教学周，您用于课外阅读的时间共约多少小时？", unit: "小时", numericMin: 0, numericMax: 168, decimalPlaces: 1 },
        { id: "rq2", type: "multiple", content: "您主要阅读哪类材料？", options: ["专业教材", "学术论文", "文学读物", "新闻资讯", "其他"], minSelect: 1, maxSelect: 3 },
        { id: "rq3", type: "scale", content: "您对自己阅读量的满意程度？", scaleMin: 1, scaleMax: 5, scaleMinLabel: "很不满意", scaleMaxLabel: "很满意" },
        { id: "rq4", type: "boolean", content: "您是否使用图书馆纸质藏书？" },
        { id: "rq5", type: "single", content: "您更常在哪里阅读？", options: ["图书馆", "宿舍", "教室", "通勤途中", "其他"] },
    ],
};

const graduateQuestionnaire = {
    title: "毕业发展与就业准备调查（受访者视角试填）",
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
    title: "食堂午间服务时段观测表（观察员试填）",
    welcomeText: "请观察员以一个地点、观测日和15分钟时段共同确定的服务时段为单位填写。时段开始后依到达顺序观察最先加入队列的5名就餐者（不足5名则观察全部）：从站到队尾开始计时，到窗口开始受理点餐或结算时停止；先分别记录，再计算算术平均。若无人加入队列，本实验将该时段等待负担记为0分钟，并把有效观察人数记为0。历史同期客流量应从抽样框抄录，并在抽样前用于确定纳入概率；等待时间和开放窗口数在抽中时段现场记录。课堂预试记录不会进入正式估计。",
    endingText: "本表记录的是服务时段而非单个就餐者。正式研究比较的是按服务时段等权的平均等待负担，不是按就餐人数加权的个人平均等待；历史同期客流量仅作为抽样前已知的PPS规模变量。",
    questions: [
        { id: "dq1", section: "background", type: "single", content: "本次观测位于哪个地点？", options: ["东校区·学苑食堂", "东校区·风味食堂", "西校区·湖畔食堂", "西校区·清真食堂"] },
        { id: "dq2", section: "background", type: "single", content: "本次观测属于哪个观测日？", options: ["第一周周一", "第一周周二", "第一周周三", "第二周周一", "第二周周二", "第二周周三"] },
        { id: "dq3", section: "background", type: "single", content: "本次观测属于哪个15分钟时段？", options: ["11:30-11:45", "11:45-12:00", "12:00-12:15", "12:15-12:30"] },
        { id: "dq4", section: "main", type: "numeric", content: "按“入队至窗口开始受理”规则，前5名到达者（不足5名则全部）的平均等待时间是多少？", unit: "分钟", numericMin: 0, numericMax: 60, decimalPlaces: 1 },
        { id: "dq5", section: "background", type: "numeric", content: "抽样框中该时段的历史同期客流量是多少人次？", unit: "人次", numericMin: 1, numericMax: 1000, decimalPlaces: 0 },
        { id: "dq6", section: "main", type: "numeric", content: "该时段实际开放了多少个服务窗口？", unit: "个", numericMin: 0, numericMax: 100, decimalPlaces: 0 },
        { id: "dq7", section: "main", type: "numeric", content: "本时段实际纳入等待时间计算的就餐者有多少名？", unit: "名", numericMin: 0, numericMax: 5, decimalPlaces: 0 },
    ],
};

const greenCommuteQuestionnaire = {
    title: "校园绿色通勤调查（受访者视角试填）",
    welcomeText: "您好！本问卷用于了解学生一次典型到校通勤所采用的主要方式。绿色通勤指步行、自行车或公共交通。",
    endingText: "感谢您的参与。正式研究估计绿色通勤记录的比例，并比较抽样框排序对系统抽样的影响。",
    questions: [
        { id: "cq1", section: "screening", type: "boolean", content: "这条记录是否代表您在正常教学周的一次典型到校通勤？" },
        { id: "cq2", section: "main", type: "single", content: "这次通勤使用的主要方式是？", options: ["步行", "自行车", "公共交通", "网约车或私家车"] },
        { id: "cq3", section: "main", type: "single", content: "这次到校通勤的登记时段是？", options: ["07:00前", "07:00—08:00", "08:00—09:00", "09:00后"] },
        { id: "cq4", section: "main", type: "numeric", content: "这次通勤的单程距离约为多少公里？", unit: "公里", numericMin: 0, numericMax: 100, decimalPlaces: 1 },
        { id: "cq5", section: "main", type: "multiple", content: "哪些因素影响了您的通勤方式选择？", options: ["时间", "费用", "天气", "安全", "便利程度", "携带物品"], minSelect: 1, maxSelect: 3 },
        { id: "cq6", section: "background", type: "single", content: "您目前居住在哪类片区？", options: ["校内宿舍", "近校社区", "远校社区"] },
        { id: "cq7", section: "background", type: "single", content: "您目前所在年级是？", options: ["大一", "大二", "大三", "大四"] },
    ],
};

const weightConfig = { questionnaire: 30, process: 30, report: 40 };
const defaultSamplingPolicy = buildDefaultSamplingPolicy();
const noPpsSamplingPolicy = buildDefaultSamplingPolicy({ ppsEnabled: false });
const graduateSamplingPolicy: SamplingPolicyV1 = {
    version: 1,
    methods: { ...defaultSamplingPolicy.methods, pps: "disabled", stratified: "required" },
};
const happinessSamplingPolicy: SamplingPolicyV1 = {
    version: 1,
    methods: { ...defaultSamplingPolicy.methods, pps: "disabled", stratified: "required" },
};
const greenCommuteSamplingPolicy: SamplingPolicyV1 = {
    version: 1,
    methods: { ...defaultSamplingPolicy.methods, systematic: "required", pps: "disabled" },
};
const ppsRequiredPolicy: SamplingPolicyV1 = {
    version: 1,
    methods: { ...defaultSamplingPolicy.methods, pps: "required" },
    ppsSizeFields: [DINING_PPS_SIZE_FIELD],
};
const happinessPopulationForPlan = createYouthHappinessPopulation();
const { recommendedSize: happinessRecommendedSize, populationVariance: happinessVariance } = computeYouthHappinessPlan(happinessPopulationForPlan);
const happinessPlan = {
    estimationType: "mean" as const,
    confidenceLevel: "95",
    marginOfError: 0.5,
    populationVariance: happinessVariance,
    designEffect: 1,
    nonResponseRate: 0,
    recommendedSize: happinessRecommendedSize,
    finalSampleSize: happinessRecommendedSize,
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
const { recommendedSize: diningRecommendedSize, populationVariance: diningWaitVariance } = computeDiningPlan(diningPopulationForPlan);
const diningPlan = {
    estimationType: "mean" as const,
    confidenceLevel: "95",
    marginOfError: 2,
    populationVariance: diningWaitVariance,
    designEffect: 1,
    nonResponseRate: 0,
    recommendedSize: diningRecommendedSize,
    finalSampleSize: diningRecommendedSize,
};

const calculatedGreenCommuteSize = calculateFinitePopulationSampleSize({
    confidenceLevel: "95",
    marginOfError: 9,
    populationSize: 360,
    designEffect: 1,
    nonResponseRate: 0,
});
if (calculatedGreenCommuteSize === null) throw new Error("Dogfood green commute proportion plan could not be calculated");
const greenCommuteRecommendedSize: number = calculatedGreenCommuteSize;
const greenCommutePlan = {
    estimationType: "proportion" as const,
    confidenceLevel: "95",
    marginOfError: 9,
    designEffect: 1,
    nonResponseRate: 0,
    recommendedSize: greenCommuteRecommendedSize,
    finalSampleSize: greenCommuteRecommendedSize,
};

const reportContent = `<h2>研究问题</h2><p>本研究估计示范地区18—35岁青年生活幸福感自评的平均水平。主指标为0—10分单题生活评价，仅用于总体描述，不是临床心理量表。</p><h2>抽样设计</h2><p>在95%置信水平和绝对误差限0.5分下规划样本量，完成简单随机、系统和按年龄组分层抽样。个体没有自然且事先已知的“规模”变量，因此不使用PPS；不能把幸福感得分本身当作规模变量。</p><h2>结果解释</h2><p>比较三种设计的样本构成、均值、设计标准误与总体已知均值。社会支持、自评健康和经济压力只用于描述分组差异；横截面合成数据不能证明因果关系，结论也不能外推到研究总体之外。</p>`;
const readingReportContent = `<h2>实验目的</h2><p>本实验以每周阅读时长的均值为估计目标，使用总体方差估计、绝对误差限和有限总体校正确定样本量，并比较可执行抽样方法的结果。</p><h2>方法与结果</h2><p>总体中每周阅读时长包含零值，且没有其他对每个单位都为正数的数值字段，因此不存在合格的 PPS 规模变量。实验模板按规则将 PPS 设为不适用，随后完成简单随机、系统和按学院分层抽样。</p><h2>结论</h2><p>均值估计流程使用样本量 ${readingRecommendedSize}。三种启用方法均保留随机种子和完整样本行；PPS 未启用是由总体数据条件决定的有效策略，而不是执行失败。分析时应明确记录这一限制，避免为完成形式而选用不满足正值条件的规模变量。</p>`;
const graduateReportContent = `<h2>研究问题</h2><p>本研究估计某综合大学本届毕业生中计划直接就业的学生比例，分析单位为一名毕业生。</p><h2>抽样设计</h2><p>以学院进行分层。个体层面的求职准备度是分析辅助变量，不是表示单位“规模”的抽样框变量，因此不用于PPS。目标属于分类变量，样本量规划采用最保守比例方差，误差限按百分点解释。</p><h2>结果解释</h2><p>比较简单随机、系统和分层抽样的直接就业比例、设计标准误与总体已知比例。结果仅代表该虚拟总体和当前抽样设计，不应外推到其他学校或毕业年份。</p>`;
const diningReportContent = `<h2>研究问题</h2><p>本研究估计两个教学周内选定的六个观测日中，两校区四个食堂午间高峰96个服务时段的平均等待分钟数，分析单位是一个十五分钟服务时段，而不是一名学生。</p><h2>抽样设计</h2><p>按校区分层，并以抽样框中事先已知的历史同期客流量作为 PPS 规模变量，比较简单随机、系统、PPS 与分层抽样。每个抽中时段从开始后最先入队的5名就餐者（不足5名则全部）站到队尾起计时，到窗口开始受理时停止，再计算时段算术平均；无人入队时按预先约定把时段等待负担记为0并记录观察人数0。等待时间和实际开放窗口数只在抽中时段现场记录，不参与事前纳入概率计算。</p><h2>结果解释</h2><p>各服务时段在目标估计中等权，因此结果不是按就餐人数加权的个人平均等待。合成总体刻意让等待时间与时段、历史同期客流量和开放窗口数相关，用于教学比较；单次样本的均值差异不能解释为现实食堂服务措施的因果效果。</p>`;
const greenCommuteReportContent = `<h2>研究问题</h2><p>本研究估计某高校正常教学周学生典型到校通勤记录中绿色通勤方式所占比例，绿色通勤定义为步行、自行车或公共交通。</p><h2>抽样设计</h2><p>按95%置信水平和±9个百分点规划得到样本量90。完成简单随机、系统和按住宿片区分层抽样；通勤距离描述的是个体特征而不是单位规模，因此PPS不适用。抽样框按住宿片区成组，并在组内按四个登记时段固定轮换，系统抽样间隔K=4会让不同随机起点固定抽中不同登记时段。</p><h2>结果解释</h2><p>系统样本一次更接近总体比例并不能证明设计更优，应比较不同随机起点并说明周期结构风险。结果表示通勤记录比例，不应直接解释为总体学生人数，也不能外推到其他学校或非正常教学周。</p>`;

const happinessFieldMapping = {
    identifier: "青年代号",
    numeric: ["生活幸福感得分", "社会支持感", "自评健康", "经济压力"],
    stratified: ["年龄组", "居住地类型", "当前状态"],
    others: [],
    analysisTarget: { kind: "mean" as const, field: "生活幸福感得分" },
    studyContract: {
        version: 1 as const,
        researchQuestion: "示范地区18—35岁青年生活幸福感自评的平均水平是多少？",
        targetPopulation: "示范地区调查时点所有18—35岁青年",
        unitOfAnalysis: "一名18—35岁青年",
        target: { kind: "mean" as const, field: "生活幸福感得分" },
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
    numeric: ["等待分钟", "历史同期客流量", "开放窗口数"],
    stratified: ["校区", "食堂"],
    others: ["观测时段", "观测日"],
    analysisTarget: { kind: "mean" as const, field: "等待分钟" },
    studyContract: {
        version: 1 as const,
        researchQuestion: "两个教学周内选定的六个观测日中，两校区四个食堂午间服务时段的平均排队等待时间是多少？",
        targetPopulation: "两个教学周内选定的六个观测日中，两校区四个食堂的96个午间服务时段",
        unitOfAnalysis: "一个15分钟食堂服务时段",
        target: { kind: "mean" as const, field: "等待分钟" },
    },
};

const greenCommuteFieldMapping = {
    identifier: "通勤记录编号",
    numeric: ["通勤距离公里"],
    stratified: ["住宿片区", "年级"],
    others: ["登记时段", "是否绿色通勤", "主要通勤方式"],
    analysisTarget: { kind: "proportion" as const, field: "是否绿色通勤", value: "是" },
    studyContract: {
        version: 1 as const,
        researchQuestion: "正常教学周学生典型到校通勤记录中，绿色通勤方式所占比例是多少？",
        targetPopulation: "某高校正常教学周内在校学生的一次典型到校通勤记录",
        unitOfAnalysis: "一名学生的一次典型到校通勤记录",
        target: { kind: "proportion" as const, field: "是否绿色通勤", value: "是" },
    },
};

async function writePopulationFixtures(
    happinessPopulation: Array<Record<string, unknown>>,
    meanPopulation: Array<Record<string, unknown>>,
    graduatePopulation: Array<Record<string, unknown>>,
    diningPopulation: Array<Record<string, unknown>>,
    greenCommutePopulation: Array<Record<string, unknown>>,
) {
    const happinessTarget = resolve(process.cwd(), HAPPINESS_POPULATION_PATH.slice(1));
    const meanTarget = resolve(process.cwd(), READING_POPULATION_PATH.slice(1));
    const graduateTarget = resolve(process.cwd(), EMPLOYMENT_POPULATION_PATH.slice(1));
    const diningTarget = resolve(process.cwd(), DINING_POPULATION_PATH.slice(1));
    const greenCommuteTarget = resolve(process.cwd(), GREEN_COMMUTE_POPULATION_PATH.slice(1));
    await mkdir(dirname(happinessTarget), { recursive: true });

    const happinessWorkbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(happinessWorkbook, XLSX.utils.json_to_sheet(happinessPopulation), "总体数据");
    await Bun.write(happinessTarget, XLSX.write(happinessWorkbook, { type: "buffer", bookType: "xlsx" }));

    for (const [target, population] of [
        [meanTarget, meanPopulation],
        [graduateTarget, graduatePopulation],
        [diningTarget, diningPopulation],
        [greenCommuteTarget, greenCommutePopulation],
    ] as const) {
        const sheet = XLSX.utils.json_to_sheet(population);
        await Bun.write(target, `\uFEFF${XLSX.utils.sheet_to_csv(sheet)}`);
    }

    for (const path of [happinessTarget, meanTarget, graduateTarget, diningTarget, greenCommuteTarget]) {
        const file = Bun.file(path);
        if (!(await file.exists()) || file.size <= 0) throw new Error(`Failed to write seed fixture: ${path}`);
    }

    const sha256 = async (path: string) => new Bun.CryptoHasher("sha256")
        .update(await Bun.file(path).arrayBuffer())
        .digest("hex");
    return {
        happiness: await sha256(happinessTarget),
        reading: await sha256(meanTarget),
        employment: await sha256(graduateTarget),
        dining: await sha256(diningTarget),
        greenCommute: await sha256(greenCommuteTarget),
    };
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
    happinessPopulation: Array<Record<string, unknown>>,
    meanPopulation: Array<Record<string, unknown>>,
    graduatePopulation: Array<Record<string, unknown>>,
    diningPopulation: Array<Record<string, unknown>>,
    greenCommutePopulation: Array<Record<string, unknown>>,
) {
    const happinessSampleSize = happinessRecommendedSize;
    const [age1 = 0, age2 = 0, age3 = 0] = allocateIntegerShares(happinessSampleSize, [1, 1, 1]);
    const [college1 = 0, college2 = 0, college3 = 0] = allocateIntegerShares(readingRecommendedSize, [1 / 3, 1 / 3, 1 / 3]);
    const graduateCollegeCounts = allocateIntegerShares(graduateRecommendedSize, [0.25, 0.25, 0.25, 0.25]);
    const diningCampusCounts = allocateIntegerShares(diningRecommendedSize, [0.5, 0.5]);
    const greenAreaCounts = allocateIntegerShares(greenCommuteRecommendedSize, [1 / 3, 1 / 3, 1 / 3]);
    const happinessResults = {
        simple: await runSampling({ method: "simple", rawParams: { sampleSize: happinessSampleSize, seed: 202601 }, targetSampleSize: happinessSampleSize, population: happinessPopulation, fieldMapping: happinessFieldMapping }),
        systematic: await runSampling({ method: "systematic", rawParams: { seed: 202602 }, targetSampleSize: happinessSampleSize, population: happinessPopulation, fieldMapping: happinessFieldMapping }),
        stratified: await runSampling({
            method: "stratified",
            rawParams: {
                stratifyBy: "年龄组",
                seed: 202604,
                layers: [
                    { name: "18—22岁", ratio: 1 / 3, sampleCount: age1 },
                    { name: "23—27岁", ratio: 1 / 3, sampleCount: age2 },
                    { name: "28—35岁", ratio: 1 / 3, sampleCount: age3 },
                ],
            },
            targetSampleSize: happinessSampleSize,
            population: happinessPopulation,
            fieldMapping: happinessFieldMapping,
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
        pps: await runSampling({ method: "pps", rawParams: { sampleSize: diningRecommendedSize, sizeField: DINING_PPS_SIZE_FIELD, seed: 202633 }, targetSampleSize: diningRecommendedSize, population: diningPopulation, fieldMapping: diningFieldMapping }),
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

    const greenCommuteResults = {
        simple: await runSampling({ method: "simple", rawParams: { sampleSize: greenCommuteRecommendedSize, seed: 202641 }, targetSampleSize: greenCommuteRecommendedSize, population: greenCommutePopulation, fieldMapping: greenCommuteFieldMapping }),
        systematic: await runSampling({ method: "systematic", rawParams: { seed: 202642 }, targetSampleSize: greenCommuteRecommendedSize, population: greenCommutePopulation, fieldMapping: greenCommuteFieldMapping }),
        stratified: await runSampling({
            method: "stratified",
            rawParams: {
                stratifyBy: "住宿片区",
                seed: 202644,
                layers: ["校内宿舍", "近校社区", "远校社区"].map((name, index) => ({
                    name,
                    ratio: 1 / 3,
                    sampleCount: greenAreaCounts[index] ?? 0,
                })),
            },
            targetSampleSize: greenCommuteRecommendedSize,
            population: greenCommutePopulation,
            fieldMapping: greenCommuteFieldMapping,
        }),
    };

    return { happinessResults, meanResults, graduateResults, diningResults, greenCommuteResults };
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
    populationFileSha256: string;
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
        populationFileSha256: params.populationFileSha256,
        parserVersion: "raw-values-v1",
        samplingAlgorithmVersion: "sampling-v2",
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
    const happinessPopulation = createYouthHappinessPopulation();
    const meanPopulation = createMeanPopulation();
    const graduatePopulation = createGraduateIntentionPopulation();
    const diningPopulation = createDiningServicePopulation();
    const greenCommutePopulation = createGreenCommutePopulation();
    const populationFileHashes = await writePopulationFixtures(happinessPopulation, meanPopulation, graduatePopulation, diningPopulation, greenCommutePopulation);
    const { happinessResults, meanResults, graduateResults, diningResults, greenCommuteResults } = await buildSamplingFixtures(
        happinessPopulation,
        meanPopulation,
        graduatePopulation,
        diningPopulation,
        greenCommutePopulation,
    );
    assertCompleteSubmission(happinessQuestionnaire, happinessPlan, happinessResults, happinessPopulation.length, reportContent, happinessSamplingPolicy);
    assertCompleteSubmission(readingQuestionnaire, readingPlan, meanResults, meanPopulation.length, readingReportContent, noPpsSamplingPolicy);
    assertCompleteSubmission(graduateQuestionnaire, graduatePlan, graduateResults, graduatePopulation.length, graduateReportContent, graduateSamplingPolicy);
    assertCompleteSubmission(diningQuestionnaire, diningPlan, diningResults, diningPopulation.length, diningReportContent, ppsRequiredPolicy);
    assertCompleteSubmission(greenCommuteQuestionnaire, greenCommutePlan, greenCommuteResults, greenCommutePopulation.length, greenCommuteReportContent, greenCommuteSamplingPolicy);
    const compactHappinessResults = compactSamplingResults(happinessResults);
    const compactHappinessChoiceResults = compactSamplingResults({
        simple: happinessResults.simple,
        systematic: happinessResults.systematic,
    });
    const compactMeanResults = compactSamplingResults(meanResults);
    const compactGraduateResults = compactSamplingResults(graduateResults);
    const compactDiningResults = compactSamplingResults(diningResults);
    const compactGreenCommuteResults = compactSamplingResults(greenCommuteResults);
    if (!compactHappinessResults || !compactHappinessChoiceResults || !compactMeanResults || !compactGraduateResults || !compactDiningResults || !compactGreenCommuteResults) {
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
        excelFilePath: HAPPINESS_POPULATION_PATH,
        excelRowCount: happinessPopulation.length,
        fieldMapping: happinessFieldMapping,
        weightConfig,
        recommendQuestions: happinessQuestionnaire.questions,
        samplingPolicy: happinessSamplingPolicy,
        status: 1,
        createdAt: day(-20),
        updatedAt: day(-7),
    };
    const topicRows = await db.insert(topic).values([
        { ...validTopicValues, name: DOGFOOD_NAMES.topicA, description: "旗舰课题：估计18—35岁青年0—10分生活幸福感自评均值，要求年龄分层并禁用PPS；强调非临床诊断、非因果和合成数据边界。" },
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
            description: "估计正常教学周学生典型到校通勤记录中绿色通勤方式的比例。建议按95%置信水平、±9个百分点规划得到n=90、K=4，观察四登记时段固定轮换导致的周期风险，以及住宿片区分组形成的隐式分层；PPS不适用于本课题。",
            excelFilePath: GREEN_COMMUTE_POPULATION_PATH,
            excelRowCount: greenCommutePopulation.length,
            fieldMapping: greenCommuteFieldMapping,
            weightConfig,
            recommendQuestions: greenCommuteQuestionnaire.questions,
            samplingPolicy: greenCommuteSamplingPolicy,
            status: 1,
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
            samplingPolicy: graduateSamplingPolicy,
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
        { topicId: topicsByName[DOGFOOD_NAMES.topicD]!.id, classId: classByName[DOGFOOD_NAMES.mainClass]!.id, openTime: null, deadline: null, createdAt: day(-4), updatedAt: day(-4) },
        { topicId: topicsByName[DOGFOOD_NAMES.topicD]!.id, classId: classByName[DOGFOOD_NAMES.secondaryClass]!.id, openTime: day(-4), deadline: day(21), createdAt: day(-4), updatedAt: day(-4) },
        { topicId: topicsByName[DOGFOOD_NAMES.topicE]!.id, classId: classByName[DOGFOOD_NAMES.mainClass]!.id, openTime: null, deadline: null, createdAt: day(-3), updatedAt: day(-3) },
    ]).returning();
    const taskFor = (topicName: string, className: string) => {
        const row = taskRows.find((item) => (
            item.topicId === topicsByName[topicName]!.id && item.classId === classByName[className]!.id
        ));
        if (!row) throw new Error(`Seed task is missing: ${topicName} / ${className}`);
        return row;
    };
    const aTask = taskFor(DOGFOOD_NAMES.topicA, DOGFOOD_NAMES.mainClass);

    const happinessCompletedBase = {
        currentStage: 4,
        questionnaire: happinessQuestionnaire,
        samplePlan: happinessPlan,
        samplingResults: compactHappinessResults,
        reportContent,
        stage1CompletedAt: day(-5),
        stage2CompletedAt: day(-4),
        stage3CompletedAt: day(-3),
        stage4CompletedAt: day(-2),
    } as const;
    const happinessSnapshot = (studentId: string, topicName: string = DOGFOOD_NAMES.topicA) => snapshot({
        topicName,
        studentName: studentsById[studentId]!.name,
        populationSize: 240,
        populationFileSha256: populationFileHashes.happiness,
        questionnaire: happinessQuestionnaire,
        samplePlan: happinessPlan,
        samplingResults: compactHappinessResults,
        reportContent,
        samplingPolicy: happinessSamplingPolicy,
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
        populationFileSha256: populationFileHashes.employment,
        questionnaire: graduateQuestionnaire,
        samplePlan: graduatePlan,
        samplingResults: compactGraduateResults,
        reportContent: graduateReportContent,
        samplingPolicy: graduateSamplingPolicy,
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
        populationFileSha256: populationFileHashes.dining,
        questionnaire: diningQuestionnaire,
        samplePlan: diningPlan,
        samplingResults: compactDiningResults,
        reportContent: diningReportContent,
        samplingPolicy: ppsRequiredPolicy,
    });
    const greenCommuteCompletedBase = {
        currentStage: 4,
        questionnaire: greenCommuteQuestionnaire,
        samplePlan: greenCommutePlan,
        samplingResults: compactGreenCommuteResults,
        reportContent: greenCommuteReportContent,
        stage1CompletedAt: day(-3),
        stage2CompletedAt: day(-2),
        stage3CompletedAt: day(-1),
        stage4CompletedAt: day(-1),
    } as const;
    const greenCommuteSnapshot = (studentId: string) => snapshot({
        topicName: DOGFOOD_NAMES.topicE,
        studentName: studentsById[studentId]!.name,
        populationSize: 360,
        populationFileSha256: populationFileHashes.greenCommute,
        questionnaire: greenCommuteQuestionnaire,
        samplePlan: greenCommutePlan,
        samplingResults: compactGreenCommuteResults,
        reportContent: greenCommuteReportContent,
        samplingPolicy: greenCommuteSamplingPolicy,
    });

    const experimentRows = await db.insert(experiment).values([
        // 主任务：10 名主班学生精确覆盖 8 个进度桶（3 人未开始）。
        { studentId: studentsById[DOGFOOD_ANCHORS.stage1]!.id, taskId: aTask.id, currentStage: 1, status: "in_progress", questionnaire: happinessQuestionnaire, createdAt: day(-2), updatedAt: day(-2) },
        { studentId: studentsById.S2602!.id, taskId: aTask.id, currentStage: 2, status: "in_progress", questionnaire: happinessQuestionnaire, stage1CompletedAt: day(-2), createdAt: day(-3), updatedAt: day(-2) },
        { studentId: studentsById.S2603!.id, taskId: aTask.id, currentStage: 3, status: "in_progress", questionnaire: happinessQuestionnaire, samplePlan: happinessPlan, stage1CompletedAt: day(-3), stage2CompletedAt: day(-2), createdAt: day(-4), updatedAt: day(-2) },
        { ...happinessCompletedBase, samplingResults: compactHappinessChoiceResults, studentId: studentsById[DOGFOOD_ANCHORS.choicePair]!.id, taskId: aTask.id, status: "in_progress", reportContent: "<p>已按模板要求完成简单随机与系统抽样，正在比较所选方法并撰写实验报告。</p>", stage4CompletedAt: null, createdAt: day(-6), updatedAt: day(-1) },
        { ...happinessCompletedBase, studentId: studentsById[DOGFOOD_ANCHORS.submitted]!.id, taskId: aTask.id, status: "submitted", submissionSnapshot: happinessSnapshot(DOGFOOD_ANCHORS.submitted), submittedAt: day(-1), createdAt: day(-7), updatedAt: day(-1) },
        { ...happinessCompletedBase, studentId: studentsById[DOGFOOD_ANCHORS.graded]!.id, taskId: aTask.id, status: "graded", submissionSnapshot: happinessSnapshot(DOGFOOD_ANCHORS.graded), submittedAt: day(-2), scoreQuestionnaire: "92", scoreProcess: "88", scoreReport: "90", totalScore: "90.00", teacherComment: "主指标定义清楚，分层比较和非因果边界说明完整。", gradedByTeacherId: teachersById.T001!.id, gradedAt: day(-1), createdAt: day(-7), updatedAt: day(-1) },
        { ...happinessCompletedBase, studentId: studentsById[DOGFOOD_ANCHORS.rejected]!.id, taskId: aTask.id, version: 2, status: "rejected", submissionSnapshot: happinessSnapshot(DOGFOOD_ANCHORS.rejected), submittedAt: day(-2), rejectReason: "请说明为什么青年个体没有适合本课题的PPS规模变量，并避免将分组差异解释为因果关系。", gradedByTeacherId: teachersById.T001!.id, gradedAt: day(-1), createdAt: day(-7), updatedAt: day(-1) },
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
            submissionSnapshot: snapshot({ topicName: DOGFOOD_NAMES.topicB, studentName: studentsById[DOGFOOD_ANCHORS.submitted]!.name, populationSize: 24, populationFileSha256: populationFileHashes.reading, questionnaire: readingQuestionnaire, samplePlan: readingPlan, samplingResults: compactMeanResults, reportContent: readingReportContent, samplingPolicy: noPpsSamplingPolicy }),
            submittedAt: day(-1),
            createdAt: day(-6),
            updatedAt: day(-1),
        },
        // 绿色通勤：冻结一份系统抽样周期风险的完整提交，用于端到端回放。
        { ...greenCommuteCompletedBase, studentId: studentsById[DOGFOOD_ANCHORS.submitted]!.id, taskId: taskFor(DOGFOOD_NAMES.topicE, DOGFOOD_NAMES.mainClass).id, status: "submitted", submissionSnapshot: greenCommuteSnapshot(DOGFOOD_ANCHORS.submitted), submittedAt: day(-1), createdAt: day(-3), updatedAt: day(-1) },
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
        { ...happinessCompletedBase, studentId: studentsById.H2501!.id, taskId: taskFor(DOGFOOD_NAMES.topicA, DOGFOOD_NAMES.historyClass).id, status: "graded", submissionSnapshot: happinessSnapshot("H2501"), submittedAt: day(-192), scoreQuestionnaire: "90", scoreProcess: "85", scoreReport: "88", totalScore: "87.70", teacherComment: "上学期归档样本，作为历史班级的对照数据。", gradedByTeacherId: teachersById.T003!.id, gradedAt: day(-191), createdAt: day(-198), updatedAt: day(-191) },
        { ...happinessCompletedBase, studentId: studentsById.H2502!.id, taskId: taskFor(DOGFOOD_NAMES.topicA, DOGFOOD_NAMES.historyClass).id, status: "graded", submissionSnapshot: happinessSnapshot("H2502"), submittedAt: day(-192), scoreQuestionnaire: "84", scoreProcess: "88", scoreReport: "86", totalScore: "86.00", teacherComment: "上学期归档样本，抽样方法比较略显简略。", gradedByTeacherId: teachersById.T003!.id, gradedAt: day(-191), createdAt: day(-198), updatedAt: day(-191) },
    ]).returning({ id: experiment.id, studentId: experiment.studentId, taskId: experiment.taskId });

    // 四组服务端抽样审计记录：幸福感、毕业意向和绿色通勤各三种可用方法，服务时段课题四种方法。
    const auditedRuns = [
        { studentId: DOGFOOD_ANCHORS.submitted, topicName: DOGFOOD_NAMES.topicA, className: DOGFOOD_NAMES.mainClass, results: happinessResults },
        { studentId: DOGFOOD_ANCHORS.submitted, topicName: DOGFOOD_NAMES.topicC, className: DOGFOOD_NAMES.mainClass, results: graduateResults },
        { studentId: DOGFOOD_ANCHORS.auditedSecondary, topicName: DOGFOOD_NAMES.topicD, className: DOGFOOD_NAMES.secondaryClass, results: diningResults },
        { studentId: DOGFOOD_ANCHORS.submitted, topicName: DOGFOOD_NAMES.topicE, className: DOGFOOD_NAMES.mainClass, results: greenCommuteResults },
    ];
    const auditedMethods = auditedRuns.flatMap((auditedRun, runIndex) => {
        const auditedExperiment = experimentRows.find((row) => (
            row.studentId === studentsById[auditedRun.studentId]!.id
            && row.taskId === taskFor(auditedRun.topicName, auditedRun.className).id
        ));
        if (!auditedExperiment) throw new Error(`Seed audited experiment is missing: ${auditedRun.studentId}/${auditedRun.topicName}`);
        return (["simple", "systematic", "pps", "stratified"] as const).flatMap((method, methodIndex) => {
            const result = (auditedRun.results as unknown as Partial<Record<SamplingMethod, Record<string, unknown>>>)[method];
            if (!result) return [];
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
        { title: "2026-2027-1 学期实验平台开放", content: "本学期提供青年幸福感、课外阅读、毕业去向、食堂等待和绿色通勤五个完整实验。请先核对研究问题、目标总体、分析单位和主指标，再选择抽样设计。", targetScope: "all", status: 1, createdAt: day(-8), updatedAt: day(-8) },
        { title: "学生端：主任务截止时间提醒", content: `青年幸福感课题推荐样本量为 ${happinessRecommendedSize}，按95%置信水平和绝对误差限0.5分规划。阅读课题总体只有24个单位，可观察有限总体校正与接近普查的边界。`, targetScope: "student", status: 1, createdAt: day(-6), updatedAt: day(-6) },
        { title: "教师端：本周批改与课堂演示安排", content: "批改列表已准备待批改、已批改和已驳回示例。五个实验分别突出分层、系统抽样、PPS、小总体和非人员分析单位；演示时请同时说明合成数据、非因果解释和外推边界。", targetScope: "teacher", status: 1, createdAt: day(-5), updatedAt: day(-5) },
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
