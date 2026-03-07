import { describe, expect, test } from "bun:test";
import {
    validateRecommendQuestionItems,
    validateParsedExcelUpload,
    validateTopicPublishReadiness,
    validateStratifiedValueCardinality,
    validateTopicAttachmentUpload,
    validateTopicFieldMappingConfig,
    validateTopicName,
    validateWeightConfig,
} from "./validation";

describe("topic validation helpers", () => {
    test("validateParsedExcelUpload rejects duplicate columns and blank rows", () => {
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
                columns: ["id", "name"],
                rowCount: 2,
                colCount: 2,
                rows: [{ id: "1", name: "Alice" }, { id: "", name: "" }],
            })
        ).toBe("存在完全空白的行");
    });

    test("validateTopicFieldMappingConfig enforces required categories", () => {
        expect(validateTopicFieldMappingConfig(null)).toBe("字段映射不能为空");
        expect(validateTopicFieldMappingConfig({ stratified: ["gender"], numeric: ["score"] })).toBe("必须选择1个标识符字段");
        expect(validateTopicFieldMappingConfig({ identifier: "id", stratified: [], numeric: ["score"] })).toBe("至少选择1个分层变量");
        expect(validateTopicFieldMappingConfig({ identifier: "id", stratified: ["id"], numeric: [] })).toBe("至少选择1个数值变量");
    });

    test("validateStratifiedValueCardinality rejects fields with too many unique values", () => {
        const rows = Array.from({ length: 21 }, (_, index) => ({ group: `g${index}` }));
        expect(validateStratifiedValueCardinality(rows, ["group"])).toBe("分层变量 group 的唯一值数量超过20");
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
                fieldMapping: JSON.stringify({ identifier: "id", stratified: ["gender"], numeric: ["score"] }),
                weightConfig: JSON.stringify({ questionnaire: 30, process: 30, report: 40 }),
            })
        ).toBeNull();
    });

    test("validateTopicAttachmentUpload enforces type and size limits", () => {
        expect(
            validateTopicAttachmentUpload(
                { currentCount: 20, fileName: "a.pdf", mimeType: "application/pdf", fileSize: 1 },
                "document"
            )
        ).toBe("附件数量已达上限");

        expect(
            validateTopicAttachmentUpload(
                { currentCount: 0, fileName: "a.exe", mimeType: "application/octet-stream", fileSize: 1 },
                "unknown"
            )
        ).toBe("不支持的文件类型");
    });

    test("validateRecommendQuestionItems validates option-based questions", () => {
        expect(validateRecommendQuestionItems(Array.from({ length: 31 }, () => ({ questionType: 1, content: "x" })))).toBe(
            "推荐题目数量不能超过30"
        );

        expect(
            validateRecommendQuestionItems([{ questionType: 2, content: "Question", options: "A" }])
        ).toBe("选项数量需在2-10之间");
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
