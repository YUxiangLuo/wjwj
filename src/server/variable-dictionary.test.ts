import { expect, test } from "bun:test";
import { dictionaryDatasetRevision, dictionaryDatasetRevisionFromHash, readStoredVariableDictionary } from "./variable-dictionary";
import { suggestVariableDictionary } from "../domain/experiment/variable-dictionary";
const bytes = new TextEncoder().encode("id,x,y\n01,10,A\n02,20,B\n").buffer;
const mapping = { identifier: "id", numeric: ["x"], others: ["y"] };

test("dictionary source identity tracks content, format and parsing roles, not filename or title", () => {
    const revision = dictionaryDatasetRevision(bytes, "one.csv", mapping);
    expect(revision).toHaveLength(64);
    expect(dictionaryDatasetRevision(bytes, "copy.CSV", JSON.stringify(mapping))).toBe(revision);
    expect(dictionaryDatasetRevision(bytes, "one.csv", { ...mapping, studyContract: { researchQuestion: "新标题" } })).toBe(revision);
    expect(dictionaryDatasetRevision(new TextEncoder().encode("changed").buffer, "one.csv", mapping)).not.toBe(revision);
    expect(dictionaryDatasetRevision(bytes, "one.xlsx", mapping)).not.toBe(revision);
    expect(dictionaryDatasetRevision(bytes, "one.csv", { ...mapping, numeric: ["y"] })).not.toBe(revision);
    expect(dictionaryDatasetRevision(bytes, "one.csv", { ...mapping, identifier: " id " })).not.toBe(revision);
    const hash = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    expect(dictionaryDatasetRevisionFromHash(hash, "one.csv", mapping)).toBe(revision);
    expect(dictionaryDatasetRevision(bytes, "one.csv", { numeric: ["x", "y"] })).toBe(dictionaryDatasetRevision(bytes, "one.csv", { numeric: ["y", "x"] }));
});

test("legacy absent metadata remains absent, while unconfirmed and unknown storage fails closed", () => {
    for (const raw of [null, undefined]) expect(readStoredVariableDictionary(raw)).toEqual({ ok: true, value: null });
    const suggestion = suggestVariableDictionary({ columns: ["id", "x"], rows: [{ id: "01", x: 10 }], identifier: "id", numeric: ["x"], datasetRevision: "a".repeat(64) });
    for (const raw of [suggestion, "{bad", {}, { ...suggestion, schemaVersion: 2, revision: 1 }]) {
        expect(readStoredVariableDictionary(raw)).toMatchObject({ ok: false, code: "INVALID_DICTIONARY_STORAGE" });
    }
    const confirmed = { ...suggestion, revision: 1 };
    expect(readStoredVariableDictionary(JSON.stringify(confirmed))).toMatchObject({ ok: false, code: "INVALID_DICTIONARY_STORAGE" });
    expect(readStoredVariableDictionary(confirmed, 1)).toEqual({ ok: true, value: confirmed });
    expect(readStoredVariableDictionary(confirmed, 2)).toMatchObject({ ok: false, code: "INVALID_DICTIONARY_STORAGE" });
});
