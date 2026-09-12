import { afterAll, expect, mock, test } from "bun:test";
import * as XLSX from "xlsx";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { createMockDb } from "../../test-utils/mock-db";
import { createTeacherAuthModuleMock } from "../../test-utils/mock-auth-modules";
import { suggestVariableDictionary } from "../../domain/experiment/variable-dictionary";
import { dictionaryDatasetRevision } from "../../server/variable-dictionary";
import { parseSpreadsheetFile } from "../../lib/spreadsheet";

const path = `/tmp/wjwj-dictionary-${crypto.randomUUID()}`;
const csv = "编号, 金额 ,类别,辅助数值\n001,10.25,10²,N/A\n002,12,102,01.50\n";
const mapping = { identifier: "编号", numeric: [" 金额 "], others: ["类别"], analysisTarget: { kind: "mean", field: " 金额 " } };
let currentPath = `${path}.csv`;
mock.module("../../server/storage-files", () => ({ resolveStoragePath: () => currentPath }));
mock.module("./auth", () => createTeacherAuthModuleMock({ getPrimaryTeacherIdOrThrow: () => 9 }));
afterAll(async () => { for (const ext of ["csv", "xlsx"]) await Bun.file(`${path}.${ext}`).delete().catch(() => undefined); });

async function setup(options: { source?: ArrayBuffer; filename?: string; row?: Record<string, unknown> | null; assigned?: boolean } = {}) {
    const filename = options.filename ?? "population.csv";
    const buffer = options.source ?? new TextEncoder().encode(csv).buffer;
    currentPath = `${path}.${filename.endsWith(".csv") ? "csv" : "xlsx"}`;
    await Bun.write(currentPath, buffer);
    const parsed = await parseSpreadsheetFile(buffer, filename, { numericFields: mapping.numeric });
    const suggestion = suggestVariableDictionary({ ...parsed, ...mapping, datasetRevision: dictionaryDatasetRevision(buffer, filename, mapping) });
    const { db, operations } = createMockDb({ select: [options.row === null ? [] : [{ status: 0, excelFilePath: filename, fieldMapping: mapping, variableDictionary: null, ...options.row }], options.assigned ? [{ id: 77 }] : []] });
    mock.module("../../db", () => ({ db }));
    const { topicVariableDictionaryRoutes } = await import("./variable-dictionary");
    return { routes: topicVariableDictionaryRoutes, operations, suggestion };
}
function req(method = "GET", dictionary?: unknown, id = "12") {
    const request = new Request("https://example.com/api/teacher/topics/12/variables", { method, ...(method === "PUT" ? { body: JSON.stringify({ dictionary }), headers: { "content-type": "application/json" } } : {}) });
    (request as Request & { params: object }).params = { id };
    return request;
}

test("GET suggests a bounded dictionary without saving or rewriting source data", async () => {
    const { routes, operations } = await setup();
    const response = await routes.GET!(req());
    expect(response.status).toBe(200);
    const payload = await response.json() as any;
    expect(payload.data).toMatchObject({ confirmed: false, editable: true, dictionary: { revision: 0, schemaVersion: 1 } });
    expect(payload.data.dictionary.variables[2].categories).toEqual([{ value: "10²", label: "10²" }, { value: "102", label: "102" }]);
    expect(JSON.stringify(payload)).not.toContain(path);
    expect(operations.some(o => o.kind === "update")).toBe(false);
    expect(await Bun.file(currentPath).text()).toBe(csv);
    const owned = operations.find(o => o.kind === "select")!;
    expect(new PgDialect().sqlToQuery(owned.where as SQL).params).toEqual([12, 9]);
    expect(owned.lockStrength).toBe("update");
});

test("PUT explicitly confirms metadata with a server-incremented revision, leaving sampling unchanged", async () => {
    const { routes, operations, suggestion } = await setup();
    const response = await routes.PUT!(req("PUT", suggestion));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { confirmed: true, dictionary: { revision: 1 } } });
    const update = operations.find(o => o.kind === "update")?.set as Record<string, unknown>;
    expect(Object.keys(update).sort()).toEqual(["updatedAt", "variableDictionary", "variableDictionaryRevision"]);
    expect(operations.some(o => o.kind === "execute")).toBe(true);
    expect(await Bun.file(currentPath).text()).toBe(csv);
});

test("analysis-only numeric conversion supports explicit missing codes without changing sampling roles", async () => {
    const { routes, suggestion, operations } = await setup();
    suggestion.variables[3] = { ...suggestion.variables[3]!, storageType: "number", measurementLevel: "continuous", categories: [], missingValues: ["N/A"], unit: "小时" };
    const response = await routes.PUT!(req("PUT", suggestion));
    expect(response.status).toBe(200);
    expect(operations.find(o => o.kind === "update")?.set).not.toHaveProperty("fieldMapping");
});

