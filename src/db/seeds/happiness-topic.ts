import type { QuestionnaireData } from "../../lib/questionnaire-types";
import type { VariableDefinition, VariableDictionary } from "../../domain/variables/types";
import type { FieldworkSimulationConfig } from "../../domain/fieldwork";

export const TEA_PRICING_DESCRIPTION = `<h2>新锐现制茶饮新品定价与支付意愿调研：从试投探底到分层定价决策</h2>
<p>新锐现制茶饮品牌「青禾茶事」拟于下季度推出主打冷萃鲜果与低负担配方的战略新品，定价委员会需评估核心会员群体的单杯最高支付意愿（WTP），并制定会员分层优惠券补贴方案。你将作为商业统计分析师，完整执行「问卷设计—首轮试投—回收质检—抽样调优—管理决策报告」五阶段闭环。</p>
<h3>目标总体与商业决策问题</h3>
<p>目标总体为品牌会员库中近90天有门店消费记录、年龄18—40岁的240名实名活跃会员（覆盖9家示范商圈门店，每行对应一名会员，会员编号已脱敏）。核心研究问题是：<strong>目标会员群体对战略新品的单杯最高支付意愿均值是多少元？</strong>该结论将直接支撑全国终端指导价与黑金会员专享券面额设定。</p>
<h3>抽样框数据结构与真实市场挑战</h3>
<p>会员总体按「会员等级」分为普通会员（96人）、银卡会员（84人）、黑金会员（60人）。抽样框共包含14个业务字段，涵盖会员等级、城市线级、门店商圈、消费场景偏好、最高支付意愿、健康低糖关注度、新品尝鲜意愿、价格敏感度、月均茶饮消费额、近一月领券核销次数（0次为有效观测，代表原价购买）及门店小程序体验评分（空白代表近3个月未使用小程序点单）。</p>
<p><strong>市场响应特征预警：</strong>在实地推送问卷时，黑金会员响应积极，而普通会员拒访率较高；若首轮仅用简单随机抽样且不做分层控制或无回答权重校准，回收样本容易向高支付意愿客群偏移（幸存者偏差），并可能混入少量闪电敷衍卷与直线作答卷。</p>
<h3>五阶段闭环任务指引</h3>
<ol>
<li><strong>商业问卷设计：</strong>参考14道推荐题目设计结构化商业问卷，使用「一键智能绑定变量」将题目关联至课题数据字典（尤其确保主指标「最高支付意愿」完成绑定，且领券次数允许填0），并完成受访者视角预试。</li>
<li><strong>首轮试投发放（Wave 1）：</strong>按先验经验标准差制定小规模试投方案，抽取试投名单并模拟发放问卷，观察实际触达与完答漏斗。</li>
<li><strong>回收质检与诊断：</strong>在质检清洗台剔除闪电敷衍卷与直线作答卷，检查会员等级间的应答偏倚与逐题完答质量，填写《抽样与投放调优决策单》。</li>
<li><strong>调整思路与二轮投放（Wave 2）：</strong>一键代入首轮实测无回答率与样本方差重算样本量，升级为按「会员等级」分层抽样（对比简单随机与系统抽样；消费者个体无自然事前规模度量，故PPS不适用），执行正式轮问卷投放并核验改进幅度。</li>
<li><strong>商务分析与决策报告：</strong>结合多口径教学误差带森林图与「会员等级 × 最高支付意愿」交叉对比分析卡片，撰写新品终端定价区间与会员补贴策略报告。</li>
</ol>`;

