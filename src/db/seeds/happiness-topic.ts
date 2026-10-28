import type { QuestionnaireData } from "../../lib/questionnaire-types";
import type { VariableDefinition, VariableDictionary } from "../../domain/variables/types";

export const HAPPINESS_DESCRIPTION = `<h2>青年幸福感调查：从生活体验到社区服务</h2>
<p>青禾示范地区的青年服务中心正在筹划下一季社区活动，希望了解不同生活阶段青年的生活感受，以及休闲空间、社交支持和社区服务需求。你将作为调查小组成员，完成一次从问卷设计到抽样估计的调查练习。</p>
<h3>调查对象与研究问题</h3>
<p>调查对象为在示范地区连续居住满6个月、调查时点18—35岁的常住青年。抽样框包含城区、县镇和农村9个虚拟社区的240名青年；每行代表一人，青年代号用于识别，不包含姓名、联系方式等个人信息。主问题是：这一总体的0—10分生活幸福感自评，平均水平是多少？</p>
<h3>数据里有什么</h3>
<p>18—22岁、23—27岁、28—35岁分别有96、84、60人。14个字段涵盖年龄、社区、居住方式、学习就业状态、幸福感、社会支持、自评健康、经济压力、睡眠、休闲及社区服务满意度。各群体的情况有重叠，也保留个体差异；休闲时长为0是有效观测，服务满意度空白表示近3个月未使用服务。</p>
<h3>你需要完成的工作</h3>
<ol><li><strong>设计与预试：</strong>参考14道推荐题，明确筛选条件、回忆时间和评分端点，完成一次受访者视角试填，再修正有歧义的表述。</li>
<li><strong>规划样本：</strong>按95%置信水平、绝对误差限0.5分规划均值估计；说明有限总体校正和预期无应答如何影响样本量。</li>
<li><strong>执行抽样：</strong>完成简单随机和年龄组分层，建议增加系统抽样进行比较。三个年龄层大小不同，请说明样本分配及加权理由。青年个体没有自然的规模变量，本课题不采用PPS。</li>
<li><strong>分析与报告：</strong>报告幸福感估计值与精度，比较不同方法；再任选睡眠、社会支持或服务满意度做一次单变量分析，将保存的结果引用到报告中，并提出一条与证据相符的后续调查建议。</li></ol>
<h3>成果与评分</h3>
<p>提交完整问卷、样本量方案、抽样记录和研究报告。问卷30分（口径与可作答性）、过程30分（设计理由与执行记录）、报告40分（估计、图表和解释边界）。重点说明做出选择的原因，不以某一次样本“最接近总体值”作为唯一评价。</p>
<h3>使用说明</h3>
<p>青禾地区、社区及总体记录均为合成教学情境，不是现实调查成果。幸福感单题不用于心理诊断；分组差异和变量关系不能证明因果，也不能外推至真实青年群体。课堂预试答案仅用于检验问卷，正式抽样使用附带总体数据。</p>`;

export const happinessQuestionnaire: QuestionnaireData = {
    title: "青年幸福感与社区生活调查",
    welcomeText: "您好！这是一份面向在本地区连续居住满6个月、年龄18—35岁青年的调查问卷，预计用时5—8分钟。我们希望了解您近期的生活感受与社区服务需求，请按实际情况作答，无需填写姓名或联系方式。参与自愿，您可随时结束试填；课堂预试答案不进入正式抽样估计。",
    endingText: "感谢您的参与！您的反馈将帮助调查小组完善题目和服务需求研究。本次为合成情境下的教学练习，结果仅作总体描述，不用于个体诊断或因果判断。",
    questions: [
        { id: "hq1", section: "screening", type: "boolean", content: "您目前是否已满18岁且不超过35岁？" },
        { id: "hq9", section: "screening", type: "boolean", content: "截至今天，您是否已在本地区连续居住满6个月？" },
        { id: "hq2", section: "main", type: "numeric", content: "总体而言，您对目前生活的幸福感评价是多少分？（0分表示完全不幸福，10分表示非常幸福）", unit: "分", numericMin: 0, numericMax: 10, decimalPlaces: 1 },
        { id: "hq3", section: "main", type: "scale", content: "过去一个月，需要帮助时，您能从家人、朋友或同伴处获得多少支持？", scaleMin: 1, scaleMax: 5, scaleMinLabel: "几乎没有", scaleMaxLabel: "非常多" },
        { id: "hq4", section: "main", type: "scale", content: "总体而言，您如何评价自己目前的健康状况？", scaleMin: 1, scaleMax: 5, scaleMinLabel: "很差", scaleMaxLabel: "很好" },
        { id: "hq5", section: "main", type: "scale", content: "过去一个月，日常生活支出给您带来的经济压力有多大？", scaleMin: 1, scaleMax: 5, scaleMinLabel: "几乎没有", scaleMaxLabel: "非常大" },
        { id: "hq12", section: "main", type: "numeric", content: "过去一周，您平均每晚实际睡眠约多少小时？（不含午睡）", unit: "小时/晚", numericMin: 0, numericMax: 24, decimalPlaces: 1 },
        { id: "hq13", section: "main", type: "numeric", content: "过去一周，您用于运动、兴趣活动或与亲友休闲相聚的时间总计约多少小时？（没有则填0.0，请保留一位小数）", unit: "小时/周", numericMin: 0, numericMax: 168, decimalPlaces: 1 },
        { id: "hq14", section: "main", type: "single", content: "您对近3个月使用过的社区公共活动、运动或文化服务，总体满意程度如何？", options: ["非常不满意", "比较不满意", "一般", "比较满意", "非常满意", "近3个月未使用过"] },
        { id: "hq6", section: "main", type: "multiple", content: "目前您最希望改善哪些方面的生活体验？（最多选三项）", options: ["学习与职业发展", "收入与日常支出", "身心休息与运动", "家庭关系", "朋友与社交", "居住环境", "社区公共服务"], minSelect: 1, maxSelect: 3 },
        { id: "hq10", section: "background", type: "numeric", content: "您目前的周岁年龄是多少？", unit: "岁", numericMin: 18, numericMax: 35, decimalPlaces: 0 },
        { id: "hq7", section: "background", type: "single", content: "您目前的主要状态是？（在校学生有兼职时仍选在校学习）", options: ["在校学习", "稳定就业", "灵活就业", "求职或待业"] },
        { id: "hq8", section: "background", type: "single", content: "您目前主要居住地属于哪种类型？", options: ["城区", "县镇", "农村"] },
        { id: "hq11", section: "background", type: "single", content: "您目前最主要的居住方式是？", options: ["与家人同住", "独居", "与他人合租", "学校或单位宿舍"] },
    ],
};

