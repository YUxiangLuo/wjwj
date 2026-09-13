import { expect, test } from "bun:test";
import { InvalidQuestionnaireStorageError, readStoredRecommendQuestions } from "./questionnaire-storage";
import { handleServerError } from "@/server/http";
const question = { id: "q", type: "single" as const, content: "请选择", options: [{ id: "a", label: "甲" }, { id: "b", label: "乙" }] };
test("absent recommendations remain optional, not a generated list", () => {
    expect(readStoredRecommendQuestions(null)).toEqual([]);
    expect(readStoredRecommendQuestions(undefined)).toEqual([]);
});
test("valid native JSONB has a defensive parsed copy with stable identities", () => {
    const input = [structuredClone(question)]; const result = readStoredRecommendQuestions(input);
    expect(result).toEqual(input); result[0]!.options![0]!.id = "changed";
    expect(input[0]!.options[0]!.id).toBe("a");
});
for (const value of [JSON.stringify([question]), "not json", {}, [question, null], [question, { type: "boolean", content: "缺身份" }],
    [{ ...question, id: "" }], [question, question], [{ ...question, type: "unknown" }], [{ ...question, options: [1, 2] }],
    [{ ...question, options: [{ id: "o_1", label: "甲" }, { id: "o_2", label: " " }, { id: "o_3", label: "乙" }] }], [{ ...question, options: [{ id: "o_1", label: "甲" }, { id: "o_2", label: "甲" }] }], [{ ...question, optionIds: ["a", "a"] }],
    [{ id: "s", type: "scale", content: "评分", scaleMin: "1", scaleMax: 5 }], [{ ...question, section: "unknown" }]]) {
    test(`stored invalid recommendations fail atomically rather than repair: ${JSON.stringify(value)}`, () => {
        const before = JSON.stringify(value);
        expect(() => readStoredRecommendQuestions(value)).toThrow(InvalidQuestionnaireStorageError);
        expect(JSON.stringify(value)).toBe(before);
    });
}
test("scale labels and recognized sections survive strict reads", () => {
    const input = [{ id: "s", type: "scale" as const, content: "满意度", section: "background" as const, scaleMin: 1, scaleMax: 7, scaleMinLabel: "低", scaleMaxLabel: "高" }];
    expect(readStoredRecommendQuestions(input)).toEqual(input);
});
test("both HTTP portals can expose a bounded storage error, never record contents", async () => {
    const response = handleServerError(new InvalidQuestionnaireStorageError());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ success: false, error: { code: "INVALID_QUESTIONNAIRE_STORAGE", message: expect.stringContaining("不会跳过或自动修复") } });
});
