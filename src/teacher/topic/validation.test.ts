import { describe, expect, test } from "bun:test";
import {
    validateParsedExcelUpload,
    validateMappedPopulationData,
    validateIdentifierFieldValues,
    validateNumericFieldValues,
    validateTopicPublishReadiness,
    validateStratifiedValueCardinality,
    validateTopicAttachmentUpload,
    validateTopicFieldMappingColumns,
    validateTopicFieldMappingConfig,
    validateTopicName,
    validateWeightConfig,
    validatePrimaryTargetDictionary,
} from "./validation";
import { validateRecommendQuestionsPayload } from "../../lib/validate-question";
import { buildDefaultSamplingPolicy } from "../../lib/sampling-policy";
import { suggestDictionary } from "../../domain/variables/dictionary";

test("primary target completeness respects typed missing codes without banning auxiliary missingness", () => {
    const rows = [{ target: "1", extra: -99 }, { target: "2", extra: 7 }];
    const dictionary = suggestDictionary(rows, "fixture", 0, { numeric: ["target", "extra"] });
    dictionary.variables.find(v => v.field === "extra")!.missing.push(-99);
    const target = dictionary.variables.find(v => v.field === "target")!;
    const mapping = { numeric: ["target", "extra"], analysisTarget: { kind: "mean", field: "target" } };
    expect(validatePrimaryTargetDictionary(mapping, dictionary, rows)).toBeNull();
    target.missing.push(1); // A numeric missing code does not match CSV text "1".
    expect(validatePrimaryTargetDictionary(mapping, dictionary, rows)).toBeNull();
    target.missing.push("1");
    expect(validatePrimaryTargetDictionary(mapping, dictionary, rows)).toContain("研究目标变量");
    // A non-event missing code still changes the denominator of a proportion.
    expect(validatePrimaryTargetDictionary({ others: ["target"], analysisTarget: { kind: "proportion", field: "target", value: "2" } }, dictionary, rows)).toContain("缺失值");
});

test("constant mean targets fail early while constant proportions remain valid", () => {
    for (const value of [0, 100]) {
        const rows = [{ id: "a", value }, { id: "b", value }];
        const parsed = { rows, columns: ["id", "value"], rowCount: 2, colCount: 2 };
        expect(validateMappedPopulationData(parsed, {
            identifier: "id", numeric: ["value"], analysisTarget: { kind: "mean", field: "value" },
        })).toContain("方差为0");
        expect(validateMappedPopulationData(parsed, {
            identifier: "id", others: ["value"], analysisTarget: { kind: "proportion", field: "value", value: String(value) },
        })).toBeNull();
        rows[1]!.value = value + 1;
        expect(validateMappedPopulationData(parsed, {
            identifier: "id", numeric: ["value"], analysisTarget: { kind: "mean", field: "value" },
        })).toBeNull();
    }
});

for (const values of [["１２", "12", "１２"], [1e200, 2e200, 3e200], [1e-200, 2e-200, 3e-200], [1e154, 2e154, 3e154]]) {
    test(`unplannable mean scale ${values[0]} is rejected before publication`, () => {
        const rows = values.map((value, id) => ({ id: String(id), value }));
        const parsed = { rows, columns: ["id", "value"], rowCount: rows.length, colCount: 2 };
        const mapping = { identifier: "id", numeric: ["value"], analysisTarget: { kind: "mean", field: "value" } };
        expect(validateMappedPopulationData(parsed, mapping)).toMatch(/方差为0|换算计量单位/);
    });
}

test("full-width variable means and non-stratified categorical targets are publishable", () => {
    for (const count of [1, 40]) {
        const rows = Array.from({ length: 40 }, (_, id) => ({ id: String(id), cat: `类别${id % count}`, "y ": String(id).replace(/\d/g, digit => String.fromCharCode(digit.charCodeAt(0) + 0xfee0)) }));
        const parsed = { rows, columns: ["id", "cat", "y "], rowCount: 40, colCount: 3 };
        expect(validateMappedPopulationData(parsed, {
            identifier: "id", numeric: ["y "], others: ["cat"], analysisTarget: { kind: "mean", field: "y " },
        })).toBeNull();
        expect(validateMappedPopulationData(parsed, {
            identifier: "id", others: ["cat"], analysisTarget: { kind: "proportion", field: "cat", value: "类别0" },
        })).toBeNull();
    }
});

