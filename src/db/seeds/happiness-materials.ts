import * as XLSX from "xlsx";
import { happinessQuestionnaire, happinessVariables } from "./happiness-topic";

export function buildHappinessWorkbook(population: Array<Record<string, unknown>>) {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(population), "总体数据");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(happinessVariables.map(variable => ({
        字段: variable.field,
        含义: variable.label,
        测量类型: { identifier: "标识", continuous: "数值", ordinal: "有序分类", nominal: "无序分类" }[variable.kind],
        单位: variable.unit || "不适用",
        编码或范围: variable.categories.length ? variable.categories.map(category => `${category.value}=${category.label}`).join("；")
            : variable.field === "生活幸福感得分" ? "0—10，可保留1位小数" : variable.field === "年龄" ? "18—35周岁" : "见推荐问卷中的测量口径",
        缺失说明: variable.field === "社区服务满意度" ? "空白表示近3个月未使用服务，不计入满意度有效分母" : variable.field === "每周休闲时长" ? "0是有效观测，不作为缺失" : "空白为缺失；总体中本字段无缺失",
    }))), "变量说明");
    const notes = [
        { 项目: "情境", 说明: "青禾示范地区为虚构教学地区，全部记录为确定性生成的合成数据，不含真实个人信息。" },
        { 项目: "总体", 说明: "连续居住满6个月的18—35岁青年240人。年龄层18—22岁96人、23—27岁84人、28—35岁60人。" },
        { 项目: "主指标", 说明: "生活幸福感得分：0分完全不幸福，10分非常幸福；目标是按青年个体等权的总体均值。" },
        { 项目: "规划与抽样", 说明: "建议95%置信水平、绝对误差限0.5分；简单随机与年龄分层必做，系统抽样可作比较，PPS不适用。" },
        { 项目: "解释边界", 说明: "关系与分组差异仅供描述，不推断现实群体、不作因果判断、不用于心理诊断。" },
        ...happinessQuestionnaire.questions.map((question, index) => ({ 项目: `推荐题${index + 1}（${question.type}）`, 说明: `${question.content}${question.options ? ` 选项：${question.options.join("；")}` : ""}` })),
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(notes), "调查说明");
    return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}
