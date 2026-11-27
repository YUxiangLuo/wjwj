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
import { resolveTargetUnit } from "../../student/experiment/target-unit";
import {
    hydrateWaveViews,
    simulateWaveDispatchForCompletedMethods,
    syncExperimentWaveRow,
} from "../../student/experiment/fieldwork-wave-service";
import {
    allocateIntegerShares,
    computeFreshFulfillmentPlan,
    computeSaasBudgetPlan,
    computeTeaPricingPlan,
    createFreshFulfillmentPopulation,
    createNevTestDrivePopulation,
    createSaasBudgetPopulation,
    createTeaPricingPopulation,
    createVipRenewalPopulation,
    DINING_POPULATION_PATH,
    DINING_PPS_SIZE_FIELD,
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
import { resolveStudyContract } from "../../lib/analysis-target";
import { buildAnalysisMetrics } from "../../domain/statistics/analysis";
import { parseTopicFieldMapping } from "../../domain/statistics/population";
import type { TargetAnalysisMetrics } from "../../domain/experiment/analysis-types";
import type { ExperimentWaveView, SamplePlanData, SamplingResultsData } from "../../domain/experiment/types";
import type { QuestionnaireData } from "../../lib/questionnaire-types";
import type { VariableDefinition, VariableDictionary } from "../../domain/variables/types";
import {
    autoBindQuestionnaireVariables,
    DEFAULT_CLEANING_CONFIG,
    validateAdjustmentPlan,
    type AdjustmentPlan,
    type FieldworkSimulationConfig,
    type StoredExperimentWave,
} from "../../domain/fieldwork";
import {
    createTeaPricingDictionary,
    TEA_PRICING_DESCRIPTION,
    teaPricingFieldMapping,
    teaPricingFieldworkConfig,
    teaPricingQuestionnaire,
} from "./happiness-topic";
import { buildTeaPricingWorkbook } from "./happiness-materials";
import { readVariableSource } from "../../server/variable-source";
import { validateDictionary } from "../../domain/variables/dictionary";
import { validateQuestionBindings } from "../../domain/variables/question-binding";

const catVar = (field: string, values: string[], kind: "nominal" | "ordinal" = "nominal"): VariableDefinition => ({
    field, label: field, unit: "", kind, categories: values.map((value) => ({ value, label: value })), missing: [null],
});
const numVar = (field: string, unit: string): VariableDefinition => ({
    field, label: field, unit, kind: "continuous", categories: [], missing: [null],
});
const idVar = (field: string): VariableDefinition => ({
    field, label: field, unit: "", kind: "identifier", categories: [], missing: [null],
});

const saasQuestionnaire: QuestionnaireData = {
    title: "B2B企业SaaS重点客户年度增购预算调研",
    welcomeText: "您好！本调研面向本年度签约存量重点企业客户（KA），旨在了解贵司下一财年数字化协同与数据分析模块的增购预算规划。所有财务预算数据严格保密，若贵司仅维持基础续约无新增模块计划，请如实填报0万元。",
    endingText: "感谢贵司信息化负责人的支持！调研汇总结果将用于制定大客户专属服务包与私有云交付排期方案。",
    questions: [
        { id: "sq1", section: "main", type: "numeric", content: "贵司下一财年计划在现有SaaS订阅基础上新增采购模块与席位的年度增购预算是多少万元？（仅维持原合同无增购请填0）", unit: "万元", numericMin: 0, numericMax: 500, decimalPlaces: 0 },
        { id: "sq2", section: "main", type: "boolean", content: "贵司当前是否已部署或计划升级本地私有云专属实例？（关联字段：是否部署私有云）" },
        { id: "sq3", section: "main", type: "scale", content: "贵司对现有客户成功团队（CSM）季度经营复盘响应速度的满意度如何？", scaleMin: 1, scaleMax: 5, scaleMinLabel: "很不满意", scaleMaxLabel: "非常满意" },
        { id: "sq4", section: "main", type: "multiple", content: "下一财年贵司最优先评估的增值模块有哪些？", options: ["BI经营驾驶舱", "AI智能客服插件", "多组织权限治理", "API数据集成连接器", "专属安全审计"], minSelect: 1, maxSelect: 3 },
        { id: "sq5", section: "background", type: "single", content: "贵司所属的核心行业分类是？（关联字段：所属行业）", options: ["智能制造", "连锁零售", "现代物流", "金融科技"] },
        { id: "sq6", section: "background", type: "single", content: "贵司当前的集团营收与人员规模属于哪一档位？（关联字段：企业规模档位）", options: ["中型成长企业", "大型集团企业"] },
    ],
};

const vipRenewalQuestionnaire: QuestionnaireData = {
    title: "综合电商平台付费会员年度续费意向与权益体验调研",
    welcomeText: "您好！感谢您成为平台尊享付费会员。本次年度会员权益调研预计耗时2—3分钟，所有回答严格匿名脱敏，仅用于优化下年度免邮券、专属折扣与联名影音权益包配置。",
    endingText: "感谢您的真实反馈！我们将综合活跃会员与沉默会员的建议优化年度会员权益结构。",
    questions: [
        { id: "vq1", section: "main", type: "single", content: "当前会员周期到期后，您的年度续费意向是什么？", options: ["明确续费", "观望比价", "暂不续费"] },
        { id: "vq2", section: "main", type: "boolean", content: "您的账户目前是否开通了到期自动续费功能？" },
        { id: "vq3", section: "main", type: "numeric", content: "过去半年内，您通过付费会员免邮与专享券累计节省的运费及优惠金额约为多少元？", unit: "元", numericMin: 0, numericMax: 5000, decimalPlaces: 0 },
        { id: "vq4", section: "main", type: "numeric", content: "过去半年内，您对月度会员专享礼券包的综合核销使用率约为百分之多少？", unit: "%", numericMin: 0, numericMax: 100, decimalPlaces: 0 },
        { id: "vq5", section: "main", type: "multiple", content: "哪些改进最能提升您的续费意愿？", options: ["无门槛免运费次数扩容", "大促折上95折", "联名视频音乐会员", "退换货极速上门免首重", "专属人工客服直连"], minSelect: 1, maxSelect: 3 },
        { id: "vq6", section: "background", type: "single", content: "近半年您在平台的购物与权益活跃频次属于？", options: ["高频活跃", "中频稳定", "低频沉默", "濒临流失"] },
    ],
};

const freshFulfillmentQuestionnaire: QuestionnaireData = {
    title: "连锁生鲜超市晚高峰前置仓履约容量现场核查表",
    welcomeText: "请运营督导员以「单个前置仓门店×观测日期×晚高峰15分钟波次」为独立核查单位填写。从波次开始起追踪前5笔即时配送订单（不足5笔计全部），记录从顾客支付锁单到骑手取货出仓的平均履约等待时长（分钟）。历史日均客单量由总部ERP台账事前导入并用于PPS入样概率计算；现场仅核录当班拣货员人数与实际等待时长。",
    endingText: "核查完毕。本表分析单位为15分钟晚高峰履约波次，结果用于前置仓晚高峰弹性排班与爆单预警。",
    questions: [
        { id: "dq1", section: "background", type: "single", content: "本次核查归属哪个前置仓门店？", options: ["陆家嘴仓", "张江仓", "静安仓", "徐汇仓"] },
        { id: "dq2", section: "background", type: "single", content: "本次核查归属哪个观测日期档位？", options: ["周二常态日", "周四促销日", "周五晚高峰", "周六家庭采购", "周日晚高峰", "周一补货日"] },
        { id: "dq3", section: "background", type: "single", content: "本次核查归属哪个晚高峰15分钟时段？", options: ["17:30-17:45", "17:45-18:00", "18:00-18:15", "18:15-18:30"] },
        { id: "dq4", section: "main", type: "numeric", content: "按“支付锁单至分拣打包出仓”口径，本波次追踪订单的平均履约等待时长是多少分钟？", unit: "分钟", numericMin: 0, numericMax: 60, decimalPlaces: 1 },
        { id: "dq5", section: "background", type: "numeric", content: "抽样框台账中该前置仓波次的历史日均客单量是多少单？", unit: "单", numericMin: 1, numericMax: 1000, decimalPlaces: 0 },
        { id: "dq6", section: "main", type: "numeric", content: "本波次仓内实际在岗拣货员人数是多少人？", unit: "人", numericMin: 1, numericMax: 50, decimalPlaces: 0 },
        { id: "dq7", section: "main", type: "numeric", content: "本波次实际纳入计时核查的有效订单笔数（0—5笔）是多少？", unit: "笔", numericMin: 0, numericMax: 5, decimalPlaces: 0 },
    ],
};

const nevTestDriveQuestionnaire: QuestionnaireData = {
    title: "智能新能源汽车门店试驾潜客锁单转化回访调研",
    welcomeText: "您好！感谢您莅临体验中心参与智能新能源汽车动态试驾。本回访预计耗时2分钟，所有信息严格保密，仅用于改善门店试驾动线、智驾讲解服务与金融购车方案。",
    endingText: "感谢您的参与！祝您出行愉悦。本次统计结果将帮助总部评估不同能级门店与到店时段的潜客转化效率。",
    questions: [
        { id: "cq1", section: "screening", type: "boolean", content: "本次记录是否为您本人近两周内在门店完成的实车动态试驾体验？" },
        { id: "cq2", section: "main", type: "boolean", content: "完成本次试驾后，您是否已形成在30天内下定锁单的高购车意向？（是=高意向锁单，否=继续观望对比）" },
        { id: "cq3", section: "main", type: "single", content: "本次试驾中打动您的首要核心产品卖点是？", options: ["智驾辅助", "续航补能", "座舱空间", "金融置换政策"] },
        { id: "cq4", section: "main", type: "numeric", content: "本次动态试驾您实际体验的道路行驶里程约为多少公里？", unit: "公里", numericMin: 0, numericMax: 100, decimalPlaces: 1 },
        { id: "cq5", section: "background", type: "single", content: "您本次预约到店试驾所处的时段档位是？", options: ["周末黄金档", "工作日上午", "工作日下午", "晚间散客档"] },
        { id: "cq6", section: "background", type: "single", content: "您本次体验的门店属于哪一能级类型？", options: ["旗舰体验中心", "商超展示店", "城郊交付中心"] },
        { id: "cq7", section: "background", type: "single", content: "您的家庭购车落地预算处于哪个区间档位？", options: ["20万以内", "20-30万", "30-40万", "40万以上"] },
    ],
};

const saasFieldMapping = {
    identifier: "客户编号",
    numeric: ["年度增购预算"],
    stratified: ["所属行业", "企业规模档位"],
    others: ["是否部署私有云"],
    analysisTarget: { kind: "mean" as const, field: "年度增购预算" },
    studyContract: {
        version: 1 as const,
        researchQuestion: "32家存量重点企业客户下一财年SaaS年度增购预算的均值是多少万元？",
        businessDecision: "核定大客户事业部下一财年ARR增购业绩目标，并评估中型与大型集团客户的交付顾问资源配比",
        targetPopulation: "本年度签约存量的32家B2B重点企业客户（KA）",
        unitOfAnalysis: "一家签约重点企业客户",
        target: { kind: "mean" as const, field: "年度增购预算" },
    },
};

const vipRenewalFieldMapping = {
    identifier: "会员账号编码",
    numeric: ["近半年省下运费金额", "会员权益使用率"],
    stratified: ["近半年活跃度", "城市线级"],
    others: ["续费意向", "是否开通自动续费"],
    analysisTarget: { kind: "proportion" as const, field: "续费意向", value: "明确续费" },
    studyContract: {
        version: 1 as const,
        researchQuestion: "平台付费会员总体中到期「明确续费」的会员比例是多少？",
        businessDecision: "测算下年度会员订阅现金流基线，并针对低频沉默会员制定精准召回补贴券预算",
        targetPopulation: "综合电商平台当前存量200名年度付费会员样本框",
        unitOfAnalysis: "一名平台年度付费会员",
        target: { kind: "proportion" as const, field: "续费意向", value: "明确续费" },
    },
};

const freshFulfillmentFieldMapping = {
    identifier: "时段记录编号",
    numeric: ["平均履约等待时长", "历史日均客单量", "当班拣货员人数"],
    stratified: ["运营大区", "前置仓门店"],
    others: ["晚高峰时段", "观测日期档位"],
    analysisTarget: { kind: "mean" as const, field: "平均履约等待时长" },
    studyContract: {
        version: 1 as const,
        researchQuestion: "两运营大区四家前置仓96个晚高峰15分钟履约波次的平均等待时长是多少分钟？",
        businessDecision: "优化晚高峰18:00核心拥堵波次的兼职拣货员弹性排班与前置仓超时免单赔付准备金",
        targetPopulation: "两运营大区四家生鲜前置仓在6个代表观测日内的96个晚高峰15分钟服务波次",
        unitOfAnalysis: "一个15分钟前置仓晚高峰履约波次",
        target: { kind: "mean" as const, field: "平均履约等待时长" },
    },
};

const nevTestDriveFieldMapping = {
    identifier: "试驾编号",
    numeric: ["试驾里程公里"],
    stratified: ["门店能级", "购车预算档位"],
    others: ["到店时段周期", "是否高意向锁单", "重点关注卖点"],
    analysisTarget: { kind: "proportion" as const, field: "是否高意向锁单", value: "是" },
    studyContract: {
        version: 1 as const,
        researchQuestion: "门店动态试驾潜客记录中30天内「高意向锁单」的转化比例是多少？",
        businessDecision: "评估周末黄金档与商超展示店试驾线索质量，调整门店试驾专员排班与锁单限时金融权益",
        targetPopulation: "品牌三类门店双周内完成的360条实车动态试驾潜客记录",
        unitOfAnalysis: "一条门店实车试驾潜客记录",
        target: { kind: "proportion" as const, field: "是否高意向锁单", value: "是" },
    },
};

const saasVariables: VariableDefinition[] = [
    idVar("客户编号"),
    catVar("所属行业", ["智能制造", "连锁零售", "现代物流", "金融科技"]),
    catVar("企业规模档位", ["中型成长企业", "大型集团企业"], "ordinal"),
    numVar("年度增购预算", "万元"),
    catVar("是否部署私有云", ["是", "否"]),
];

const vipRenewalVariables: VariableDefinition[] = [
    idVar("会员账号编码"),
    catVar("近半年活跃度", ["高频活跃", "中频稳定", "低频沉默", "濒临流失"], "ordinal"),
    catVar("城市线级", ["一二线城市", "三四线及以下"]),
    catVar("续费意向", ["明确续费", "观望比价", "暂不续费"], "ordinal"),
    catVar("是否开通自动续费", ["是", "否"]),
    numVar("近半年省下运费金额", "元"),
    numVar("会员权益使用率", "%"),
];

const freshFulfillmentVariables: VariableDefinition[] = [
    idVar("时段记录编号"),
    catVar("运营大区", ["浦东运营区", "浦西运营区"]),
    catVar("前置仓门店", ["陆家嘴仓", "张江仓", "静安仓", "徐汇仓"]),
    catVar("晚高峰时段", ["17:30-17:45", "17:45-18:00", "18:00-18:15", "18:15-18:30"], "ordinal"),
    catVar("观测日期档位", ["周二常态日", "周四促销日", "周五晚高峰", "周六家庭采购", "周日晚高峰", "周一补货日"]),
    numVar("平均履约等待时长", "分钟"),
    numVar("历史日均客单量", "单"),
    numVar("当班拣货员人数", "人"),
];

const nevTestDriveVariables: VariableDefinition[] = [
    idVar("试驾编号"),
    catVar("门店能级", ["旗舰体验中心", "商超展示店", "城郊交付中心"]),
    catVar("到店时段周期", ["周末黄金档", "工作日上午", "工作日下午", "晚间散客档"]),
    catVar("购车预算档位", ["20万以内", "20-30万", "30-40万", "40万以上"], "ordinal"),
    catVar("是否高意向锁单", ["是", "否"]),
    catVar("重点关注卖点", ["智驾辅助", "续航补能", "座舱空间", "金融置换政策"]),
    numVar("试驾里程公里", "公里"),
];

const saasFieldworkConfig: FieldworkSimulationConfig = {
    version: 1,
    preset: "balanced",
    baseUnitNonResponseRate: 0.12,
    baseSpeederRate: 0.04,
    baseStraightlinerRate: 0.04,
    baseItemSkipRate: 0.01,
    contactCostPerUnit: 35,
    incentiveCostPerComplete: 150,
};

const vipFieldworkConfig: FieldworkSimulationConfig = {
    version: 1,
    preset: "stratum_differential",
    baseUnitNonResponseRate: 0.22,
    stratumField: "近半年活跃度",
    stratumNonResponseRates: {
        "高频活跃": 0.08,
        "中频稳定": 0.16,
        "低频沉默": 0.36,
        "濒临流失": 0.48,
    },
    baseSpeederRate: 0.06,
    baseStraightlinerRate: 0.05,
    baseItemSkipRate: 0.02,
    contactCostPerUnit: 3,
    incentiveCostPerComplete: 15,
};

const freshFieldworkConfig: FieldworkSimulationConfig = {
    version: 1,
    preset: "peak_congestion",
    baseUnitNonResponseRate: 0.14,
    baseSpeederRate: 0.05,
    baseStraightlinerRate: 0.04,
    baseItemSkipRate: 0.02,
    contactCostPerUnit: 18,
    incentiveCostPerComplete: 45,
};

const nevFieldworkConfig: FieldworkSimulationConfig = {
    version: 1,
    preset: "high_burden_sensitive",
    baseUnitNonResponseRate: 0.16,
    baseSpeederRate: 0.07,
    baseStraightlinerRate: 0.05,
    baseItemSkipRate: 0.02,
    contactCostPerUnit: 8,
    incentiveCostPerComplete: 30,
};

const weightConfig = { questionnaire: 30, process: 30, report: 40 };
const defaultSamplingPolicy = buildDefaultSamplingPolicy();
const noPpsSamplingPolicy = buildDefaultSamplingPolicy({ ppsEnabled: false });
const vipSamplingPolicy: SamplingPolicyV1 = {
    version: 1,
    methods: { ...defaultSamplingPolicy.methods, pps: "disabled", stratified: "required" },
};
const teaSamplingPolicy: SamplingPolicyV1 = {
    version: 1,
    methods: { ...defaultSamplingPolicy.methods, pps: "disabled", stratified: "required" },
};
const nevSamplingPolicy: SamplingPolicyV1 = {
    version: 1,
    methods: { ...defaultSamplingPolicy.methods, systematic: "required", pps: "disabled" },
};
const ppsRequiredPolicy: SamplingPolicyV1 = {
    version: 1,
    methods: { ...defaultSamplingPolicy.methods, pps: "required" },
    ppsSizeFields: [DINING_PPS_SIZE_FIELD],
};

const teaPopForPlan = createTeaPricingPopulation();
const { recommendedSize: teaRecommendedSize, populationVariance: teaVariance } = computeTeaPricingPlan(teaPopForPlan);
const teaPlan: SamplePlanData = {
    estimationType: "mean",
    confidenceLevel: "95",
    marginOfError: 1.0,
    populationVariance: teaVariance,
    varianceSource: "population",
    designEffect: 1,
    nonResponseRate: 0.15,
    recommendedSize: teaRecommendedSize,
    finalSampleSize: teaRecommendedSize,
};

const { recommendedSize: saasRecommendedSize, populationVariance: saasPopulationVariance } = computeSaasBudgetPlan();
const saasPlan: SamplePlanData = {
    estimationType: "mean",
    confidenceLevel: "95",
    marginOfError: 3,
    populationVariance: saasPopulationVariance,
    varianceSource: "population",
    designEffect: 1,
    nonResponseRate: 0.15,
    recommendedSize: saasRecommendedSize,
    finalSampleSize: saasRecommendedSize,
};

const calculatedVipSize = calculateFinitePopulationSampleSize({
    confidenceLevel: "95",
    marginOfError: 6,
    populationSize: 200,
    designEffect: 1,
    nonResponseRate: 0.15,
});
if (calculatedVipSize === null) throw new Error("VIP renewal proportion plan could not be calculated");
const vipRecommendedSize: number = calculatedVipSize;
const vipPlan: SamplePlanData = {
    estimationType: "proportion",
    confidenceLevel: "95",
    marginOfError: 6,
    designEffect: 1,
    nonResponseRate: 0.15,
    recommendedSize: vipRecommendedSize,
    finalSampleSize: vipRecommendedSize,
};

const freshPopForPlan = createFreshFulfillmentPopulation();
const { recommendedSize: freshRecommendedSize, populationVariance: freshWaitVariance } = computeFreshFulfillmentPlan(freshPopForPlan);
const freshPlan: SamplePlanData = {
    estimationType: "mean",
    confidenceLevel: "95",
    marginOfError: 2,
    populationVariance: freshWaitVariance,
    varianceSource: "population",
    designEffect: 1,
    nonResponseRate: 0.15,
    recommendedSize: freshRecommendedSize,
    finalSampleSize: freshRecommendedSize,
};

// Keep n=90 on N=360 so systematic K = 360 / 90 = 4 exactly!
const calculatedNevSize = calculateFinitePopulationSampleSize({
    confidenceLevel: "95",
    marginOfError: 9,
    populationSize: 360,
    designEffect: 1,
    nonResponseRate: 0,
});
if (calculatedNevSize !== 90) throw new Error(`Expected NEV systematic benchmark n=90, got ${calculatedNevSize}`);
const nevRecommendedSize: number = calculatedNevSize;
const nevPlan: SamplePlanData = {
    estimationType: "proportion",
    confidenceLevel: "95",
    marginOfError: 9,
    designEffect: 1,
    nonResponseRate: 0,
    recommendedSize: nevRecommendedSize,
    finalSampleSize: nevRecommendedSize,
};

const teaReportContent = `<h2>商业决策背景与研究目标</h2><p>本研究围绕新锐现制茶饮品牌战略新品上市定价决策，估计活跃会员单杯最高支付意愿均值。首轮试投暴露普通会员无回答率较高及少量闪电卷污染，正式轮通过会员等级分层抽样与质检清洗校准了幸存者高估偏差。消费者个体不存在事前已知的正值规模度量，因此不使用 PPS 抽样。</p><h2>多轮对比与管理建议</h2><p>对比简单随机、系统与会员等级分层抽样可见，分层设计显著降低了层间异质性带来的标准误。建议全国终端指导价锚定总体均值区间，并对价格敏感度较高的普通会员定向发放新品满减券。</p>`;
const saasReportContent = `<h2>商业问题与小总体特征</h2><p>本调研面向32家存量B2B重点企业客户估计下一财年SaaS年度增购预算均值。由于总体包含预算为0万元的纯续约客户，且无其他对所有客户恒为正数的辅助规模字段，实验模板按统计规范将 PPS 设为不适用。</p><h2>试投复盘与正式轮推断</h2><p>首轮小样本试投验证了允许填报0万元的问卷量程规则，并测得B2B高管访谈无回答率；二轮正式投放纳入15%预期无回答率与有限总体校正（FPC）得到样本量 ${saasRecommendedSize}，同步完成简单随机、系统与行业分层抽样。建议大客户团队重点围绕大型集团客户与金融科技行业配置交付顾问资源。</p>`;
const vipReportContent = `<h2>商业背景与幸存者偏差诊断</h2><p>本研究估计综合电商平台200名付费会员中到期「明确续费」的总体比例。首轮试投使用简单随机抽样时，高频活跃会员积极完答而低频沉默会员大量拒访，导致原始回收续费率虚高。个人消费金额不代表单位抽样规模，故不用于 PPS。</p><h2>分层调优与续费运营策略</h2><p>正式轮代入实测损耗率扩充样本量，并强制按「近半年活跃度」执行分层抽样及事后权重校准，有效缓解了层间应答率差异带来的沉默会员欠代表偏倚。建议运营团队切勿被未校准的高续费率误导，应在会员到期前30天对低频沉默层定向投放免邮召回券。</p>`;
const freshReportContent = `<h2>运营问题与非人员分析单位界定</h2><p>本研究估计两运营大区四家生鲜前置仓96个晚高峰15分钟履约波次的平均等待时长，分析单位为一个15分钟履约波次而非单名顾客。首轮试投发现晚高峰18:00波次订单密度高且等待波动剧烈，等概率抽样效率偏低。</p><h2>PPS抽样调优与排班建议</h2><p>正式轮利用ERP台账事先已知的「历史日均客单量」作为规模变量执行必做 PPS 抽样，并与简单随机、系统及运营大区分层抽样对照。由于历史客单量与履约等待时长高度正相关，PPS 抽样的 Hájek 估计标准误显著收窄。建议在17:45—18:15峰值波次动态增配2名兼职拣货员。</p>`;
const nevReportContent = `<h2>商业目标与系统抽样周期风险</h2><p>本研究估计智能新能源汽车门店360条动态试驾记录中30天内「高意向锁单」的转化比例。单次试驾里程属于个体体验特征而非规模度量，因此 PPS 不适用。</p><h2>试投复盘与正式轮对比结论</h2><p>正式轮按95%置信水平与±9个百分点规划样本量 n=90，此时系统抽样间距恰好为 K=4，与抽样框内「周末黄金档—工作日上午—工作日下午—晚间散客档」四时段固定循环完全同步，不同随机起点锁死单一时段导致估计剧烈摆动！相比之下按门店能级分层或简单随机抽样更为稳健。建议门店切勿按固定4的倍数间隔抽检回访线索。</p>`;

const defaultAdjustmentPlans: Record<"saas" | "vip" | "fresh" | "nev", AdjustmentPlan> = {
    saas: {
        identifiedIssues: ["unit_nonresponse_gap", "careless_responses"],
        plannedActions: ["recalibrate_sample_size", "upgrade_sampling_design"],
        rationale: "首轮试投显示部分企业信息化负责人因会议繁忙未及时回复，且小总体下需结合有限总体校正（FPC）与15%无回答余量重新核算正式轮样本量，并增加按所属行业分层抽样提升行业代表性。",
    },
    vip: {
        identifiedIssues: ["stratum_response_bias", "unit_nonresponse_gap", "careless_responses"],
        plannedActions: ["recalibrate_sample_size", "upgrade_sampling_design", "apply_nonresponse_weighting"],
        rationale: "首轮试投发现低频沉默与濒临流失会员拒访率远高于高频活跃会员，造成样本结构向高续费客群偏倚；正式轮代入实测损耗率重算样本量，并升级为按近半年活跃度分层抽样配合权重校准。",
    },
    fresh: {
        identifiedIssues: ["periodic_or_frame_risk", "unit_nonresponse_gap"],
        plannedActions: ["recalibrate_sample_size", "upgrade_sampling_design"],
        rationale: "首轮等概率试投对高客单量拥堵波次覆盖不足导致方差偏大；正式轮启用总部台账「历史日均客单量」执行必做 PPS 抽样，并同步对比运营大区分层抽样以显著压降主指标标准误。",
    },
    nev: {
        identifiedIssues: ["periodic_or_frame_risk", "careless_responses"],
        plannedActions: ["revise_questionnaire", "upgrade_sampling_design"],
        rationale: "抽样框按四类到店时段固定循环排列，当正式轮 n=90 时系统抽样间距 K=4 与周末黄金档周期共振；因此正式轮同步执行简单随机与门店能级分层抽样量化周期性偏误并剔除闪电敷衍回访卷。",
    },
};

for (const plan of Object.values(defaultAdjustmentPlans)) {
    const err = validateAdjustmentPlan(plan);
    if (err) throw new Error(`Invalid seed adjustment plan: ${err}`);
}

async function writePopulationFixtures(
    teaPop: Array<Record<string, unknown>>,
    saasPop: Array<Record<string, unknown>>,
    vipPop: Array<Record<string, unknown>>,
    freshPop: Array<Record<string, unknown>>,
    nevPop: Array<Record<string, unknown>>,
) {
    const teaTarget = resolve(process.cwd(), HAPPINESS_POPULATION_PATH.slice(1));
    const saasTarget = resolve(process.cwd(), READING_POPULATION_PATH.slice(1));
    const vipTarget = resolve(process.cwd(), EMPLOYMENT_POPULATION_PATH.slice(1));
    const freshTarget = resolve(process.cwd(), DINING_POPULATION_PATH.slice(1));
    const nevTarget = resolve(process.cwd(), GREEN_COMMUTE_POPULATION_PATH.slice(1));
    await mkdir(dirname(teaTarget), { recursive: true });

    await Bun.write(teaTarget, buildTeaPricingWorkbook(teaPop));

    for (const [target, population] of [
        [saasTarget, saasPop],
        [vipTarget, vipPop],
        [freshTarget, freshPop],
        [nevTarget, nevPop],
    ] as const) {
        const sheet = XLSX.utils.json_to_sheet(population);
        await Bun.write(target, `\uFEFF${XLSX.utils.sheet_to_csv(sheet)}`);
    }

    for (const path of [teaTarget, saasTarget, vipTarget, freshTarget, nevTarget]) {
        const file = Bun.file(path);
        if (!(await file.exists()) || file.size <= 0) throw new Error(`Failed to write seed fixture: ${path}`);
    }

    const sha256 = async (path: string) => new Bun.CryptoHasher("sha256")
        .update(await Bun.file(path).arrayBuffer())
        .digest("hex");
    return {
        tea: await sha256(teaTarget),
        saas: await sha256(saasTarget),
        vip: await sha256(vipTarget),
        fresh: await sha256(freshTarget),
        nev: await sha256(nevTarget),
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
    const target = resolve(process.cwd(), GUIDE_ATTACHMENT_PATH.slice(1));
    await mkdir(dirname(target), { recursive: true });
    await Bun.write(target, sourceFile);
    const targetFile = Bun.file(target);
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
    teaPop: Array<Record<string, unknown>>,
    saasPop: Array<Record<string, unknown>>,
    vipPop: Array<Record<string, unknown>>,
    freshPop: Array<Record<string, unknown>>,
    nevPop: Array<Record<string, unknown>>,
) {
    const tierCounts = ["普通会员", "银卡会员", "黑金会员"].map((tier) => teaPop.filter((r) => r.会员等级 === tier).length);
    const [t1 = 0, t2 = 0, t3 = 0] = allocateIntegerShares(teaRecommendedSize, tierCounts);
    const saasIndustryCounts = allocateIntegerShares(saasRecommendedSize, [0.25, 0.25, 0.25, 0.25]);
    const vipActivityCounts = allocateIntegerShares(vipRecommendedSize, [0.25, 0.25, 0.25, 0.25]);
    const freshRegionCounts = allocateIntegerShares(freshRecommendedSize, [0.5, 0.5]);
    const nevStoreCounts = allocateIntegerShares(nevRecommendedSize, [1 / 3, 1 / 3, 1 / 3]);

    const teaResults = {
        simple: await runSampling({ method: "simple", rawParams: { sampleSize: teaRecommendedSize, seed: 202601 }, targetSampleSize: teaRecommendedSize, population: teaPop, fieldMapping: teaPricingFieldMapping }),
        systematic: await runSampling({ method: "systematic", rawParams: { seed: 202602 }, targetSampleSize: teaRecommendedSize, population: teaPop, fieldMapping: teaPricingFieldMapping }),
        stratified: await runSampling({
            method: "stratified",
            rawParams: {
                stratifyBy: "会员等级",
                seed: 202604,
                layers: [
                    { name: "普通会员", ratio: tierCounts[0]! / teaPop.length, sampleCount: t1 },
                    { name: "银卡会员", ratio: tierCounts[1]! / teaPop.length, sampleCount: t2 },
                    { name: "黑金会员", ratio: tierCounts[2]! / teaPop.length, sampleCount: t3 },
                ],
            },
            targetSampleSize: teaRecommendedSize,
            population: teaPop,
            fieldMapping: teaPricingFieldMapping,
        }),
    };

    const saasPilotSimple = await runSampling({ method: "simple", rawParams: { sampleSize: 12, seed: 202610 }, targetSampleSize: 12, population: saasPop, fieldMapping: saasFieldMapping });
    const saasResults = {
        simple: await runSampling({ method: "simple", rawParams: { sampleSize: saasRecommendedSize, seed: 202611 }, targetSampleSize: saasRecommendedSize, population: saasPop, fieldMapping: saasFieldMapping }),
        systematic: await runSampling({ method: "systematic", rawParams: { seed: 202612 }, targetSampleSize: saasRecommendedSize, population: saasPop, fieldMapping: saasFieldMapping }),
        stratified: await runSampling({
            method: "stratified",
            rawParams: {
                stratifyBy: "所属行业",
                seed: 202614,
                layers: ["智能制造", "连锁零售", "现代物流", "金融科技"].map((name, idx) => ({
                    name,
                    ratio: 0.25,
                    sampleCount: saasIndustryCounts[idx] ?? 0,
                })),
            },
            targetSampleSize: saasRecommendedSize,
            population: saasPop,
            fieldMapping: saasFieldMapping,
        }),
    };

    const vipPilotSimple = await runSampling({ method: "simple", rawParams: { sampleSize: 40, seed: 202620 }, targetSampleSize: 40, population: vipPop, fieldMapping: vipRenewalFieldMapping });
    const vipResults = {
        simple: await runSampling({ method: "simple", rawParams: { sampleSize: vipRecommendedSize, seed: 202621 }, targetSampleSize: vipRecommendedSize, population: vipPop, fieldMapping: vipRenewalFieldMapping }),
        systematic: await runSampling({ method: "systematic", rawParams: { seed: 202622 }, targetSampleSize: vipRecommendedSize, population: vipPop, fieldMapping: vipRenewalFieldMapping }),
        stratified: await runSampling({
            method: "stratified",
            rawParams: {
                stratifyBy: "近半年活跃度",
                seed: 202624,
                layers: ["高频活跃", "中频稳定", "低频沉默", "濒临流失"].map((name, index) => ({
                    name,
                    ratio: 0.25,
                    sampleCount: vipActivityCounts[index] ?? 0,
                })),
            },
            targetSampleSize: vipRecommendedSize,
            population: vipPop,
            fieldMapping: vipRenewalFieldMapping,
        }),
    };

    const freshPilotSimple = await runSampling({ method: "simple", rawParams: { sampleSize: 24, seed: 202630 }, targetSampleSize: 24, population: freshPop, fieldMapping: freshFulfillmentFieldMapping });
    const freshResults = {
        simple: await runSampling({ method: "simple", rawParams: { sampleSize: freshRecommendedSize, seed: 202631 }, targetSampleSize: freshRecommendedSize, population: freshPop, fieldMapping: freshFulfillmentFieldMapping }),
        systematic: await runSampling({ method: "systematic", rawParams: { seed: 202632 }, targetSampleSize: freshRecommendedSize, population: freshPop, fieldMapping: freshFulfillmentFieldMapping }),
        pps: await runSampling({ method: "pps", rawParams: { sampleSize: freshRecommendedSize, sizeField: DINING_PPS_SIZE_FIELD, seed: 202633 }, targetSampleSize: freshRecommendedSize, population: freshPop, fieldMapping: freshFulfillmentFieldMapping }),
        stratified: await runSampling({
            method: "stratified",
            rawParams: {
                stratifyBy: "运营大区",
                seed: 202634,
                layers: ["浦东运营区", "浦西运营区"].map((name, index) => ({
                    name,
                    ratio: 0.5,
                    sampleCount: freshRegionCounts[index] ?? 0,
                })),
            },
            targetSampleSize: freshRecommendedSize,
            population: freshPop,
            fieldMapping: freshFulfillmentFieldMapping,
        }),
    };

    const nevPilotSimple = await runSampling({ method: "simple", rawParams: { sampleSize: 45, seed: 202640 }, targetSampleSize: 45, population: nevPop, fieldMapping: nevTestDriveFieldMapping });
    const nevResults = {
        simple: await runSampling({ method: "simple", rawParams: { sampleSize: nevRecommendedSize, seed: 202641 }, targetSampleSize: nevRecommendedSize, population: nevPop, fieldMapping: nevTestDriveFieldMapping }),
        systematic: await runSampling({ method: "systematic", rawParams: { seed: 202642 }, targetSampleSize: nevRecommendedSize, population: nevPop, fieldMapping: nevTestDriveFieldMapping }),
        stratified: await runSampling({
            method: "stratified",
            rawParams: {
                stratifyBy: "门店能级",
                seed: 202644,
                layers: ["旗舰体验中心", "商超展示店", "城郊交付中心"].map((name, index) => ({
                    name,
                    ratio: 1 / 3,
                    sampleCount: nevStoreCounts[index] ?? 0,
                })),
            },
            targetSampleSize: nevRecommendedSize,
            population: nevPop,
            fieldMapping: nevTestDriveFieldMapping,
        }),
    };

    return {
        teaResults,
        saasPilotSimple,
        saasResults,
        vipPilotSimple,
        vipResults,
        freshPilotSimple,
        freshResults,
        nevPilotSimple,
        nevResults,
    };
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

function buildTwoWaveFixture(params: {
    taskId: number;
    baseQuestionnaire: QuestionnaireData;
    dictionary: VariableDictionary;
    fieldMapping: Record<string, unknown>;
    fieldworkConfig: FieldworkSimulationConfig;
    population: Array<Record<string, unknown>>;
    pilotSampleSize: number;
    pilotSimpleResult: Record<string, unknown>;
    formalPlan: SamplePlanData;
    formalCompactResults: Record<string, unknown>;
    pilotSeed: number;
    formalSeed: number;
    completedAtIso: string;
}): {
    boundQuestionnaire: QuestionnaireData;
    storedWaves: StoredExperimentWave[];
    waveViews: ExperimentWaveView[];
} {
    const targetField = (params.fieldMapping.analysisTarget as { field: string }).field;
    const bound = autoBindQuestionnaireVariables({
        questionnaire: params.baseQuestionnaire,
        dictionary: params.dictionary,
        taskId: params.taskId,
        targetField,
    }).questionnaire;
    validateQuestionBindings(bound, params.dictionary, params.taskId);

    const pilotCompact = compactSamplingResults({ simple: params.pilotSimpleResult }) as Record<string, unknown>;
    const pilotPlan: SamplePlanData = {
        ...params.formalPlan,
        nonResponseRate: 0.1,
        recommendedSize: params.pilotSampleSize,
        finalSampleSize: params.pilotSampleSize,
    };

    const wave1Draft: StoredExperimentWave = {
        waveNumber: 1,
        kind: "pilot",
        label: "第 1 轮 · 首轮试投",
        questionnaire: bound,
        samplePlan: pilotPlan as unknown as Record<string, unknown>,
        samplingResults: pilotCompact,
        fieldwork: null,
        cleaningConfig: { ...DEFAULT_CLEANING_CONFIG },
        completedAt: params.completedAtIso,
    };
    const w1Dispatch = simulateWaveDispatchForCompletedMethods({
        wave: wave1Draft,
        population: params.population,
        fieldMapping: params.fieldMapping,
        fieldworkConfig: params.fieldworkConfig,
        dictionary: params.dictionary,
        seed: params.pilotSeed,
    });
    if (!w1Dispatch.ok) throw new Error(`Seed wave 1 dispatch failed: ${w1Dispatch.message}`);
    const wave1: StoredExperimentWave = { ...wave1Draft, fieldwork: w1Dispatch.fieldwork };

    const wave2Draft: StoredExperimentWave = {
        waveNumber: 2,
        kind: "main",
        label: "第 2 轮 · 调优正式投放",
        questionnaire: bound,
        samplePlan: params.formalPlan as unknown as Record<string, unknown>,
        samplingResults: params.formalCompactResults,
        fieldwork: null,
        cleaningConfig: { ...DEFAULT_CLEANING_CONFIG },
        completedAt: params.completedAtIso,
    };
    const w2Dispatch = simulateWaveDispatchForCompletedMethods({
        wave: wave2Draft,
        population: params.population,
        fieldMapping: params.fieldMapping,
        fieldworkConfig: params.fieldworkConfig,
        dictionary: params.dictionary,
        seed: params.formalSeed,
    });
    if (!w2Dispatch.ok) throw new Error(`Seed wave 2 dispatch failed: ${w2Dispatch.message}`);
    const wave2: StoredExperimentWave = { ...wave2Draft, fieldwork: w2Dispatch.fieldwork };

    const storedWaves = [wave1, wave2];
    const waveViews = hydrateWaveViews({
        waves: storedWaves,
        population: params.population,
        populationSize: params.population.length,
        fieldMapping: params.fieldMapping,
        fieldworkConfig: params.fieldworkConfig,
        dictionary: params.dictionary,
    });

    return { boundQuestionnaire: bound, storedWaves, waveViews };
}

function snapshot(params: {
    topicName: string;
    studentName: string;
    populationSize: number;
    populationFileSha256: string;
    questionnaire: QuestionnaireData;
    samplePlan: SamplePlanData;
    samplingResults: Record<string, unknown>;
    adjustmentPlan: AdjustmentPlan;
    waves: ExperimentWaveView[];
    fieldMapping: unknown;
    fieldworkConfig: FieldworkSimulationConfig;
    variableDictionary: VariableDictionary;
    reportContent: string;
    samplingPolicy: SamplingPolicyV1;
    targetMetrics: TargetAnalysisMetrics;
}): SubmissionSnapshot {
    return {
        topicName: params.topicName,
        studentName: params.studentName,
        populationSize: params.populationSize,
        questionnaire: params.questionnaire as unknown as Record<string, unknown>,
        samplePlan: params.samplePlan as unknown as Record<string, unknown>,
        samplingResults: params.samplingResults,
        adjustmentPlan: params.adjustmentPlan,
        waves: params.waves,
        studyContract: resolveStudyContract(params.fieldMapping, { topicName: params.topicName }),
        fieldworkConfig: params.fieldworkConfig,
        reportContent: params.reportContent,
        weightConfig,
        samplingPolicy: params.samplingPolicy,
        variableDictionary: params.variableDictionary,
        targetMetrics: params.targetMetrics,
        populationFileSha256: params.populationFileSha256,
        parserVersion: "raw-values-v1",
        samplingAlgorithmVersion: "business-sampling-v3",
    };
}

function seedTargetMetrics(params: {
    population: Array<Record<string, unknown>>;
    fieldMapping: unknown;
    dictionary: VariableDictionary;
    samplingResults: unknown;
    samplePlan: SamplePlanData;
    topicName: string;
}): TargetAnalysisMetrics {
    const target = buildAnalysisMetrics({
        population: params.population,
        fieldMapping: parseTopicFieldMapping(params.fieldMapping),
        samplingResults: params.samplingResults as SamplingResultsData,
        samplePlan: params.samplePlan,
        topicName: params.topicName,
        targetUnit: resolveTargetUnit(params.fieldMapping, params.dictionary),
    }).target;
    if (!target) throw new Error(`Dogfood target metrics missing for ${params.topicName}`);
    return target;
}

async function confirmTopicDictionary(
    excelPath: string,
    mapping: unknown,
    defs: VariableDefinition[],
): Promise<VariableDictionary> {
    const source = await readVariableSource(excelPath, mapping);
    return validateDictionary(
        { source: source.source, revision: 1, variables: structuredClone(defs) },
        source.rows,
        source.source,
    );
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

    const teaPop = createTeaPricingPopulation();
    const saasPop = createSaasBudgetPopulation();
    const vipPop = createVipRenewalPopulation();
    const freshPop = createFreshFulfillmentPopulation();
    const nevPop = createNevTestDrivePopulation();

    const populationFileHashes = await writePopulationFixtures(teaPop, saasPop, vipPop, freshPop, nevPop);
    const {
        teaResults,
        saasPilotSimple,
        saasResults,
        vipPilotSimple,
        vipResults,
        freshPilotSimple,
        freshResults,
        nevPilotSimple,
        nevResults,
    } = await buildSamplingFixtures(teaPop, saasPop, vipPop, freshPop, nevPop);

    assertCompleteSubmission(teaPricingQuestionnaire, teaPlan, teaResults, teaPop.length, teaReportContent, teaSamplingPolicy);
    assertCompleteSubmission(saasQuestionnaire, saasPlan, saasResults, saasPop.length, saasReportContent, noPpsSamplingPolicy);
    assertCompleteSubmission(vipRenewalQuestionnaire, vipPlan, vipResults, vipPop.length, vipReportContent, vipSamplingPolicy);
    assertCompleteSubmission(freshFulfillmentQuestionnaire, freshPlan, freshResults, freshPop.length, freshReportContent, ppsRequiredPolicy);
    assertCompleteSubmission(nevTestDriveQuestionnaire, nevPlan, nevResults, nevPop.length, nevReportContent, nevSamplingPolicy);

    const teaSource = await readVariableSource(HAPPINESS_POPULATION_PATH, teaPricingFieldMapping);
    const teaDict = validateDictionary(createTeaPricingDictionary(teaSource.source), teaSource.rows, teaSource.source);
    const saasDict = await confirmTopicDictionary(READING_POPULATION_PATH, saasFieldMapping, saasVariables);
    const vipDict = await confirmTopicDictionary(EMPLOYMENT_POPULATION_PATH, vipRenewalFieldMapping, vipRenewalVariables);
    const freshDict = await confirmTopicDictionary(DINING_POPULATION_PATH, freshFulfillmentFieldMapping, freshFulfillmentVariables);
    const nevDict = await confirmTopicDictionary(GREEN_COMMUTE_POPULATION_PATH, nevTestDriveFieldMapping, nevTestDriveVariables);

    const seedTargets = {
        saas: seedTargetMetrics({ population: saasPop, fieldMapping: saasFieldMapping, dictionary: saasDict, samplingResults: saasResults, samplePlan: saasPlan, topicName: DOGFOOD_NAMES.topicB }),
        vip: seedTargetMetrics({ population: vipPop, fieldMapping: vipRenewalFieldMapping, dictionary: vipDict, samplingResults: vipResults, samplePlan: vipPlan, topicName: DOGFOOD_NAMES.topicC }),
        fresh: seedTargetMetrics({ population: freshPop, fieldMapping: freshFulfillmentFieldMapping, dictionary: freshDict, samplingResults: freshResults, samplePlan: freshPlan, topicName: DOGFOOD_NAMES.topicD }),
        nev: seedTargetMetrics({ population: nevPop, fieldMapping: nevTestDriveFieldMapping, dictionary: nevDict, samplingResults: nevResults, samplePlan: nevPlan, topicName: DOGFOOD_NAMES.topicE }),
    };

    const compactSaasResults = compactSamplingResults(saasResults) as Record<string, unknown> | null;
    const compactVipResults = compactSamplingResults(vipResults) as Record<string, unknown> | null;
    const compactFreshResults = compactSamplingResults(freshResults) as Record<string, unknown> | null;
    const compactNevResults = compactSamplingResults(nevResults) as Record<string, unknown> | null;
    if (!compactSaasResults || !compactVipResults || !compactFreshResults || !compactNevResults) {
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

    const topicRows = await db.insert(topic).values([
        {
            teacherId: teachersById.T001!.id,
            name: DOGFOOD_NAMES.topicA,
            description: TEA_PRICING_DESCRIPTION,
            excelFilePath: HAPPINESS_POPULATION_PATH,
            excelRowCount: teaPop.length,
            variableDictionary: teaDict,
            variableRevision: teaDict.revision,
            fieldMapping: teaPricingFieldMapping,
            weightConfig,
            recommendQuestions: teaPricingQuestionnaire.questions,
            samplingPolicy: teaSamplingPolicy,
            fieldworkConfig: teaPricingFieldworkConfig,
            status: 1,
            createdAt: day(-20),
            updatedAt: day(-7),
        },
        {
            teacherId: teachersById.T001!.id,
            name: DOGFOOD_NAMES.topicB,
            description: "B2B重点企业客户商业调研案例（N=32）：估计下一财年SaaS年度增购预算均值（万元）。总体含0万元纯续约有效观测且无正值辅助规模变量，重点训练小总体有限总体校正（FPC）、量程零值边界与PPS不适用性。",
            excelFilePath: READING_POPULATION_PATH,
            excelRowCount: saasPop.length,
            variableDictionary: saasDict,
            variableRevision: saasDict.revision,
            fieldMapping: saasFieldMapping,
            weightConfig,
            recommendQuestions: saasQuestionnaire.questions,
            samplingPolicy: noPpsSamplingPolicy,
            fieldworkConfig: saasFieldworkConfig,
            status: 1,
            createdAt: day(-18),
            updatedAt: day(-6),
        },
        {
            teacherId: teachersById.T001!.id,
            name: DOGFOOD_NAMES.topicE,
            description: "汽车新零售潜客转化案例（N=360）：估计实车动态试驾潜客30天内高意向锁单比例。按95%置信水平与±9个百分点规划得 n=90、K=4，恰好与四类到店时段周期同步，重点揭示系统抽样周期共振风险与分层稳健性。",
            excelFilePath: GREEN_COMMUTE_POPULATION_PATH,
            excelRowCount: nevPop.length,
            variableDictionary: nevDict,
            variableRevision: nevDict.revision,
            fieldMapping: nevTestDriveFieldMapping,
            weightConfig,
            recommendQuestions: nevTestDriveQuestionnaire.questions,
            samplingPolicy: nevSamplingPolicy,
            fieldworkConfig: nevFieldworkConfig,
            status: 1,
            createdAt: day(-3),
            updatedAt: day(-3),
        },
        {
            teacherId: teachersById.T001!.id,
            name: DOGFOOD_NAMES.topicC,
            description: "综合电商平台会员经营案例（N=200）：估计年度付费会员到期明确续费比例。模拟低频沉默会员高拒访引发的幸存者偏差，重点训练试投偏差诊断、活跃度分层必做设计与无回答权重校准。",
            excelFilePath: EMPLOYMENT_POPULATION_PATH,
            excelRowCount: vipPop.length,
            variableDictionary: vipDict,
            variableRevision: vipDict.revision,
            fieldMapping: vipRenewalFieldMapping,
            weightConfig,
            recommendQuestions: vipRenewalQuestionnaire.questions,
            samplingPolicy: vipSamplingPolicy,
            fieldworkConfig: vipFieldworkConfig,
            status: 1,
            createdAt: day(-16),
            updatedAt: day(-5),
        },
        {
            teacherId: teachersById.T001!.id,
            name: DOGFOOD_NAMES.topicD,
            description: "即时零售履约运营案例（N=96）：以15分钟晚高峰波次为非人员分析单位，估计生鲜前置仓平均履约等待时长（分钟），重点训练利用台账「历史日均客单量」开展必做 PPS 抽样及 Hájek 比估计。",
            excelFilePath: DINING_POPULATION_PATH,
            excelRowCount: freshPop.length,
            variableDictionary: freshDict,
            variableRevision: freshDict.revision,
            fieldMapping: freshFulfillmentFieldMapping,
            weightConfig,
            recommendQuestions: freshFulfillmentQuestionnaire.questions,
            samplingPolicy: ppsRequiredPolicy,
            fieldworkConfig: freshFieldworkConfig,
            status: 1,
            createdAt: day(-12),
            updatedAt: day(-4),
        },
    ]).returning();
    const topicsByName = Object.fromEntries(topicRows.map((row) => [row.name, row]));
    await copyGuideAttachment(topicsByName[DOGFOOD_NAMES.topicA]!.id);

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

    const saasTaskMain = taskFor(DOGFOOD_NAMES.topicB, DOGFOOD_NAMES.mainClass);
    const vipTaskMain = taskFor(DOGFOOD_NAMES.topicC, DOGFOOD_NAMES.mainClass);
    const freshTaskSecondary = taskFor(DOGFOOD_NAMES.topicD, DOGFOOD_NAMES.secondaryClass);
    const nevTaskMain = taskFor(DOGFOOD_NAMES.topicE, DOGFOOD_NAMES.mainClass);

    const completedIso = day(-1).toISOString();

    const saasWavePack = buildTwoWaveFixture({
        taskId: saasTaskMain.id,
        baseQuestionnaire: saasQuestionnaire,
        dictionary: saasDict,
        fieldMapping: saasFieldMapping,
        fieldworkConfig: saasFieldworkConfig,
        population: saasPop,
        pilotSampleSize: 12,
        pilotSimpleResult: saasPilotSimple,
        formalPlan: saasPlan,
        formalCompactResults: compactSaasResults,
        pilotSeed: 5101,
        formalSeed: 5201,
        completedAtIso: completedIso,
    });

    const vipWavePack = buildTwoWaveFixture({
        taskId: vipTaskMain.id,
        baseQuestionnaire: vipRenewalQuestionnaire,
        dictionary: vipDict,
        fieldMapping: vipRenewalFieldMapping,
        fieldworkConfig: vipFieldworkConfig,
        population: vipPop,
        pilotSampleSize: 40,
        pilotSimpleResult: vipPilotSimple,
        formalPlan: vipPlan,
        formalCompactResults: compactVipResults,
        pilotSeed: 6101,
        formalSeed: 6201,
        completedAtIso: completedIso,
    });

    const freshWavePack = buildTwoWaveFixture({
        taskId: freshTaskSecondary.id,
        baseQuestionnaire: freshFulfillmentQuestionnaire,
        dictionary: freshDict,
        fieldMapping: freshFulfillmentFieldMapping,
        fieldworkConfig: freshFieldworkConfig,
        population: freshPop,
        pilotSampleSize: 24,
        pilotSimpleResult: freshPilotSimple,
        formalPlan: freshPlan,
        formalCompactResults: compactFreshResults,
        pilotSeed: 7101,
        formalSeed: 7201,
        completedAtIso: completedIso,
    });

    const nevWavePack = buildTwoWaveFixture({
        taskId: nevTaskMain.id,
        baseQuestionnaire: nevTestDriveQuestionnaire,
        dictionary: nevDict,
        fieldMapping: nevTestDriveFieldMapping,
        fieldworkConfig: nevFieldworkConfig,
        population: nevPop,
        pilotSampleSize: 45,
        pilotSimpleResult: nevPilotSimple,
        formalPlan: nevPlan,
        formalCompactResults: compactNevResults,
        pilotSeed: 8101,
        formalSeed: 8201,
        completedAtIso: completedIso,
    });

    const buildTerminalBase = (
        pack: ReturnType<typeof buildTwoWaveFixture>,
        plan: SamplePlanData,
        compactRes: Record<string, unknown>,
        adjPlan: AdjustmentPlan,
        report: string,
    ) => ({
        currentStage: 5,
        activeWaveNumber: 2,
        questionnaire: pack.boundQuestionnaire,
        samplePlan: plan,
        samplingResults: compactRes,
        adjustmentPlan: adjPlan,
        wavesData: pack.storedWaves,
        reportContent: report,
        stage1CompletedAt: day(-5),
        stage2CompletedAt: day(-4),
        stage3CompletedAt: day(-3),
        stage4CompletedAt: day(-2),
        stage5CompletedAt: day(-1),
    });

    const vipSnapshot = (studentId: string) => snapshot({
        topicName: DOGFOOD_NAMES.topicC,
        studentName: studentsById[studentId]!.name,
        populationSize: vipPop.length,
        populationFileSha256: populationFileHashes.vip,
        questionnaire: vipWavePack.boundQuestionnaire,
        samplePlan: vipPlan,
        samplingResults: compactVipResults,
        adjustmentPlan: defaultAdjustmentPlans.vip,
        waves: vipWavePack.waveViews,
        fieldMapping: vipRenewalFieldMapping,
        fieldworkConfig: vipFieldworkConfig,
        variableDictionary: vipDict,
        reportContent: vipReportContent,
        samplingPolicy: vipSamplingPolicy,
        targetMetrics: seedTargets.vip,
    });

    const freshSnapshot = (studentId: string) => snapshot({
        topicName: DOGFOOD_NAMES.topicD,
        studentName: studentsById[studentId]!.name,
        populationSize: freshPop.length,
        populationFileSha256: populationFileHashes.fresh,
        questionnaire: freshWavePack.boundQuestionnaire,
        samplePlan: freshPlan,
        samplingResults: compactFreshResults,
        adjustmentPlan: defaultAdjustmentPlans.fresh,
        waves: freshWavePack.waveViews,
        fieldMapping: freshFulfillmentFieldMapping,
        fieldworkConfig: freshFieldworkConfig,
        variableDictionary: freshDict,
        reportContent: freshReportContent,
        samplingPolicy: ppsRequiredPolicy,
        targetMetrics: seedTargets.fresh,
    });

    const nevSnapshot = (studentId: string) => snapshot({
        topicName: DOGFOOD_NAMES.topicE,
        studentName: studentsById[studentId]!.name,
        populationSize: nevPop.length,
        populationFileSha256: populationFileHashes.nev,
        questionnaire: nevWavePack.boundQuestionnaire,
        samplePlan: nevPlan,
        samplingResults: compactNevResults,
        adjustmentPlan: defaultAdjustmentPlans.nev,
        waves: nevWavePack.waveViews,
        fieldMapping: nevTestDriveFieldMapping,
        fieldworkConfig: nevFieldworkConfig,
        variableDictionary: nevDict,
        reportContent: nevReportContent,
        samplingPolicy: nevSamplingPolicy,
        targetMetrics: seedTargets.nev,
    });

    const saasSnapshot = (studentId: string) => snapshot({
        topicName: DOGFOOD_NAMES.topicB,
        studentName: studentsById[studentId]!.name,
        populationSize: saasPop.length,
        populationFileSha256: populationFileHashes.saas,
        questionnaire: saasWavePack.boundQuestionnaire,
        samplePlan: saasPlan,
        samplingResults: compactSaasResults,
        adjustmentPlan: defaultAdjustmentPlans.saas,
        waves: saasWavePack.waveViews,
        fieldMapping: saasFieldMapping,
        fieldworkConfig: saasFieldworkConfig,
        variableDictionary: saasDict,
        reportContent: saasReportContent,
        samplingPolicy: noPpsSamplingPolicy,
        targetMetrics: seedTargets.saas,
    });

    const experimentRows = await db.insert(experiment).values([
        // Case A (茶饮新品定价) 不预置学生实验：让所有演示账号从 0% 开启完整五阶段闭环体验！
        // Case B (B2B SaaS预算)：终态待批改样本
        {
            ...buildTerminalBase(saasWavePack, saasPlan, compactSaasResults, defaultAdjustmentPlans.saas, saasReportContent),
            studentId: studentsById[DOGFOOD_ANCHORS.submitted]!.id,
            taskId: saasTaskMain.id,
            status: "submitted",
            submissionSnapshot: saasSnapshot(DOGFOOD_ANCHORS.submitted),
            submittedAt: day(-1),
            createdAt: day(-6),
            updatedAt: day(-1),
        },
        // Case E (新能源试驾转化)：终态待批改样本（K=4周期共振对照）
        {
            ...buildTerminalBase(nevWavePack, nevPlan, compactNevResults, defaultAdjustmentPlans.nev, nevReportContent),
            studentId: studentsById[DOGFOOD_ANCHORS.submitted]!.id,
            taskId: nevTaskMain.id,
            status: "submitted",
            submissionSnapshot: nevSnapshot(DOGFOOD_ANCHORS.submitted),
            submittedAt: day(-1),
            createdAt: day(-3),
            updatedAt: day(-1),
        },
        // Case C (电商付费会员续费率)：进行中（阶段2试投中）、待批改、已批改各一份
        {
            studentId: studentsById[DOGFOOD_ANCHORS.stage1]!.id,
            taskId: vipTaskMain.id,
            currentStage: 2,
            activeWaveNumber: 1,
            status: "in_progress",
            questionnaire: vipWavePack.boundQuestionnaire,
            stage1CompletedAt: day(-2),
            createdAt: day(-4),
            updatedAt: day(-2),
        },
        {
            ...buildTerminalBase(vipWavePack, vipPlan, compactVipResults, defaultAdjustmentPlans.vip, vipReportContent),
            studentId: studentsById[DOGFOOD_ANCHORS.submitted]!.id,
            taskId: vipTaskMain.id,
            status: "submitted",
            submissionSnapshot: vipSnapshot(DOGFOOD_ANCHORS.submitted),
            submittedAt: day(-1),
            createdAt: day(-5),
            updatedAt: day(-1),
        },
        {
            ...buildTerminalBase(vipWavePack, vipPlan, compactVipResults, defaultAdjustmentPlans.vip, vipReportContent),
            studentId: studentsById[DOGFOOD_ANCHORS.graded]!.id,
            taskId: vipTaskMain.id,
            status: "graded",
            submissionSnapshot: vipSnapshot(DOGFOOD_ANCHORS.graded),
            submittedAt: day(-2),
            scoreQuestionnaire: "90",
            scoreProcess: "94",
            scoreReport: "89",
            totalScore: "90.80",
            teacherComment: "首轮试投准确捕捉到沉默会员高拒访引发的幸存者偏差，二轮按活跃度分层抽样与事后权重校准逻辑严密，召回券补贴建议具可操作性。",
            gradedByTeacherId: teachersById.T001!.id,
            gradedAt: day(-1),
            createdAt: day(-5),
            updatedAt: day(-1),
        },
        // Case D (生鲜超市晚高峰履约容量，副班)：进行中、待批改、已批改、已驳回
        {
            studentId: studentsById.P2601!.id,
            taskId: freshTaskSecondary.id,
            currentStage: 1,
            activeWaveNumber: 1,
            status: "in_progress",
            questionnaire: freshWavePack.boundQuestionnaire,
            createdAt: day(-2),
            updatedAt: day(-2),
        },
        {
            ...buildTerminalBase(freshWavePack, freshPlan, compactFreshResults, defaultAdjustmentPlans.fresh, freshReportContent),
            studentId: studentsById[DOGFOOD_ANCHORS.auditedSecondary]!.id,
            taskId: freshTaskSecondary.id,
            status: "submitted",
            submissionSnapshot: freshSnapshot(DOGFOOD_ANCHORS.auditedSecondary),
            submittedAt: day(-1),
            createdAt: day(-4),
            updatedAt: day(-1),
        },
        {
            ...buildTerminalBase(freshWavePack, freshPlan, compactFreshResults, defaultAdjustmentPlans.fresh, freshReportContent),
            studentId: studentsById.P2603!.id,
            taskId: freshTaskSecondary.id,
            status: "graded",
            submissionSnapshot: freshSnapshot("P2603"),
            submittedAt: day(-1),
            scoreQuestionnaire: "88",
            scoreProcess: "93",
            scoreReport: "90",
            totalScore: "90.30",
            teacherComment: "15分钟履约波次分析单位界定清晰，二轮引入历史日均客单量开展PPS抽样显著压缩了标准误，排班建议贴合业务实际。",
            gradedByTeacherId: teachersById.T001!.id,
            gradedAt: day(-1),
            createdAt: day(-4),
            updatedAt: day(-1),
        },
        {
            ...buildTerminalBase(freshWavePack, freshPlan, compactFreshResults, defaultAdjustmentPlans.fresh, freshReportContent),
            studentId: studentsById.P2604!.id,
            taskId: freshTaskSecondary.id,
            version: 2,
            status: "rejected",
            submissionSnapshot: freshSnapshot("P2604"),
            submittedAt: day(-2),
            rejectReason: "请明确区分「15分钟前置仓服务波次」与「单笔外卖订单」两个分析单位，并在商业报告中补充历史日均客单量作为PPS规模变量的强相关依据。",
            gradedByTeacherId: teachersById.T001!.id,
            gradedAt: day(-1),
            createdAt: day(-4),
            updatedAt: day(-1),
        },
    ]).returning({ id: experiment.id, studentId: experiment.studentId, taskId: experiment.taskId, wavesData: experiment.wavesData });

    // Sync relational experiment_wave rows for all multi-wave experiments
    for (const expRow of experimentRows) {
        const waves = Array.isArray(expRow.wavesData) ? (expRow.wavesData as StoredExperimentWave[]) : [];
        for (const w of waves) {
            await syncExperimentWaveRow(db, expRow.id, w);
        }
    }

    // 三组服务端抽样审计记录：电商续费率与新能源试驾各3种方法，生鲜前置仓履约4种方法（共10条）
    const auditedRuns = [
        { studentId: DOGFOOD_ANCHORS.submitted, topicName: DOGFOOD_NAMES.topicC, className: DOGFOOD_NAMES.mainClass, results: vipResults },
        { studentId: DOGFOOD_ANCHORS.auditedSecondary, topicName: DOGFOOD_NAMES.topicD, className: DOGFOOD_NAMES.secondaryClass, results: freshResults },
        { studentId: DOGFOOD_ANCHORS.submitted, topicName: DOGFOOD_NAMES.topicE, className: DOGFOOD_NAMES.mainClass, results: nevResults },
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
                waveNumber: 2,
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
        { title: "2026-2027-1 学期商务统计虚拟仿真系统开放", content: "本学期上线茶饮新品定价、B2B SaaS预算、电商会员续费率、生鲜前置仓履约容量与新能源试驾转化五大商业统计实验。请完整体验从首轮试投探底、废卷质检清洗到二轮抽样调优的五阶段闭环。", targetScope: "all", status: 1, createdAt: day(-8), updatedAt: day(-8) },
        { title: "学生端：旗舰课题闭环实验指南", content: `「新锐现制茶饮新品定价与支付意愿调研」正式轮基准样本量为 ${teaRecommendedSize} 份（95%置信水平、误差限1.0元、15%无回答余量）。B2B SaaS预算课题总体为32家重点客户，请重点关注有限总体校正（FPC）与零增购有效值边界。`, targetScope: "student", status: 1, createdAt: day(-6), updatedAt: day(-6) },
        { title: "教师端：多波次质检调优批改台已就绪", content: "批改工作台已支持查看学生 Wave 1 试投漏斗、闪电卷/直线卷清洗设置、《抽样与投放调优决策单》及 Wave 2 正式轮改进记分卡。", targetScope: "teacher", status: 1, createdAt: day(-5), updatedAt: day(-5) },
        { title: "商业仿真数据合规声明", content: "平台全部商业门店、会员与企业客户总体均为确定性合成教学数据，不包含真实商业机密或个人隐私信息。", targetScope: "all", status: 1, createdAt: day(-4), updatedAt: day(-4) },
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
