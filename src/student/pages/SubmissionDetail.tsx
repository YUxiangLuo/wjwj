import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download, Loader2, FileText, CheckCircle2, AlertCircle, Calendar, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { submissionsApi, type SubmissionDetail } from "../api-client";
import { cn } from "@/lib/utils";

type SubmissionStatusView = {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
};

const statusConfig: Record<number, SubmissionStatusView> = {
    0: { label: "待批改", variant: "outline" },
    1: { label: "待批改", variant: "outline" },
    2: { label: "已批改", variant: "default" },
    3: { label: "被驳回", variant: "destructive" },
};

function getScoreClass(score: number | null | undefined) {
    if (score == null) return "text-muted-foreground";
    if (score < 60) return "text-destructive";
    return "text-primary";
}

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
                <Loader2 className="size-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!detail) {
        return (
            <Empty className="mt-20">
                <EmptyHeader>
                    <EmptyMedia variant="icon">
                        <FileText />
                    </EmptyMedia>
                    <EmptyTitle>未找到提交记录</EmptyTitle>
                    <EmptyDescription>该提交可能已被删除或你没有访问权限。</EmptyDescription>
                </EmptyHeader>
            </Empty>
        );
    }

    const status = statusConfig[detail.status] ?? statusConfig[1]!;
    const scoreItems = [
        { label: "问卷设计", value: detail.scoreQuestionnaire, weight: detail.weights.questionnaire },
        { label: "实验过程", value: detail.scoreProcess, weight: detail.weights.process },
        { label: "实验报告", value: detail.scoreReport, weight: detail.weights.report },
    ];

    return (
        <div className="mx-auto flex max-w-4xl flex-col gap-6" data-testid="student-submission-detail">
            <div className="flex items-center justify-between">
                <Button variant="ghost" asChild>
                    <Link to={`/task/${detail.taskId}/history`}>
                        <ArrowLeft data-icon="inline-start" />
                        返回历史记录
                    </Link>
                </Button>
                <Badge variant={status.variant}>
                    {detail.status === 2 ? <CheckCircle2 /> :
                        detail.status === 3 ? <AlertCircle /> :
                            <Loader2 className="animate-spin" />}
                    {status.label}
                </Badge>
            </div>

            <Card size="sm" className="bg-muted/30">
                <CardHeader className="border-b border-border">
                    <CardTitle className="flex items-center gap-3 text-2xl normal-case tracking-normal text-foreground">
                        {detail.topicName}
                    </CardTitle>
                    <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                            <Calendar className="size-4" />
                            <span>提交: <span className="ml-1 text-foreground">{detail.submittedAt ? new Date(detail.submittedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : "-"}</span></span>
                        </div>
                        {detail.gradedAt && (
                            <div className="flex items-center gap-1.5">
                                <CheckCircle2 className="size-4 text-primary" />
                                <span>批改: <span className="ml-1 text-foreground">{new Date(detail.gradedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</span></span>
                            </div>
                        )}
                        {detail.graderName && (
                            <div className="flex items-center gap-1.5">
                                <User className="size-4 text-primary" />
                                <span>批改人: <span className="ml-1 text-foreground">{detail.graderName}</span></span>
                            </div>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-6">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                        {scoreItems.map((item) => (
                            <div key={item.label} className="rounded-lg border border-border bg-background/60 p-4 text-center">
                                <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">{item.label}</div>
                                <div className="font-mono text-2xl font-bold text-foreground">{item.value ?? "-"}</div>
                                <div className="mt-1 text-[10px] text-muted-foreground">权重 {item.weight}%</div>
                            </div>
                        ))}
                        <div className="rounded-lg border border-primary/20 bg-primary/10 p-4 text-center">
                            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-primary">总分</div>
                            <div className={cn("font-mono text-3xl font-bold", getScoreClass(detail.totalScore))}>
                                {detail.totalScore ?? "-"}
                            </div>
                        </div>
                    </div>

                    {detail.teacherComment && (
                        <div className="rounded-xl border border-border bg-background/60 p-5">
                            <h4 className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                                <FileText className="size-4 text-primary" />
                                教师评语
                            </h4>
                            <p className="whitespace-pre-line border-l-2 border-primary/30 pl-6 text-sm leading-relaxed text-foreground/80">
                                {detail.teacherComment}
                            </p>
                        </div>
                    )}

                    {detail.rejectReason && (
                        <Alert variant="destructive">
                            <AlertCircle />
                            <AlertTitle>驳回理由</AlertTitle>
                            <AlertDescription className="whitespace-pre-line">
                                {detail.rejectReason}
                            </AlertDescription>
                        </Alert>
                    )}

                    <Separator />

                    <div className="flex flex-wrap gap-4">
                        <Button
                            variant="outline"
                            onClick={() => handleDownload("questionnaire")}
                            disabled={!detail.questionnairePdfPath}
                        >
                            <Download data-icon="inline-start" />
                            下载问卷 PDF
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => handleDownload("report")}
                            disabled={!detail.reportPdfPath}
                        >
                            <Download data-icon="inline-start" />
                            下载报告 PDF
                        </Button>
                    </div>

                    {detail.pdfStatus !== "ready" && detail.pdfStatusMessage && (
                        <Alert
                            variant={detail.pdfStatus === "failed" ? "destructive" : "info"}
                            className="flex items-center justify-between gap-3"
                        >
                            <AlertDescription>{detail.pdfStatusMessage}</AlertDescription>
                            {refreshingPdf && <Loader2 className="size-4 shrink-0 animate-spin" />}
                        </Alert>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

export default SubmissionDetailPage;
