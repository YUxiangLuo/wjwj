import { expect, test } from "bun:test";
import { InvalidJsonbStorageError, readStoredDocument } from "./stored-document";
import { handleServerError } from "../server/http";

test("native documents and genuine absence do not need a decoder", () => {
    for (const value of [{ a: "01" }, [0, false], Object.create(null)]) expect(readStoredDocument(value)).toBe(value);
    expect(readStoredDocument(null)).toBeNull(); expect(readStoredDocument(undefined)).toBeNull();
});
for (const value of ["", " ", "{}", "[]", "null", '{"secret":"do-not-leak"}', "invalid", 0, false, new Date(), new Map()]) {
    test(`stored document rejects present invalid data: ${String(value)}`, async () => {
        let cause: unknown;
        try { readStoredDocument(value); } catch (error) { cause = error; }
        expect(cause).toBeInstanceOf(InvalidJsonbStorageError);
        const response = handleServerError(cause);
        expect(response.status).toBe(409);
        const body = await response.text();
        expect(body).toContain("INVALID_JSONB_STORAGE"); expect(body).not.toContain("do-not-leak");
    });
}
