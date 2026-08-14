import { unlink } from "node:fs/promises";
import { expect, mock, test } from "bun:test";
import * as XLSX from "xlsx";
import { createTeacherAuthModuleMock } from "../../test-utils/mock-auth-modules";
import { createMockDb } from "../../test-utils/mock-db";

function withRouteParam(request: Request, id: string) {
    (request as Request & { params?: Record<string, string> }).params = { id };
    return request;
}

function buildWorkbookBuffer(rows: unknown[][]) {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
    return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

async function loadTopicRoutes(options: {
    select?: unknown[];
    update?: unknown[];
    teacherId?: number;
} = {}) {
    const { db, operations } = createMockDb(options);

    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => createTeacherAuthModuleMock({
        getPrimaryTeacherIdOrThrow: () => options.teacherId ?? 9,
    }));

    const module = await import("./topic-task");
    return { module, operations };
}

test("topic excel upload stores parsed metadata and writes workbook to storage", async () => {
    const previousFilePath = `/storage/uploads/previous-topic-${crypto.randomUUID()}.xlsx`;
    const previousAbsolutePath = `${process.cwd()}${previousFilePath}`;
    await Bun.write(previousAbsolutePath, "old workbook");
    const { module, operations } = await loadTopicRoutes({
        select: [[{ id: 12, status: 0, excelFilePath: previousFilePath }]],
    });

    const buffer = buildWorkbookBuffer([
        ["name", "score"],
        ["Alice", 95],
        ["Bob", 88],
    ]);

    const form = new FormData();
    form.append("file", new File([buffer], "population.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }));

    const request = withRouteParam(new Request("https://example.com/api/teacher/topics/12/excel", {
        method: "POST",
        body: form,
    }), "12");

    const response = await module.topicExcelUploadRoutes.POST!(request);
    const payload = await response.json() as any;
    const absolutePath = `${process.cwd()}${payload.data.filePath}`;

    try {
        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(payload.data).toMatchObject({
            rowCount: 2,
            colCount: 2,
            columns: ["name", "score"],
        });

        const updateOperation = operations.find((operation) => operation.kind === "update");
        expect(updateOperation?.set).toMatchObject({
            excelFilePath: expect.stringContaining("/storage/uploads/"),
            excelRowCount: 2,
            fieldMapping: null,
            updatedAt: expect.any(Date),
        });
        expect(operations.some((operation) => operation.kind === "execute")).toBe(true);

        const writtenText = await Bun.file(absolutePath).text();
        expect(writtenText.length).toBeGreaterThan(0);
        expect(await Bun.file(previousAbsolutePath).exists()).toBe(false);
    } finally {
        await unlink(absolutePath).catch(() => undefined);
        await unlink(previousAbsolutePath).catch(() => undefined);
    }
});

test("topic excel upload rejects workbooks with fewer than two columns", async () => {
    const { module, operations } = await loadTopicRoutes({
        select: [[{ id: 12, status: 0 }]],
    });

    const buffer = buildWorkbookBuffer([
        ["name"],
        ["Alice"],
    ]);

    const form = new FormData();
    form.append("file", new File([buffer], "invalid.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }));

    const request = withRouteParam(new Request("https://example.com/api/teacher/topics/12/excel", {
        method: "POST",
        body: form,
    }), "12");

    const response = await module.topicExcelUploadRoutes.POST!(request);
    const payload = await response.json() as any;

    expect(response.status).toBe(400);
    expect(payload).toEqual({
        success: false,
        error: {
            code: "VALIDATION_ERROR",
            message: "数据列数需在2-50之间",
        },
    });
    expect(operations.filter((operation) => operation.kind === "update")).toHaveLength(0);
});

test("topic excel upload rejects unsupported spreadsheet extensions before parsing", async () => {
    const { module, operations } = await loadTopicRoutes({
        select: [[{ id: 12, status: 0 }]],
    });
    const form = new FormData();
    form.append("file", new File(["not a workbook"], "population.xls", { type: "application/vnd.ms-excel" }));
    const request = withRouteParam(new Request("https://example.com/api/teacher/topics/12/excel", {
        method: "POST",
        body: form,
    }), "12");

    const response = await module.topicExcelUploadRoutes.POST!(request);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_FILE" } });
    expect(operations.some((operation) => operation.kind === "update")).toBe(false);
});

test("topic excel upload preserves Chinese text for utf-8 csv files", async () => {
    const { module } = await loadTopicRoutes({
        select: [[{ id: 12, status: 0 }]],
    });

    const csvContent = "行业名称,公司名称,销售数量\n电子行业,测试科技,1200\n";
    const form = new FormData();
    form.append("file", new File([csvContent], "population.csv", {
        type: "text/csv",
    }));

    const request = withRouteParam(new Request("https://example.com/api/teacher/topics/12/excel", {
        method: "POST",
        body: form,
    }), "12");

    const response = await module.topicExcelUploadRoutes.POST!(request);
    const payload = await response.json() as any;
    const absolutePath = `${process.cwd()}${payload.data.filePath}`;

    try {
        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(payload.data.columns).toEqual(["行业名称", "公司名称", "销售数量"]);
        expect(payload.data.preview[0]).toEqual({
            行业名称: "电子行业",
            公司名称: "测试科技",
            销售数量: 1200,
        });
    } finally {
        await unlink(absolutePath).catch(() => undefined);
    }
});
