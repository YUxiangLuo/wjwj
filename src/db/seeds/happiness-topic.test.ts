import { expect, test } from "bun:test";
import * as XLSX from "xlsx";
import { createYouthHappinessPopulation } from "./dogfood-fixtures";
import { createHappinessDictionary, happinessFieldMapping, happinessQuestionnaire, happinessVariables } from "./happiness-topic";
import { buildHappinessWorkbook } from "./happiness-materials";
import { validateDictionary, interpretNumeric } from "../../domain/variables/dictionary";
import { parseSpreadsheetFile } from "../../lib/spreadsheet";
import { validateRecommendQuestionsPayload } from "../../lib/validate-question";
import { validateMappedPopulationData } from "../../teacher/topic/validation";

test("the seeded happiness workbook and mapping satisfy the real publication contract", async () => {
    const parsed = await parseSpreadsheetFile(buildHappinessWorkbook(createYouthHappinessPopulation()), "happiness.xlsx", {
        numericFields: happinessFieldMapping.numeric,
    });
    expect(validateMappedPopulationData(parsed, happinessFieldMapping)).toBeNull();
    expect(parsed.rows.filter(row => row.社区服务满意度 === null || row.社区服务满意度 === "")).toHaveLength(22);
});

test("the happiness workbook keeps a parseable population first and supplies a codebook and brief", async () => {
    const bytes = buildHappinessWorkbook(createYouthHappinessPopulation());
    const workbook = XLSX.read(bytes, { type: "buffer" });
    expect(workbook.SheetNames).toEqual(["总体数据", "变量说明", "调查说明"]);
    const parsed = await parseSpreadsheetFile(bytes, "happiness.xlsx", { preserveRawValues: true });
    expect(parsed.rowCount).toBe(240);
    expect(parsed.columns).toEqual(happinessVariables.map(variable => variable.field));
    const dictionary = validateDictionary(createHappinessDictionary("test-source"), parsed.rows, "test-source");
    expect(dictionary.variables).toHaveLength(14);
    const leisure = dictionary.variables.find(variable => variable.field === "每周休闲时长")!;
    expect(interpretNumeric(0, leisure)).toBe(0);
    const service = dictionary.variables.find(variable => variable.field === "社区服务满意度")!;
    expect(service.kind).toBe("ordinal");
    expect(service.missing).toEqual([null]);
    expect(parsed.rows.filter(row => row.社区服务满意度 === null)).toHaveLength(22);
    expect(XLSX.utils.sheet_to_json(workbook.Sheets["变量说明"]!)).toHaveLength(14);
});

test("happiness recommendations cover eligibility, a directly measured target and an explicit nonuser option", () => {
    const result = validateRecommendQuestionsPayload(happinessQuestionnaire.questions);
    expect(result).toBeNull();
    expect(happinessQuestionnaire.questions).toHaveLength(14);
    expect(happinessQuestionnaire.questions.filter(question => question.section === "screening")).toHaveLength(2);
    expect(happinessQuestionnaire.questions.find(question => question.id === "hq2")).toMatchObject({ type: "numeric", numericMin: 0, numericMax: 10, unit: "分", decimalPlaces: 1 });
    expect(happinessQuestionnaire.questions.find(question => question.id === "hq14")?.options).toContain("近3个月未使用过");
});
