import { and, eq, isNotNull, isNull, or } from "drizzle-orm";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { db } from "../../db";
import { experiment, task, topic, topicAttachment } from "../../db/schema";
import { error, getRouteParam, getSearchParams } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";
import { requireAuth } from "./auth";

function toCsv(data: Record<string, unknown>[], extraHeaders: string[] = []) {
    if (data.length === 0) return "";
    const headerSet = new Set<string>();
    data.forEach((row) => Object.keys(row).forEach((key) => headerSet.add(key)));
    extraHeaders.forEach((h) => headerSet.add(h));
    const headers = Array.from(headerSet);

    const escape = (v: unknown) => {
        if (v === null || v === undefined) return "";
        const s = typeof v === "string" ? v : JSON.stringify(v);
        if (s.includes(",") || s.includes("\n") || s.includes('"')) {
            return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
    };
    const lines = [headers.join(",")];
    for (const row of data) {
        lines.push(headers.map((h) => escape(row[h])).join(","));
    }
    return lines.join("\n");
}

export function resolveAttachmentPath(filePath: string) {
    const baseDir = path.resolve(process.cwd(), "storage");
    const normalized = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
    const relativePath = normalized.startsWith("storage/") ? normalized.slice("storage/".length) : normalized;
    const fullPath = path.resolve(baseDir, relativePath);

    const isInsideStorage = fullPath === baseDir || fullPath.startsWith(`${baseDir}${path.sep}`);
    if (!isInsideStorage) {
        throw new Error("INVALID_PATH");
    }

    return fullPath;
}

function inferMimeTypeFromName(fileName: string) {
    const lower = fileName.toLowerCase();
    if (lower.endsWith(".png")) return "image/png";
    if (/\.(jpe?g)$/.test(lower)) return "image/jpeg";
    if (lower.endsWith(".gif")) return "image/gif";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".bmp")) return "image/bmp";
    if (lower.endsWith(".svg")) return "image/svg+xml";
    if (lower.endsWith(".mp4") || lower.endsWith(".m4v")) return "video/mp4";
    if (lower.endsWith(".webm")) return "video/webm";
    if (lower.endsWith(".ogg")) return "video/ogg";
    if (lower.endsWith(".mov")) return "video/quicktime";
    if (lower.endsWith(".pdf")) return "application/pdf";
    return "application/octet-stream";
}

function normalizeAttachmentMime(fileName: string, fileType: string) {
    const trimmed = fileType.trim().toLowerCase();
    if (!trimmed || trimmed === "unknown") {
        return inferMimeTypeFromName(fileName);
    }
    return trimmed;
}

function canInlinePreview(contentType: string) {
    return (
        contentType.startsWith("image/") ||
        contentType.startsWith("video/") ||
        contentType.startsWith("application/pdf")
    );
}

async function getTaskAccessError(taskId: number, classId: number): Promise<Response | null> {
    const [activeRow] = await db
        .select({ id: task.id })
        .from(task)
        .innerJoin(topic, eq(task.topicId, topic.id))
        .where(and(eq(task.id, taskId), eq(task.classId, classId), isNull(task.deletedAt), eq(topic.isDeleted, 0)));

    if (activeRow) return null;

    const [deletedRow] = await db
        .select({ id: task.id })
        .from(task)
        .innerJoin(topic, eq(task.topicId, topic.id))
        .where(
            and(
                eq(task.id, taskId),
                eq(task.classId, classId),
                or(isNotNull(task.deletedAt), eq(topic.isDeleted, 1), isNotNull(topic.deletedAt))
            )
        );

    if (deletedRow) {
        return error("课题已删除", "TOPIC_DELETED", 410);
    }

    return error("无权限访问该附件", "FORBIDDEN", 403);
}

const attachmentDownloadRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const attachmentId = Number.parseInt(getRouteParam(req, "id") ?? "", 10);
        if (!attachmentId) {
            return error("无效的附件ID", "INVALID_ID");
        }

        const [att] = await db
            .select({
                id: topicAttachment.id,
                topicId: topicAttachment.topicId,
                fileName: topicAttachment.fileName,
                filePath: topicAttachment.filePath,
                fileType: topicAttachment.fileType,
            })
            .from(topicAttachment)
            .where(eq(topicAttachment.id, attachmentId));

        if (!att) {
            return error("附件不存在", "NOT_FOUND", 404);
        }

        const [accessibleTask] = await db
            .select({ id: task.id })
            .from(task)
            .innerJoin(topic, eq(task.topicId, topic.id))
            .where(and(eq(task.classId, currentStudent.classId), eq(task.topicId, att.topicId), isNull(task.deletedAt), eq(topic.isDeleted, 0)))
            .limit(1);

        if (!accessibleTask) {
            const [deletedTask] = await db
                .select({ id: task.id })
                .from(task)
                .innerJoin(topic, eq(task.topicId, topic.id))
                .where(
                    and(
                        eq(task.classId, currentStudent.classId),
                        eq(task.topicId, att.topicId),
                        or(isNotNull(task.deletedAt), eq(topic.isDeleted, 1), isNotNull(topic.deletedAt))
                    )
                )
                .limit(1);

            if (deletedTask) {
                return error("课题已删除", "TOPIC_DELETED", 410);
            }
            return error("无权限访问该附件", "FORBIDDEN", 403);
        }

        let fullPath: string;
        try {
            fullPath = resolveAttachmentPath(att.filePath);
        } catch {
            return error("无效的文件路径", "INVALID_PATH", 400);
        }

        try {
            const fileBuffer = await fs.readFile(fullPath);
            const mode = getSearchParams(req).get("mode");
            const contentType = normalizeAttachmentMime(att.fileName, att.fileType ?? "");
            const isPreviewMode = mode === "preview" && canInlinePreview(contentType);

            return new Response(fileBuffer, {
                headers: {
                    "Content-Type": isPreviewMode ? contentType : "application/octet-stream",
                    "Content-Disposition": `${isPreviewMode ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(att.fileName)}`,
                },
            });
        } catch {
            return error("文件不存在", "NOT_FOUND", 404);
        }
    },
};

const exportRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const taskId = Number.parseInt(getRouteParam(req, "id") ?? "", 10);
        if (!taskId) return error("无效的任务ID", "INVALID_ID");

        const taskAccessError = await getTaskAccessError(taskId, currentStudent.classId);
        if (taskAccessError) return taskAccessError;

        const type = getSearchParams(req).get("type") ?? "all";

        const [exp] = await db
            .select({ samplingResults: experiment.samplingResults })
            .from(experiment)
            .where(and(eq(experiment.studentId, currentStudent.id), eq(experiment.taskId, taskId)));

        if (!exp?.samplingResults) {
            return error("暂无抽样结果", "NO_DATA", 404);
        }

        const results = exp.samplingResults as any;
        const simpleData = (results.simple?.data ?? []) as Record<string, unknown>[];
        const systematicData = (results.systematic?.data ?? []) as Record<string, unknown>[];
        const stratifiedData = (results.stratified?.data ?? []) as Record<string, unknown>[];

        let data: Record<string, unknown>[] = [];
        let filename = "sampling_results.csv";
        if (type === "simple") {
            data = simpleData;
            filename = "simple_sampling.csv";
        } else if (type === "systematic") {
            data = systematicData;
            filename = "systematic_sampling.csv";
        } else if (type === "stratified") {
            data = stratifiedData;
            filename = "stratified_sampling.csv";
        } else {
            data = [
                ...simpleData.map((row) => ({ __method: "simple", ...row })),
                ...systematicData.map((row) => ({ __method: "systematic", ...row })),
                ...stratifiedData.map((row) => ({ __method: "stratified", ...row })),
            ];
            filename = "all_sampling.csv";
        }

        if (data.length === 0) {
            return error("暂无可导出的数据", "NO_DATA", 404);
        }

        const csv = toCsv(data, type === "all" ? ["__method"] : []);
        return new Response(csv, {
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
            },
        });
    },
};

export { attachmentDownloadRoutes, exportRoutes };