describe("topic validation helpers", () => {
    test("validateParsedExcelUpload rejects duplicate columns, blank headers, and blank rows", () => {
        expect(
            validateParsedExcelUpload({
                columns: ["id", "id"],
                rowCount: 1,
                colCount: 2,
                rows: [{ id: "1" }],
            })
        ).toBe("表头存在重复列名");

        expect(
            validateParsedExcelUpload({
                columns: ["id", "__EMPTY", "value"],
                blankColumnIndexes: [2],
                rowCount: 1,
                colCount: 3,
                rows: [{ id: "1", __EMPTY: "A", value: 2 }],
            })
        ).toBe("表头存在空白列名（第2列）");

        expect(
            validateParsedExcelUpload({
                columns: ["id", "name"],
                rowCount: 2,
                colCount: 2,
                rows: [{ id: "1", name: "Alice" }, { id: "", name: "" }],
            })
        ).toBe("存在完全空白的行");
    });

    test("validateNumericFieldValues requires every mapped numeric value to be finite", () => {
        const rows = [
            { score: "12.5", age: 20 },
            { score: "", age: 21 },
        ];
        expect(validateNumericFieldValues(rows, ["age"])).toBeNull();
        expect(validateNumericFieldValues(rows, ["score"])).toBe("数值变量 score 在数据第2行存在空值或非数值");
        expect(validateNumericFieldValues([{ score: "abc" }], ["score"])).toBe("数值变量 score 在数据第1行存在空值或非数值");
        expect(validateNumericFieldValues([{ score: "0x10" }], ["score"])).toBe("数值变量 score 在数据第1行存在空值或非数值");
        expect(validateNumericFieldValues([{ score: true }], ["score"])).toBe("数值变量 score 在数据第1行存在空值或非数值");
    });

    test("validateTopicFieldMappingConfig enforces identifiers and disjoint field roles", () => {
        expect(validateTopicFieldMappingConfig(null)).toBe("字段映射不能为空");
        expect(validateTopicFieldMappingConfig([])).toBe("字段映射格式无效");
        expect(validateTopicFieldMappingConfig({ identifier: 1, stratified: ["gender"], numeric: ["score"] })).toBe("字段映射格式无效");
        expect(validateTopicFieldMappingConfig({ identifier: "id", stratified: 1, numeric: ["score"] })).toBe("字段映射格式无效");
        expect(validateTopicFieldMappingConfig({ identifier: "id", stratified: ["gender"], numeric: [{}] })).toBe("字段映射格式无效");
        expect(validateTopicFieldMappingConfig({ stratified: ["gender"], numeric: ["score"] })).toBe("必须选择1个标识符字段");
        expect(validateTopicFieldMappingConfig({ identifier: "id", stratified: [], numeric: ["score"] })).toBeNull();
        expect(validateTopicFieldMappingConfig({ identifier: "id", stratified: ["group"], numeric: [] })).toBeNull();
        expect(validateTopicFieldMappingConfig({ identifier: "id", stratified: ["group"], numeric: ["score"], others: [" "] }))
            .toBe("字段映射不能包含空字段");
        expect(validateTopicFieldMappingConfig({ identifier: "id", stratified: ["group", "group"], numeric: ["score"] }))
            .toBe("分层变量中不能重复选择字段 group");
        expect(validateTopicFieldMappingConfig({ identifier: "id", stratified: ["group"], numeric: ["group"] }))
            .toBe("字段 group 不能同时作为分层变量和数值变量");
    });

    test("field mapping accepts pure categorical proportions and two-column means", () => {
        expect(validateTopicFieldMappingConfig({
            identifier: "编号",
            stratified: ["地区", "是否参与"],
            numeric: [],
            analysisTarget: { kind: "proportion", field: "是否参与", value: "是" },
            studyContract: {
                version: 1,
                researchQuestion: "社区活动参与比例是多少？",
                targetPopulation: "三个社区的全部登记单位",
                unitOfAnalysis: "一个登记单位",
                target: { kind: "proportion", field: "是否参与", value: "是" },
            },
        })).toBeNull();
        expect(validateTopicFieldMappingConfig({
            identifier: "编号",
            stratified: [],
            numeric: ["测量值"],
            analysisTarget: { kind: "mean", field: "测量值" },
            studyContract: {
                version: 1,
                researchQuestion: "全部登记单位的平均测量值是多少？",
                targetPopulation: "当前登记的全部单位",
                unitOfAnalysis: "一个登记单位",
                target: { kind: "mean", field: "测量值" },
            },
        })).toBeNull();
    });

    test("validateTopicFieldMappingColumns rejects mappings left over from a replaced workbook", () => {
        const mapping = {
            identifier: "样本ID",
            stratified: ["小组"],
            numeric: ["数值指标"],
            others: [] as string[],
        };

        expect(validateTopicFieldMappingColumns(mapping, ["样本ID", "年级", "每周学习时长"]))
            .toBe("字段映射包含当前总体数据中不存在的列：小组、数值指标");
        expect(validateTopicFieldMappingColumns(mapping, ["样本ID", "小组", "数值指标"]))
            .toBeNull();
    });

    test("validateStratifiedValueCardinality rejects fields with too many unique values", () => {
        const rows = Array.from({ length: 21 }, (_, index) => ({ group: `g${index}` }));
        expect(validateStratifiedValueCardinality(rows, ["group"])).toBe("分层变量 group 的唯一值数量超过20");
        expect(validateStratifiedValueCardinality([{ group: "A" }, { group: "" }], ["group"]))
            .toBe("分层变量 group 在数据第2行存在空值");
        expect(validateStratifiedValueCardinality([{ group: "A" }, { group: "Ａ" }], ["group"]))
            .toBe("分层变量 group 至少需要2个唯一值");
    });

    test("validateIdentifierFieldValues rejects blank and normalized duplicate identifiers", () => {
        expect(validateIdentifierFieldValues([{ id: "001" }, { id: "" }], "id"))
            .toBe("标识符字段 id 在数据第2行存在空值");
        expect(validateIdentifierFieldValues([{ id: "A1" }, { id: "Ａ1" }], "id"))
            .toBe("标识符字段 id 在数据第 2 行与第 1 行重复（忽略大小写）");
        expect(validateIdentifierFieldValues([{ id: "001" }, { id: "002" }], "id")).toBeNull();
    });

    test("validateTopicPublishReadiness requires data, mapping, and weights", () => {
        expect(validateTopicPublishReadiness(null)).toBe("实验模板需先上传总体数据后才能发布");
        expect(
            validateTopicPublishReadiness({
                excelFilePath: "/storage/uploads/topic.xlsx",
                fieldMapping: null,
                weightConfig: null,
            })
        ).toBe("实验模板需先完成研究目标与字段配置后才能发布");

        expect(
            validateTopicPublishReadiness({
                excelFilePath: "/storage/uploads/topic.xlsx",
                fieldMapping: JSON.stringify({
                    identifier: "id",
                    stratified: ["gender"],
                    numeric: ["score"],
                    analysisTarget: { kind: "mean", field: "score" },
                }),
                samplingPolicy: buildDefaultSamplingPolicy({ ppsEnabled: false }),
                weightConfig: JSON.stringify({ questionnaire: 30, process: 30, report: 40 }),
            })
        ).toBeNull();
        expect(
            validateTopicPublishReadiness({
                excelFilePath: "/storage/uploads/topic.xlsx",
                fieldMapping: JSON.stringify({ identifier: "id", stratified: ["gender"], numeric: ["score"] }),
                weightConfig: JSON.stringify({ questionnaire: 30, process: 30, report: 40 }),
            })
        ).toBe("实验模板需先指定研究目标变量后才能发布");

        expect(
            validateTopicPublishReadiness({
                excelFilePath: "/storage/uploads/topic.xlsx",
                fieldMapping: JSON.stringify({
                    identifier: "id",
                    stratified: ["gender"],
                    numeric: ["score"],
                    analysisTarget: { kind: "mean", field: "score" },
                }),
                samplingPolicy: { version: 1, methods: {} },
                weightConfig: JSON.stringify({ questionnaire: 30, process: 30, report: 40 }),
            })
        ).toBe("实验模板需先完成抽样策略配置：抽样策略格式无效");
    });

    test("validateTopicPublishReadiness accepts study contracts and keeps legacy targets working", () => {
        const base = {
            excelFilePath: "/storage/uploads/topic.xlsx",
            samplingPolicy: buildDefaultSamplingPolicy({ ppsEnabled: false }),
            weightConfig: JSON.stringify({ questionnaire: 30, process: 30, report: 40 }),
        };
        const contract = {
            version: 1,
            researchQuestion: "该校学生每周学习时长的平均水平是多少？",
            targetPopulation: "该校全体学生",
            unitOfAnalysis: "一名学生",
            target: { kind: "mean", field: "score" },
        };
        // 完整研究合同 → 可发布
        expect(
            validateTopicPublishReadiness({
                ...base,
                fieldMapping: JSON.stringify({
                    identifier: "id",
                    stratified: ["gender"],
                    numeric: ["score"],
                    analysisTarget: { kind: "mean", field: "score" },
                    studyContract: contract,
                }),
            })
        ).toBeNull();
        // 合同与旧版对照变量不一致 → 拒绝
        expect(
            validateTopicPublishReadiness({
                ...base,
                fieldMapping: JSON.stringify({
                    identifier: "id",
                    stratified: ["gender"],
                    numeric: ["score"],
                    analysisTarget: { kind: "mean", field: "score" },
                    studyContract: { ...contract, target: { kind: "proportion", field: "gender", value: "女" } },
                }),
            })
        ).toBe("研究合同与兼容对照变量不一致");
        // 合同存在但不完整 → 拒绝并提示补全
        expect(
            validateTopicPublishReadiness({
                ...base,
                fieldMapping: JSON.stringify({
                    identifier: "id",
                    stratified: ["gender"],
                    numeric: ["score"],
                    studyContract: { ...contract, researchQuestion: "短" },
                }),
            })
        ).toBe("研究问题长度需在 5-300 字之间");
    });

    test("publish readiness matches sampling capabilities to optional field roles", () => {
        const weightConfig = { questionnaire: 30, process: 30, report: 40 };
        const categoricalMapping = {
            identifier: "编号",
            stratified: ["地区", "是否参与"],
            numeric: [] as string[],
            analysisTarget: { kind: "proportion" as const, field: "是否参与", value: "是" },
        };
        expect(validateTopicPublishReadiness({
            excelFilePath: "/storage/uploads/categorical.csv",
            fieldMapping: categoricalMapping,
            samplingPolicy: buildDefaultSamplingPolicy({ ppsEnabled: false }),
            weightConfig,
        })).toBeNull();
        expect(validateTopicPublishReadiness({
            excelFilePath: "/storage/uploads/categorical.csv",
            fieldMapping: categoricalMapping,
            samplingPolicy: buildDefaultSamplingPolicy(),
            weightConfig,
        })).toBe("没有非目标数值字段时必须将 PPS 设为不适用");

        const twoColumnMeanMapping = {
            identifier: "编号",
            stratified: [] as string[],
            numeric: ["测量值"],
            analysisTarget: { kind: "mean" as const, field: "测量值" },
        };
        expect(validateTopicPublishReadiness({
            excelFilePath: "/storage/uploads/mean.csv",
            fieldMapping: twoColumnMeanMapping,
            samplingPolicy: buildDefaultSamplingPolicy({ ppsEnabled: false, stratifiedEnabled: false }),
            weightConfig,
        })).toBeNull();
        expect(validateTopicPublishReadiness({
            excelFilePath: "/storage/uploads/mean.csv",
            fieldMapping: twoColumnMeanMapping,
            samplingPolicy: buildDefaultSamplingPolicy({ ppsEnabled: false }),
            weightConfig,
        })).toBe("没有分层变量时必须将分层抽样设为不适用");
    });

    test("validateTopicFieldMappingConfig validates study contract when present", () => {
        const mapping = {
            identifier: "id",
            stratified: ["gender"],
            numeric: ["score"],
        };
        expect(validateTopicFieldMappingConfig({
            ...mapping,
            studyContract: {
                version: 1,
                researchQuestion: "该校学生每周学习时长的平均水平是多少？",
                targetPopulation: "该校全体学生",
                unitOfAnalysis: "一名学生",
                target: { kind: "mean", field: "score" },
            },
        })).toBeNull();
        expect(validateTopicFieldMappingConfig({
            ...mapping,
            studyContract: { version: 1, researchQuestion: "短" },
        })).toBe("研究合同缺少：目标总体、分析单位、均值对照变量");
        // 仅有旧版对照变量的历史课题不受影响
        expect(validateTopicFieldMappingConfig({
            ...mapping,
            analysisTarget: { kind: "mean", field: "score" },
        })).toBeNull();
    });

    test("validateTopicAttachmentUpload enforces type and size limits", () => {
        expect(
            validateTopicAttachmentUpload(
                { currentCount: 20, fileSize: 1 },
                "document"
            )
        ).toBe("附件数量已达上限");

        expect(
            validateTopicAttachmentUpload(
                { currentCount: 0, fileSize: 1 },
                "unknown"
            )
        ).toBe("不支持的文件类型");

        expect(
            validateTopicAttachmentUpload(
                { currentCount: 0, fileSize: 120 * 1024 * 1024 + 1 },
                "video"
            )
        ).toBe("文件大小超过限制");
        expect(validateTopicAttachmentUpload(
            { currentCount: 0, fileSize: 1, fileName: `${"a".repeat(252)}.pdf` },
            "document",
        )).toBe("附件名称不能为空且不能超过255个字符");
        expect(validateTopicAttachmentUpload(
            { currentCount: 4, currentTotalBytes: 500 * 1024 * 1024, fileSize: 1, fileName: "guide.pdf" },
            "document",
        )).toBe("单个实验模板的附件总大小不能超过500 MiB");
    });

    test("validateRecommendQuestionsPayload validates question list", () => {
        expect(
            validateRecommendQuestionsPayload(Array.from({ length: 31 }, () => ({ type: "boolean", id: "x", content: "x" })))
        ).toBe("推荐题目数量不能超过30");

        expect(
            validateRecommendQuestionsPayload([{ type: "single", id: "a", content: "Question", options: ["A"] }])
        ).toBe("第1题选项数量需在2-10个之间");
    });

    test("validateWeightConfig enforces ranges and total", () => {
        expect(validateWeightConfig(null)).toBe("评分权重不能为空");
        expect(validateWeightConfig({ questionnaire: 5, process: 45, report: 50 })).toBe("问卷设计权重需在10-50%之间");
        expect(validateWeightConfig({ questionnaire: 20, process: 10, report: 70 })).toBe("实验过程权重需在20-60%之间");
        expect(validateWeightConfig({ questionnaire: 20, process: 40, report: 20 })).toBe("评分权重总和必须等于100");
    });

    test("validateTopicName trims and validates names", () => {
        expect(validateTopicName(1)).toBe("实验模板名称格式无效");
        expect(validateTopicName("   ")).toBe("实验模板名称不能为空");
        expect(validateTopicName("x".repeat(201))).toBe("实验模板名称不能超过200字");
        expect(validateTopicName("课题A")).toBeNull();
    });
});

