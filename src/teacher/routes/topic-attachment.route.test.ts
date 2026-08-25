import { unlink } from "node:fs/promises";
import { expect, mock, test } from "bun:test";
import { createTeacherAuthModuleMock } from "../../test-utils/mock-auth-modules";
import { createMockDb } from "../../test-utils/mock-db";

function withRouteParams(request: Request, params: Record<string, string>) {
    (request as Request & { params?: Record<string, string> }).params = params;
    return request;
}

async function loadTopicRoutes(options: {
    select?: unknown[];
    insert?: unknown[];
    delete?: unknown[];
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

test("topic attachment upload stores metadata and writes the file under storage", async () => {
    const { module, operations } = await loadTopicRoutes({
        select: [
            [{ id: 12, status: 0 }],
            [{ count: 0 }],
        ],
        insert: [[{ id: 18 }]],
    });

    const form = new FormData();
    form.append("file", new File(["%PDF-1.7\nattachment body"], "guide.pdf", {
        type: "video/mp4",
    }));

    const request = withRouteParams(new Request("https://example.com/api/teacher/topics/12/attachments", {
        method: "POST",
        body: form,
    }), { id: "12" });

    const response = await module.topicAttachmentRoutes.POST!(request);
    const payload = await response.json() as any;
    const absolutePath = `${process.cwd()}${payload.data.filePath}`;

    try {
        expect(response.status).toBe(200);
        expect(payload).toEqual({
            success: true,
            data: {
                id: 18,
                filePath: expect.stringContaining("/storage/uploads/"),
            },
        });

        const insertOperation = operations.find((operation) => operation.kind === "insert");
        expect(insertOperation?.values).toMatchObject({
            topicId: 12,
            fileName: "guide.pdf",
            fileType: "application/pdf",
        });
        expect(operations.some((operation) => operation.kind === "execute")).toBe(true);

        expect(await Bun.file(absolutePath).text()).toBe("%PDF-1.7\nattachment body");
    } finally {
        await unlink(absolutePath).catch(() => undefined);
    }
});

test("topic attachment upload rejects content that does not match an allowed extension", async () => {
    const { module, operations } = await loadTopicRoutes({
        select: [[{ id: 12, status: 0 }]],
    });

    const form = new FormData();
    form.append("file", new File(["<svg><script>alert(1)</script></svg>"], "spoofed.png", {
        type: "image/svg+xml",
    }));

    const request = withRouteParams(new Request("https://example.com/api/teacher/topics/12/attachments", {
        method: "POST",
        body: form,
    }), { id: "12" });

    const response = await module.topicAttachmentRoutes.POST!(request);
    const payload = await response.json() as any;

    expect(response.status).toBe(400);
    expect(payload.error).toEqual({
        code: "INVALID_FILE",
        message: "文件内容与扩展名不匹配",
    });
    expect(operations.filter((operation) => operation.kind === "insert")).toHaveLength(0);
});

test("topic attachment upload rejects an unknown extension spoofed as video", async () => {
    const { module, operations } = await loadTopicRoutes({
        select: [
            [{ id: 12, status: 0 }],
            [{ count: 0 }],
        ],
    });

    const form = new FormData();
    form.append("file", new File(["binary"], "archive.zip", {
        type: "video/mp4",
    }));

    const request = withRouteParams(new Request("https://example.com/api/teacher/topics/12/attachments", {
        method: "POST",
        body: form,
    }), { id: "12" });

    const response = await module.topicAttachmentRoutes.POST!(request);
    const payload = await response.json() as any;

    expect(response.status).toBe(400);
    expect(payload).toEqual({
        success: false,
        error: {
            code: "VALIDATION_ERROR",
            message: "不支持的文件类型",
        },
    });
    expect(operations.filter((operation) => operation.kind === "insert")).toHaveLength(0);
});

test("topic attachment delete removes the attachment after ownership check", async () => {
    const testId = crypto.randomUUID().slice(0, 8);
    const filePath = `/storage/uploads/delete-attachment-test-${testId}.pdf`;
    const absolutePath = `${process.cwd()}${filePath}`;
    await Bun.write(absolutePath, "delete me");

    const { module, operations } = await loadTopicRoutes({
        select: [
            [{ id: 12, status: 0 }],
            [{ filePath }],
            [{ count: 0 }],
        ],
    });

    const request = withRouteParams(new Request("https://example.com/api/teacher/topics/12/attachments/3", {
        method: "DELETE",
    }), { id: "12", attachmentId: "3" });

    const response = await module.topicAttachmentDeleteRoutes.DELETE!(request);
    const payload = await response.json() as any;

    try {
        expect(response.status).toBe(200);
        expect(payload).toEqual({ success: true, data: { success: true } });
        expect(operations.filter((operation) => operation.kind === "delete")).toHaveLength(1);
        expect(await Bun.file(absolutePath).exists()).toBe(false);
    } finally {
        await unlink(absolutePath).catch(() => undefined);
    }
});

test("topic attachment delete returns 404 when the topic does not belong to the teacher", async () => {
    const { module, operations } = await loadTopicRoutes({
        select: [[]],
    });

    const request = withRouteParams(new Request("https://example.com/api/teacher/topics/12/attachments/3", {
        method: "DELETE",
    }), { id: "12", attachmentId: "3" });

    const response = await module.topicAttachmentDeleteRoutes.DELETE!(request);
    const payload = await response.json() as any;

    expect(response.status).toBe(404);
    expect(payload).toEqual({
        success: false,
        error: {
            code: "NOT_FOUND",
            message: "课题不存在",
        },
    });
    expect(operations.filter((operation) => operation.kind === "delete")).toHaveLength(0);
});