export const teaPricingQuestionnaire: QuestionnaireData = {
    title: "新锐现制茶饮战略新品定价与消费偏好调研",
    welcomeText: "您好！感谢参与「青禾茶事」战略新品上市前消费者调研。本问卷面向近90天有消费记录的18—40岁品牌会员，预计耗时约3—5分钟。所有数据严格匿名保密，仅用于新品定价与会员权益统计研究，请按您的真实消费习惯填写。",
    endingText: "衷心感谢您的宝贵反馈！完答审核通过后，系统将向您的会员账户发放新品试饮礼金券。本实验数据为商务统计教学合成情境，仅供定量决策推演训练。",
    questions: [
        { id: "hq1", section: "screening", type: "boolean", content: "您目前的周岁年龄是否在18岁至40岁之间？" },
        { id: "hq9", section: "screening", type: "boolean", content: "近90天内，您是否在「青禾茶事」线下门店或小程序有过购买记录？" },
        { id: "hq2", section: "main", type: "numeric", content: "对于主打冷萃鲜果与低负担配方的500ml战略新品，您愿意支付的单杯最高价格是多少元？（支持保留1位小数）", unit: "元", numericMin: 0, numericMax: 60, decimalPlaces: 1 },
        { id: "hq3", section: "main", type: "scale", content: "选购现制茶饮时，您对「真果肉、零植脂末、低糖控卡」健康配方的看重程度如何？", scaleMin: 1, scaleMax: 5, scaleMinLabel: "完全不在意", scaleMaxLabel: "非常看重" },
        { id: "hq4", section: "main", type: "scale", content: "茶饮品牌推出季度限定风味新品时，您的首发尝鲜购买意愿有多高？", scaleMin: 1, scaleMax: 5, scaleMinLabel: "很低", scaleMaxLabel: "很高" },
        { id: "hq5", section: "main", type: "scale", content: "当单杯现制茶饮提价3—5元且无优惠券时，您减少购买或转向竞品的敏感程度如何？", scaleMin: 1, scaleMax: 5, scaleMinLabel: "极不敏感", scaleMaxLabel: "极度敏感" },
        { id: "hq12", section: "main", type: "numeric", content: "过去一个月，您在各类现制茶饮与咖啡上的总消费金额约为多少元？", unit: "元/月", numericMin: 0, numericMax: 2000, decimalPlaces: 1 },
        { id: "hq13", section: "main", type: "numeric", content: "过去一个月，您在购买茶饮时使用团购券或会员优惠券核销了多少次？（全部原价购买请填0）", unit: "次/月", numericMin: 0, numericMax: 60, decimalPlaces: 0 },
        { id: "hq14", section: "main", type: "single", content: "您对近3个月使用过的品牌点单小程序界面流畅度与预估取茶时间准确性评价如何？", options: ["非常不满意", "比较不满意", "一般", "比较满意", "非常满意", "近3个月未使用过"] },
        { id: "hq6", section: "main", type: "multiple", content: "哪些权益最能促成您购买20元以上的新品茶饮？（最多选三项）", options: ["会员专享立减券", "第二杯半价拼单", "免费升级鲜奶/小料", "限定周边联名杯套", "超时免单履约保障", "低卡营养成分透明公示", "积分双倍抵现"], minSelect: 1, maxSelect: 3 },
        { id: "hq10", section: "background", type: "numeric", content: "您目前的周岁年龄是多少？", unit: "岁", numericMin: 18, numericMax: 40, decimalPlaces: 0 },
        { id: "hq7", section: "background", type: "single", content: "您平时购买现制茶饮的月均频次属于哪一档？", options: ["低频尝鲜(1-2杯)", "中频复购(3-5杯)", "高频重度(6杯以上)"] },
        { id: "hq8", section: "background", type: "single", content: "您常住及主要消费所在的城市属于哪一线级？", options: ["一线城市", "新一线城市", "二线城市"] },
        { id: "hq11", section: "background", type: "single", content: "您最常在以下哪种消费场景中下单购买现制茶饮？", options: ["工作日下午茶", "周末社交聚会", "通勤随手买", "外卖拼单"] },
    ],
};

