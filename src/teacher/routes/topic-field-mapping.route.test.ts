import { unlink } from "node:fs/promises";
import { expect, mock, test } from "bun:test";
import * as XLSX from "xlsx";
import { createTeacherAuthModuleMock } from "../../test-utils/mock-auth-modules";
import { createMockDb } from "../../test-utils/mock-db";

function withRouteParam(request: Request, id: string) {
    (request as Request & { params?: Record<string, string> }).params = { id };
    return request;
}

test("field mapping rejects columns left over from a replaced workbook", async () => {
    const filePath = `/storage/uploads/mapping-current-${crypto.randomUUID()}.xlsx`;
    const absolutePath = `${process.cwd()}${filePath}`;
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
        { 样本ID: "V1", 年级: "大一", 每周学习时长: 8 },
        { 样本ID: "V2", 年级: "大二", 每周学习时长: "" },
    ]), "总体数据");
    await Bun.write(absolutePath, XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));

    const routeTopic = { id: 12, status: 0, excelFilePath: filePath, hasTasks: false };
    const { db, operations } = createMockDb({
        select: [
            [routeTopic],
            [{ status: 0, excelFilePath: filePath }],
            [],
            [routeTopic],
            [{ status: 0, excelFilePath: filePath }],
            [],
        ],
    });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => createTeacherAuthModuleMock());

    try {
        const module = await import("./topic-task");
        const request = withRouteParam(new Request("https://example.com/api/teacher/topics/12/mapping", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                fieldMapping: {
                    identifier: "样本ID",
                    stratified: ["小组"],
                    numeric: ["数值指标"],
                    others: [],
                },
            }),
        }), "12");

        const response = await module.topicFieldMappingRoutes.PUT!(request);
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({
            success: false,
            error: {
                code: "VALIDATION_ERROR",
                message: "字段映射包含当前总体数据中不存在的列：小组、数值指标",
            },
        });
        expect(operations.filter((operation) => operation.kind === "update")).toHaveLength(0);

        const incompleteNumericRequest = withRouteParam(new Request("https://example.com/api/teacher/topics/12/mapping", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                fieldMapping: {
                    identifier: "样本ID",
                    stratified: ["年级"],
                    numeric: ["每周学习时长"],
                    others: [],
                },
            }),
        }), "12");
        const incompleteNumericResponse = await module.topicFieldMappingRoutes.PUT!(incompleteNumericRequest);
        expect(incompleteNumericResponse.status).toBe(400);
        expect(await incompleteNumericResponse.json()).toEqual({
            success: false,
            error: {
                code: "VALIDATION_ERROR",
                message: "数值变量 每周学习时长 在数据第2行存在空值或非数值",
            },
        });
        expect(operations.filter((operation) => operation.kind === "update")).toHaveLength(0);
    } finally {
        await unlink(absolutePath).catch(() => undefined);
    }
});
