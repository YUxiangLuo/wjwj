import { createWriteStream } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import PDFDocument from "pdfkit";
import * as XLSX from "xlsx";
import { db } from "../../db";
import { class_, experiment, notification, submission, task, topic } from "../../db/schema";
import { error, json, parseBody } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";
import { getConfigNumber, requireAuth } from "./auth";

const ExperimentStatus = {
    IN_PROGRESS: 0,
    SUBMITTED: 1,
    GRADED: 2,
    REJECTED: 3,
} as const;

function getZValue(p: number): number {
    if (p >= 0.99) return 2.576;
    if (p >= 0.95) return 1.96;
    if (p >= 0.90) return 1.645;
    return 1.96;
}

function getPathParam(req: Request, position: number): string {
    const url = new URL(req.url);
    const parts = url.pathname.split("/");
    return parts[parts.length - position] ?? "";
}

async function notifyUser(
    receiverType: number,
    receiverId: number,
    payload: { type: string; title: string; content: string; relatedType?: string; relatedId?: number }
) {
    await db.insert(notification).values({
        receiverType,
        receiverId,
        type: payload.type,
        title: payload.title,
        content: payload.content,
        relatedType: payload.relatedType,
        relatedId: payload.relatedId,
    });
}

async function readPopulationData(filePath: string): Promise<any[]> {
    const fullPath = path.join(process.cwd(), filePath);
    try {
        const fileBuffer = await fs.readFile(fullPath);
        const workbook = XLSX.read(fileBuffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) return [];
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) return [];
        return XLSX.utils.sheet_to_json(sheet);
    } catch (e) {
        console.error("Failed to read excel:", e);
        return [];
    }
}

async function writePdf(filePath: string, build: (doc: InstanceType<typeof PDFDocument>) => void) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    return new Promise<void>((resolve, reject) => {
        const doc = new PDFDocument({ size: "A4", margin: 50 });
        const stream = createWriteStream(filePath);

        doc.pipe(stream);
        try {
            build(doc);
            doc.end();
        } catch (err) {
            doc.end();
            reject(err);
        }

        stream.on("finish", () => resolve());
        stream.on("error", (err) => reject(err));
        doc.on("error", (err) => reject(err));
    });
}

function formatQuestionType(type: string) {
    switch (type) {
        case "boolean":
            return "判断题";
        case "single":
            return "单选题";
        case "multiple":
            return "多选题";
        case "scale":
            return "量表题";
        default:
            return "题目";
    }
}

async function generateQuestionnairePdf(params: {
    outputPath: string;
    title: string;
    welcomeText: string;
    endingText: string;
    questions: Array<any>;
    meta: { topicName: string; studentName: string; submittedAt: Date };
}) {
    await writePdf(params.outputPath, (doc) => {
        doc.fontSize(18).text("问卷设计", { align: "center" });
        doc.moveDown(0.5);
        doc.fontSize(12).text(`课题：${params.meta.topicName}`);
        doc.text(`学生：${params.meta.studentName}`);
        doc.text(`提交时间：${params.meta.submittedAt.toLocaleString("zh-CN")}`);
        doc.moveDown();

        doc.fontSize(16).text(params.title || "未命名问卷");
        doc.moveDown(0.5);
        doc.fontSize(12).text(params.welcomeText || "");
        doc.moveDown();

        params.questions.forEach((q, index) => {
            doc.fontSize(12).text(`Q${index + 1}. [${formatQuestionType(q.type)}] ${q.content}`);
            if (q.type === "boolean") {
                doc.text("选项：是 / 否", { indent: 16 });
            }
            if ((q.type === "single" || q.type === "multiple") && Array.isArray(q.options)) {
                q.options.forEach((opt: string, idx: number) => {
                    const label = String.fromCharCode(65 + idx);
                    doc.text(`${label}. ${opt}`, { indent: 16 });
                });
            }
            if (q.type === "scale") {
                doc.text(`量表范围：${q.scaleMin ?? 1} - ${q.scaleMax ?? 10}`, { indent: 16 });
            }
            doc.moveDown(0.5);
        });

        doc.moveDown();
        doc.fontSize(12).text(params.endingText || "");
    });
}

