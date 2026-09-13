import * as XLSX from "xlsx";
import { questionAnswers, validateQuestionnaireBindings } from "@/domain/experiment/question-variable-binding";
import { variableValueKey, type VariableDictionaryV1 } from "@/domain/experiment/variable-dictionary";
import type { QuestionnaireData } from "@/lib/questionnaire-types";
import { stratumKey } from "@/domain/statistics/sampling";
import type { SamplingExportType } from "./sampling-results-export";

const methods = ["simple", "systematic", "pps", "stratified"] as const;
type Cell = string | number | boolean | null;
export class CodebookError extends Error {
    constructor(message: string, public readonly code = "INVALID_CODEBOOK", public readonly status = 409) { super(message); }
}
export interface CodebookInput {
    experimentId: number; taskId: number; version: number; source: "submitted" | "saved";
    dictionary: VariableDictionaryV1; questionnaire: QuestionnaireData; populationFileSha256: string;
    population: Record<string, unknown>[]; results: unknown; type: SamplingExportType;
}
const object = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value);
function requireValue(ok: unknown, message: string): asserts ok { if (!ok) throw new CodebookError(message); }

/** Only authoritative source rows enter data sheets. Metadata lives in separate sheets. */
export function buildCodebookWorkbook(input: CodebookInput): Uint8Array {
    const { dictionary, questionnaire, population, results } = input;
    const bindingError = validateQuestionnaireBindings(questionnaire, dictionary, input.taskId);
    requireValue(!bindingError, bindingError ?? "题目关联无效");
    requireValue(object(results), "暂无可导出的抽样记录");
    requireValue(Object.keys(results).every(key => (methods as readonly string[]).includes(key)), "抽样结果包含未知方法，不会忽略后生成部分码本");
    const fields = dictionary.variables.map(v => v.sourceField);
    const tables: Array<{ name: string; rows: Cell[][] }> = [];
    let cellCount = 0, textSize = 0;
    function table(name: string, rows: Cell[][]) {
        for (const row of rows) for (const value of row) {
            cellCount++;
            requireValue(value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)), "样本包含无法无损写入 Excel 的单元格");
            if (typeof value === "string") {
                requireValue(value.length <= 32767, "单元格超过 Excel 的 32767 字符限制；不会截断，请使用原始数据文件");
                textSize += value.length;
            }
        }
        if (cellCount > 1_000_000 || textSize > 16 * 1024 * 1024) throw new CodebookError("码本超过导出容量，请选择单一方法或使用 CSV；不会截断样本", "EXPORT_TOO_LARGE", 413);
        tables.push({ name, rows });
    }
    table("说明", [["项目", "内容"], ["格式", "wj-codebook-v1"], ["数据版本", input.source === "submitted" ? "提交快照" : "当前已保存实验（不含浏览器未保存草稿）"],
        ["实验ID", input.experimentId], ["任务ID", input.taskId], ["实验修订", input.version], ["字典修订", dictionary.revision], ["数据集修订", dictionary.datasetRevision],
        ["总体文件SHA256", input.populationFileSha256], ["读取协议", dictionary.parserVersion], ["抽样算法", "sampling-v2"], ["总体行数", population.length], ["问卷标题", questionnaire.title],
        ["来源边界", "题目关联仅表示语义对应，不表示既有数据由本问卷采集。认知试填答案不会写入样本。"],
        ["读取方式", "样本使用原抽样字段配置读取，保留全部源字段。字典必须与此读取方式一致，不自动转换编码、截断范围或换算单位。"],
        ["缺失规则", "空单元格、空白文本及字典明确声明的原值为缺失；0/false 不自动视为缺失。数据表保留原值，不替换缺失编码。"],
        ["选项身份", "未配置的选项身份保持空白，不在导出时补造。"], ["权重", "简单随机/系统抽样按实际 N/n，分层按实际 N_h/n_h，PPS 使用保存的入样概率及其倒数。不是有效案例数校正；不据此输出回归检验或通用标准误。"],
        ["记录位置", "抽样记录用方法和样本序号对应各样本表的数据行；总体行序号指解析后的总体行，不是原 Excel 物理行号。"],
        ["Excel安全", "文本单元格按文本写入，不创建公式、宏或链接，不给原值添加防公式前缀。"]]);
    table("变量", [["变量ID", "精确源字段", "标签", "存储类型", "测量层级", "单位"], ...dictionary.variables.map(v => [v.id, v.sourceField, v.label, v.storageType, v.measurementLevel, v.unit])]);
    table("编码与缺失", [["变量ID", "精确源字段", "用途", "顺序", "原值类型", "原值", "类型与原值JSON", "标签"], ...dictionary.variables.flatMap(v => [
        ...v.categories.map((c, i) => [v.id, v.sourceField, "类别", i + 1, typeof c.value, c.value, variableValueKey(c.value), c.label]),
        ...v.missingValues.map((value, i) => [v.id, v.sourceField, "声明缺失", i + 1, typeof value, value, variableValueKey(value), ""]),
    ])]);
    table("题目", [["题目ID", "分区", "题型", "题干", "作答规则JSON", "关联状态"], ...questionnaire.questions.map(q => [q.id, q.section ?? "main", q.type, q.content,
        JSON.stringify(q.type === "numeric" ? q.numberRule : q.type === "scale" ? { min: q.scaleMin ?? 1, max: q.scaleMax ?? 10, minLabel: q.scaleMinLabel, maxLabel: q.scaleMaxLabel } : q.type === "multiple" ? { min: q.minSelect ?? 1, max: q.maxSelect ?? q.options!.length } : {}), q.variableBinding ? "语义对应，不是采集来源" : "仅认知预试"])]);
    table("作答选项", [["题目ID", "顺序", "答案身份", "标签"], ...questionnaire.questions.flatMap(q => questionAnswers(q).map((a, i) => [q.id, i + 1, a.id, a.label]))]);
    table("题目变量关联", [["题目ID", "关联类型", "答案身份", "变量ID", "精确源字段", "原值类型", "原值", "类型与原值JSON"], ...questionnaire.questions.flatMap(q => {
        const b = q.variableBinding; if (!b) return [];
        if (b.kind === "continuous") return [[q.id, b.kind, "", b.variableId, dictionary.variables.find(v => v.id === b.variableId)!.sourceField, "", "", ""]];
        return b.answers.map(a => [q.id, b.kind, a.answerId, a.variableId, dictionary.variables.find(v => v.id === a.variableId)!.sourceField, typeof a.value, a.value, variableValueKey(a.value)]);
    })]);
    const design: Cell[][] = [["方法", "状态", "总体N", "实际样本n", "种子", "间隔", "随机起点", "规模字段", "分层字段", "说明"]];
    const strata: Cell[][] = [["方法", "分层字段", "层名", "总体层大小Nh", "实际层样本nh"]];
    const records: Cell[][] = [["方法", "样本序号（1起）", "总体行序号（1起）", "入样概率", "设计权重", "层名"]];
    let total = 0;
    for (const method of methods) {
        if (input.type !== "all" && input.type !== method) continue;
        const s = results[method];
        if (s === undefined) { design.push([method, "未执行", population.length, "", "", "", "", "", "", ""]); continue; }
        requireValue(object(s), "抽样设计记录格式无效");
        if (s.unavailable === true) {
            requireValue(method === "pps" && s.indices === undefined && s.data === undefined, "不可用方法不能包含入样记录");
            design.push([method, "不可用", population.length, "", "", "", "", "", "", typeof s.unavailableReason === "string" ? s.unavailableReason : "未记录原因"]); continue;
        }
        requireValue(s.completed === true && Array.isArray(s.indices) && integer(s.sampleCount) && s.sampleCount > 0 && s.sampleCount === s.indices.length, "抽样记录缺少完整的实际样本量和总体行索引；不使用嵌入旧行替代");
        const indices: number[] = s.indices;
        requireValue(indices.every(i => integer(i) && i >= 0 && i < population.length) && new Set(indices).size === indices.length, "抽样行索引无效或重复");
        requireValue(integer(s.seed) && s.seed >= 0 && s.seed <= 0xffffffff, "抽样记录缺少有效种子");
        const n = indices.length, N = population.length;
        if (cellCount + (n + 1) * fields.length + (records.length + n) * 6 > 1_000_000) throw new CodebookError("码本超过导出容量，请选择单一方法或使用 CSV；不会截断样本", "EXPORT_TOO_LARGE", 413);
        const rows = indices.map(i => population[i]!);
        if (method === "systematic") requireValue(s.interval === N / n && typeof s.randomStart === "number" && s.randomStart >= 0 && s.randomStart < s.interval, "系统抽样缺少当前算法的实际间隔和起点，不推断旧间隔");
        if (method === "pps") requireValue(typeof s.sizeField === "string" && fields.includes(s.sizeField) && population.every(row => typeof row[s.sizeField] === "number" && Number.isFinite(row[s.sizeField]) && (row[s.sizeField] as number) > 0) && typeof s.randomStart === "number" && s.randomStart >= 0 && s.randomStart < 1 && Array.isArray(s.inclusionProbabilities) && s.inclusionProbabilities.length === n && s.inclusionProbabilities.every((p: unknown) => typeof p === "number" && Number.isFinite(p) && p > 0 && p <= 1 && Number.isFinite(1 / p)), "PPS 缺少有效的规模字段或逐行入样概率");
        const layers = new Map<string, { count: number; sampleCount: number }>();
        if (method === "stratified") {
            requireValue(typeof s.stratifyBy === "string" && fields.includes(s.stratifyBy) && Array.isArray(s.layers), "分层抽样缺少完整设计信息");
            const populationCounts = new Map<string, number>(), sampleCounts = new Map<string, number>();
            for (const row of population) { const key = stratumKey(row[s.stratifyBy]); populationCounts.set(key, (populationCounts.get(key) ?? 0) + 1); }
            for (const row of rows) { const key = stratumKey(row[s.stratifyBy]); sampleCounts.set(key, (sampleCounts.get(key) ?? 0) + 1); }
            for (const layer of s.layers) {
                requireValue(object(layer) && typeof layer.name === "string" && !layers.has(layer.name) && integer(layer.count) && integer(layer.sampleCount) && layer.sampleCount > 0 && layer.count >= layer.sampleCount && populationCounts.get(layer.name) === layer.count && sampleCounts.get(layer.name) === layer.sampleCount, "分层设计与真实总体/样本层大小不一致");
                layers.set(layer.name, { count: layer.count, sampleCount: layer.sampleCount }); strata.push([method, s.stratifyBy, layer.name, layer.count, layer.sampleCount]);
            }
            requireValue(layers.size === populationCounts.size && [...populationCounts.keys()].every(key => layers.has(key)), "分层设计未覆盖完整总体");
        }
        design.push([method, "已完成", N, n, s.seed, method === "systematic" ? s.interval : "", typeof s.randomStart === "number" ? s.randomStart : "", method === "pps" ? s.sizeField : "", method === "stratified" ? s.stratifyBy : "", ""]);
        rows.forEach((row, i) => {
            const key = method === "stratified" ? stratumKey(row[s.stratifyBy]) : "";
            const layer = layers.get(key);
            const p = method === "pps" ? s.inclusionProbabilities[i] as number : layer ? layer.sampleCount / layer.count : n / N;
            records.push([method, i + 1, indices[i]! + 1, p, 1 / p, key]);
            requireValue(Object.keys(row).length === fields.length && fields.every(field => Object.hasOwn(row, field)), "样本字段与完整变量字典不一致，不能丢弃额外字段");
        });
        table(`样本_${method}`, [fields, ...rows.map(row => fields.map(field => row[field] as Cell))]); total += n;
    }
    if (!total) throw new CodebookError("暂无可导出的已完成抽样数据", "NO_DATA", 404);
    table("抽样设计", design); table("分层设计", strata); table("抽样记录", records);
    const book = XLSX.utils.book_new();
    for (const { name, rows } of tables) {
        const sheet = XLSX.utils.aoa_to_sheet(rows);
        sheet["!cols"] = rows[0]!.map((header, index) => ({ wch: Math.min(48, Math.max(16, String(header ?? "").length * 2, ...rows.slice(1, 21).map(row => typeof row[index] === "string" ? (row[index] as string).length * 1.5 : 16))) }));
        sheet["!autofilter"] = { ref: XLSX.utils.encode_range({ r: 0, c: 0 }, { r: rows.length - 1, c: rows[0]!.length - 1 }) };
        XLSX.utils.book_append_sheet(book, sheet, name);
    }
    return XLSX.write(book, { type: "buffer", bookType: "xlsx", compression: true });
}
