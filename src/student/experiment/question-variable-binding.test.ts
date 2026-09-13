import { expect, mock, test } from "bun:test";
import { bindingDictionary, boundQuestionnaire } from "@/test-utils/question-variable-binding";
import { buildStageCompletionUpdates } from "./update-service";
import { dictionaryDatasetRevision } from "@/server/variable-dictionary";
import { createMockDb } from "@/test-utils/mock-db";

function record() {
    return { id: 9, taskId: 3, studentId: 2, version: 4, status: "in_progress", currentStage: 1, stage1CompletedAt: null } as any;
}
for (const mode of ["valid", "no-dictionary", "foreign-task", "changed-question", "duplicate-id"] as const) {
    test(`stage 1 validates optional bindings against authoritative metadata: ${mode}`, () => {
        const questionnaire = boundQuestionnaire();
        if (mode === "foreign-task") questionnaire.questions[0]!.variableBinding!.taskId = 7;
        if (mode === "changed-question") questionnaire.questions[0]!.content = "不同含义";
        if (mode === "duplicate-id") questionnaire.questions[1]!.id = questionnaire.questions[0]!.id;
        const result = buildStageCompletionUpdates({ experimentRecord: record(), stage: 1, payload: { questionnaire }, populationSize: 100,
            deadlinePassed: false, variableDictionary: mode === "no-dictionary" ? null : bindingDictionary() });
        expect(result.ok).toBe(mode === "valid");
        if (result.ok) {
            expect(result.updates.currentStage).toBe(2); expect(result.updates.version).toBe(5);
            expect((result.updates.questionnaire as any).questions[0].variableBinding).toEqual(questionnaire.questions[0]!.variableBinding);
        } else expect(result.code).toBe(mode === "duplicate-id" ? "VALIDATION_ERROR" : "INVALID_VARIABLE_BINDING");
    });
}
test("stage 1 removes untrusted binding extras without modifying unbound questions", () => {
    const questionnaire = boundQuestionnaire(); (questionnaire.questions[0]!.variableBinding as any).inventedResponses = [123];
    const result = buildStageCompletionUpdates({ experimentRecord: record(), stage: 1, payload: { questionnaire }, populationSize: 100, deadlinePassed: false, variableDictionary: bindingDictionary() });
    expect(result.ok).toBe(true);
    if (result.ok) {
        expect((result.updates.questionnaire as any).questions[0].variableBinding).not.toHaveProperty("inventedResponses");
        expect((result.updates.questionnaire as any).questions[1]).toEqual(questionnaire.questions[1]);
    }
});
test("stage 1 rejects answer data at questionnaire and question levels without preparing a write", () => {
    for (const level of ["questionnaire", "question"]) {
        const questionnaire = boundQuestionnaire();
        if (level === "questionnaire") (questionnaire as any).answersByIndex = { 0: "o_a" };
        else (questionnaire.questions[0] as any).responses = [0, false];
        const saved = record(), before = structuredClone(saved), input = structuredClone(questionnaire);
        const result = buildStageCompletionUpdates({ experimentRecord: saved, stage: 1, payload: { questionnaire }, populationSize: 100, deadlinePassed: false, variableDictionary: bindingDictionary() });
        expect(result).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
        expect(result).not.toHaveProperty("updates"); expect(saved).toEqual(before); expect(questionnaire).toEqual(input);
    }
});
test("no binding remains optional even on a dictionary-enabled task", () => {
    const questionnaire = boundQuestionnaire(); delete questionnaire.questions[0]!.variableBinding;
    const result = buildStageCompletionUpdates({ experimentRecord: record(), stage: 1, payload: { questionnaire }, populationSize: 100, deadlinePassed: false });
    expect(result.ok).toBe(true);
});
for (const valid of [true, false]) {
    test(`final submission validates the persisted association and snapshots the same dictionary (${valid})`, async () => {
        const file = `/tmp/wjwj-binding-submit-${crypto.randomUUID()}.csv`;
        await Bun.write(file, "id,value\n1,1\n2,2\n");
        const dictionary = bindingDictionary(); dictionary.datasetRevision = dictionaryDatasetRevision(await Bun.file(file).arrayBuffer(), file, {});
        const questionnaire = boundQuestionnaire(); questionnaire.questions[0]!.variableBinding!.datasetRevision = dictionary.datasetRevision;
        if (!valid) questionnaire.questions[0]!.variableBinding!.taskId = 99;
        const { db, operations } = createMockDb({ update: [[{ id: 9 }]] });
        mock.module("../../db", () => ({ db }));
        mock.module("../../server/storage-files", () => ({ resolveStoragePath: () => file }));
        const { submitStudentExperiment } = await import(`./submit-service.ts?binding=${crypto.randomUUID()}`);
        try {
            const result = await submitStudentExperiment({ experimentRecord: { ...record(), currentStage: 4, stage4CompletedAt: new Date(), questionnaire,
                samplePlan: { confidenceLevel: "95", marginOfError: 5, designEffect: 1, nonResponseRate: 0, recommendedSize: 132, finalSampleSize: 50 },
                samplingResults: { simple: { completed: true, sampleCount: 50 }, systematic: { completed: true, sampleCount: 50 }, pps: { completed: true, sampleCount: 50, sizeField: "规模" }, stratified: { completed: true, stratifyBy: "分组", layers: [{ name: "A", sampleCount: 50 }] } },
                reportContent: `<p>${"这是完整的教学分析报告。".repeat(20)}</p>` }, observedVersion: 4,
                taskInfo: { topicName: "关联测试", populationSize: 200, excelFilePath: file, fieldMapping: {}, variableDictionary: dictionary, variableDictionaryRevision: dictionary.revision }, student: { studentId: "S001" } });
            expect(result.ok).toBe(valid);
            if (valid) expect(operations.find(op => op.kind === "update")?.set).toMatchObject({ submissionSnapshot: { questionnaire, variableDictionary: dictionary } });
            else { expect(result).toMatchObject({ code: "INVALID_VARIABLE_BINDING" }); expect(operations).toHaveLength(0); }
        } finally { await Bun.$`rm -f ${file}`.quiet(); }
    });
}
