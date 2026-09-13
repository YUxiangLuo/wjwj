import { expect, mock, test } from "bun:test";
import { createMockDb } from "../../test-utils/mock-db";
import { suggestDictionary } from "../../domain/variables/dictionary";
import { readVariableSource } from "../../server/variable-source";

test("variable dictionary enforces freeze, source/revision conflicts, and no-op revisions", async () => {
    const path = `/storage/uploads/variables-${crypto.randomUUID()}.csv`;
    await Bun.write(`${process.cwd()}${path}`, "id,group,score\n1,A,10\n2,B,20\n");
    const mapping = { identifier: "id", numeric: ["score"], stratified: ["group"] };
    const sourceData = await readVariableSource(path, mapping);
    const dictionary = suggestDictionary(sourceData.rows, sourceData.source, 4);
    const state = { id: 12, status: 0, excelFilePath: path, fieldMapping: mapping, variableDictionary: dictionary, variableRevision: 4 };
    const { db, operations } = createMockDb({ select: [
        [{ ...state, status: 1 }], [],
        [state], [],
        [state], [],
        [state], [],
    ] });
    mock.module("../../db", () => ({ db }));
    const service = await import("./variable-dictionary-service");
    try {
        expect(await service.putTeacherVariableDictionary({ teacherId: 9, topicId: 12, body: { source: sourceData.source, observedRevision: 4, dictionary } }))
            .toMatchObject({ ok: false, code: "TOPIC_LOCKED", status: 409 });
        expect(await service.putTeacherVariableDictionary({ teacherId: 9, topicId: 12, body: { source: "stale", observedRevision: 4, dictionary } }))
            .toMatchObject({ ok: false, code: "VARIABLE_SOURCE_CONFLICT", status: 409 });
        expect(await service.putTeacherVariableDictionary({ teacherId: 9, topicId: 12, body: { source: sourceData.source, observedRevision: 3, dictionary } }))
            .toMatchObject({ ok: false, code: "VARIABLE_REVISION_CONFLICT", status: 409 });
        expect(await service.putTeacherVariableDictionary({ teacherId: 9, topicId: 12, body: { source: sourceData.source, observedRevision: 4, dictionary } }))
            .toEqual({ ok: true, revision: 4 });
        expect(operations.filter(operation => operation.kind === "update")).toHaveLength(0);
    } finally {
        await Bun.file(`${process.cwd()}${path}`).delete().catch(() => undefined);
    }
});

test("variable dictionary PUT body is strict and complete", async () => {
    const service = await import("./variable-dictionary-service");
    expect(await service.putTeacherVariableDictionary({ teacherId: 9, topicId: 12, body: { source: "x", observedRevision: 0 } }))
        .toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
});
