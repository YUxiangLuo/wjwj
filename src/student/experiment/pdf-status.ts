export const SubmissionPdfStatus = {
    PENDING: 0,
    GENERATING: 1,
    READY: 2,
    FAILED: 3,
} as const;

export type SubmissionPdfStatusCode = typeof SubmissionPdfStatus[keyof typeof SubmissionPdfStatus];
export type SubmissionPdfState = "pending" | "generating" | "ready" | "failed";

export const MAX_SUBMISSION_PDF_ATTEMPTS = 3;
export const SUBMISSION_PDF_RETRY_DELAY_MS = 60_000;
export const SUBMISSION_PDF_STALE_GENERATING_MS = 10 * 60_000;

export function getSubmissionPdfState(params: {
    status: number | null | undefined;
    questionnairePdfPath?: string | null;
    reportPdfPath?: string | null;
}): SubmissionPdfState {
    if (params.questionnairePdfPath && params.reportPdfPath) {
        return "ready";
    }

    switch (params.status) {
        case SubmissionPdfStatus.GENERATING:
            return "generating";
        case SubmissionPdfStatus.READY:
            return "ready";
        case SubmissionPdfStatus.FAILED:
            return "failed";
        case SubmissionPdfStatus.PENDING:
        default:
            return "pending";
    }
}

export function getSubmissionPdfMessage(params: {
    status: number | null | undefined;
    attempts?: number | null;
    questionnairePdfPath?: string | null;
    reportPdfPath?: string | null;
}) {
    const state = getSubmissionPdfState(params);

    switch (state) {
        case "ready":
            return null;
        case "generating":
            return "PDF 正在生成，请稍后刷新。";
        case "failed":
            return "PDF 生成失败，请联系教师或管理员。";
        case "pending":
        default:
            return (params.attempts ?? 0) > 0
                ? "PDF 生成失败，系统正在自动重试。"
                : "PDF 已加入生成队列，请稍后刷新。";
    }
}
