import { unlink } from "node:fs/promises";
import { expect, mock, test } from "bun:test";
import * as XLSX from "xlsx";
import { topic } from "../../db/schema";
import { createTeacherAuthModuleMock } from "../../test-utils/mock-auth-modules";
import { createMockDb } from "../../test-utils/mock-db";
import { buildDefaultSamplingPolicy } from "../../lib/sampling-policy";

function request(policy = buildDefaultSamplingPolicy()) {
    const value = new Request("https://example.com/api/teacher/topics/12/sampling-policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ samplingPolicy: policy }),
    });
    (value as Request & { params: Record<string, string> }).params = { id: "12" };
    return value;
}

test("draft experiment template saves a validated sampling policy", async () => {
    const filePath = `/storage/uploads/sampling-policy-${crypto.randomUUID()}.xlsx`;
    const absolutePath = `${process.cwd()}${filePath}`;
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
        { id: 1, group: "A", target: 10, size: 2 },
        { id: 2, group: "B", target: 20, size: 4 },
    ]), "总体数据");
    await Bun.write(absolutePath, XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));

    const policy = buildDefaultSamplingPolicy();
    policy.methods.pps = "required";
    const routeTopic = { id: 12, status: 0, hasTasks: false };
    const { db, operations } = createMockDb({ select: [
        [routeTopic],
        [{ status: 0, excelFilePath: filePath, fieldMapping: { identifier: "id", stratified: ["group"], numeric: ["target", "size"], analysisTarget: { kind: "mean", field: "target" } } }],
        [],
    ] });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => createTeacherAuthModuleMock());

    try {
        const module = await import(`./topic-task.ts?sampling-policy=${crypto.randomUUID()}`);
        const response = await module.topicSamplingPolicyRoutes.PUT!(request(policy));
        expect(response.status).toBe(200);
        const update = operations.find((operation) => operation.kind === "update" && operation.table === topic);
        expect(update?.set).toMatchObject({ samplingPolicy: policy, updatedAt: expect.any(Date) });
    } finally {
        await unlink(absolutePath).catch(() => undefined);
    }
});

test("sampling policy requires stratified sampling to be disabled without strata", async () => {
    const filePath = `/storage/uploads/sampling-policy-no-strata-${crypto.randomUUID()}.xlsx`;
    const absolutePath = `${process.cwd()}${filePath}`;
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
        { id: 1, target: 10 },
        { id: 2, target: 20 },
    ]), "总体数据");
    await Bun.write(absolutePath, XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));

    const policy = buildDefaultSamplingPolicy({ ppsEnabled: false });
    const { db, operations } = createMockDb({ select: [
        [{ id: 12, status: 0, hasTasks: false }],
        [{ status: 0, excelFilePath: filePath, fieldMapping: { identifier: "id", stratified: [], numeric: ["target"], analysisTarget: { kind: "mean", field: "target" } } }],
        [],
    ] });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => createTeacherAuthModuleMock());

    try {
        const module = await import(`./topic-task.ts?sampling-policy-no-strata=${crypto.randomUUID()}`);
        const response = await module.topicSamplingPolicyRoutes.PUT!(request(policy));
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({
            error: { message: "当前研究没有分层变量，请将分层抽样设为不适用" },
        });
        expect(operations.some((operation) => operation.kind === "update")).toBeFalse();
    } finally {
        await unlink(absolutePath).catch(() => undefined);
    }
});

test("published experiment template sampling policy is immutable", async () => {
    const { db, operations } = createMockDb({ select: [[{ id: 12, status: 1, hasTasks: false }]] });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => createTeacherAuthModuleMock());
    const module = await import(`./topic-task.ts?sampling-policy-locked=${crypto.randomUUID()}`);
    const response = await module.topicSamplingPolicyRoutes.PUT!(request());
    expect(response.status).toBe(403);
    expect(operations.some((operation) => operation.kind === "update")).toBeFalse();
});
