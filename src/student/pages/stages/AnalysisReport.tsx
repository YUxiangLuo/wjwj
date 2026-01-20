import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BarChart3, Download, FileText, Send, Loader2 } from "lucide-react";
import { useExperiment } from "../ExperimentLayout";

interface AnalysisReportProps {
    onPrev: () => void;
    onSubmit: () => void;
}

export function AnalysisReport({ onPrev, onSubmit }: AnalysisReportProps) {
    const { experiment, saveExperiment } = useExperiment();

    // Initialize from saved data
    const [reportContent, setReportContent] = useState(experiment?.reportContent ?? "");
    const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [restoreDraftOpen, setRestoreDraftOpen] = useState(false);
    const [pendingDraft, setPendingDraft] = useState<string | null>(null);
    const draftKey = experiment?.taskId ? `student_report_draft_${experiment.taskId}` : null;

    const minLength = 100;
    const maxLength = 5000;
    const isValidLength = reportContent.length >= minLength && reportContent.length <= maxLength;

    const persistDraft = useCallback(() => {
        if (!draftKey) return;
        if (reportContent) {
            localStorage.setItem(draftKey, reportContent);
        }
    }, [draftKey, reportContent]);

    // Idle auto-save (3s)
    useEffect(() => {
        const timer = setTimeout(() => {
            if (reportContent) {
                saveExperiment({ reportContent });
                persistDraft();
            }
        }, 3000);
        return () => clearTimeout(timer);
    }, [reportContent, saveExperiment, persistDraft]);

    // Interval auto-save (30s)
    useEffect(() => {
        const timer = setInterval(() => {
            if (reportContent) {
                saveExperiment({ reportContent });
                persistDraft();
            }
        }, 30000);
        return () => clearInterval(timer);
    }, [reportContent, saveExperiment, persistDraft]);

    // Restore draft from localStorage
    useEffect(() => {
        if (!draftKey) return;
        const raw = localStorage.getItem(draftKey);
        if (!raw) return;
        const hasServerData = Boolean(experiment?.reportContent);
        if (hasServerData && raw === experiment?.reportContent) return;
        setPendingDraft(raw);
        setRestoreDraftOpen(true);
    }, [draftKey, experiment?.reportContent]);

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            // Save final report content before preview
            await saveExperiment({ reportContent });
            onSubmit();
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleExport = async (type: "simple" | "systematic" | "stratified" | "all") => {
        if (!experiment?.taskId) return;
        try {
            const res = await fetch(`/api/student/tasks/${experiment.taskId}/export?type=${type}`, {
                credentials: "include",
            });
            if (!res.ok) throw new Error("导出失败");
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `sampling_${type}.csv`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Export failed:", error);
        }
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Charts area */}
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <BarChart3 className="w-5 h-5" />
                                图表分析
                            </CardTitle>
                            <CardDescription>系统自动生成的统计图表</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Tabs defaultValue="mean">
                                <TabsList>
                                    <TabsTrigger value="mean">均值对比</TabsTrigger>
                                    <TabsTrigger value="dist">分布对比</TabsTrigger>
                                    <TabsTrigger value="error">误差分析</TabsTrigger>
                                </TabsList>

                                <TabsContent value="mean" className="mt-4">
                                    <div className="h-64 bg-slate-100 rounded-lg flex items-center justify-center">
                                        <div className="text-center text-muted-foreground">
                                            <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                            <p>均值对比柱状图</p>
                                            <p className="text-sm">（展示三种抽样方法的均值对比）</p>
                                        </div>
                                    </div>
                                </TabsContent>

                                <TabsContent value="dist" className="mt-4">
                                    <div className="h-64 bg-slate-100 rounded-lg flex items-center justify-center">
                                        <div className="text-center text-muted-foreground">
                                            <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                            <p>分布对比图</p>
                                            <p className="text-sm">（展示样本分布与总体分布对比）</p>
                                        </div>
                                    </div>
                                </TabsContent>

                                <TabsContent value="error" className="mt-4">
                                    <div className="h-64 bg-slate-100 rounded-lg flex items-center justify-center">
                                        <div className="text-center text-muted-foreground">
                                            <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                            <p>抽样误差分析图</p>
                                            <p className="text-sm">（展示三种方法的抽样标准误对比）</p>
                                        </div>
                                    </div>
                                </TabsContent>
                            </Tabs>
                        </CardContent>
                    </Card>
                </div>

                {/* Export area */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Download className="w-5 h-5" />
                                数据导出
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <Button variant="outline" className="w-full justify-start" onClick={() => handleExport("simple")}>
                                <FileText className="w-4 h-4 mr-2" />
                                简单随机抽样结果
                            </Button>
                            <Button variant="outline" className="w-full justify-start" onClick={() => handleExport("systematic")}>
                                <FileText className="w-4 h-4 mr-2" />
                                系统抽样结果
                            </Button>
                            <Button variant="outline" className="w-full justify-start" onClick={() => handleExport("stratified")}>
                                <FileText className="w-4 h-4 mr-2" />
                                分层抽样结果
                            </Button>
                            <Button variant="outline" className="w-full justify-start" onClick={() => handleExport("all")}>
                                <FileText className="w-4 h-4 mr-2" />
                                导出全部数据
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Report writing area */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        撰写报告
                    </CardTitle>
                    <CardDescription>
                        请根据实验结果撰写分析报告（{minLength}-{maxLength}字）
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="p-4 bg-blue-50 rounded-lg text-sm text-blue-700">
                        <p className="font-medium mb-2">建议包含以下内容：</p>
                        <ol className="list-decimal list-inside space-y-1">
                            <li>抽样方法选择的理由</li>
                            <li>各方法执行结果的对比分析</li>
                            <li>抽样误差的分析</li>
                            <li>对调查结论可靠性的评估</li>
                            <li>改进建议（可选）</li>
                        </ol>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="report">报告内容</Label>
                        <Textarea
                            id="report"
                            placeholder="请在此撰写您的分析报告..."
                            value={reportContent}
                            onChange={(e) => setReportContent(e.target.value)}
                            rows={12}
                            maxLength={maxLength}
                        />
                        <div className="flex justify-between text-sm">
                            <span className={reportContent.length < minLength ? "text-red-500" : "text-muted-foreground"}>
                                {reportContent.length < minLength
                                    ? `还需 ${minLength - reportContent.length} 字`
                                    : "✓ 字数符合要求"}
                            </span>
                            <span className="text-muted-foreground">{reportContent.length}/{maxLength}</span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Navigation */}
            <div className="flex justify-between">
                <Button variant="outline" onClick={onPrev}>
                    上一阶段
                </Button>
                <Button onClick={() => setConfirmSubmitOpen(true)} disabled={!isValidLength}>
                    <Send className="w-4 h-4 mr-2" />
                    完成并预览提交
                </Button>
            </div>

            {/* Confirm Submit Dialog */}
            <AlertDialog open={confirmSubmitOpen} onOpenChange={setConfirmSubmitOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>确认提交实验</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="text-sm text-muted-foreground">
                                您即将提交本次实验，包括：
                                <ul className="list-disc list-inside mt-2">
                                    <li>问卷设计</li>
                                    <li>样本量规划</li>
                                    <li>抽样执行结果</li>
                                    <li>分析报告（{reportContent.length} 字）</li>
                                </ul>
                                <p className="mt-2"><strong>提交后将无法修改。</strong>确定提交吗？</p>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isSubmitting}>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={handleSubmit} disabled={isSubmitting}>
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    提交中...
                                </>
                            ) : (
                                "确认提交"
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={restoreDraftOpen} onOpenChange={setRestoreDraftOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>恢复草稿</AlertDialogTitle>
                        <AlertDialogDescription>检测到本地草稿，是否恢复？</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel
                            onClick={() => {
                                if (draftKey) localStorage.removeItem(draftKey);
                                setRestoreDraftOpen(false);
                            }}
                        >
                            放弃草稿
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (pendingDraft !== null) {
                                    setReportContent(pendingDraft);
                                }
                                setRestoreDraftOpen(false);
                            }}
                        >
                            恢复草稿
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

export default AnalysisReport;
