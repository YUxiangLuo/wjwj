import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { bindingDictionary } from "@/test-utils/question-variable-binding";
import { dictionaryDatasetRevision } from "@/server/variable-dictionary";
let info: any; let path = "";
const find = mock(async (_taskId: number, _classId: number) => info);
mock.module("./task-info", () => ({ findStudentTaskSubmitInfo: find }));
mock.module("@/server/storage-files", () => ({ resolveStoragePath: () => path }));
const { readStudentVariableDictionary } = await import("./variable-dictionary");
beforeEach(async () => {
    path = `/tmp/wjwj-student-dictionary-${crypto.randomUUID()}.csv`;
    await Bun.write(path, "id,value\n1,2\n");
    const dictionary = bindingDictionary(); dictionary.datasetRevision = dictionaryDatasetRevision(await Bun.file(path).arrayBuffer(), path, {});
    info = { excelFilePath: path, fieldMapping: {}, variableDictionary: dictionary, variableDictionaryRevision: 3 };
    find.mockClear();
});
afterEach(async () => { await Bun.$`rm -f ${path}`.quiet(); });
test("source access uses task and class scope and exposes only confirmed metadata", async () => {
    const result = await readStudentVariableDictionary(3, 11);
    expect(find).toHaveBeenCalledWith(3, 11); expect(result).toEqual({ ok: true, dictionary: info.variableDictionary });
});
test("legacy templates have no student dictionary suggestion or automatic backfill", async () => {
    info.variableDictionary = null; info.variableDictionaryRevision = 0; info.excelFilePath = null;
    expect(await readStudentVariableDictionary(3, 11)).toEqual({ ok: true, dictionary: null });
});
test("another class/nonexistent task cannot read source metadata", async () => {
    info = null; expect(await readStudentVariableDictionary(3, 12)).toMatchObject({ ok: false, status: 404 });
});
test("corrupt dictionary and stale counter fail closed", async () => {
    info.variableDictionaryRevision = 4;
    expect(await readStudentVariableDictionary(3, 11)).toMatchObject({ ok: false, code: "INVALID_DICTIONARY_STORAGE" });
    info.variableDictionary = { schemaVersion: 99 };
    expect(await readStudentVariableDictionary(3, 11)).toMatchObject({ ok: false, code: "INVALID_DICTIONARY_STORAGE" });
});
test("source changes and missing files cannot silently relink existing questions", async () => {
    await Bun.write(path, "id,value\n1,3\n");
    expect(await readStudentVariableDictionary(3, 11)).toMatchObject({ ok: false, code: "DATASET_CHANGED", status: 409 });
    await Bun.$`rm -f ${path}`.quiet();
    const result = await readStudentVariableDictionary(3, 11);
    expect(result).toMatchObject({ ok: false, code: "READ_FAILED", status: 422 });
    expect(JSON.stringify(result)).not.toContain(path);
});