async function generateReportPdf(params: {
    outputPath: string;
    reportContent: string;
    meta: { topicName: string; studentName: string; submittedAt: Date };
}) {
    await writePdf(params.outputPath, (doc) => {
        doc.fontSize(18).text("实验报告", { align: "center" });
        doc.moveDown(0.5);
        doc.fontSize(12).text(`课题：${params.meta.topicName}`);
        doc.text(`学生：${params.meta.studentName}`);
        doc.text(`提交时间：${params.meta.submittedAt.toLocaleString("zh-CN")}`);
        doc.moveDown();

        doc.fontSize(12).text(params.reportContent || "");
    });
}

function schedulePdfGeneration(params: {
    submissionId: number;
    taskId: number;
    teacherId: number | null;
    studentId: number;
    studentName: string;
    topicName: string;
    questionnaire: any | null;
    reportContent: string;
}) {
    const maxAttempts = 3;
    const baseDelayMs = 2000;

    const attempt = async (count: number) => {
        try {
            const outputDir = path.join(process.cwd(), "storage", "uploads", "submissions");
            const baseName = `submission-${params.submissionId}`;
            const questionnairePath = path.join(outputDir, `${baseName}-questionnaire.pdf`);
            const reportPath = path.join(outputDir, `${baseName}-report.pdf`);

            let questionnairePdfPath: string | null = null;
            let reportPdfPath: string | null = null;

            if (params.questionnaire) {
                await generateQuestionnairePdf({
                    outputPath: questionnairePath,
                    title: params.questionnaire.title ?? "",
                    welcomeText: params.questionnaire.welcomeText ?? "",
                    endingText: params.questionnaire.endingText ?? "",
                    questions: params.questionnaire.questions ?? [],
                    meta: {
                        topicName: params.topicName,
                        studentName: params.studentName,
                        submittedAt: new Date(),
                    },
                });
                questionnairePdfPath = `/storage/uploads/submissions/${baseName}-questionnaire.pdf`;
            }

            if (params.reportContent) {
                await generateReportPdf({
                    outputPath: reportPath,
                    reportContent: params.reportContent,
                    meta: {
                        topicName: params.topicName,
                        studentName: params.studentName,
                        submittedAt: new Date(),
                    },
                });
                reportPdfPath = `/storage/uploads/submissions/${baseName}-report.pdf`;
            }

            await db.update(submission).set({
                questionnairePdfPath,
                reportPdfPath,
            }).where(eq(submission.id, params.submissionId));
        } catch (err) {
            if (count < maxAttempts) {
                setTimeout(() => {
                    attempt(count + 1).catch(() => undefined);
                }, baseDelayMs * count);
                return;
            }

            const message = "提交的PDF生成失败，请稍后重试或联系教师。";
            await notifyUser(4, params.studentId, {
                type: "PDF_FAILED",
                title: "PDF生成失败",
                content: message,
                relatedType: "submission",
                relatedId: params.submissionId,
            });

            if (params.teacherId) {
                await notifyUser(2, params.teacherId, {
                    type: "PDF_FAILED",
                    title: "PDF生成失败",
                    content: `学生提交的PDF生成失败，提交ID：${params.submissionId}`,
                    relatedType: "submission",
                    relatedId: params.submissionId,
                });
            }

            console.error("Failed to generate submission PDFs:", err);
        }
    };

    setTimeout(() => {
        attempt(1).catch(() => undefined);
    }, 0);
}

async function performSimpleSampling(data: any[], n: number, seed?: number): Promise<any[]> {
    const indices = Array.from({ length: data.length }, (_, i) => i);

    for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = indices[i]!;
        indices[i] = indices[j]!;
        indices[j] = temp;
    }

    const selectedIndices = indices.slice(0, n);
    return selectedIndices.map((i) => data[i]);
}

