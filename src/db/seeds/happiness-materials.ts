import * as XLSX from "xlsx";
import { teaPricingQuestionnaire, teaPricingVariables } from "./happiness-topic";

export function buildTeaPricingWorkbook(population: Array<Record<string, unknown>>) {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(population), "总体数据");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(teaPricingVariables.map(variable => ({
        字段: variable.field,
        含义: variable.label,
        测量类型: { identifier: "标识", continuous: "数值", ordinal: "有序分类", nominal: "无序分类" }[variable.kind],
        单位: variable.unit || "不适用",
        编码或范围: variable.categories.length
            ? variable.categories.map(category => `${category.value}=${category.label}`).join("；")
            : variable.field === "最高支付意愿"
                ? "10—32元，保留1位小数"
                : variable.field === "年龄"
                    ? "18—40周岁"
                    : "见推荐问卷中的商业测量口径",
        缺失说明: variable.field === "门店小程序体验评分"
            ? "空白表示近3个月未使用小程序点单，不计入体验评分有效分母"
            : variable.field === "近一月领券核销次数"
                ? "0是有效观测（全部原价购买），不作为缺失"
                : "空白为缺失；抽样框总体中本字段无缺失",
    }))), "变量说明");
    const notes = [
        { 项目: "商业情境", 说明: "「青禾茶事」战略新品上市前消费者定价调研，全部记录为确定性生成的商务统计教学总体，不含真实个人隐私信息。" },
        { 项目: "抽样框总体", 说明: "近90天有消费记录的18—40岁活跃会员240人。会员等级：普通会员96人、银卡会员84人、黑金会员60人。" },
        { 项目: "核心目标指标", 说明: "最高支付意愿（元）：单杯500ml新品愿意支付的最高零售价格，目标为按活跃会员个体等权的总体均值。" },
        { 项目: "试投质检与抽样调优", 说明: "首轮试投将暴露普通会员拒访率较高导致的结构偏倚及少量闪电敷衍卷；正式轮须启用会员等级分层抽样并代入实测参数重算样本量。" },
        { 项目: "解释与外推边界", 说明: "支付意愿受调查时点促销感知影响，分组交叉对比仅供定价策略参考，不等同于真实门店价格弹性因果实验。" },
        ...teaPricingQuestionnaire.questions.map((question, index) => ({
            项目: `推荐题${index + 1}（${question.type}）`,
            说明: `${question.content}${question.options ? ` 选项：${question.options.join("；")}` : ""}`,
        })),
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(notes), "调查说明");
    return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

export const buildHappinessWorkbook = buildTeaPricingWorkbook;
