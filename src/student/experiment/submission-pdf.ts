import { createWriteStream } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { eq } from "drizzle-orm";
import PDFDocument from "pdfkit";
import { db } from "../../db";
import { notification, submission } from "../../db/schema";
import { getRichTextPlainText } from "../../utils/rich-text";

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
        doc.fontSize(12).text(getRichTextPlainText(params.welcomeText) || "");
        doc.moveDown();

        params.questions.forEach((question, index) => {
            doc.fontSize(12).text(`Q${index + 1}. [${formatQuestionType(question.type)}] ${question.content}`);
            if (question.type === "boolean") {
                doc.text("选项：是 / 否", { indent: 16 });
            }
            if ((question.type === "single" || question.type === "multiple") && Array.isArray(question.options)) {
                question.options.forEach((option: string, optionIndex: number) => {
                    const label = String.fromCharCode(65 + optionIndex);
                    doc.text(`${label}. ${option}`, { indent: 16 });
                });
            }
            if (question.type === "scale") {
                doc.text(`量表范围：${question.scaleMin ?? 1} - ${question.scaleMax ?? 10}`, { indent: 16 });
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

export function scheduleSubmissionPdfGeneration(params: {
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
