import { unlink } from "node:fs/promises";
import { expect, mock, test } from "bun:test";
import { createStudentAuthModuleMock } from "../../test-utils/mock-auth-modules";
import { createMockDb } from "../../test-utils/mock-db";

function createRequest(url: string) {
    return new Request(url, { method: "GET" });
}

function withRouteParam(request: Request, id: string) {
    (request as Request & { params?: Record<string, string> }).params = { id };
    return request;
}

async function loadFilesRoutes(options: {
    select?: unknown[];
    authStudent?: Record<string, unknown>;
} = {}) {
    const { db } = createMockDb(options);

    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => createStudentAuthModuleMock({
        requireAuth: async () => ({
            student: {
                id: 11,
                classId: 7,
                name: "Alice",
                studentId: "20230001",
                status: 1,
                ...options.authStudent,
            },
            error: null,
            sessionExpiresAt: null,
        }),
    }));
    mock.module("../experiment/task-access", () => ({
        getStudentTaskAccessError: async () => null,
        getStudentTopicAttachmentAccessError: async () => null,
    }));

    const module = await import(`./files?student-files-route-test=${Math.random()}`);
    return module;
}

test("attachment preview ignores a spoofed stored MIME and derives it from the filename", async () => {
    const filePath = `/storage/uploads/attachment-mime-${crypto.randomUUID()}.png`;
    const absolutePath = `${process.cwd()}${filePath}`;
    await Bun.write(absolutePath, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

    try {
        const module = await loadFilesRoutes({
            select: [[{
                id: 8,
                topicId: 4,
                fileName: "preview.png",
                filePath,
                fileType: "image/svg+xml",
            }]],
        });
        const response = await module.attachmentDownloadRoutes.GET!(withRouteParam(
            createRequest("https://example.com/api/student/attachments/8/download?mode=preview"),
            "8",
        ));

        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toBe("image/png");
        expect(response.headers.get("Content-Disposition")).toStartWith("inline;");
    } finally {
        await unlink(absolutePath).catch(() => undefined);
    }
});

test("export route hydrates compact sampling indices from the immutable population file", async () => {
    const populationPath = `/storage/compact-export-${crypto.randomUUID()}.csv`;
    const absolutePath = `${process.cwd()}${populationPath}`;
    await Bun.write(absolutePath, "id,city\n1,北京\n2,上海\n");

    try {
        const module = await loadFilesRoutes({
            select: [[{
                excelFilePath: populationPath,
                samplingResults: { simple: { completed: true, sampleCount: 1, indices: [1] } },
            }]],
        });
        const response = await module.exportRoutes.GET!(withRouteParam(
            createRequest("https://example.com/api/student/tasks/40/export?type=simple"),
            "40",
        ));
        expect(response.status).toBe(200);
        expect(await response.text()).toContain("上海");
    } finally {
        await unlink(absolutePath).catch(() => undefined);
    }
});

test("compact export returns READ_FAILED when population storage is missing", async () => {
    const module = await loadFilesRoutes({
        select: [[{
            excelFilePath: `/storage/missing-${crypto.randomUUID()}.csv`,
            samplingResults: { simple: { completed: true, sampleCount: 1, indices: [0] } },
        }]],
    });
    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
        const response = await module.exportRoutes.GET!(withRouteParam(
            createRequest("https://example.com/api/student/tasks/40/export?type=simple"),
            "40",
        ));
        expect(response.status).toBe(500);
        expect(await response.json()).toMatchObject({ error: { code: "READ_FAILED" } });
    } finally {
        console.error = originalConsoleError;
    }
});

test("export route reads native indices and restores all CSV rows from the source", async () => {
    const { resolveStoragePath } = await import("../../server/storage-files");
    const filename = `/storage/native-export-${crypto.randomUUID()}.csv`;
    const absolutePath = resolveStoragePath(filename)!;
    await Bun.write(absolutePath, "id,city,group\n001,北京,a\n002,上海,a\n003,广州,b\n");
    try {
    const module = await loadFilesRoutes({
        select: [[{
            excelFilePath: filename, fieldMapping: { identifier: "id", numeric: [], others: ["city"], stratified: ["group"] },
            samplingResults: {
                simple: { completed: true, sampleCount: 1, indices: [0] },
                systematic: { completed: true, sampleCount: 1, indices: [1] },
                stratified: { completed: true, sampleCount: 2, indices: [1, 2], stratifyBy: "group", layers: [{ name: "a", count: 2, sampleCount: 1 }, { name: "b", count: 1, sampleCount: 1 }] },
            },
        }]],
    });

    const request = withRouteParam(
        createRequest("https://example.com/api/student/tasks/40/export?type=all"),
        "40"
    );

    const response = await module.exportRoutes.GET!(request);
    expect([...new Uint8Array(await response.clone().arrayBuffer()).slice(0, 3)]).toEqual([239, 187, 191]);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    expect(response.headers.get("Content-Disposition")).toContain("all_sampling.csv");
    expect(body).toContain("__wj_method");
    expect(body).toContain("simple");
    expect(body).toContain("systematic");
    expect(body).toContain("stratified");
    expect(body).toContain("北京");
    expect(body).toContain("上海");
    expect(body).toContain("广州");
    expect(body).toContain("001");
    } finally { await unlink(absolutePath); }
});

test("CSV export rejects string-shaped storage instead of interpreting it", async () => {
    const module = await loadFilesRoutes({ select: [[{ samplingResults: '{"simple":{"data":[{"secret":"must-not-leak"}]}}' }]] });
    await expect(module.exportRoutes.GET!(withRouteParam(createRequest("https://example.com/api/student/tasks/40/export"), "40"))).rejects.toThrow("JSONB 存储格式无效");
});
