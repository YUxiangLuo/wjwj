import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { submissionsApi, type SubmissionDetail } from "../api-client";

const statusLabels: Record<number, { label: string; color: string }> = {
    0: { label: "批改草稿", color: "bg-slate-100 text-slate-700" },
    1: { label: "待批改", color: "bg-amber-100 text-amber-700" },
    2: { label: "已批改", color: "bg-emerald-100 text-emerald-700" },
    3: { label: "被驳回", color: "bg-red-100 text-red-700" },
};

export function SubmissionDetailPage() {
    const { submissionId } = useParams();
    const [detail, setDetail] = useState<SubmissionDetail | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function load() {
            if (!submissionId) return;
            setLoading(true);
            try {
                const res = await submissionsApi.getDetail(Number(submissionId));
                if (res.success && res.data) {
                    setDetail(res.data);
                }
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [submissionId]);

    const handleDownload = async (type: "questionnaire" | "report") => {
        if (!detail) return;
        try {
            const res = await fetch(`/api/student/submissions/${detail.id}/download?type=${type}`, {
                credentials: "include",
            });
            if (!res.ok) throw new Error("下载失败");
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = type === "questionnaire" ? "questionnaire.pdf" : "report.pdf";
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
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!detail) {
        return <div className="text-center text-muted-foreground">未找到提交记录</div>;
    }

    const status = statusLabels[detail.status] ?? statusLabels[1] ?? { label: "待批改", color: "bg-amber-100 text-amber-700" };

    return (
        <div className="space-y-6">
            <Link to={`/task/${detail.taskId}/history`}>
                <Button variant="ghost" className="gap-2">
                    <ArrowLeft className="w-4 h-4" />
                    返回历史记录
                </Button>
            </Link>

            <Card>
                <CardHeader>
                    <CardTitle>{detail.topicName}</CardTitle>
                    <CardDescription>提交详情</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <Badge className={status.color}>{status.label}</Badge>
                    <div className="text-sm text-muted-foreground">提交时间：{detail.submittedAt ? new Date(detail.submittedAt).toLocaleString("zh-CN") : "-"}</div>
                    {detail.gradedAt && (
                        <div className="text-sm text-muted-foreground">批改时间：{new Date(detail.gradedAt).toLocaleString("zh-CN")}</div>
                    )}
                    {detail.graderName && (
                        <div className="text-sm text-muted-foreground">批改人：{detail.graderName}</div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>评分详情</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    <div className="text-sm">问卷设计：{detail.scoreQuestionnaire ?? "-"} 分（权重 {detail.weights.questionnaire}%）</div>
                    <div className="text-sm">实验过程：{detail.scoreProcess ?? "-"} 分（权重 {detail.weights.process}%）</div>
                    <div className="text-sm">实验报告：{detail.scoreReport ?? "-"} 分（权重 {detail.weights.report}%）</div>
                    <div className="text-base font-medium">总分：{detail.totalScore ?? "-"}</div>
                </CardContent>
            </Card>

            {detail.teacherComment && (
                <Card>
                    <CardHeader>
                        <CardTitle>教师评语</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground whitespace-pre-line">
                        {detail.teacherComment}
                    </CardContent>
                </Card>
            )}

            {detail.rejectReason && (
                <Card className="border-red-200 bg-red-50">
                    <CardHeader>
                        <CardTitle className="text-red-700">驳回理由</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-red-700 whitespace-pre-line">
                        {detail.rejectReason}
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>PDF 查看</CardTitle>
                </CardHeader>
                <CardContent className="flex gap-3">
                    <Button variant="outline" onClick={() => handleDownload("questionnaire")} disabled={!detail.questionnairePdfPath}>
                        <Download className="w-4 h-4 mr-2" />
                        问卷 PDF
                    </Button>
                    <Button variant="outline" onClick={() => handleDownload("report")} disabled={!detail.reportPdfPath}>
                        <Download className="w-4 h-4 mr-2" />
                        报告 PDF
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}

export default SubmissionDetailPage;
