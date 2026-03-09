import { createWriteStream } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { and, asc, eq, isNull, lt, lte, or } from "drizzle-orm";
import PDFDocument from "pdfkit";
import { db } from "../../db";
import { experiment, notification, student, submission, task, topic } from "../../db/schema";
import { getAffectedRows } from "../../db/utils";
import { resolveStoragePath } from "../../server/storage-files";
import { formatDateTimeCN } from "../../utils/format";
import { getRichTextPlainText } from "../../utils/rich-text";
import {
    MAX_SUBMISSION_PDF_ATTEMPTS,
    SubmissionPdfStatus,
    SUBMISSION_PDF_RETRY_DELAY_MS,
    SUBMISSION_PDF_STALE_GENERATING_MS,
} from "./pdf-status";
import { parseStoredJson } from "./serialization";

const SUBMISSION_PDF_BATCH_LIMIT = 3;
const SUBMISSION_PDF_KICK_MAX_ROUNDS = 10;
const DEFAULT_PDF_FONT_PATH = path.join(process.cwd(), "public", "fonts", "NotoSansSC-Regular.otf");
const PDF_FONT_ENV = "PDF_FONT_PATH";

interface SubmissionPdfQuestion {
    type?: string;
    content?: string;
    options?: string[];
    scaleMin?: number;
    scaleMax?: number;
}

interface SubmissionPdfQuestionnaire {
    title?: string;
    welcomeText?: string;
    endingText?: string;
    questions?: SubmissionPdfQuestion[];
}

interface SubmissionPdfJobPayload {
    submissionId: number;
    studentDbId: number;
    studentIdText: string;
    studentName: string;
    teacherId: number | null;
    topicName: string;
    submittedAt: Date;
    questionnaire: SubmissionPdfQuestionnaire | null;
    reportContent: string;
}

interface ClaimedSubmissionPdfJob {
    submissionId: number;
    attemptNumber: number;
}

function sanitizePdfError(error: unknown) {
    const message = error instanceof Error ? error.message : "未知错误";
    return message.slice(0, 500);
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

let cachedPdfFontPath: string | null = null;

async function resolvePdfFontPath() {
    if (cachedPdfFontPath) {
        return cachedPdfFontPath;
    }

    const candidates = [
        process.env[PDF_FONT_ENV]?.trim(),
        DEFAULT_PDF_FONT_PATH,
        "/usr/share/fonts/opentype/noto/NotoSansSC-Regular.otf",
        "C:\\Windows\\Fonts\\msyh.ttf",
    ].filter((value): value is string => Boolean(value && value.trim()));

    for (const candidate of candidates) {
        try {
            await fs.access(candidate);
            cachedPdfFontPath = candidate;
            return candidate;
        } catch {
            // Try the next configured font candidate.
        }
    }

    throw new Error(`未找到可用的中文 PDF 字体，请设置 ${PDF_FONT_ENV} 或提供 public/fonts/NotoSansSC-Regular.otf`);
}

async function writePdf(filePath: string, build: (doc: InstanceType<typeof PDFDocument>) => void) {
    const fontPath = await resolvePdfFontPath();
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    return new Promise<void>((resolve, reject) => {
        let settled = false;
        const settle = (fn: () => void) => { if (!settled) { settled = true; fn(); } };

        const doc = new PDFDocument({ size: "A4", margin: 50 });
        const stream = createWriteStream(filePath);

        doc.pipe(stream);
        doc.font(fontPath);

        try {
            build(doc);
            doc.end();
        } catch (error) {
            try { doc.end(); } catch { /* ignore close errors */ }
            settle(() => reject(error));
        }

        stream.on("finish", () => settle(() => resolve()));
        stream.on("error", (error) => settle(() => reject(error)));
        doc.on("error", (error) => settle(() => reject(error)));
    });
}

function formatQuestionType(type: string | undefined) {
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
    questionnaire: SubmissionPdfQuestionnaire;
    meta: { topicName: string; studentName: string; submittedAt: Date };
}) {
    await writePdf(params.outputPath, (doc) => {
        doc.fontSize(18).text("问卷设计", { align: "center" });
        doc.moveDown(0.5);
        doc.fontSize(12).text(`课题：${params.meta.topicName}`);
        doc.text(`学生：${params.meta.studentName}`);
        doc.text(`提交时间：${formatDateTimeCN(params.meta.submittedAt)}`);
        doc.moveDown();

        doc.fontSize(16).text(params.questionnaire.title || "未命名问卷");
        doc.moveDown(0.5);
        doc.fontSize(12).text(getRichTextPlainText(params.questionnaire.welcomeText) || "");
        doc.moveDown();

        for (const [index, question] of (params.questionnaire.questions ?? []).entries()) {
            doc.fontSize(12).text(`Q${index + 1}. [${formatQuestionType(question.type)}] ${question.content ?? ""}`);
            if (question.type === "boolean") {
                doc.text("选项：是 / 否", { indent: 16 });
            }
            if ((question.type === "single" || question.type === "multiple") && Array.isArray(question.options)) {
                question.options.forEach((option, optionIndex) => {
                    const label = String.fromCharCode(65 + optionIndex);
                    doc.text(`${label}. ${option}`, { indent: 16 });
                });
            }
            if (question.type === "scale") {
                doc.text(`量表范围：${question.scaleMin ?? 1} - ${question.scaleMax ?? 10}`, { indent: 16 });
            }
            doc.moveDown(0.5);
        }

        doc.moveDown();
        doc.fontSize(12).text(getRichTextPlainText(params.questionnaire.endingText) || "");
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
        doc.text(`提交时间：${formatDateTimeCN(params.meta.submittedAt)}`);
        doc.moveDown();
        doc.fontSize(12).text(getRichTextPlainText(params.reportContent) || "");
    });
}