test("XLSX analysis-only numbers use native values, not rounded display labels", async () => {
    const sheet = XLSX.utils.aoa_to_sheet([["编号", " 金额 ", "类别", "辅助数值"], ["001", 10.25, "10²", 0.12345], ["002", 12, "102", 0.25]]);
    sheet.D2!.z = "0%"; sheet.D3!.z = "0%";
    const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, "data");
    const { routes, suggestion } = await setup({ source: XLSX.write(book, { type: "array", bookType: "xlsx" }), filename: "population.xlsx" });
    suggestion.variables[3] = { ...suggestion.variables[3]!, storageType: "number", measurementLevel: "nominal", categories: [{ value: 0.12345, label: "原始精度" }, { value: 0.25, label: "四分之一" }] };
    expect((await routes.PUT!(req("PUT", suggestion))).status).toBe(200);
});

for (const change of ["stale revision", "stale source", "trimmed field", "uncovered category", "missing numeric code"] as const) {
    test(`PUT rejects ${change} before metadata writes`, async () => {
        const { routes, suggestion, operations } = await setup();
        if (change === "stale revision") suggestion.revision = 5;
        if (change === "stale source") suggestion.datasetRevision = "f".repeat(64);
        if (change === "trimmed field") suggestion.variables[1]!.sourceField = "金额";
        if (change === "uncovered category") suggestion.variables[2]!.categories.pop();
        if (change === "missing numeric code") suggestion.variables[3] = { ...suggestion.variables[3]!, storageType: "number", measurementLevel: "continuous", categories: [] };
        const response = await routes.PUT!(req("PUT", suggestion));
        expect(response.status).toBe(change.startsWith("stale") ? 409 : 400);
        expect(operations.some(o => o.kind === "update")).toBe(false);
    });
}

for (const options of [{ row: null }, { row: { status: 1 } }, { assigned: true }] as const) {
    test(`ownership and frozen-template guard ${JSON.stringify(options)}`, async () => {
        const { routes, suggestion, operations } = await setup(options);
        const response = await routes.PUT!(req("PUT", suggestion));
        expect(response.status).toBe(options.row === null ? 404 : 403);
        expect(operations.some(o => o.kind === "update")).toBe(false);
    });
}

test("invalidated metadata retains its monotone revision without being implicitly confirmed", async () => {
    const { routes, suggestion, operations } = await setup({ row: { variableDictionaryRevision: 7 } });
    suggestion.revision = 7;
    const response = await routes.PUT!(req("PUT", suggestion));
    expect(response.status).toBe(200);
    expect(operations.find(o => o.kind === "update")?.set).toMatchObject({ variableDictionaryRevision: 8, variableDictionary: { revision: 8 } });
    const again = await setup({ row: { variableDictionaryRevision: 7 } });
    expect(await (await again.routes.GET!(req())).json()).toMatchObject({ data: { confirmed: false, dictionary: { revision: 7 } } });
});

test("revision exhaustion cannot persist an unreadable or unsafe next number", async () => {
    const { routes, suggestion, operations } = await setup({ row: { variableDictionaryRevision: Number.MAX_SAFE_INTEGER } });
    suggestion.revision = Number.MAX_SAFE_INTEGER;
    const response = await routes.PUT!(req("PUT", suggestion));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "VERSION_LIMIT" } });
    expect(operations.some(o => o.kind === "update")).toBe(false);
});

test("published legacy topics may be inspected without silently confirming metadata", async () => {
    const { routes, operations } = await setup({ row: { status: 1 } });
    const response = await routes.GET!(req());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { confirmed: false, editable: false } });
    expect(operations.some(o => o.kind === "update")).toBe(false);
});

test("saved dictionaries fail closed for source changes and unsupported storage versions", async () => {
    const base = await setup();
    for (const dictionary of [
        { ...base.suggestion, revision: 1, datasetRevision: "f".repeat(64) },
        { ...base.suggestion, revision: 1, schemaVersion: 99 },
        base.suggestion,
        "{broken",
    ]) {
        const { routes, operations } = await setup({ row: { variableDictionary: dictionary } });
        expect((await routes.GET!(req())).status).toBe(409);
        expect(operations.some(o => o.kind === "update")).toBe(false);
    }
});

test("missing payload and invalid route IDs cannot confirm a dictionary", async () => {
    const { routes, operations } = await setup();
    expect((await routes.PUT!(req("PUT"))).status).toBe(400);
    expect((await routes.GET!(req("GET", undefined, "0"))).status).toBe(400);
    expect(operations.some(o => o.kind === "update")).toBe(false);
});
