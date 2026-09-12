import { afterAll, expect, mock, test } from "bun:test";
import { createMockDb } from "../../test-utils/mock-db";
import * as storage from "../../server/storage-files";
import { dictionaryDatasetRevision } from "../../server/variable-dictionary";
import { suggestVariableDictionary } from "../../domain/experiment/variable-dictionary";
import { buildDefaultSamplingPolicy } from "../../lib/sampling-policy";

const path = `/tmp/wjwj-dictionary-lifecycle-${crypto.randomUUID()}.csv`;
const csv = "id,value,group\n001,10,A\n002,20,B\n";
await Bun.write(path, csv);
afterAll(async () => { await Bun.file(path).delete().catch(() => undefined); });
mock.module("../../server/storage-files", () => ({ ...storage, resolveStoragePath: () => path, createStorageUploadPath: () => "/storage/copy.csv", copyStorageFile: async () => {}, writeStorageFile: async () => {} }));
mock.module("./storage-cleanup", () => ({ deleteTopicStorageFileIfUnreferenced: async () => {} }));
const fieldMapping = { identifier: "id", numeric: ["value"], others: ["group"], analysisTarget: { kind: "mean", field: "value" } };
const base = {
    id: 12, teacherId: 9, name: "总体", status: 0, excelFilePath: "/storage/source.csv", excelRowCount: 2,
    fieldMapping, samplingPolicy: buildDefaultSamplingPolicy({ ppsEnabled: false, stratifiedEnabled: false }),
    weightConfig: { questionnaire: 20, process: 40, report: 40 },
};
function dictionary() {
    return { ...suggestVariableDictionary({ columns: ["id", "value", "group"], rows: [{ id: "001", value: 10, group: "A" }, { id: "002", value: 20, group: "B" }], ...fieldMapping,
        datasetRevision: dictionaryDatasetRevision(new TextEncoder().encode(csv).buffer, base.excelFilePath, fieldMapping) }), revision: 4 };
}
async function setup(select: unknown[]) {
    const { db, operations } = createMockDb({ select });
    mock.module("../../db", () => ({ db }));
    const manage = await import("./manage-service");
    const content = await import("./content-service");
    const tasks = await import("./task-service");
    return { manage, content, tasks, operations };
}

test("equivalent mapping saves retain metadata while role changes invalidate it", async () => {
    for (const changed of [false, true]) {
        const { manage, operations } = await setup([[{ ...base, variableDictionary: dictionary() }], []]);
        const result = await manage.updateTopicFieldMapping({ teacherId: 9, topicId: 12,
            fieldMapping: changed ? { ...fieldMapping, others: [], stratified: ["group"] } : structuredClone(fieldMapping) });
        expect(result.ok).toBe(true);
        const update = operations.find(o => o.kind === "update")?.set;
        if (changed) expect(update).toHaveProperty("variableDictionary", null);
        else expect(update).not.toHaveProperty("variableDictionary");
    }
});

test("replacing source clears the dictionary even when headers happen to match", async () => {
    const { manage, operations } = await setup([[{ ...base, variableDictionary: dictionary() }], []]);
    expect((await manage.replaceTopicExcelData({ teacherId: 9, topicId: 12, file: new File([csv], "new.csv") })).ok).toBe(true);
    expect(operations.find(o => o.kind === "update")?.set).toMatchObject({ variableDictionary: null, fieldMapping: null });
});

test("copy carries confirmed dictionary into a new topic revision without changing source metadata", async () => {
    const original = dictionary();
    const { content, operations } = await setup([[{ ...base, variableDictionary: original }], []]);
    expect((await content.copyTopicWithResources({ teacherId: 9, topicId: 12 })).ok).toBe(true);
    expect(operations.find(o => o.kind === "insert")?.values).toMatchObject({ variableDictionary: { ...original, revision: 1 }, status: 0 });
    expect(original.revision).toBe(4);
});

test("copy and publication reject corrupt or stale dictionaries before writes", async () => {
    for (const value of [{ ...dictionary(), schemaVersion: 2 }, { ...dictionary(), datasetRevision: "b".repeat(64) }]) {
        for (const action of ["copy", "publish", "assign"] as const) {
            const { content, manage, tasks, operations } = await setup([[{ ...base, status: action === "assign" ? 1 : 0, variableDictionary: value }], []]);
            const result = action === "copy" ? await content.copyTopicWithResources({ teacherId: 9, topicId: 12 })
                : action === "publish" ? await manage.updateTeacherTopicBasics({ teacherId: 9, topicId: 12, body: { status: 1 } })
                    : await tasks.publishTopicTasks({ teacherId: 9, topicId: 12, classIds: [1] });
            expect(result).toMatchObject({ ok: false, status: 409 });
            expect(operations.some(o => o.kind === "insert" || o.kind === "update")).toBe(false);
        }
    }
});

function completedExperiment() {
    const now = new Date();
    return {
        id: 1, version: 4, status: "in_progress", currentStage: 4, stage4CompletedAt: now,
        questionnaire: { title: "教学问卷", welcomeText: "欢迎参与本次抽样调查课堂认知预试，请根据实际情况认真作答。", endingText: "感谢参与本次抽样调查课堂认知预试，您的预试现已结束。", questions: Array.from({ length: 5 }, (_, i) => ({ id: `q${i}`, type: "boolean", content: `第${i + 1}个调查问题？` })) },
        samplePlan: { estimationType: "mean", populationVariance: 25, confidenceLevel: "95", marginOfError: 5, designEffect: 1, nonResponseRate: 0, recommendedSize: 2, finalSampleSize: 2 },
        samplingResults: { simple: { completed: true, sampleCount: 2 }, systematic: { completed: true, sampleCount: 2, interval: 1 } },
        reportContent: `<p>${"本次采用普查，对总体数值进行说明，并讨论统计方法的适用范围。".repeat(8)}</p>`,
    } as any;
}

test("submission snapshots freeze confirmed metadata and reject mismatched provenance", async () => {
    for (const mode of ["legacy", "confirmed", "stale", "future"] as const) {
        const { operations } = await setup([]);
        const { submitStudentExperiment } = await import("../../student/experiment/submit-service");
        const value = mode === "legacy" ? null : { ...dictionary(), ...(mode === "stale" ? { datasetRevision: "c".repeat(64) } : mode === "future" ? { schemaVersion: 2 } : {}) };
        const result = await submitStudentExperiment({ experimentRecord: completedExperiment(), observedVersion: 4,
            taskInfo: { topicName: "总体", populationSize: 2, excelFilePath: base.excelFilePath, fieldMapping, samplingPolicy: base.samplingPolicy, variableDictionary: value }, student: { studentId: "001" } });
        expect(result).toMatchObject({ ok: mode === "legacy" || mode === "confirmed" });
        const update = operations.find(o => o.kind === "update")?.set as any;
        if (mode === "legacy") expect(update.submissionSnapshot).not.toHaveProperty("variableDictionary");
        else if (mode === "confirmed") {
            expect(update.submissionSnapshot.variableDictionary).toEqual(dictionary());
            expect(update).not.toHaveProperty("questionnaire");
        } else expect(update).toBeUndefined();
    }
});