async function performSystematicSampling(data: any[], k: number, n: number): Promise<any[]> {
    const start = Math.floor(Math.random() * k);
    const result = [];

    for (let i = start; i < data.length; i += k) {
        result.push(data[i]);
    }

    return result;
}

async function performStratifiedSampling(data: any[], stratifyBy: string, layers: any[]): Promise<any[]> {
    const result: any[] = [];
    const groups: Record<string, any[]> = {};
    for (const item of data) {
        const val = String(item[stratifyBy]);
        if (!groups[val]) groups[val] = [];
        groups[val].push(item);
    }

    for (const layer of layers) {
        const groupData = groups[layer.name] || [];
        const sampleCount = layer.sampleCount;

        if (sampleCount > 0 && groupData.length > 0) {
            const sampled = await performSimpleSampling(groupData, sampleCount);
            result.push(...sampled);
        }
    }

    return result;
}

const experimentRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const taskId = parseInt(getPathParam(req, 2));
        if (!taskId) {
            return error("无效的任务ID", "INVALID_ID");
        }

        const [taskInfo] = await db
            .select({ id: task.id, topicId: task.topicId })
            .from(task)
            .where(and(eq(task.id, taskId), eq(task.classId, currentStudent.classId), isNull(task.deletedAt)));

        if (!taskInfo) {
            return error("任务不存在", "NOT_FOUND", 404);
        }

        let [exp] = await db
            .select()
            .from(experiment)
            .where(and(eq(experiment.studentId, currentStudent.id), eq(experiment.taskId, taskId)));

        if (!exp) {
            try {
                const [result] = await db.insert(experiment).values({
                    studentId: currentStudent.id,
                    taskId,
                    currentStage: 0,
                    status: ExperimentStatus.IN_PROGRESS,
                });

                [exp] = await db.select().from(experiment).where(eq(experiment.id, result.insertId));
            } catch (e: unknown) {
                if (e && typeof e === "object" && "code" in e && e.code === "ER_DUP_ENTRY") {
                    [exp] = await db
                        .select()
                        .from(experiment)
                        .where(and(eq(experiment.studentId, currentStudent.id), eq(experiment.taskId, taskId)));
                } else {
                    throw e;
                }
            }
        }

        if (!exp) {
            return error("创建实验记录失败", "CREATE_FAILED", 500);
        }

        const [topicInfo] = await db.select({ excelRowCount: topic.excelRowCount }).from(topic).where(eq(topic.id, taskInfo.topicId));

        return json({
            id: exp.id,
            taskId: exp.taskId,
            currentStage: exp.currentStage,
            status: exp.status,
            questionnaire: exp.questionnaire,
            samplePlan: exp.samplePlan,
            samplingResults: exp.samplingResults,
            reportContent: exp.reportContent,
            lastSavedAt: exp.lastSavedAt?.toISOString() ?? null,
            populationSize: topicInfo?.excelRowCount ?? 10000,
        });
    },

    async PUT(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const taskId = parseInt(getPathParam(req, 2));
        if (!taskId) {
            return error("无效的任务ID", "INVALID_ID");
        }

        const body = await parseBody<{
            currentStage?: number;
            questionnaire?: unknown;
            samplePlan?: unknown;
            samplingResults?: unknown;
            reportContent?: string;
        }>(req);

        const [exp] = await db
            .select()
            .from(experiment)
            .where(and(eq(experiment.studentId, currentStudent.id), eq(experiment.taskId, taskId)));

        if (!exp) {
            return error("实验记录不存在", "NOT_FOUND", 404);
        }

        const [taskInfo] = await db.select({ openTime: task.openTime, deadline: task.deadline }).from(task).where(eq(task.id, taskId));

        if (taskInfo?.openTime && new Date(taskInfo.openTime) > new Date()) {
            return error("任务尚未开放", "TASK_NOT_OPEN");
        }

        const deadline = taskInfo?.deadline ? new Date(taskInfo.deadline) : null;
        const deadlinePassed = !!deadline && Date.now() > deadline.getTime();

        if (exp.status !== ExperimentStatus.IN_PROGRESS && exp.status !== ExperimentStatus.REJECTED) {
            return error("实验已提交，无法修改", "ALREADY_SUBMITTED");
        }

        if (exp.status === ExperimentStatus.REJECTED && deadlinePassed) {
            return error("任务已截止，无法重新提交", "TASK_DEADLINE");
        }

        const updates: Record<string, unknown> = {
            lastSavedAt: new Date(),
            version: exp.version + 1,
        };

        if (body.currentStage !== undefined) {
            if (deadlinePassed && body.currentStage > exp.currentStage) {
                return error("任务已截止，无法进入下一阶段", "TASK_DEADLINE");
            }
            updates.currentStage = body.currentStage;

            if (body.currentStage >= 1 && !exp.stage1CompletedAt) updates.stage1CompletedAt = new Date();
            if (body.currentStage >= 2 && !exp.stage2CompletedAt) updates.stage2CompletedAt = new Date();
            if (body.currentStage >= 3 && !exp.stage3CompletedAt) updates.stage3CompletedAt = new Date();
            if (body.currentStage >= 4 && !exp.stage4CompletedAt) updates.stage4CompletedAt = new Date();
        }

        if (body.questionnaire !== undefined) updates.questionnaire = body.questionnaire;
        if (body.samplePlan !== undefined) {
            const [taskMeta] = await db
                .select({
                    topicId: task.topicId,
                    excelRowCount: topic.excelRowCount,
                })
                .from(task)
                .innerJoin(topic, eq(task.topicId, topic.id))
                .where(eq(task.id, taskId));

            const plan = body.samplePlan as any;
            if (plan.confidenceLevel && plan.marginOfError && taskMeta?.excelRowCount) {
                const confidenceValue = Number(plan.confidenceLevel);
                const confidenceRatio = confidenceValue > 1 ? confidenceValue / 100 : confidenceValue;
                const errorValue = Number(plan.marginOfError);
                const errorRatio = errorValue > 1 ? errorValue / 100 : errorValue;

                const z = getZValue(confidenceRatio);
                const e = errorRatio;
                const N = taskMeta.excelRowCount;
                const p = 0.5;

                const n0 = (Math.pow(z, 2) * p * (1 - p)) / Math.pow(e, 2);
                const n = n0 / (1 + (n0 - 1) / N);

                plan.calculatedSampleSize = Math.ceil(n);
            }
            updates.samplePlan = plan;
        }
        if (body.samplingResults !== undefined) updates.samplingResults = body.samplingResults;
        if (body.reportContent !== undefined) updates.reportContent = body.reportContent;

        if (exp.status === ExperimentStatus.REJECTED) {
            updates.status = ExperimentStatus.IN_PROGRESS;
        }

        await db.update(experiment).set(updates).where(eq(experiment.id, exp.id));

        return json({ success: true, lastSavedAt: new Date().toISOString() });
    },
};

const statsRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;

        const taskId = parseInt(getPathParam(req, 2));
        if (!taskId) return error("无效的任务ID", "INVALID_ID");

        const [taskInfo] = await db
            .select({
                topicId: task.topicId,
                excelFilePath: topic.excelFilePath,
                fieldMapping: topic.fieldMapping,
            })
            .from(task)
            .innerJoin(topic, eq(task.topicId, topic.id))
            .where(eq(task.id, taskId));

        if (!taskInfo || !taskInfo.excelFilePath) {
            return error("未找到总体的Excel数据文件", "NO_DATA_FILE");
        }

        const population = await readPopulationData(taskInfo.excelFilePath);
        let mapping = taskInfo.fieldMapping as { stratified?: string[] } | null | string;

        if (typeof mapping === "string") {
            try {
                mapping = JSON.parse(mapping);
            } catch (e) {
                console.error("Failed to parse fieldMapping:", e);
                mapping = null;
            }
        }

        const typedMapping = mapping as { stratified?: string[] } | null;

        if (!typedMapping || !typedMapping.stratified || typedMapping.stratified.length === 0) {
            return json({ stats: {} });
        }

        const stats: Record<string, Record<string, number>> = {};
        for (const field of typedMapping.stratified) {
            const counts: Record<string, number> = {};
            for (const row of population) {
                const val = String(row[field]);
                counts[val] = (counts[val] || 0) + 1;
            }
            stats[field] = counts;
        }

        return json({ stats });
    },
};

