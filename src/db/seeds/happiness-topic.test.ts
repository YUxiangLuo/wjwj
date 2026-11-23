import { expect, test } from "bun:test";
import * as XLSX from "xlsx";
import { createTeaPricingPopulation } from "./dogfood-fixtures";
import {
    createTeaPricingDictionary,
    teaPricingFieldMapping,
    teaPricingQuestionnaire,
    teaPricingVariables,
} from "./happiness-topic";
import { buildTeaPricingWorkbook } from "./happiness-materials";
import { validateDictionary, interpretNumeric } from "../../domain/variables/dictionary";
import { parseSpreadsheetFile } from "../../lib/spreadsheet";
import { validateRecommendQuestionsPayload } from "../../lib/validate-question";
import { validateMappedPopulationData } from "../../teacher/topic/validation";

test("the seeded tea-pricing workbook and mapping satisfy the real publication contract", async () => {
    const parsed = await parseSpreadsheetFile(buildTeaPricingWorkbook(createTeaPricingPopulation()), "tea-pricing.xlsx", {
        numericFields: teaPricingFieldMapping.numeric,
    });
    expect(validateMappedPopulationData(parsed, teaPricingFieldMapping)).toBeNull();
    expect(parsed.rows.filter(row => row.门店小程序体验评分 === null || row.门店小程序体验评分 === "")).toHaveLength(22);
});

test("the tea-pricing workbook keeps a parseable population first and supplies a codebook and brief", async () => {
    const bytes = buildTeaPricingWorkbook(createTeaPricingPopulation());
    const workbook = XLSX.read(bytes, { type: "buffer" });
    expect(workbook.SheetNames).toEqual(["总体数据", "变量说明", "调查说明"]);
    const parsed = await parseSpreadsheetFile(bytes, "tea-pricing.xlsx", { preserveRawValues: true });
    expect(parsed.rowCount).toBe(240);
    expect(parsed.columns).toEqual(teaPricingVariables.map(variable => variable.field));
    const dictionary = validateDictionary(createTeaPricingDictionary("test-source"), parsed.rows, "test-source");
    expect(dictionary.variables).toHaveLength(14);
    const couponCount = dictionary.variables.find(variable => variable.field === "近一月领券核销次数")!;
    expect(interpretNumeric(0, couponCount)).toBe(0);
    const appScore = dictionary.variables.find(variable => variable.field === "门店小程序体验评分")!;
    expect(appScore.kind).toBe("ordinal");
    expect(appScore.missing).toEqual([null]);
    expect(parsed.rows.filter(row => row.门店小程序体验评分 === null)).toHaveLength(22);
    expect(XLSX.utils.sheet_to_json(workbook.Sheets["变量说明"]!)).toHaveLength(14);
});

test("tea-pricing recommendations cover screening, a directly measured WTP target and an explicit nonuser option", () => {
    const result = validateRecommendQuestionsPayload(teaPricingQuestionnaire.questions);
    expect(result).toBeNull();
    expect(teaPricingQuestionnaire.questions).toHaveLength(14);
    expect(teaPricingQuestionnaire.questions.filter(question => question.section === "screening")).toHaveLength(2);
    expect(teaPricingQuestionnaire.questions.find(question => question.id === "hq2")).toMatchObject({ type: "numeric", numericMin: 0, numericMax: 60, unit: "元", decimalPlaces: 1 });
    expect(teaPricingQuestionnaire.questions.find(question => question.id === "hq14")?.options).toContain("近3个月未使用过");
});
