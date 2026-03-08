import { expect, test } from "bun:test";
import {
    getSubmissionPdfMessage,
    getSubmissionPdfState,
    SubmissionPdfStatus,
} from "./pdf-status";

test("pdf state becomes ready when both PDF paths exist", () => {
    expect(getSubmissionPdfState({
        status: SubmissionPdfStatus.PENDING,
        questionnairePdfPath: "/storage/uploads/submissions/q.pdf",
        reportPdfPath: "/storage/uploads/submissions/r.pdf",
    })).toBe("ready");
});

test("pdf message distinguishes fresh pending jobs from retrying jobs", () => {
    expect(getSubmissionPdfMessage({
        status: SubmissionPdfStatus.PENDING,
        attempts: 0,
    })).toBe("PDF 已加入生成队列，请稍后刷新。");

    expect(getSubmissionPdfMessage({
        status: SubmissionPdfStatus.PENDING,
        attempts: 2,
    })).toBe("PDF 生成失败，系统正在自动重试。");
});

test("pdf message reports final failure", () => {
    expect(getSubmissionPdfState({
        status: SubmissionPdfStatus.FAILED,
        questionnairePdfPath: null,
        reportPdfPath: null,
    })).toBe("failed");

    expect(getSubmissionPdfMessage({
        status: SubmissionPdfStatus.FAILED,
        attempts: 3,
    })).toBe("PDF 生成失败，请联系教师或管理员。");
});