test("identifier duplicates ignore case, matching the platform's identity semantics", () => {
    const rows = [{ 编号: "R001" }, { 编号: "r001" }];
    expect(validateIdentifierFieldValues(rows, "编号")).toBe("标识符字段 编号 在数据第 2 行与第 1 行重复（忽略大小写）");
    expect(validateIdentifierFieldValues([{ 编号: "R001" }, { 编号: "R002" }], "编号")).toBeNull();
});

test("numeric validation accepts the text forms a spreadsheet export can carry", () => {
    expect(validateNumericFieldValues([{ 值: "１２３" }], ["值"])).toBeNull();
    expect(validateNumericFieldValues([{ 值: "1,234.5" }], ["值"])).toBeNull();
    expect(validateNumericFieldValues([{ 值: "1,23" }], ["值"])).toContain("空值或非数值");
    expect(validateNumericFieldValues([{ 值: "abc" }], ["值"])).toContain("空值或非数值");
});

test("publish readiness rejects a required PPS when no numeric column is all positive", () => {
    const fieldMapping = {
        identifier: "编号",
        numeric: ["得分", "规模"],
        stratified: ["组别"],
        others: [],
        analysisTarget: { kind: "mean", field: "得分" },
        studyContract: {
            version: 1,
            researchQuestion: "总体中得分的平均水平是多少？",
            targetPopulation: "全体单位",
            unitOfAnalysis: "一个单位",
            target: { kind: "mean", field: "得分" },
        },
    };
    const base = {
        excelFilePath: "/storage/uploads/topic.csv",
        fieldMapping,
        weightConfig: { questionnaire: 30, process: 30, report: 40 },
    };
    const policy = (pps: "required" | "optional") => ({ version: 1, methods: { simple: "required", systematic: "optional", pps, stratified: "optional" } });
    const rowsWithZero = [{ 编号: "1", 得分: 10, 规模: 0 }, { 编号: "2", 得分: 20, 规模: 5 }];

    // Field existence alone passed before; the value-level gate now rejects it.
    expect(validateTopicPublishReadiness({ ...base, samplingPolicy: policy("required") })).toBeNull();
    expect(validateTopicPublishReadiness({ ...base, samplingPolicy: policy("required"), rows: rowsWithZero }))
        .toContain("没有合格的 PPS 规模变量");
    expect(validateTopicPublishReadiness({
        ...base,
        samplingPolicy: policy("required"),
        rows: [{ 编号: "1", 得分: 10, 规模: 3 }, { 编号: "2", 得分: 20, 规模: 5 }],
    })).toBeNull();
    expect(validateTopicPublishReadiness({
        ...base,
        samplingPolicy: { ...policy("required"), ppsSizeFields: ["不存在的字段"] },
        rows: [{ 编号: "1", 得分: 10, 规模: 3 }, { 编号: "2", 得分: 20, 规模: 5 }],
    })).toContain("没有非目标数值字段");
});
