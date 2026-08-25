import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { experiment, topicAttachment } from "../../db/schema";
import { error, getRouteParam, getSearchParams } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";
import { resolveStoragePath } from "../../server/storage-files";
import { getStudentTaskAccessError, getStudentTopicAttachmentAccessError } from "../experiment/task-access";
import { parseStoredJson } from "../experiment/serialization";
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
    return resolveStoragePath(filePath);
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

function normalizeAttachmentMime(fileName: string, _fileType: string) {
    // Never trust the client-supplied MIME stored by older rows. Preview MIME
    // is derived from the server allowlisted filename extension.
    return inferMimeTypeFromName(fileName);
}

function canInlinePreview(contentType: string) {
    return (
        contentType.startsWith("image/") ||
        contentType.startsWith("video/") ||
        contentType.startsWith("application/pdf")
    );
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

        const attachmentAccessError = await getStudentTopicAttachmentAccessError(att.topicId, currentStudent.classId);
        if (attachmentAccessError) return attachmentAccessError;

        let fullPath: string;
        try {
            fullPath = resolveAttachmentPath(att.filePath);
        } catch {
            return error("无效的文件路径", "INVALID_PATH", 400);
        }

        try {
            const file = Bun.file(fullPath);
            if (!(await file.exists())) {
                return error("文件不存在", "NOT_FOUND", 404);
            }
            const fileBuffer = await file.arrayBuffer();
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

interface SamplingResultSection {
    data?: Record<string, unknown>[];
}

interface SamplingResultsExportData {
    simple?: SamplingResultSection;
    systematic?: SamplingResultSection;
    pps?: SamplingResultSection;
    stratified?: SamplingResultSection;
}

const exportRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const taskId = Number.parseInt(getRouteParam(req, "id") ?? "", 10);
        if (!taskId) return error("无效的任务ID", "INVALID_ID");

        const taskAccessError = await getStudentTaskAccessError(taskId, currentStudent.classId);
        if (taskAccessError) return taskAccessError;

        const type = getSearchParams(req).get("type") ?? "all";
        const ALLOWED_EXPORT_TYPES = ["simple", "systematic", "pps", "stratified", "all"];
        if (!ALLOWED_EXPORT_TYPES.includes(type)) {
            return error("无效的导出类型", "VALIDATION_ERROR", 400);
        }

        const [exp] = await db
            .select({ samplingResults: experiment.samplingResults })
            .from(experiment)
            .where(and(eq(experiment.studentId, currentStudent.id), eq(experiment.taskId, taskId)));

        if (!exp?.samplingResults) {
            return error("暂无抽样结果", "NO_DATA", 404);
        }

        const results = parseStoredJson<SamplingResultsExportData>(exp.samplingResults);
        if (!results) {
            return error("暂无抽样结果", "NO_DATA", 404);
        }

        const simpleData = (results.simple?.data ?? []) as Record<string, unknown>[];
        const systematicData = (results.systematic?.data ?? []) as Record<string, unknown>[];
        const ppsData = (results.pps?.data ?? []) as Record<string, unknown>[];
        const stratifiedData = (results.stratified?.data ?? []) as Record<string, unknown>[];

        let data: Record<string, unknown>[] = [];
        let filename = "sampling_results.csv";
        if (type === "simple") {
            data = simpleData;
            filename = "simple_sampling.csv";
        } else if (type === "systematic") {
            data = systematicData;
            filename = "systematic_sampling.csv";
        } else if (type === "pps") {
            data = ppsData;
            filename = "pps_sampling.csv";
        } else if (type === "stratified") {
            data = stratifiedData;
            filename = "stratified_sampling.csv";
        } else {
            data = [
                ...simpleData.map((row) => ({ __method: "simple", ...row })),
                ...systematicData.map((row) => ({ __method: "systematic", ...row })),
                ...ppsData.map((row) => ({ __method: "pps", ...row })),
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