const samplingActionRoutes: RouteDefinition = {
    async POST(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;

        const taskId = parseInt(getPathParam(req, 2));
        if (!taskId) return error("无效的任务ID", "INVALID_ID");

        const body = await parseBody<{
            method: "simple" | "systematic" | "stratified";
            params: any;
        }>(req);

        const [taskInfo] = await db
            .select({
                topicId: task.topicId,
                excelFilePath: topic.excelFilePath,
            })
            .from(task)
            .innerJoin(topic, eq(task.topicId, topic.id))
            .where(eq(task.id, taskId));

        if (!taskInfo || !taskInfo.excelFilePath) {
            return error("未找到总体的Excel数据文件", "NO_DATA_FILE");
        }

        const population = await readPopulationData(taskInfo.excelFilePath);
        if (population.length === 0) {
            return error("总体数据为空或读取失败", "READ_FAILED");
        }

        let sampledData: any[] = [];
        let resultParams: any = {};

        switch (body.method) {
            case "simple": {
                const n = body.params.sampleSize || 100;
                sampledData = await performSimpleSampling(population, n, body.params.seed);
                resultParams = { completed: true, sampleCount: sampledData.length, seed: body.params.seed, data: sampledData };
                break;
            }
            case "systematic": {
                const k = body.params.kValue || 10;
                sampledData = await performSystematicSampling(population, k, 0);
                resultParams = { completed: true, kValue: k, sampleCount: sampledData.length, data: sampledData };
                break;
            }
            case "stratified": {
                const stratifyBy = body.params.stratifyBy;
                const layers = body.params.layers;
                sampledData = await performStratifiedSampling(population, stratifyBy, layers);
                resultParams = { completed: true, stratifyBy, layers, stratifiedData: [], data: sampledData };
                break;
            }
        }

        return json({ success: true, result: resultParams });
    },
};

const submitRoutes: RouteDefinition = {
    async POST(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const taskId = parseInt(getPathParam(req, 2));
        if (!taskId) {
            return error("无效的任务ID", "INVALID_ID");
        }

        const [exp] = await db
            .select()
            .from(experiment)
            .where(and(eq(experiment.studentId, currentStudent.id), eq(experiment.taskId, taskId)));

        if (!exp) {
            return error("实验记录不存在", "NOT_FOUND", 404);
        }

        const [taskInfo] = await db
            .select({
                openTime: task.openTime,
                deadline: task.deadline,
                topicName: topic.name,
                teacherId: class_.teacherId,
            })
            .from(task)
            .innerJoin(topic, eq(task.topicId, topic.id))
            .innerJoin(class_, eq(task.classId, class_.id))
            .where(eq(task.id, taskId));

        if (taskInfo?.openTime && new Date(taskInfo.openTime) > new Date()) {
            return error("任务尚未开放", "TASK_NOT_OPEN");
        }

        if (taskInfo?.deadline) {
            const deadline = new Date(taskInfo.deadline).getTime();
            const now = Date.now();
            const grace = 30 * 1000;
            if (now > deadline + grace) {
                return error("任务已截止，无法提交", "TASK_DEADLINE");
            }
        }

        if (exp.status === ExperimentStatus.SUBMITTED) return error("实验已提交，请勿重复提交", "ALREADY_SUBMITTED");
        if (exp.status === ExperimentStatus.GRADED) return error("实验已批改完成", "ALREADY_GRADED");
        if (exp.currentStage < 4) return error("请完成所有实验阶段后再提交", "INCOMPLETE");
        if (!exp.reportContent || exp.reportContent.length < 100) return error("报告内容不能少于100字", "REPORT_TOO_SHORT");

        await db.update(experiment).set({ status: ExperimentStatus.SUBMITTED }).where(eq(experiment.id, exp.id));

        const [submissionResult] = await db.insert(submission).values({
            experimentId: exp.id,
            status: 1,
            submittedAt: new Date(),
        });

        const submissionId = submissionResult.insertId as number;

        schedulePdfGeneration({
            submissionId,
            taskId,
            teacherId: taskInfo?.teacherId ?? null,
            studentId: currentStudent.id,
            studentName: currentStudent.name ?? "",
            topicName: taskInfo?.topicName ?? "",
            questionnaire: exp.questionnaire as any | null,
            reportContent: exp.reportContent ?? "",
        });

        return json({ success: true });
    },
};

