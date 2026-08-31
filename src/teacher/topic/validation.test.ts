import { describe, expect, test } from "bun:test";
import {
    validateParsedExcelUpload,
    validateNumericFieldValues,
    validateTopicPublishReadiness,
    validateStratifiedValueCardinality,
    validateTopicAttachmentUpload,
    validateTopicFieldMappingColumns,
    validateTopicFieldMappingConfig,
    validateTopicName,
    validateWeightConfig,
} from "./validation";
import { validateRecommendQuestionsPayload } from "../../lib/validate-question";

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
    });

    test("validateTopicFieldMappingConfig enforces required categories", () => {
        expect(validateTopicFieldMappingConfig(null)).toBe("字段映射不能为空");
        expect(validateTopicFieldMappingConfig([])).toBe("字段映射格式无效");
        expect(validateTopicFieldMappingConfig({ identifier: 1, stratified: ["gender"], numeric: ["score"] })).toBe("字段映射格式无效");
        expect(validateTopicFieldMappingConfig({ identifier: "id", stratified: 1, numeric: ["score"] })).toBe("字段映射格式无效");
        expect(validateTopicFieldMappingConfig({ identifier: "id", stratified: ["gender"], numeric: [{}] })).toBe("字段映射格式无效");
        expect(validateTopicFieldMappingConfig({ stratified: ["gender"], numeric: ["score"] })).toBe("必须选择1个标识符字段");
        expect(validateTopicFieldMappingConfig({ identifier: "id", stratified: [], numeric: ["score"] })).toBe("至少选择1个分层变量");
        expect(validateTopicFieldMappingConfig({ identifier: "id", stratified: ["id"], numeric: [] })).toBe("至少选择1个数值变量");
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
        expect(validateStratifiedValueCardinality(rows, ["group"])).toBe("分类变量 group 的唯一值数量超过20");
    });

    test("validateTopicPublishReadiness requires data, mapping, and weights", () => {
        expect(validateTopicPublishReadiness(null)).toBe("课题需先上传总体数据后才能发布");
        expect(
            validateTopicPublishReadiness({
                excelFilePath: "/storage/uploads/topic.xlsx",
                fieldMapping: null,
                weightConfig: null,
            })
        ).toBe("课题需先完成字段映射后才能发布");

        expect(
            validateTopicPublishReadiness({
                excelFilePath: "/storage/uploads/topic.xlsx",
                fieldMapping: JSON.stringify({
                    identifier: "id",
                    stratified: ["gender"],
                    numeric: ["score"],
                    analysisTarget: { kind: "mean", field: "score" },
                    studyContract: {
                        version: 1,
                        researchQuestion: "学生平均分是多少？",
                        targetPopulation: "全体学生",
                        unitOfAnalysis: "一名学生",
                        target: { kind: "mean", field: "score" },
                    },
                }),
                weightConfig: JSON.stringify({ questionnaire: 30, process: 30, report: 40 }),
            })
        ).toBeNull();
        expect(
            validateTopicPublishReadiness({
                excelFilePath: "/storage/uploads/legacy-topic.xlsx",
                fieldMapping: JSON.stringify({
                    identifier: "id",
                    stratified: ["gender"],
                    numeric: ["score"],
                    analysisTarget: { kind: "mean", field: "score" },
                }),
                weightConfig: JSON.stringify({ questionnaire: 30, process: 30, report: 40 }),
            })
        ).toBeNull();
        expect(
            validateTopicPublishReadiness({
                excelFilePath: "/storage/uploads/topic.xlsx",
                fieldMapping: JSON.stringify({ identifier: "id", stratified: ["gender"], numeric: ["score"] }),
                weightConfig: JSON.stringify({ questionnaire: 30, process: 30, report: 40 }),
            })
        ).toBe("课题需先完成研究合同后才能发布");
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
        expect(validateTopicName(1)).toBe("课题名称格式无效");
        expect(validateTopicName("   ")).toBe("课题名称不能为空");
        expect(validateTopicName("x".repeat(201))).toBe("课题名称不能超过200字");
        expect(validateTopicName("课题A")).toBeNull();
    });
});