export const happinessFieldMapping = {
    identifier: "青年代号",
    numeric: ["生活幸福感得分", "社会支持感", "自评健康", "经济压力", "年龄", "每晚睡眠时长", "每周休闲时长"],
    stratified: ["年龄组", "居住地类型", "当前状态"],
    // Nullable ordinal responses stay in the variable dictionary for analysis;
    // planning numeric fields must be complete for every population row.
    others: ["居住社区", "居住方式", "社区服务满意度"],
    analysisTarget: { kind: "mean" as const, field: "生活幸福感得分" },
    studyContract: {
        version: 1 as const,
        researchQuestion: "青禾示范地区18—35岁常住青年生活幸福感自评的平均水平是多少？",
        targetPopulation: "青禾示范地区（虚拟）调查时点18—35岁、连续居住满6个月的240名常住青年",
        unitOfAnalysis: "一名18—35岁常住青年",
        target: { kind: "mean" as const, field: "生活幸福感得分" },
    },
};

const categorical = (field: string, values: string[], kind: "nominal" | "ordinal" = "nominal"): VariableDefinition => ({
    field, label: field, unit: "", kind, categories: values.map(value => ({ value, label: value })), missing: [null],
});
const continuous = (field: string, unit: string): VariableDefinition => ({ field, label: field, unit, kind: "continuous", categories: [], missing: [null] });
const ordinal = (field: string, labels: string[]): VariableDefinition => ({
    field, label: field, unit: "级", kind: "ordinal", categories: labels.map((label, index) => ({ value: index + 1, label })), missing: [null],
});
export const happinessVariables: VariableDefinition[] = [
    { field: "青年代号", label: "青年代号", unit: "", kind: "identifier", categories: [], missing: [null] },
    continuous("年龄", "岁"),
    categorical("年龄组", ["18—22岁", "23—27岁", "28—35岁"], "ordinal"),
    categorical("居住社区", ["青禾社区", "云溪社区", "新桥社区", "文景社区", "朝阳社区", "河畔社区", "溪口村", "田园村", "林下村"]),
    categorical("居住地类型", ["城区", "县镇", "农村"]),
    categorical("居住方式", ["与家人同住", "独居", "与他人合租", "学校或单位宿舍"]),
    categorical("当前状态", ["在校学习", "稳定就业", "灵活就业", "求职或待业"]),
    continuous("生活幸福感得分", "分"),
    ordinal("社会支持感", ["几乎没有", "比较少", "一般", "比较多", "非常多"]),
    ordinal("自评健康", ["很差", "较差", "一般", "较好", "很好"]),
    ordinal("经济压力", ["几乎没有", "比较小", "一般", "比较大", "非常大"]),
    continuous("每晚睡眠时长", "小时/晚"),
    continuous("每周休闲时长", "小时/周"),
    ordinal("社区服务满意度", ["非常不满意", "比较不满意", "一般", "比较满意", "非常满意"]),
];

export function createHappinessDictionary(source: string, revision = 1): VariableDictionary {
    return { source, revision, variables: structuredClone(happinessVariables) };
}
