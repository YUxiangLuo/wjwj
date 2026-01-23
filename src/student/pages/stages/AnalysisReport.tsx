import { useState, useEffect } from "react";
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
import { BarChart3, Download, FileText, Send, Loader2, Sparkles, AlertCircle } from "lucide-react";
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
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <Card className="rounded-2xl border-slate-800 bg-slate-900/50 shadow-sm">
                        <CardHeader className="border-b border-slate-800 pb-4">
                            <CardTitle className="flex items-center gap-2 text-slate-100">
                                <BarChart3 className="w-5 h-5 text-indigo-500" />
                                图表分析
                            </CardTitle>
                            <CardDescription className="text-slate-400">系统自动生成的统计图表</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-6">
                            <Tabs defaultValue="mean">
                                <TabsList className="bg-slate-950 border border-slate-800 p-1 rounded-xl w-full flex h-auto">
                                    <TabsTrigger value="mean" className="flex-1 rounded-lg py-2 data-[state=active]:bg-slate-800 data-[state=active]:text-white text-slate-400">均值对比</TabsTrigger>
                                    <TabsTrigger value="dist" className="flex-1 rounded-lg py-2 data-[state=active]:bg-slate-800 data-[state=active]:text-white text-slate-400">分布对比</TabsTrigger>
                                    <TabsTrigger value="error" className="flex-1 rounded-lg py-2 data-[state=active]:bg-slate-800 data-[state=active]:text-white text-slate-400">误差分析</TabsTrigger>
                                </TabsList>

                                <TabsContent value="mean" className="mt-6">
                                    <div className="h-64 bg-slate-950/30 border border-slate-800 rounded-2xl flex items-center justify-center relative overflow-hidden group">
                                        <div className="absolute inset-0 bg-grid-slate-800/[0.2] [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))]"></div>
                                        <div className="text-center text-slate-500 relative z-10 group-hover:scale-105 transition-transform duration-500">
                                            <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30 text-indigo-400" />
                                            <p className="font-medium">均值对比柱状图</p>
                                            <p className="text-xs mt-1 text-slate-600">（展示三种抽样方法的均值对比）</p>
                                        </div>
                                    </div>
                                </TabsContent>

                                <TabsContent value="dist" className="mt-6">
                                    <div className="h-64 bg-slate-950/30 border border-slate-800 rounded-2xl flex items-center justify-center relative overflow-hidden group">
                                        <div className="absolute inset-0 bg-grid-slate-800/[0.2] [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))]"></div>
                                        <div className="text-center text-slate-500 relative z-10 group-hover:scale-105 transition-transform duration-500">
                                            <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30 text-teal-400" />
                                            <p className="font-medium">分布对比图</p>
                                            <p className="text-xs mt-1 text-slate-600">（展示样本分布与总体分布对比）</p>
                                        </div>
                                    </div>
                                </TabsContent>

                                <TabsContent value="error" className="mt-6">
                                    <div className="h-64 bg-slate-950/30 border border-slate-800 rounded-2xl flex items-center justify-center relative overflow-hidden group">
                                        <div className="absolute inset-0 bg-grid-slate-800/[0.2] [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))]"></div>
                                        <div className="text-center text-slate-500 relative z-10 group-hover:scale-105 transition-transform duration-500">
                                            <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30 text-amber-400" />
                                            <p className="font-medium">抽样误差分析图</p>
                                            <p className="text-xs mt-1 text-slate-600">（展示三种方法的抽样标准误对比）</p>
                                        </div>
                                    </div>
                                </TabsContent>
                            </Tabs>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card className="rounded-2xl border-slate-800 bg-slate-900/50 shadow-sm">
                        <CardHeader className="border-b border-slate-800 pb-4">
                            <CardTitle className="flex items-center gap-2 text-slate-100">
                                <Download className="w-5 h-5 text-teal-500" />
                                数据导出
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 pt-6">
                            <Button variant="outline" className="w-full justify-start border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white" onClick={() => handleExport("simple")}>
                                <FileText className="w-4 h-4 mr-2" />
                                简单随机抽样结果
                            </Button>
                            <Button variant="outline" className="w-full justify-start border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white" onClick={() => handleExport("systematic")}>
                                <FileText className="w-4 h-4 mr-2" />
                                系统抽样结果
                            </Button>
                            <Button variant="outline" className="w-full justify-start border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white" onClick={() => handleExport("stratified")}>
                                <FileText className="w-4 h-4 mr-2" />
                                分层抽样结果
                            </Button>
                            <div className="h-px bg-slate-800 my-2"></div>
                            <Button variant="default" className="w-full justify-start bg-teal-600 hover:bg-teal-700 text-white shadow-lg shadow-teal-500/20" onClick={() => handleExport("all")}>
                                <FileText className="w-4 h-4 mr-2" />
                                导出全部数据
                            </Button>
                        </CardContent>
                    </Card>

                    <Card className="rounded-2xl border-indigo-500/20 bg-indigo-500/5 shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-base text-indigo-300 flex items-center gap-2">
                                <Sparkles className="w-4 h-4" />
                                分析提示
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm text-indigo-200/70">
                            <p>• 建议先观察均值差异，再分析分布与误差。</p>
                            <p>• 对比三种抽样方法，说明原因与适用场景。</p>
                            <p>• 结合图表数据，论证您的观点。</p>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <Card className="rounded-2xl border-slate-800 bg-slate-900/50 shadow-sm">
                <CardHeader className="border-b border-slate-800 pb-4">
                    <CardTitle className="flex items-center gap-2 text-slate-100">
                        <FileText className="w-5 h-5 text-indigo-500" />
                        撰写报告
                    </CardTitle>
                    <CardDescription className="text-slate-400">
                        请根据实验结果撰写分析报告（{minLength}-{maxLength}字）
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                    <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-xl text-sm text-slate-400">
                        <p className="font-semibold text-slate-300 mb-2">建议包含以下内容：</p>
                        <ul className="list-disc list-inside space-y-1.5 pl-2">
                            <li>抽样方法选择的理由</li>
                            <li>各方法执行结果的对比分析</li>
                            <li>抽样误差的分析</li>
                            <li>对调查结论可靠性的评估</li>
                            <li>改进建议（可选）</li>
                        </ul>
                    </div>

                    <div className="space-y-3">
                        <Label htmlFor="report" className="text-slate-300">报告内容</Label>
                        <div className="relative">
                            <Textarea
                                id="report"
                                placeholder="请在此撰写您的分析报告..."
                                value={reportContent}
                                onChange={(e) => setReportContent(e.target.value)}
                                rows={16}
                                maxLength={maxLength}
                                className="bg-slate-950 border-slate-800 text-slate-200 focus:border-indigo-500 min-h-[400px] p-4 leading-relaxed resize-none"
                            />
                            <div className="absolute bottom-4 right-4 text-xs">
                                <span className={reportContent.length < minLength ? "text-rose-400" : "text-emerald-400"}>
                                    {reportContent.length < minLength
                                        ? `还需 ${minLength - reportContent.length} 字`
                                        : "✓ 字数符合要求"}
                                </span>
                                <span className="text-slate-500 ml-2">{reportContent.length}/{maxLength}</span>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Navigation */}
            <div className="flex justify-between pt-6 border-t border-slate-800/50">
                <Button variant="outline" onClick={onPrev} className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white">
                    上一阶段
                </Button>
                <Button onClick={() => setConfirmSubmitOpen(true)} disabled={!isValidLength} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20">
                    <Send className="w-4 h-4 mr-2" />
                    完成并预览提交
                </Button>
            </div>

            {/* Confirm Submit Dialog */}
            <AlertDialog open={confirmSubmitOpen} onOpenChange={setConfirmSubmitOpen}>
                <AlertDialogContent className="bg-slate-900 border-slate-800 text-slate-200">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-100">确认提交实验</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="text-sm text-slate-400">
                                您即将提交本次实验，包括：
                                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 mt-3 mb-3 space-y-1">
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                                        <span>问卷设计</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                                        <span>样本量规划</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                                        <span>抽样执行结果</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                                        <span>分析报告（{reportContent.length} 字）</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 text-amber-400 bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    <span>提交后将无法修改。确定提交吗？</span>
                                </div>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isSubmitting} className="bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white">取消</AlertDialogCancel>
                        <AlertDialogAction onClick={handleSubmit} disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
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
                <AlertDialogContent className="bg-slate-900 border-slate-800 text-slate-200">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-100">恢复草稿</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-400">检测到本地草稿，是否恢复？</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel
                            className="bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white"
                            onClick={() => {
                                if (draftKey) localStorage.removeItem(draftKey);
                                setRestoreDraftOpen(false);
                            }}
                        >
                            放弃草稿
                        </AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
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
