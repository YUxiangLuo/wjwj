import type { StudyContract } from "../src/lib/analysis-target";
import type { Question } from "../src/lib/questionnaire-types";
import type { SamplingPolicyV1 } from "../src/lib/sampling-policy";
import { recordsToCsv } from "../src/lib/csv";

type Row = Record<string, string | number>;
interface Spec {
    key: string; name: string; count: number; unit: string; population: string;
    identifier: string; groupField: string; groups: string[];
    target: StudyContract["target"]; numeric: string[]; others?: string[];
    focus: string; precision: string; report: string;
    measureQuestion: string; measureOptions: string[]; drivers: string[];
    person?: boolean; pps?: "required" | "optional"; stratifiedRequired?: boolean; systematicRequired?: boolean;
    row: (i: number, group: string) => Row;
}

function noise(i: number, salt: number) {
    let x = (Math.imul(i + 1, 2654435761) ^ Math.imul(salt, 1597334677)) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 2246822507) >>> 0;
    return ((x ^ (x >>> 13)) >>> 0) / 4294967296;
}
const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const escape = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const specs: Spec[] = [
    {
        key: "household-spending", name: "城乡住户月消费支出与家庭规模", count: 240, unit: "一户住户", population: "示范城区及周边乡镇的240户合成住户",
        identifier: "住户编号", groupField: "居住区域", groups: ["中心城区", "近郊社区", "乡镇"], target: { kind: "mean", field: "月消费支出（元）" }, numeric: ["月消费支出（元）", "家庭人数"], others: ["住房类型"],
        focus: "比较简单随机与PPS对住户平均月消费支出的估计，理解家庭规模与消费支出相关时的设计选择。",
        precision: "95%置信水平，绝对误差限先设为±400元，再比较±200元与±600元的差异。",
        report: "说明家庭人数为何可以作为PPS规模变量；比较加权均值与未加权均值，讨论少量高消费住户的影响。目标是每户平均支出，不是人均支出。",
        measureQuestion: "过去一个月，家庭消费支出大致属于哪个区间？", measureOptions: ["3000元以下", "3000—5999元", "6000—8999元", "9000元及以上"], drivers: ["食品日用", "居住支出", "教育文化", "交通通信"], person: true, pps: "required",
        row: (i, g) => { const size = 1 + Math.floor(noise(i, 1) * 6); return { "家庭人数": size, "月消费支出（元）": round(1200 + size * 650 + noise(i, 2) * 2400 + (g === "中心城区" ? 1000 : 0) + (i % 31 === 0 ? 6500 : 0), 0), "住房类型": i % 3 ? "自有住房" : "租赁住房" }; },
    },
    {
        key: "business-profit", name: "小微企业季度经营盈亏调查", count: 180, unit: "一家企业", population: "某示范园区180家合成小微企业",
        identifier: "企业编号", groupField: "行业", groups: ["制造业", "零售业", "生活服务业"], target: { kind: "mean", field: "季度净利润（万元）" }, numeric: ["季度净利润（万元）", "员工人数", "季度营业收入（万元）"],
        focus: "估计企业平均季度净利润，比较不同行业分层后的精度，观察正利润、亏损和零利润的图形表达。",
        precision: "95%置信水平，绝对误差限±2万元；可提高设计效应观察邀请数变化。",
        report: "必须包含分层结果，解释负值均值的含义；区分平均每家企业利润与全园区利润总额，不用相对误差替代接近零时的绝对误差。",
        measureQuestion: "本季度企业经营结果属于哪种情况？", measureOptions: ["亏损", "基本持平", "盈利"], drivers: ["原材料成本", "人员成本", "订单变化", "租金与运营费用"], pps: "optional", stratifiedRequired: true,
        row: (i) => { const staff = 5 + Math.floor(noise(i, 3) * 75); const revenue = round(staff * (1.2 + noise(i, 4) * 1.8)); return { "员工人数": staff, "季度营业收入（万元）": revenue, "季度净利润（万元）": i % 23 === 0 ? 0 : round(revenue * (noise(i, 5) - 0.48) * 0.32) }; },
    },
    {
        key: "green-commute", name: "校园绿色通勤方式占比调查", count: 360, unit: "一名在校学生的一次典型通勤记录", population: "三个住宿片区360条合成学生典型通勤记录",
        identifier: "通勤记录编号", groupField: "住宿片区", groups: ["校内宿舍", "近校社区", "远校社区"], target: { kind: "proportion", field: "是否绿色通勤", value: "是" }, numeric: ["通勤距离（公里）"], others: ["是否绿色通勤", "主要方式"],
        focus: "估计步行、骑行或公共交通等绿色方式的占比，比较简单随机、系统和分层抽样。",
        precision: "95%置信水平，误差限±5个百分点；可比较±3和±8个百分点。",
        report: "报告必须按“比例/百分点”解释结果；观察按住宿片区排列的抽样框对系统抽样的影响。PPS在本课题中不启用。",
        measureQuestion: "您最近一周最常使用哪种通勤方式？", measureOptions: ["步行", "骑行", "公共交通", "网约车或私家车"], drivers: ["通勤时间", "费用", "天气", "交通便利程度"], person: true, systematicRequired: true,
        row: (i, g) => { const green = noise(i, 6) < (g === "校内宿舍" ? 0.88 : g === "近校社区" ? 0.7 : 0.55); return { "是否绿色通勤": green ? "是" : "否", "主要方式": green ? ["步行", "骑行", "公共交通"][i % 3]! : "网约车或私家车", "通勤距离（公里）": i === 0 ? 0 : round((g === "远校社区" ? 8 : 0.3) + noise(i, 7) * 6) }; },
    },
    {
        key: "quality-defects", name: "生产线产品不合格率抽检", count: 500, unit: "一件产品", population: "四条生产线500件合成产品的质检记录",
        identifier: "产品编号", groupField: "生产线", groups: ["一号线", "二号线", "三号线", "四号线"], target: { kind: "proportion", field: "质检结果", value: "不合格" }, numeric: [], others: ["质检结果", "班次"],
        focus: "用纯分类总体估计产品不合格率，体验没有数值规模字段时的抽样路径。",
        precision: "95%置信水平，误差限±5个百分点；比较不同样本量下少量不合格品是否被抽中。",
        report: "必须完成按生产线分层，说明样本未发现不合格品不代表总体不存在不合格品；不要把样本不合格件数当成总体总量。",
        measureQuestion: "按照统一质检标准，这件产品属于哪一类？", measureOptions: ["合格", "不合格", "需要复核"], drivers: ["外观检查", "尺寸检查", "功能测试", "包装核验"], stratifiedRequired: true,
        row: (i, g) => ({ "质检结果": noise(i, 8) < (g === "四号线" ? 0.12 : 0.055) ? "不合格" : "合格", "班次": i % 2 ? "晚班" : "早班" }),
    },
    {
        key: "digital-help", name: "社区老年人数字服务协助需求", count: 300, unit: "一名社区老年居民", population: "示范社区300名60岁及以上合成居民",
        identifier: "居民代号", groupField: "年龄组", groups: ["60—69岁", "70—79岁", "80岁及以上"], target: { kind: "proportion", field: "是否需要协助", value: "是" }, numeric: [], others: ["是否需要协助", "居住方式"],
        focus: "估计办理线上公共服务时需要协助的居民比例，比较年龄分层与总体简单抽样。",
        precision: "95%置信水平，误差限±5个百分点；可设置10%无回答率观察邀请数变化。",
        report: "解释年龄结构与需求差异，区分分层抽样的总体估计和各年龄组分别达标的样本量要求；不把相关性解释为因果关系。",
        measureQuestion: "独立办理线上公共服务时，您是否通常需要他人协助？", measureOptions: ["需要", "不需要", "尚未使用过"], drivers: ["操作步骤", "文字阅读", "设备网络", "信息安全顾虑"], person: true, stratifiedRequired: true,
        row: (i, g) => ({ "是否需要协助": noise(i, 9) < (g === "60—69岁" ? 0.3 : g === "70—79岁" ? 0.55 : 0.8) ? "是" : "否", "居住方式": ["独居", "与家人同住", "机构居住"][i % 3]! }),
    },
    {
        key: "cold-chain", name: "冷链仓储温度偏差监测", count: 240, unit: "一条定时温度监测记录", population: "三个库区240条合成定时温度监测记录",
        identifier: "监测编号", groupField: "库区", groups: ["入库区", "储存区", "出库区"], target: { kind: "mean", field: "温度偏差（℃）" }, numeric: ["温度偏差（℃）"], others: ["监测时段"],
        focus: "估计相对设定温度的平均偏差，观察负值、正值相抵及系统抽样对周期排序的敏感性。",
        precision: "95%置信水平，绝对误差限建议设为±0.2℃，再比较±0.1℃与±0.5℃。",
        report: "使用绝对误差与设计SE说明精度；均值接近零时避免使用不稳定的相对误差。研究单位为记录，不进行设备因果或纵向模型推断。",
        measureQuestion: "本条记录相对于设定温度处于什么状态？", measureOptions: ["低于设定温度", "接近设定温度", "高于设定温度"], drivers: ["开关门作业", "装卸频率", "制冷运行", "测点位置"], systematicRequired: true,
        row: (i, g) => ({ "温度偏差（℃）": round(((i * 7) % 41 - 20) / 10 + (g === "出库区" ? 0.15 : g === "储存区" ? -0.1 : 0)), "监测时段": ["上午", "下午", "夜间"][Math.floor(i / 3) % 3]! }),
    },
    {
        key: "parcel-time", name: "快递包裹签收时效比较", count: 260, unit: "一个包裹", population: "三个配送类型260个合成包裹记录",
        identifier: "包裹代号", groupField: "配送类型", groups: ["同城", "省内", "跨省"], target: { kind: "mean", field: "签收时长（小时）" }, numeric: ["签收时长（小时）", "运输距离（公里）"], others: ["是否按约定时效签收"],
        focus: "估计包裹平均签收时长，比较远距离与少量延误记录对不同抽样设计的影响。",
        precision: "95%置信水平，绝对误差限±2小时；也可比较±4小时。",
        report: "用运输距离尝试PPS并解释加权结果；区分平均签收时长与按时签收比例，本课题的主目标是前者。",
        measureQuestion: "这个包裹的签收时长属于哪个区间？", measureOptions: ["12小时以内", "12—24小时", "24—48小时", "48小时以上"], drivers: ["运输距离", "中转次数", "末端派送", "集中到件高峰"], pps: "optional",
        row: (i, g) => { const distance = round((g === "同城" ? 2 : g === "省内" ? 70 : 400) + noise(i, 10) * (g === "同城" ? 30 : 700)); const time = round(4 + distance / 35 + noise(i, 11) * 10 + (i % 29 === 0 ? 26 : 0)); return { "运输距离（公里）": distance, "签收时长（小时）": time, "是否按约定时效签收": time <= 36 ? "是" : "否" }; },
    },
    {
        key: "shopping-ratings", name: "线上购物评价与类目差异", count: 320, unit: "一条商品评价记录", population: "四类商品320条合成评价记录",
        identifier: "评价编号", groupField: "商品类目", groups: ["图书文具", "数码配件", "居家用品", "服饰"], target: { kind: "mean", field: "综合评分" }, numeric: ["综合评分"], others: ["是否退换货"],
        focus: "把1—5级评分作为近似等距数值，估计评价记录平均分并比较商品类目分层。",
        precision: "95%置信水平，绝对误差限建议设为±0.25分。",
        report: "明确评分均值依赖近似等距假设；分析单位是评价记录，不是去重后的消费者。讨论极端评分和类目结构对结论的影响。",
        measureQuestion: "您如何评价这次购物的整体体验？", measureOptions: ["很不满意", "不满意", "一般", "满意", "很满意"], drivers: ["商品质量", "页面描述", "物流体验", "售后服务"], person: true, stratifiedRequired: true,
        row: (i) => { const score = 1 + Math.floor(noise(i, 12) * 5); return { "综合评分": score, "是否退换货": score <= 2 && i % 3 === 0 ? "是" : "否" }; },
    },
    {
        key: "park-species", name: "城市公园稀有植物样方调查", count: 420, unit: "一块固定面积样方", population: "三类生境420块合成公园样方",
        identifier: "样方编号", groupField: "生境类型", groups: ["林地", "草地", "湿地"], target: { kind: "proportion", field: "是否发现目标植物", value: "是" }, numeric: ["目标植物株数"], others: ["是否发现目标植物"],
        focus: "估计目标植物在样方中的出现比例，体验稀有事件与不同生境分层。",
        precision: "95%置信水平，可比较±3与±5个百分点；关注样本中目标事件数较少时的解释边界。",
        report: "必须完成生境分层。说明未抽到目标植物不代表总体不存在；主目标是样方出现率，不是植物总株数或多样性指数。",
        measureQuestion: "依据统一识别标准，本样方是否发现目标植物？", measureOptions: ["发现", "未发现", "待进一步确认"], drivers: ["光照条件", "土壤湿度", "人为干扰", "生境连通性"], stratifiedRequired: true,
        row: (i) => { const present = i % 37 === 0; return { "是否发现目标植物": present ? "是" : "否", "目标植物株数": present ? 1 + i % 7 : 0 }; },
    },
    {
        key: "building-energy", name: "校园楼宇日均用电量与面积", count: 160, unit: "一栋楼宇", population: "四种用途160栋合成楼宇的日均用电记录",
        identifier: "楼宇编号", groupField: "建筑用途", groups: ["教学楼", "实验楼", "宿舍楼", "办公楼"], target: { kind: "mean", field: "日均用电量（千瓦时）" }, numeric: ["日均用电量（千瓦时）", "建筑面积（平方米）"],
        focus: "估计平均每栋楼的日均用电量，使用建筑面积作为PPS规模变量并比较用途分层。",
        precision: "95%置信水平，绝对误差限建议先设为±100千瓦时。",
        report: "解释建筑面积与电耗的关系以及不等概率抽样权重；目标是每栋楼的平均用电量，不是每平方米电耗强度或全校总电耗。",
        measureQuestion: "楼宇的日均用电量大致处于哪个区间？", measureOptions: ["300千瓦时以下", "300—599千瓦时", "600—999千瓦时", "1000千瓦时及以上"], drivers: ["建筑面积", "使用时长", "设备密度", "建筑用途"], pps: "required",
        row: (i, g) => { const area = round(500 + noise(i, 13) * 9500, 0); const rate = g === "实验楼" ? 0.2 : g === "宿舍楼" ? 0.13 : 0.08; return { "建筑面积（平方米）": area, "日均用电量（千瓦时）": round(area * rate * (0.8 + noise(i, 14) * 0.4)) }; },
    },
];

