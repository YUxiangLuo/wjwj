import { and, eq } from "drizzle-orm";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { db } from "../../db";
import { experiment, topicAttachment } from "../../db/schema";
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

const attachmentDownloadRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;

        const attachmentId = Number.parseInt(getRouteParam(req, "id") ?? "", 10);
        if (!attachmentId) {
            return error("无效的附件ID", "INVALID_ID");
        }

        const [att] = await db.select().from(topicAttachment).where(eq(topicAttachment.id, attachmentId));

        if (!att) {
            return error("附件不存在", "NOT_FOUND", 404);
        }

        let fullPath: string;
        try {
            fullPath = resolveAttachmentPath(att.filePath);
        } catch {
            return error("无效的文件路径", "INVALID_PATH", 400);
        }

        try {
            const fileBuffer = await fs.readFile(fullPath);
            return new Response(fileBuffer, {
                headers: {
                    "Content-Type": "application/octet-stream",
                    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(att.fileName)}`,
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