const resetRoutes: RouteDefinition = {
    async POST(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const taskId = parseInt(getPathParam(req, 2));
        if (!taskId) {
            return error("无效的任务ID", "INVALID_ID");
        }

        const body = await parseBody<{ resetToStage: number; clearQuestionnaire?: boolean }>(req);
        const resetToStage = Math.max(1, Math.min(4, Number(body.resetToStage) || 1));
        const clearQuestionnaire = Boolean(body.clearQuestionnaire);

        const [exp] = await db
            .select()
            .from(experiment)
            .where(and(eq(experiment.studentId, currentStudent.id), eq(experiment.taskId, taskId)));

        if (!exp) {
            return error("实验记录不存在", "NOT_FOUND", 404);
        }

        const [taskInfo] = await db.select({ openTime: task.openTime, deadline: task.deadline }).from(task).where(eq(task.id, taskId));

        if (taskInfo?.openTime && new Date(taskInfo.openTime) > new Date()) {
            return error("任务尚未开放", "TASK_NOT_OPEN");
        }

        const deadline = taskInfo?.deadline ? new Date(taskInfo.deadline) : null;
        const deadlinePassed = !!deadline && Date.now() > deadline.getTime();

        if (exp.status === ExperimentStatus.SUBMITTED || exp.status === ExperimentStatus.GRADED) {
            return error("实验已提交或批改，无法重置", "ALREADY_SUBMITTED");
        }

        if (exp.status === ExperimentStatus.REJECTED && deadlinePassed) {
            return error("任务已截止，无法重新提交", "TASK_DEADLINE");
        }

        const updates: Record<string, unknown> = {
            currentStage: resetToStage,
            lastSavedAt: new Date(),
            version: exp.version + 1,
        };

        if (clearQuestionnaire) updates.questionnaire = null;

        if (resetToStage <= 1) {
            updates.samplePlan = null;
            updates.samplingResults = null;
            updates.reportContent = null;
            updates.stage2CompletedAt = null;
            updates.stage3CompletedAt = null;
            updates.stage4CompletedAt = null;
        }

        if (resetToStage <= 2) {
            updates.samplingResults = null;
            updates.reportContent = null;
            updates.stage3CompletedAt = null;
            updates.stage4CompletedAt = null;
        }

        if (resetToStage <= 3) {
            updates.reportContent = null;
            updates.stage4CompletedAt = null;
        }

        if (exp.status === ExperimentStatus.REJECTED) {
            updates.status = ExperimentStatus.IN_PROGRESS;
        }

        await db.update(experiment).set(updates).where(eq(experiment.id, exp.id));

        return json({ success: true, lastSavedAt: new Date().toISOString() });
    },
};

export { experimentRoutes, resetRoutes, samplingActionRoutes, statsRoutes, submitRoutes };
