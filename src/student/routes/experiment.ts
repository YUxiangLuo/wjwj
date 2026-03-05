import { createWriteStream } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { and, eq, isNotNull, isNull, or } from "drizzle-orm";
import PDFDocument from "pdfkit";
import * as XLSX from "xlsx";
import { db } from "../../db";
import { assistantClass, class_, experiment, notification, submission, task, topic } from "../../db/schema";
import { error, getRouteParam, json, parseBody } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";
import {
    createSeededRandom,
    performSimpleSampling,
    performStratifiedSampling,
    performSystematicSampling,
} from "../sampling";
import { getRichTextPlainLength, getRichTextPlainText } from "../../utils/rich-text";
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

function getTaskId(req: Request): number {
    return Number.parseInt(getRouteParam(req, "id") ?? "", 10);
}

function isValidStage(stage: number) {
    return Number.isInteger(stage) && stage >= 0 && stage <= 4;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getAffectedRows(result: unknown) {
    if (!result || typeof result !== "object") return 0;
    const value = (result as { affectedRows?: unknown }).affectedRows;
    return typeof value === "number" ? value : 0;
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

    return error("任务不存在", "NOT_FOUND", 404);
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
    // Normalize input path so values like "/storage/uploads/..." become "storage/uploads/..."
    let normalizedPath = filePath.replace(/\\/g, "/").trim();
    if (normalizedPath.startsWith("/")) {
        normalizedPath = normalizedPath.slice(1);
    }

    // Only allow reading files from the "storage" directory tree
    if (!normalizedPath || !normalizedPath.startsWith("storage/")) {
        console.error("Invalid population data path:", filePath);
        return [];
    }

    const storageBaseDir = path.resolve(process.cwd(), "storage");
    const fullPath = path.resolve(process.cwd(), normalizedPath);

    if (!fullPath.startsWith(storageBaseDir + path.sep) && fullPath !== storageBaseDir) {
        console.error("Path traversal attempt blocked:", filePath);
        return [];
    }
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

function toTrimmedString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function toInteger(value: unknown): number | null {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return Math.floor(parsed);
}

function isSamplingStepCompleted(value: unknown) {
    return value === true || value === 1;
}

function validateQuestionnaireForSubmit(questionnaire: unknown): string | null {
    if (!questionnaire || typeof questionnaire !== "object") {
        return "请先完成问卷设计";
    }

    const data = questionnaire as Record<string, unknown>;
    const title = toTrimmedString(data.title);
    const welcomeText = getRichTextPlainText(data.welcomeText);
    const endingText = getRichTextPlainText(data.endingText);
    const questions = Array.isArray(data.questions) ? data.questions : [];

    if (title.length < 1 || title.length > 100) {
        return "问卷标题长度需在1-100字之间";
    }

    if (welcomeText.length < 20 || welcomeText.length > 1000) {
        return "欢迎语长度需在20-1000字之间";
    }

    if (endingText.length < 20 || endingText.length > 1000) {
        return "结束语长度需在20-1000字之间";
    }

    if (questions.length < 5 || questions.length > 50) {
        return "问卷题目数量需在5-50题之间";
    }

    for (let index = 0; index < questions.length; index += 1) {
        const rawQuestion = questions[index];
        if (!rawQuestion || typeof rawQuestion !== "object") {
            return `第${index + 1}题配置无效`;
        }

        const question = rawQuestion as Record<string, unknown>;
        const type = toTrimmedString(question.type);
        const content = toTrimmedString(question.content);
        if (content.length < 1 || content.length > 500) {
            return `第${index + 1}题题目内容长度需在1-500字之间`;
        }

        if (!["boolean", "single", "multiple", "scale"].includes(type)) {
            return `第${index + 1}题题型无效`;
        }

        if (type === "single" || type === "multiple") {
            const options = Array.isArray(question.options)
                ? question.options.map((option) => toTrimmedString(option)).filter((option) => option.length > 0)
                : [];

            if (options.length < 2 || options.length > 10) {
                return `第${index + 1}题选项数量需在2-10个之间`;
            }

            if (options.some((option) => option.length > 200)) {
                return `第${index + 1}题选项内容不能超过200字`;
            }

            if (type === "multiple") {
                const minSelect = Number.isFinite(Number(question.minSelect)) ? Math.floor(Number(question.minSelect)) : 1;
                const maxSelect = Number.isFinite(Number(question.maxSelect)) ? Math.floor(Number(question.maxSelect)) : options.length;
                if (minSelect < 1 || maxSelect < minSelect || maxSelect > options.length) {
                    return `第${index + 1}题多选数量限制无效`;
                }
            }
        }

        if (type === "scale") {
            const scaleMin = Number.isFinite(Number(question.scaleMin)) ? Number(question.scaleMin) : 1;
            const scaleMax = Number.isFinite(Number(question.scaleMax)) ? Number(question.scaleMax) : 10;
            if (scaleMin < 1 || scaleMax > 10 || scaleMin >= scaleMax) {
                return `第${index + 1}题量表范围无效`;
            }
        }
    }

    return null;
}

function validateSamplePlanForSubmit(samplePlan: unknown, populationSize: number | null): string | null {
    if (!samplePlan || typeof samplePlan !== "object") {
        return "请先完成样本量规划";
    }

    const data = samplePlan as Record<string, unknown>;
    const confidenceLevel = toTrimmedString(data.confidenceLevel);
    const marginOfError = Number(data.marginOfError);
    const finalSampleSize = Number(data.finalSampleSize);

    if (!confidenceLevel) {
        return "请先设置置信水平";
    }

    if (!Number.isFinite(marginOfError) || marginOfError < 1 || marginOfError > 10) {
        return "允许误差需在1%-10%之间";
    }

    if (!Number.isFinite(finalSampleSize) || finalSampleSize < 30) {
        return "最终样本量不能小于30";
    }

    if (populationSize !== null && Number.isFinite(populationSize) && populationSize > 0) {
        const maxSampleSize = Math.floor(populationSize * 0.5);
        if (maxSampleSize >= 30 && finalSampleSize > maxSampleSize) {
            return `最终样本量不能超过总体规模的50%（${maxSampleSize}）`;
        }
    }

    return null;
}

function validateSamplingResultsForSubmit(samplingResults: unknown, targetSampleSize: number | null): string | null {
    if (!samplingResults || typeof samplingResults !== "object") {
        return "请先完成抽样执行";
    }

    const data = samplingResults as Record<string, unknown>;
    const simple = data.simple as Record<string, unknown> | undefined;
    const systematic = data.systematic as Record<string, unknown> | undefined;
    const stratified = data.stratified as Record<string, unknown> | undefined;

    if (!simple || !isSamplingStepCompleted(simple.completed)) {
        return "请先完成简单随机抽样";
    }

    if (!systematic || !isSamplingStepCompleted(systematic.completed)) {
        return "请先完成系统抽样";
    }

    if (!stratified || !isSamplingStepCompleted(stratified.completed)) {
        return "请先完成分层抽样";
    }

    if (targetSampleSize !== null && Number.isFinite(targetSampleSize) && targetSampleSize > 0) {
        const simpleCount = toInteger(simple.sampleCount);
        if (simpleCount !== targetSampleSize) {
            return `简单随机抽样样本量需等于目标样本量（${targetSampleSize}）`;
        }

        const systematicCount = toInteger(systematic.sampleCount);
        const minExpected = Math.floor(targetSampleSize * 0.8);
        const maxExpected = Math.ceil(targetSampleSize * 1.2);
        if (systematicCount === null || systematicCount < minExpected || systematicCount > maxExpected) {
            return `系统抽样样本量需在 ${minExpected}-${maxExpected} 之间`;
        }

        const stratifiedLayers = Array.isArray(stratified.layers) ? stratified.layers : [];
        const stratifiedTotal = stratifiedLayers.reduce((sum, layer) => {
            if (!layer || typeof layer !== "object") return sum;
            const sampleCount = toInteger((layer as Record<string, unknown>).sampleCount);
            return sum + (sampleCount === null ? 0 : sampleCount);
        }, 0);

        if (stratifiedLayers.length === 0 || stratifiedTotal !== targetSampleSize) {
            return `分层抽样样本量总和需等于目标样本量（${targetSampleSize}）`;
        }
    }

    return null;
}

function validateReportForSubmit(reportContent: unknown): string | null {
    const reportLength = getRichTextPlainLength(reportContent);
    if (reportLength < 100) {
        return "报告内容不能少于100字";
    }
    if (reportLength > 5000) {
        return "报告内容不能超过5000字";
    }
    return null;
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
        doc.fontSize(12).text(getRichTextPlainText(params.welcomeText) || "");
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
        doc.fontSize(12).text(getRichTextPlainText(params.endingText) || "");
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

        doc.fontSize(12).text(getRichTextPlainText(params.reportContent) || "");
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


const experimentRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const taskId = getTaskId(req);
        if (!taskId) {
            return error("无效的任务ID", "INVALID_ID");
        }

        const taskAccessError = await getTaskAccessError(taskId, currentStudent.classId);
        if (taskAccessError) return taskAccessError;

        const [taskInfo] = await db
            .select({ id: task.id, topicId: task.topicId })
            .from(task)
            .innerJoin(topic, eq(task.topicId, topic.id))
            .where(and(eq(task.id, taskId), eq(task.classId, currentStudent.classId), isNull(task.deletedAt), eq(topic.isDeleted, 0)));

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

        const taskId = getTaskId(req);
        if (!taskId) {
            return error("无效的任务ID", "INVALID_ID");
        }

        const taskAccessError = await getTaskAccessError(taskId, currentStudent.classId);
        if (taskAccessError) return taskAccessError;

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

        const [taskInfo] = await db
            .select({ openTime: task.openTime, deadline: task.deadline })
            .from(task)
            .innerJoin(topic, eq(task.topicId, topic.id))
            .where(and(eq(task.id, taskId), eq(task.classId, currentStudent.classId), isNull(task.deletedAt), eq(topic.isDeleted, 0)));

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
            const nextStage = Number(body.currentStage);
            if (!isValidStage(nextStage)) {
                return error("当前阶段必须是0-4的整数", "VALIDATION_ERROR", 400);
            }

            if (deadlinePassed && nextStage > exp.currentStage) {
                return error("任务已截止，无法进入下一阶段", "TASK_DEADLINE");
            }
            updates.currentStage = nextStage;

            if (nextStage >= 1 && !exp.stage1CompletedAt) updates.stage1CompletedAt = new Date();
            if (nextStage >= 2 && !exp.stage2CompletedAt) updates.stage2CompletedAt = new Date();
            if (nextStage >= 3 && !exp.stage3CompletedAt) updates.stage3CompletedAt = new Date();
            if (nextStage >= 4 && !exp.stage4CompletedAt) updates.stage4CompletedAt = new Date();
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
                .where(and(eq(task.id, taskId), eq(task.classId, currentStudent.classId), isNull(task.deletedAt), eq(topic.isDeleted, 0)));

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

        const [updateResult] = await db
            .update(experiment)
            .set(updates)
            .where(and(eq(experiment.id, exp.id), eq(experiment.version, exp.version)));

        if (getAffectedRows(updateResult) === 0) {
            return error("实验记录已发生变化，请刷新后重试", "VERSION_CONFLICT", 409);
        }

        return json({ success: true, lastSavedAt: new Date().toISOString() });
    },
};

const statsRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const taskId = getTaskId(req);
        if (!taskId) return error("无效的任务ID", "INVALID_ID");

        const taskAccessError = await getTaskAccessError(taskId, currentStudent.classId);
        if (taskAccessError) return taskAccessError;

        const [taskInfo] = await db
            .select({
                topicId: task.topicId,
                excelFilePath: topic.excelFilePath,
                fieldMapping: topic.fieldMapping,
            })
            .from(task)
            .innerJoin(topic, eq(task.topicId, topic.id))
            .where(and(eq(task.id, taskId), eq(task.classId, currentStudent.classId), isNull(task.deletedAt), eq(topic.isDeleted, 0)));

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
        const currentStudent = auth.student!;

        const taskId = getTaskId(req);
        if (!taskId) return error("无效的任务ID", "INVALID_ID");

        const taskAccessError = await getTaskAccessError(taskId, currentStudent.classId);
        if (taskAccessError) return taskAccessError;

        const body = await parseBody<{
            method: "simple" | "systematic" | "stratified";
            params: any;
        }>(req);
        if (!["simple", "systematic", "stratified"].includes(body.method)) {
            return error("无效的抽样方法", "VALIDATION_ERROR", 400);
        }
        const params = isPlainObject(body.params) ? body.params : {};

        const [exp] = await db
            .select({ samplePlan: experiment.samplePlan })
            .from(experiment)
            .where(and(eq(experiment.studentId, currentStudent.id), eq(experiment.taskId, taskId)));
        if (!exp) {
            return error("实验记录不存在", "NOT_FOUND", 404);
        }

        const targetSampleSize = (() => {
            if (!exp.samplePlan || typeof exp.samplePlan !== "object") return null;
            const finalSampleSize = Number((exp.samplePlan as Record<string, unknown>).finalSampleSize);
            if (!Number.isFinite(finalSampleSize) || finalSampleSize <= 0) return null;
            return Math.floor(finalSampleSize);
        })();

        const [taskInfo] = await db
            .select({
                topicId: task.topicId,
                excelFilePath: topic.excelFilePath,
                fieldMapping: topic.fieldMapping,
            })
            .from(task)
            .innerJoin(topic, eq(task.topicId, topic.id))
            .where(and(eq(task.id, taskId), eq(task.classId, currentStudent.classId), isNull(task.deletedAt), eq(topic.isDeleted, 0)));

        if (!taskInfo || !taskInfo.excelFilePath) {
            return error("未找到总体的Excel数据文件", "NO_DATA_FILE");
        }

        const population = await readPopulationData(taskInfo.excelFilePath);
        if (population.length === 0) {
            return error("总体数据为空或读取失败", "READ_FAILED");
        }

        const samplingSeed =
            typeof params.seed === "number" || typeof params.seed === "string"
                ? params.seed
                : undefined;
        const random = createSeededRandom(samplingSeed);

        let sampledData: any[] = [];
        let resultParams: any = {};

        switch (body.method) {
            case "simple": {
                const n = Number.parseInt(String(params.sampleSize ?? ""), 10);
                if (!Number.isInteger(n) || n < 1 || n > population.length) {
                    return error(`样本量需为 1-${population.length} 之间的整数`, "VALIDATION_ERROR", 400);
                }
                if (targetSampleSize !== null && n !== targetSampleSize) {
                    return error(`简单随机抽样样本量需等于目标样本量（${targetSampleSize}）`, "VALIDATION_ERROR", 400);
                }
                sampledData = await performSimpleSampling(population, n, random);
                resultParams = { completed: true, sampleCount: sampledData.length, seed: params.seed, data: sampledData };
                break;
            }
            case "systematic": {
                const k = Number.parseInt(String(params.kValue ?? ""), 10);
                if (!Number.isInteger(k) || k < 1 || k > population.length) {
                    return error(`K 值需为 1-${population.length} 之间的整数`, "VALIDATION_ERROR", 400);
                }
                const expectedCount = Math.ceil(population.length / k);
                if (targetSampleSize !== null) {
                    const minExpected = Math.floor(targetSampleSize * 0.8);
                    const maxExpected = Math.ceil(targetSampleSize * 1.2);
                    if (expectedCount < minExpected || expectedCount > maxExpected) {
                        return error(`K 值导致样本量超出范围，需在 ${minExpected}-${maxExpected} 之间`, "VALIDATION_ERROR", 400);
                    }
                }
                sampledData = await performSystematicSampling(population, k, random);
                resultParams = { completed: true, kValue: k, sampleCount: sampledData.length, seed: params.seed, data: sampledData };
                break;
            }
            case "stratified": {
                const stratifyBy = toTrimmedString(params.stratifyBy);
                if (!stratifyBy) {
                    return error("请选择分层变量", "VALIDATION_ERROR", 400);
                }

                let mapping = taskInfo.fieldMapping as { stratified?: string[] } | null | string;
                if (typeof mapping === "string") {
                    try {
                        mapping = JSON.parse(mapping);
                    } catch {
                        mapping = null;
                    }
                }
                const typedMapping = mapping as { stratified?: string[] } | null;
                if (typedMapping?.stratified?.length && !typedMapping.stratified.includes(stratifyBy)) {
                    return error("分层变量无效", "VALIDATION_ERROR", 400);
                }

                const hasField = population.some((row) => Object.prototype.hasOwnProperty.call(row, stratifyBy));
                if (!hasField) {
                    return error("分层变量不存在于总体数据中", "VALIDATION_ERROR", 400);
                }

                const layersInput = Array.isArray(params.layers) ? params.layers : [];
                if (layersInput.length === 0) {
                    return error("请先配置各层样本数", "VALIDATION_ERROR", 400);
                }

                const layerPopulationCount = new Map<string, number>();
                for (const row of population) {
                    const key = String(row[stratifyBy] ?? "");
                    layerPopulationCount.set(key, (layerPopulationCount.get(key) ?? 0) + 1);
                }

                const layers: Array<{ name: string; count: number; ratio: number; sampleCount: number }> = [];
                let totalAssigned = 0;
                for (let i = 0; i < layersInput.length; i += 1) {
                    const input = layersInput[i] as Record<string, unknown>;
                    const name = toTrimmedString(input?.name);
                    const sampleCount = Number(input?.sampleCount);
                    if (!name) {
                        return error(`第 ${i + 1} 层名称无效`, "VALIDATION_ERROR", 400);
                    }
                    if (!Number.isInteger(sampleCount) || sampleCount < 0) {
                        return error(`第 ${i + 1} 层样本数需为非负整数`, "VALIDATION_ERROR", 400);
                    }

                    const groupCount = layerPopulationCount.get(name) ?? 0;
                    if (groupCount <= 0) {
                        return error(`分层“${name}”在总体中不存在`, "VALIDATION_ERROR", 400);
                    }
                    if (sampleCount > groupCount) {
                        return error(`分层“${name}”样本数不能超过该层总体人数（${groupCount}）`, "VALIDATION_ERROR", 400);
                    }

                    const ratio = Number.isFinite(Number(input?.ratio)) ? Number(input?.ratio) : 0;
                    layers.push({
                        name,
                        count: groupCount,
                        ratio,
                        sampleCount,
                    });
                    totalAssigned += sampleCount;
                }

                if (totalAssigned <= 0) {
                    return error("分层样本总数必须大于 0", "VALIDATION_ERROR", 400);
                }
                if (targetSampleSize !== null && totalAssigned !== targetSampleSize) {
                    return error(`各层样本数总和需等于目标样本量（${targetSampleSize}）`, "VALIDATION_ERROR", 400);
                }

                sampledData = await performStratifiedSampling(population, stratifyBy, layers, random);
                resultParams = { completed: true, stratifyBy, layers, stratifiedData: [], seed: params.seed, data: sampledData };
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

        const taskId = getTaskId(req);
        if (!taskId) {
            return error("无效的任务ID", "INVALID_ID");
        }

        const taskAccessError = await getTaskAccessError(taskId, currentStudent.classId);
        if (taskAccessError) return taskAccessError;

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
                populationSize: topic.excelRowCount,
                teacherId: class_.teacherId,
                classId: task.classId,
            })
            .from(task)
            .innerJoin(topic, eq(task.topicId, topic.id))
            .innerJoin(class_, eq(task.classId, class_.id))
            .where(and(eq(task.id, taskId), eq(task.classId, currentStudent.classId), isNull(task.deletedAt), eq(topic.isDeleted, 0)));

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
        if (exp.status === ExperimentStatus.REJECTED) return error("实验已被驳回，请先重置后再提交", "REJECTED_NEED_RESET");
        if (exp.currentStage < 4) return error("请完成所有实验阶段后再提交", "INCOMPLETE");

        const questionnaireError = validateQuestionnaireForSubmit(exp.questionnaire);
        if (questionnaireError) return error(questionnaireError, "INCOMPLETE", 400);

        const populationSizeRaw = taskInfo?.populationSize;
        const populationSize = populationSizeRaw === null || populationSizeRaw === undefined
            ? null
            : Number(populationSizeRaw);
        const normalizedPopulationSize = populationSize !== null && Number.isFinite(populationSize)
            ? populationSize
            : null;
        const samplePlanError = validateSamplePlanForSubmit(exp.samplePlan, normalizedPopulationSize);
        if (samplePlanError) return error(samplePlanError, "INCOMPLETE", 400);

        const targetSampleSize = (() => {
            if (!exp.samplePlan || typeof exp.samplePlan !== "object") return null;
            const size = toInteger((exp.samplePlan as Record<string, unknown>).finalSampleSize);
            if (size === null || size <= 0) return null;
            return size;
        })();

        const samplingResultsError = validateSamplingResultsForSubmit(exp.samplingResults, targetSampleSize);
        if (samplingResultsError) return error(samplingResultsError, "INCOMPLETE", 400);

        const reportError = validateReportForSubmit(exp.reportContent);
        if (reportError) return error(reportError, "INCOMPLETE", 400);

        const [submitUpdateResult] = await db
            .update(experiment)
            .set({
                status: ExperimentStatus.SUBMITTED,
                version: exp.version + 1,
                lastSavedAt: new Date(),
            })
            .where(and(eq(experiment.id, exp.id), eq(experiment.version, exp.version)));

        if (getAffectedRows(submitUpdateResult) === 0) {
            return error("实验记录已发生变化，请刷新后重试", "VERSION_CONFLICT", 409);
        }

        const [submissionResult] = await db.insert(submission).values({
            experimentId: exp.id,
            status: ExperimentStatus.SUBMITTED,
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

        try {
            const topicName = taskInfo?.topicName ?? "未命名课题";
            const studentName = currentStudent.name ?? currentStudent.studentId;

            if (taskInfo?.teacherId) {
                await notifyUser(2, taskInfo.teacherId, {
                    type: "NEW_SUBMISSION",
                    title: "有新作业提交",
                    content: `学生「${studentName}」提交了「${topicName}」`,
                    relatedType: "submission",
                    relatedId: submissionId,
                });
            }

            if (taskInfo?.classId) {
                const assistantRows = await db
                    .select({ assistantId: assistantClass.assistantId })
                    .from(assistantClass)
                    .where(eq(assistantClass.classId, taskInfo.classId));

                const assistantIds = Array.from(new Set(assistantRows.map((row) => row.assistantId)));
                for (const assistantId of assistantIds) {
                    await notifyUser(3, assistantId, {
                        type: "NEW_SUBMISSION",
                        title: "有新作业提交",
                        content: `学生「${studentName}」提交了「${topicName}」`,
                        relatedType: "submission",
                        relatedId: submissionId,
                    });
                }
            }
        } catch (notifyError) {
            console.error("Failed to notify teacher/assistants on submission:", notifyError);
        }

        return json({ success: true });
    },
};

const resetRoutes: RouteDefinition = {
    async POST(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const taskId = getTaskId(req);
        if (!taskId) {
            return error("无效的任务ID", "INVALID_ID");
        }

        const taskAccessError = await getTaskAccessError(taskId, currentStudent.classId);
        if (taskAccessError) return taskAccessError;

        const body = await parseBody<{ resetToStage: number; clearQuestionnaire?: boolean }>(req);
        let resetToStageInput = Number(body.resetToStage);
        if (!Number.isFinite(resetToStageInput)) {
            resetToStageInput = 1;
        }
        const resetToStage = Math.max(0, Math.min(4, resetToStageInput));
        const clearQuestionnaire = Boolean(body.clearQuestionnaire);

        const [exp] = await db
            .select()
            .from(experiment)
            .where(and(eq(experiment.studentId, currentStudent.id), eq(experiment.taskId, taskId)));

        if (!exp) {
            return error("实验记录不存在", "NOT_FOUND", 404);
        }

        const [taskInfo] = await db
            .select({ openTime: task.openTime, deadline: task.deadline })
            .from(task)
            .innerJoin(topic, eq(task.topicId, topic.id))
            .where(and(eq(task.id, taskId), eq(task.classId, currentStudent.classId), isNull(task.deletedAt), eq(topic.isDeleted, 0)));

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

        if (resetToStage <= 0) {
            updates.questionnaire = null;
            updates.stage1CompletedAt = null;
        }

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

        const [updateResult] = await db
            .update(experiment)
            .set(updates)
            .where(and(eq(experiment.id, exp.id), eq(experiment.version, exp.version)));

        if (getAffectedRows(updateResult) === 0) {
            return error("实验记录已发生变化，请刷新后重试", "VERSION_CONFLICT", 409);
        }

        return json({ success: true, lastSavedAt: new Date().toISOString() });
    },
};

export { experimentRoutes, resetRoutes, samplingActionRoutes, statsRoutes, submitRoutes };