function getSubmissionPdfPaths(submissionId: number) {
    const baseName = `submission-${submissionId}`;
    const questionnaireStoragePath = `/storage/uploads/submissions/${baseName}-questionnaire.pdf`;
    const reportStoragePath = `/storage/uploads/submissions/${baseName}-report.pdf`;

    return {
        questionnaireStoragePath,
        reportStoragePath,
        questionnaireAbsolutePath: resolveStoragePath(questionnaireStoragePath),
        reportAbsolutePath: resolveStoragePath(reportStoragePath),
    };
}

function getSubmissionPdfTempPaths(submissionId: number) {
    const { questionnaireAbsolutePath, reportAbsolutePath } = getSubmissionPdfPaths(submissionId);
    const tempSuffix = `${process.pid}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

    return {
        questionnaireTempPath: `${questionnaireAbsolutePath}.${tempSuffix}.tmp`,
        reportTempPath: `${reportAbsolutePath}.${tempSuffix}.tmp`,
    };
}

async function cleanupAbsoluteFiles(filePaths: string[]) {
    await Promise.all(filePaths.map(async (filePath) => {
        try {
            await fs.unlink(filePath);
        } catch (error) {
            if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
                throw error;
            }
        }
    }));
}

export async function loadSubmissionPdfJobPayload(submissionId: number): Promise<SubmissionPdfJobPayload | null> {
    const [row] = await db
        .select({
            submissionId: submission.id,
            studentDbId: student.id,
            studentIdText: student.studentId,
            currentStudentName: student.name,
            teacherId: topic.teacherId,
            currentTopicName: topic.name,
            submittedAt: submission.submittedAt,
            snapshotQuestionnaire: submission.pdfSnapshotQuestionnaire,
            snapshotReportContent: submission.pdfSnapshotReportContent,
            snapshotTopicName: submission.pdfSnapshotTopicName,
            snapshotStudentName: submission.pdfSnapshotStudentName,
        })
        .from(submission)
        .innerJoin(experiment, eq(submission.experimentId, experiment.id))
        .innerJoin(student, eq(experiment.studentId, student.id))
        .innerJoin(task, eq(experiment.taskId, task.id))
        .innerJoin(topic, eq(task.topicId, topic.id))
        .where(eq(submission.id, submissionId))
        .limit(1);

    if (!row?.submittedAt) {
        return null;
    }

    return {
        submissionId: row.submissionId,
        studentDbId: row.studentDbId,
        studentIdText: row.studentIdText,
        studentName: row.snapshotStudentName ?? row.currentStudentName ?? row.studentIdText,
        teacherId: row.teacherId,
        topicName: row.snapshotTopicName ?? row.currentTopicName ?? "未命名课题",
        submittedAt: row.submittedAt,
        questionnaire: parseStoredJson<SubmissionPdfQuestionnaire>(row.snapshotQuestionnaire),
        reportContent: row.snapshotReportContent ?? "",
    };
}

async function claimSubmissionPdfJobs(limit: number) {
    const retryCutoff = new Date(Date.now() - SUBMISSION_PDF_RETRY_DELAY_MS);
    const staleGeneratingCutoff = new Date(Date.now() - SUBMISSION_PDF_STALE_GENERATING_MS);

    const candidates = await db
        .select({
            submissionId: submission.id,
            pdfStatus: submission.pdfStatus,
            attempts: submission.pdfGenerationAttempts,
            lastAttemptAt: submission.pdfLastAttemptAt,
        })
        .from(submission)
        .where(and(
            lt(submission.pdfGenerationAttempts, MAX_SUBMISSION_PDF_ATTEMPTS),
            or(
                and(
                    eq(submission.pdfStatus, SubmissionPdfStatus.PENDING),
                    or(isNull(submission.pdfLastAttemptAt), lte(submission.pdfLastAttemptAt, retryCutoff))
                ),
                and(
                    eq(submission.pdfStatus, SubmissionPdfStatus.GENERATING),
                    or(isNull(submission.pdfLastAttemptAt), lte(submission.pdfLastAttemptAt, staleGeneratingCutoff))
                )
            )
        ))
        .orderBy(asc(submission.submittedAt), asc(submission.id))
        .limit(limit * 4);

    const claimedJobs: ClaimedSubmissionPdfJob[] = [];

    for (const candidate of candidates) {
        if (claimedJobs.length >= limit) break;

        const nextAttempt = (candidate.attempts ?? 0) + 1;
        const claimTime = new Date();
        const where = candidate.lastAttemptAt
            ? and(
                eq(submission.id, candidate.submissionId),
                eq(submission.pdfStatus, candidate.pdfStatus),
                eq(submission.pdfGenerationAttempts, candidate.attempts),
                eq(submission.pdfLastAttemptAt, candidate.lastAttemptAt)
            )
            : and(
                eq(submission.id, candidate.submissionId),
                eq(submission.pdfStatus, candidate.pdfStatus),
                eq(submission.pdfGenerationAttempts, candidate.attempts),
                isNull(submission.pdfLastAttemptAt)
            );

        const [result] = await db
            .update(submission)
            .set({
                pdfStatus: SubmissionPdfStatus.GENERATING,
                pdfGenerationAttempts: nextAttempt,
                pdfLastAttemptAt: claimTime,
                pdfError: null,
            })
            .where(where);

        if (getAffectedRows(result) === 0) {
            continue;
        }

        claimedJobs.push({
            submissionId: candidate.submissionId,
            attemptNumber: nextAttempt,
        });
    }

    return claimedJobs;
}

async function markSubmissionPdfReady(params: {
    submissionId: number;
    questionnairePdfPath: string;
    reportPdfPath: string;
}) {
    await db
        .update(submission)
        .set({
            questionnairePdfPath: params.questionnairePdfPath,
            reportPdfPath: params.reportPdfPath,
            pdfStatus: SubmissionPdfStatus.READY,
            pdfGeneratedAt: new Date(),
            pdfError: null,
        })
        .where(eq(submission.id, params.submissionId));
}

async function markSubmissionPdfFailed(params: {
    submissionId: number;
    attemptNumber: number;
    studentId: number;
    studentName: string;
    studentIdText: string;
    teacherId: number | null;
    errorMessage: string;
}) {
    const isFinalFailure = params.attemptNumber >= MAX_SUBMISSION_PDF_ATTEMPTS;

    await db
        .update(submission)
        .set({
            pdfStatus: isFinalFailure ? SubmissionPdfStatus.FAILED : SubmissionPdfStatus.PENDING,
            pdfError: params.errorMessage,
        })
        .where(eq(submission.id, params.submissionId));

    if (!isFinalFailure) {
        return;
    }

    await notifyUser(4, params.studentId, {
        type: "PDF_FAILED",
        title: "PDF生成失败",
        content: "提交的 PDF 生成失败，请联系教师或管理员处理。",
        relatedType: "submission",
        relatedId: params.submissionId,
    });

    if (params.teacherId) {
        const studentName = params.studentName || params.studentIdText;
        await notifyUser(2, params.teacherId, {
            type: "PDF_FAILED",
            title: "PDF生成失败",
            content: `学生「${studentName}」的提交 PDF 生成失败，提交ID：${params.submissionId}`,
            relatedType: "submission",
            relatedId: params.submissionId,
        });
    }
}

async function processClaimedSubmissionPdfJob(job: ClaimedSubmissionPdfJob) {
    const payload = await loadSubmissionPdfJobPayload(job.submissionId);
    if (!payload) {
        await db.update(submission).set({
            pdfStatus: SubmissionPdfStatus.FAILED,
            pdfError: "提交记录不存在或缺少提交时间",
        }).where(eq(submission.id, job.submissionId));
        return;
    }

    const {
        questionnaireStoragePath,
        reportStoragePath,
        questionnaireAbsolutePath,
        reportAbsolutePath,
    } = getSubmissionPdfPaths(job.submissionId);
    const { questionnaireTempPath, reportTempPath } = getSubmissionPdfTempPaths(job.submissionId);

    try {
        if (!payload.questionnaire) {
            throw new Error("提交快照缺少问卷数据，无法生成问卷 PDF");
        }
        if (!payload.reportContent.trim()) {
            throw new Error("提交快照缺少实验报告内容，无法生成报告 PDF");
        }

        await generateQuestionnairePdf({
            outputPath: questionnaireTempPath,
            questionnaire: payload.questionnaire,
            meta: {
                topicName: payload.topicName,
                studentName: payload.studentName,
                submittedAt: payload.submittedAt,
            },
        });

        await generateReportPdf({
            outputPath: reportTempPath,
            reportContent: payload.reportContent,
            meta: {
                topicName: payload.topicName,
                studentName: payload.studentName,
                submittedAt: payload.submittedAt,
            },
        });

        await fs.rename(questionnaireTempPath, questionnaireAbsolutePath);
        await fs.rename(reportTempPath, reportAbsolutePath);

        await markSubmissionPdfReady({
            submissionId: job.submissionId,
            questionnairePdfPath: questionnaireStoragePath,
            reportPdfPath: reportStoragePath,
        });
    } catch (error) {
        try {
            await cleanupAbsoluteFiles([questionnaireTempPath, reportTempPath]);
        } catch (cleanupError) {
            console.error(`Failed to clean up temp PDF files for #${job.submissionId}:`, cleanupError);
        }
        const errorMessage = sanitizePdfError(error);

        await markSubmissionPdfFailed({
            submissionId: job.submissionId,
            attemptNumber: job.attemptNumber,
            studentId: payload.studentDbId,
            studentName: payload.studentName,
            studentIdText: payload.studentIdText,
            teacherId: payload.teacherId,
            errorMessage,
        });

        console.error(`Failed to generate submission PDFs for #${job.submissionId}:`, error);
    }
}

export async function processPendingSubmissionPdfs(options: { limit?: number } = {}) {
    const limit = Math.max(1, options.limit ?? SUBMISSION_PDF_BATCH_LIMIT);
    const claimedJobs = await claimSubmissionPdfJobs(limit);

    for (const job of claimedJobs) {
        await processClaimedSubmissionPdfJob(job);
    }

    return claimedJobs.length;
}

let inlineKickScheduled = false;

export function kickSubmissionPdfProcessing() {
    if (inlineKickScheduled) {
        return;
    }

    inlineKickScheduled = true;
    queueMicrotask(() => {
        void (async () => {
            try {
                for (let round = 0; round < SUBMISSION_PDF_KICK_MAX_ROUNDS; round++) {
                    const processed = await processPendingSubmissionPdfs({ limit: SUBMISSION_PDF_BATCH_LIMIT });
                    if (processed < SUBMISSION_PDF_BATCH_LIMIT) {
                        break;
                    }
                }
            } catch (error) {
                console.error("Inline submission PDF processing failed:", error);
            } finally {
                inlineKickScheduled = false;
            }
        })();
    });
}
