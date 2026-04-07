import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download, Loader2, FileText, CheckCircle2, AlertCircle, Calendar, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { submissionsApi, type SubmissionDetail } from "../api-client";
import { cn } from "@/lib/utils";

const statusConfig: Record<number, { label: string; color: string }> = {
    0: { label: "待批改", color: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
    1: { label: "待批改", color: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
    2: { label: "已批改", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
    3: { label: "被驳回", color: "bg-red-500/10 text-red-600 border-red-500/20" },
};

function getDownloadFileName(contentDisposition: string | null, fallback: string) {
    if (!contentDisposition) return fallback;

    const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
        return decodeURIComponent(utf8Match[1]);
    }

    const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
    return plainMatch?.[1] || fallback;
}

export function SubmissionDetailPage() {
    const { submissionId } = useParams();
    const [detail, setDetail] = useState<SubmissionDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshingPdf, setRefreshingPdf] = useState(false);
    const pollCountRef = useRef(0);

    async function loadDetail(options?: { background?: boolean }) {
        if (!submissionId) return;

        const isBackground = options?.background === true;
        if (isBackground) {
            setRefreshingPdf(true);
        } else {
            setLoading(true);
        }

        try {
            const res = await submissionsApi.getDetail(Number(submissionId));
            if (res.success && res.data) {
                setDetail(res.data);
            }
        } finally {
            if (isBackground) {
                setRefreshingPdf(false);
            } else {
                setLoading(false);
            }
        }
    }

    useEffect(() => {
        pollCountRef.current = 0;
        void loadDetail();
    }, [submissionId]);

    useEffect(() => {
        if (!submissionId || !detail) return;
        if (detail.pdfStatus === "ready" || detail.pdfStatus === "failed") return;

        const MAX_POLLS = 60;
        const BASE_INTERVAL = 5000;
        const MAX_INTERVAL = 30000;

        if (pollCountRef.current >= MAX_POLLS) return;

        const delay = Math.min(BASE_INTERVAL * Math.pow(1.5, pollCountRef.current), MAX_INTERVAL);
        const timer = window.setTimeout(() => {
            pollCountRef.current += 1;
            void loadDetail({ background: true });
        }, delay);

        return () => window.clearTimeout(timer);
    }, [detail, submissionId]);

    const handleDownload = async (type: "questionnaire" | "report") => {
        if (!detail) return;
        try {
            const res = await fetch(`/api/student/submissions/${detail.id}/download?type=${type}`, {
                credentials: "include",
            });
            if (!res.ok) throw new Error("下载失败");
            const blob = await res.blob();
            const fileName = getDownloadFileName(
                res.headers.get("Content-Disposition"),
                type === "questionnaire" ? "questionnaire.pdf" : "report.pdf"
            );
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = fileName.toLowerCase().endsWith(".pdf") ? fileName : `${fileName}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Download failed:", error);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <Loader2 className="w-8 h-8 animate-spin text-cyan-600" />
            </div>
        );
    }

    if (!detail) {
        return <div className="text-center text-slate-500 mt-20">未找到提交记录</div>;
    }

    const status = statusConfig[detail.status] ?? statusConfig[1]!;

    return (
        <div className="space-y-6 max-w-4xl mx-auto" data-testid="student-submission-detail">
            <div className="flex items-center justify-between">
                <Link to={`/task/${detail.taskId}/history`}>
                    <Button variant="ghost" className="gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-800">
                        <ArrowLeft className="w-4 h-4" />
                        返回历史记录
                    </Button>
                </Link>
                {/* Status Badge in Header */}
                <Badge variant="outline" className={cn("px-3 py-1 text-sm border font-medium flex items-center gap-1.5", status.color)}>
                    {detail.status === 2 ? <CheckCircle2 className="w-3.5 h-3.5" /> :
                        detail.status === 3 ? <AlertCircle className="w-3.5 h-3.5" /> :
                            <Loader2 className="w-3.5 h-3.5" />}
                    {status.label}
                </Badge>
            </div>

            <Card className="border-indigo-500/20 bg-slate-50/40 dark:bg-slate-900/40 backdrop-blur-xl shadow-2xl overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-cyan-400 opacity-20" />
                <CardHeader className="pb-4 border-b border-slate-300/30 dark:border-slate-700/30">
                    <CardTitle className="text-2xl text-slate-900 dark:text-slate-100 flex items-center gap-3">
                        <span className="bg-clip-text text-transparent bg-gradient-to-r from-slate-900 dark:from-white to-slate-600 dark:to-slate-400">
                            {detail.topicName}
                        </span>
                    </CardTitle>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600 dark:text-slate-400 mt-2">
                        <div className="flex items-center gap-1.5">
                            <Calendar className="w-4 h-4 text-slate-500" />
                            <span>提交: <span className="text-slate-700 dark:text-slate-300 ml-1">{detail.submittedAt ? new Date(detail.submittedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : "-"}</span></span>
                        </div>
                        {detail.gradedAt && (
                            <div className="flex items-center gap-1.5">
                                <CheckCircle2 className="w-4 h-4 text-emerald-500/80" />
                                <span>批改: <span className="text-slate-700 dark:text-slate-300 ml-1">{new Date(detail.gradedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</span></span>
                            </div>
                        )}
                        {detail.graderName && (
                            <div className="flex items-center gap-1.5">
                                <User className="w-4 h-4 text-indigo-500" />
                                <span>批改人: <span className="text-slate-700 dark:text-slate-300 ml-1">{detail.graderName}</span></span>
                            </div>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                    {/* Score Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-slate-200/40 dark:bg-slate-800/40 rounded-lg p-4 text-center border border-slate-300/30 dark:border-slate-700/30">
                            <div className="text-xs text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">问卷设计</div>
                            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono">{detail.scoreQuestionnaire ?? "-"}</div>
                            <div className="text-[10px] text-slate-500 mt-1">权重 {detail.weights.questionnaire}%</div>
                        </div>
                        <div className="bg-slate-200/40 dark:bg-slate-800/40 rounded-lg p-4 text-center border border-slate-300/30 dark:border-slate-700/30">
                            <div className="text-xs text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">实验过程</div>
                            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono">{detail.scoreProcess ?? "-"}</div>
                            <div className="text-[10px] text-slate-500 mt-1">权重 {detail.weights.process}%</div>
                        </div>
                        <div className="bg-slate-200/40 dark:bg-slate-800/40 rounded-lg p-4 text-center border border-slate-300/30 dark:border-slate-700/30">
                            <div className="text-xs text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">实验报告</div>
                            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono">{detail.scoreReport ?? "-"}</div>
                            <div className="text-[10px] text-slate-500 mt-1">权重 {detail.weights.report}%</div>
                        </div>
                        <div className="bg-indigo-900/20 rounded-lg p-4 text-center border border-indigo-500/30 relative overflow-hidden">
                            <div className="absolute inset-0 bg-indigo-500/5" />
                            <div className="text-xs text-indigo-700 dark:text-indigo-300 mb-1 uppercase tracking-wider font-semibold relative">总分</div>
                            <div className={cn("text-3xl font-bold font-mono relative",
                                (detail.totalScore ?? 0) >= 90 ? "text-emerald-600" :
                                    (detail.totalScore ?? 0) >= 60 ? "text-cyan-600" : "text-slate-900 dark:text-slate-100"
                            )}>
                                {detail.totalScore ?? "-"}
                            </div>
                        </div>
                    </div>

                    {/* Teacher Comment */}
                    {detail.teacherComment && (
                        <div className="bg-slate-200/30 dark:bg-slate-800/30 rounded-xl p-5 border border-slate-300/50 dark:border-slate-700/50">
                            <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                                <FileText className="w-4 h-4 text-indigo-500" />
                                教师评语
                            </h4>
                            <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed whitespace-pre-line pl-6 border-l-2 border-indigo-500/30">
                                {detail.teacherComment}
                            </p>
                        </div>
                    )}

                    {/* Reject Reason */}
                    {detail.rejectReason && (
                        <div className="bg-red-500/10 rounded-xl p-5 border border-red-500/20">
                            <h4 className="text-sm font-medium text-red-600 mb-2 flex items-center gap-2">
                                <AlertCircle className="w-4 h-4" />
                                驳回理由
                            </h4>
                            <p className="text-red-700/90 dark:text-red-300/90 text-sm leading-relaxed whitespace-pre-line pl-6 border-l-2 border-red-500/30">
                                {detail.rejectReason}
                            </p>
                        </div>
                    )}

                    {/* Downloads */}
                    <div className="pt-4 border-t border-slate-300/30 dark:border-slate-700/30 flex flex-wrap gap-4">
                        <Button
                            variant="outline"
                            onClick={() => handleDownload("questionnaire")}
                            disabled={!detail.questionnairePdfPath}
                            className="bg-slate-200/50 dark:bg-slate-800/50 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-300 dark:hover:bg-slate-700 hover:border-slate-400 dark:hover:border-slate-600 gap-2"
                        >
                            <Download className="w-4 h-4" />
                            下载问卷 PDF
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => handleDownload("report")}
                            disabled={!detail.reportPdfPath}
                            className="bg-slate-200/50 dark:bg-slate-800/50 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-300 dark:hover:bg-slate-700 hover:border-slate-400 dark:hover:border-slate-600 gap-2"
                        >
                            <Download className="w-4 h-4" />
                            下载报告 PDF
                        </Button>
                    </div>

                    {detail.pdfStatus !== "ready" && detail.pdfStatusMessage && (
                        <div className={cn(
                            "rounded-xl border px-4 py-3 text-sm flex items-center justify-between gap-3",
                            detail.pdfStatus === "failed"
                                ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
                                : "border-cyan-500/20 bg-cyan-500/10 text-cyan-800 dark:text-cyan-200"
                        )}>
                            <span>{detail.pdfStatusMessage}</span>
                            {refreshingPdf && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

export default SubmissionDetailPage;