export const teaPricingFieldMapping = {
    identifier: "会员编号",
    numeric: ["最高支付意愿", "健康低糖关注度", "新品尝鲜意愿", "价格敏感度", "年龄", "月均茶饮消费额", "近一月领券核销次数"],
    stratified: ["会员等级", "城市线级", "月均购茶频次档位"],
    others: ["常购门店商圈", "消费场景偏好", "门店小程序体验评分"],
    analysisTarget: { kind: "mean" as const, field: "最高支付意愿" },
    studyContract: {
        version: 1 as const,
        researchQuestion: "品牌活跃会员对500ml战略新品的单杯最高支付意愿（WTP）均值是多少元？",
        businessDecision: "确定下季度战略新品全国终端指导零售价区间，并制定普通/银卡/黑金三级会员的首发优惠券差额补贴方案",
        targetPopulation: "品牌会员库中近90天有消费记录、年龄18—40岁的240名实名活跃会员",
        unitOfAnalysis: "一名活跃品牌会员",
        target: { kind: "mean" as const, field: "最高支付意愿" },
    },
};

export const teaPricingFieldworkConfig: FieldworkSimulationConfig = {
    version: 1,
    preset: "stratum_differential",
    baseUnitNonResponseRate: 0.18,
    stratumField: "会员等级",
    stratumNonResponseRates: {
        "普通会员": 0.30,
        "银卡会员": 0.16,
        "黑金会员": 0.06,
    },
    baseSpeederRate: 0.07,
    baseStraightlinerRate: 0.05,
    baseItemSkipRate: 0.02,
    contactCostPerUnit: 2,
    incentiveCostPerComplete: 12,
};

const categorical = (field: string, values: string[], kind: "nominal" | "ordinal" = "nominal"): VariableDefinition => ({
    field, label: field, unit: "", kind, categories: values.map(value => ({ value, label: value })), missing: [null],
});
const continuous = (field: string, unit: string): VariableDefinition => ({
    field, label: field, unit, kind: "continuous", categories: [], missing: [null],
});
const ordinal = (field: string, labels: string[]): VariableDefinition => ({
    field, label: field, unit: "级", kind: "ordinal", categories: labels.map((label, index) => ({ value: index + 1, label })), missing: [null],
});

export const teaPricingVariables: VariableDefinition[] = [
    { field: "会员编号", label: "会员编号", unit: "", kind: "identifier", categories: [], missing: [null] },
    continuous("年龄", "岁"),
    categorical("会员等级", ["普通会员", "银卡会员", "黑金会员"], "ordinal"),
    categorical("常购门店商圈", ["CBD写字楼店", "核心商场店", "高校街区店", "社区邻里店", "交通枢纽店", "科技园区店", "文旅步行街店", "创意园区店", "夜间市集店"]),
    categorical("城市线级", ["一线城市", "新一线城市", "二线城市"]),
    categorical("消费场景偏好", ["工作日下午茶", "周末社交聚会", "通勤随手买", "外卖拼单"]),
    categorical("月均购茶频次档位", ["低频尝鲜(1-2杯)", "中频复购(3-5杯)", "高频重度(6杯以上)"], "ordinal"),
    continuous("最高支付意愿", "元"),
    ordinal("健康低糖关注度", ["完全不在意", "不太在意", "一般", "比较看重", "非常看重"]),
    ordinal("新品尝鲜意愿", ["很低", "较低", "一般", "较高", "很高"]),
    ordinal("价格敏感度", ["极不敏感", "较不敏感", "一般", "较敏感", "极度敏感"]),
    continuous("月均茶饮消费额", "元/月"),
    continuous("近一月领券核销次数", "次/月"),
    ordinal("门店小程序体验评分", ["非常不满意", "比较不满意", "一般", "比较满意", "非常满意"]),
];

export function createTeaPricingDictionary(source: string, revision = 1): VariableDictionary {
    return { source, revision, variables: structuredClone(teaPricingVariables) };
}

// Compatibility aliases for existing tests and maintenance scripts
export const HAPPINESS_DESCRIPTION = TEA_PRICING_DESCRIPTION;
export const happinessQuestionnaire = teaPricingQuestionnaire;
export const happinessFieldMapping = teaPricingFieldMapping;
export const happinessVariables = teaPricingVariables;
export const createHappinessDictionary = createTeaPricingDictionary;