export function buildDemoResearchCatalog() {
    return specs.map(spec => {
        const rows = Array.from({ length: spec.count }, (_, i) => ({
            [spec.identifier]: `${spec.key.toUpperCase()}-${String(i + 1).padStart(4, "0")}`,
            [spec.groupField]: spec.groups[i % spec.groups.length]!,
            ...spec.row(i, spec.groups[i % spec.groups.length]!),
        }));
        const studyContract: StudyContract = { version: 1, researchQuestion: spec.target.kind === "mean" ? `${spec.population}中${spec.target.field}的平均水平是多少？` : `${spec.population}中${spec.target.field}为「${spec.target.value}」的单位比例是多少？`, targetPopulation: spec.population, unitOfAnalysis: spec.unit, target: spec.target };
        const samplingPolicy: SamplingPolicyV1 = { version: 1, methods: { simple: "required", systematic: spec.systematicRequired ? "required" : "optional", pps: spec.pps ?? "disabled", stratified: spec.stratifiedRequired ? "required" : "optional" } };
        const recommendQuestions: Question[] = [
            { id: `${spec.key}-scope`, section: "screening", type: "boolean", content: spec.person ? "您提供的信息是否属于本课题规定的调查总体和参考期？" : "本条记录是否属于研究合同规定的总体和参考期？" },
            { id: `${spec.key}-group`, section: "background", type: "single", content: `本调查单位属于哪个${spec.groupField}？`, options: spec.groups },
            { id: `${spec.key}-measure`, section: "main", type: "single", content: spec.measureQuestion, options: spec.measureOptions },
            { id: `${spec.key}-drivers`, section: "main", type: "multiple", content: "您认为哪些因素需要在分析或核验时重点考虑？（可多选）", options: spec.drivers, minSelect: 1, maxSelect: 3 },
            { id: `${spec.key}-clarity`, section: "main", type: "scale", content: "您对本次调查问题和记录口径的理解程度如何？", scaleMin: 1, scaleMax: 5, scaleMinLabel: "尚不清楚", scaleMaxLabel: "非常清楚" },
            { id: `${spec.key}-check`, section: "background", type: "boolean", content: "您是否已经核对本次信息的统计口径和参考范围？" },
        ];
        const description = `<p>${escape(spec.focus)}</p><h3>研究任务</h3><p>总体：${escape(spec.population)}。分析单位：${escape(spec.unit)}。</p><h3>建议规划</h3><p>${escape(spec.precision)}</p><h3>报告提示</h3><p>${escape(spec.report)}</p><p>本课题全部使用合成数据。问卷仅用于受访者视角试填，正式估计使用合成总体表；请结合抽样假设解释结果。</p>`;
        return { key: spec.key, name: spec.name, description, rows, csv: recordsToCsv(rows), recommendQuestions, samplingPolicy, fieldMapping: { identifier: spec.identifier, stratified: [spec.groupField], numeric: spec.numeric, others: spec.others ?? [], studyContract }, weightConfig: { questionnaire: 30, process: 30, report: 40 } };
    });
}
