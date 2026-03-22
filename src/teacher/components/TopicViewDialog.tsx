import { useState, useEffect } from "react";
import { BookOpen, FileText, Layers, ListChecks, PieChart, Table2, ExternalLink, CheckCircle2, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { RichTextContent } from "@/components/RichTextContent";
import { teacherApi, type TopicDetail, type Topic } from "../api-client";

const QUESTION_TYPE_LABELS: Record<number, string> = {
    1: "判断题",
    2: "单选题",
    3: "多选题",
    4: "量表题",
};

type TabKey = "basic" | "data" | "mapping" | "attachments" | "questions" | "weights";

const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "basic", label: "基本信息", icon: BookOpen },
    { key: "data", label: "数据概览", icon: Table2 },
    { key: "mapping", label: "字段映射", icon: Layers },
    { key: "attachments", label: "辅助资料", icon: FileText },
    { key: "questions", label: "推荐题目", icon: ListChecks },
    { key: "weights", label: "评分权重", icon: PieChart },
];

interface TopicViewDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    topic: Topic | null;
}

export function TopicViewDialog({ open, onOpenChange, topic }: TopicViewDialogProps) {
    const [detail, setDetail] = useState<TopicDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<TabKey>("basic");

    const topicId = topic?.id ?? null;

    useEffect(() => {
        if (open && topicId !== null) {
            setActiveTab("basic");
            loadDetail(topicId);
        } else {
            setDetail(null);
        }
    }, [open, topicId]);

    async function loadDetail(id: number) {
        setLoading(true);
        const res = await teacherApi.getTopicDetail(id);
        if (res.success && res.data) {
            setDetail(res.data);
        }
        setLoading(false);
    }

    function safeParseJson(raw: unknown): Record<string, unknown> | null {
        if (!raw) return null;
        if (typeof raw === "object") return raw as Record<string, unknown>;
        if (typeof raw === "string") {
            try { return JSON.parse(raw); } catch { return null; }
        }
        return null;
    }

    const fieldMapping = (() => {
        const parsed = safeParseJson(detail?.topic?.fieldMapping);
        return {
            identifier: parsed?.identifier as string | undefined,
            stratified: (parsed?.stratified ?? []) as string[],
            numeric: (parsed?.numeric ?? []) as string[],
            others: (parsed?.others ?? []) as string[],
        };
    })();

    const weightConfig = (() => {
        const parsed = safeParseJson(detail?.topic?.weightConfig);
        return {
            questionnaire: (parsed?.questionnaire ?? 30) as number,
            process: (parsed?.process ?? 30) as number,
            report: (parsed?.report ?? 40) as number,
        };
    })();

    if (!topic) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="sm:max-w-5xl h-[80vh] flex flex-col bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200"
                onInteractOutside={(e) => e.preventDefault()}
            >
                <DialogHeader>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center border border-indigo-500/20">
                            <Eye className="w-5 h-5" />
                        </div>
                        <div>
                            <DialogTitle className="text-slate-900 dark:text-slate-100">{topic.name}</DialogTitle>
                            <DialogDescription className="sr-only">
                                查看课题的基本信息、数据配置、字段映射和评分权重。
                            </DialogDescription>
                            <div className="flex items-center gap-2 mt-1">
                                {topic.status === 1 ? (
                                    <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs">已发布</Badge>
                                ) : (
                                    <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-xs">草稿</Badge>
                                )}
                                <span className="text-xs text-slate-500">创建于 {new Date(topic.createdAt).toLocaleDateString("zh-CN")}</span>
                            </div>
                        </div>
                    </div>
                </DialogHeader>

                {/* Tab navigation */}
                <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800 pb-0 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700">
                    {TABS.map(({ key, label, icon: Icon }) => (
                        <button
                            key={key}
                            onClick={() => setActiveTab(key)}
                            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-md transition-colors border-b-2 whitespace-nowrap ${
                                activeTab === key
                                    ? "text-indigo-500 border-indigo-400 bg-indigo-500/5"
                                    : "text-slate-500 border-transparent hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/50"
                            }`}
                        >
                            <Icon className="w-3.5 h-3.5" />
                            {label}
                        </button>
                    ))}
                </div>

                {/* Tab content */}
                <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700 scrollbar-track-transparent">
                    {loading ? (
                        <div className="flex items-center justify-center py-20 text-slate-500">加载中...</div>
                    ) : (
                        <>
                            {/* Basic Info Tab */}
                            {activeTab === "basic" && (
                                <div className="space-y-4 py-4 animate-in fade-in duration-300">
                                    <div className="space-y-2">
                                        <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">课题名称</div>
                                        <div className="text-base text-slate-900 dark:text-slate-100 font-medium">{topic.name}</div>
                                    </div>
                                    <Separator className="bg-slate-200 dark:bg-slate-800" />
                                    <div className="space-y-2">
                                        <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">背景描述</div>
                                        <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed bg-white/50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-lg p-4 max-h-[300px] overflow-y-auto">
                                            <RichTextContent
                                                html={detail?.topic?.description || topic.description || ""}
                                                emptyFallback="暂无描述"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Data overview Tab */}
                            {activeTab === "data" && (
                                <div className="space-y-4 py-4 animate-in fade-in duration-300">
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-4 text-center">
                                            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{detail?.topic?.excelRowCount ?? topic.dataRows ?? 0}</div>
                                            <div className="text-xs text-slate-500 mt-1">数据行数</div>
                                        </div>
                                        <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-4 text-center">
                                            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{detail?.excelInfo?.columns?.length ?? 0}</div>
                                            <div className="text-xs text-slate-500 mt-1">数据列数</div>
                                        </div>
                                        <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-4 text-center">
                                            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                                                {detail?.topic?.excelFilePath ? (
                                                    <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto" />
                                                ) : (
                                                    <span className="text-slate-500">—</span>
                                                )}
                                            </div>
                                            <div className="text-xs text-slate-500 mt-1">数据文件</div>
                                        </div>
                                    </div>
                                    {detail?.excelInfo?.preview && detail.excelInfo.preview.length > 0 && (
                                        <div className="space-y-2">
                                            <div className="text-xs text-slate-600 dark:text-slate-400 font-medium">数据预览（前 {Math.min(detail.excelInfo.preview.length, 10)} 行）</div>
                                            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                                                <table className="w-full text-xs">
                                                    <thead>
                                                        <tr className="bg-slate-200/50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                                                            {detail.excelInfo.columns.map((col) => (
                                                                <th key={col} className="text-left px-3 py-2 text-slate-600 dark:text-slate-400 font-medium whitespace-nowrap">{col}</th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {detail.excelInfo.preview.slice(0, 10).map((row, idx) => (
                                                            <tr key={idx} className="border-b border-slate-200/50 dark:border-slate-800/50 hover:bg-slate-200/30 dark:hover:bg-slate-800/30">
                                                                {detail.excelInfo!.columns.map((col) => (
                                                                    <td key={col} className="px-3 py-1.5 text-slate-700 dark:text-slate-300 whitespace-nowrap max-w-[200px] truncate">
                                                                        {row?.[col] != null ? String(row[col]) : <span className="text-slate-500">-</span>}
                                                                    </td>
                                                                ))}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                    {(!detail?.excelInfo?.preview || detail.excelInfo.preview.length === 0) && (
                                        <div className="text-center py-8 text-sm text-slate-500">暂无数据预览</div>
                                    )}
                                </div>
                            )}

                            {/* Field Mapping Tab */}
                            {activeTab === "mapping" && (
                                <div className="space-y-4 py-4 animate-in fade-in duration-300">
                                    {fieldMapping.identifier || fieldMapping.stratified.length > 0 || fieldMapping.numeric.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-blue-400" />
                                                    <div className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider">标识符</div>
                                                </div>
                                                {fieldMapping.identifier ? (
                                                    <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">{fieldMapping.identifier}</Badge>
                                                ) : (
                                                    <span className="text-sm text-slate-500">未设置</span>
                                                )}
                                            </div>
                                            <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-amber-400" />
                                                    <div className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider">分层变量（{fieldMapping.stratified.length}）</div>
                                                </div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {fieldMapping.stratified.length > 0
                                                        ? fieldMapping.stratified.map((f) => (
                                                            <Badge key={f} className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-xs">{f}</Badge>
                                                        ))
                                                        : <span className="text-sm text-slate-500">未设置</span>
                                                    }
                                                </div>
                                            </div>
                                            <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-emerald-400" />
                                                    <div className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider">数值变量（{fieldMapping.numeric.length}）</div>
                                                </div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {fieldMapping.numeric.length > 0
                                                        ? fieldMapping.numeric.map((f) => (
                                                            <Badge key={f} className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs">{f}</Badge>
                                                        ))
                                                        : <span className="text-sm text-slate-500">未设置</span>
                                                    }
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center py-8 text-sm text-slate-500">暂未配置字段映射</div>
                                    )}
                                </div>
                            )}

                            {/* Attachments Tab */}
                            {activeTab === "attachments" && (
                                <div className="space-y-3 py-4 animate-in fade-in duration-300">
                                    {detail?.attachments && detail.attachments.length > 0 ? (
                                        detail.attachments.map((a) => (
                                            <div key={a.id} className="flex items-center justify-between p-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center border border-indigo-500/20">
                                                        <FileText className="w-4 h-4" />
                                                    </div>
                                                    <div>
                                                        <div className="text-sm text-slate-800 dark:text-slate-200">{a.fileName}</div>
                                                        <div className="text-xs text-slate-500">
                                                            {a.fileSize > 0 ? `${(a.fileSize / 1024).toFixed(1)} KB` : ""}
                                                            {a.createdAt ? ` · ${new Date(a.createdAt).toLocaleDateString("zh-CN")}` : ""}
                                                        </div>
                                                    </div>
                                                </div>
                                                <a
                                                    href={a.filePath}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs text-indigo-500 hover:text-indigo-600 flex items-center gap-1"
                                                >
                                                    <ExternalLink className="w-3 h-3" />
                                                    查看
                                                </a>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-8 text-sm text-slate-500">暂无辅助资料</div>
                                    )}
                                </div>
                            )}

                            {/* Questions Tab */}
                            {activeTab === "questions" && (
                                <div className="space-y-3 py-4 animate-in fade-in duration-300">
                                    {detail?.recommendQuestions && detail.recommendQuestions.length > 0 ? (
                                        detail.recommendQuestions.map((q, idx) => (
                                            <div key={q.id} className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-2">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-xs text-slate-500 font-mono w-6 shrink-0">{idx + 1}.</span>
                                                    <Badge variant="secondary" className="bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700 text-xs">
                                                        {QUESTION_TYPE_LABELS[q.questionType] ?? "未知"}
                                                    </Badge>
                                                </div>
                                                <div className="text-sm text-slate-800 dark:text-slate-200 pl-9">{q.content || "（无内容）"}</div>
                                                {q.options && q.questionType !== 1 && q.questionType !== 4 && (
                                                    <div className="pl-9 text-xs text-slate-600 dark:text-slate-400">
                                                        选项：{typeof q.options === "string" ? q.options : JSON.stringify(q.options)}
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-8 text-sm text-slate-500">暂无推荐题目</div>
                                    )}
                                </div>
                            )}

                            {/* Weights Tab */}
                            {activeTab === "weights" && (
                                <div className="space-y-6 py-4 animate-in fade-in duration-300">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-6 text-center space-y-2">
                                            <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">问卷设计</div>
                                            <div className="text-3xl font-bold text-indigo-500">{weightConfig.questionnaire}%</div>
                                        </div>
                                        <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-6 text-center space-y-2">
                                            <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">实验过程</div>
                                            <div className="text-3xl font-bold text-cyan-600">{weightConfig.process}%</div>
                                        </div>
                                        <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-6 text-center space-y-2">
                                            <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">实验报告</div>
                                            <div className="text-3xl font-bold text-amber-600">{weightConfig.report}%</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-center gap-2">
                                        <span className="text-sm text-slate-600 dark:text-slate-400">总权重：</span>
                                        <span className={`text-lg font-bold ${(weightConfig.questionnaire + weightConfig.process + weightConfig.report) === 100 ? "text-emerald-600" : "text-rose-600"}`}>
                                            {weightConfig.questionnaire + weightConfig.process + weightConfig.report}%
                                        </span>
                                    </div>
                                    {/* Weight bar visualization */}
                                    <div className="h-3 rounded-full overflow-hidden flex bg-slate-200 dark:bg-slate-800">
                                        <div className="bg-indigo-500 transition-all" style={{ width: `${weightConfig.questionnaire}%` }} title={`问卷设计 ${weightConfig.questionnaire}%`} />
                                        <div className="bg-cyan-500 transition-all" style={{ width: `${weightConfig.process}%` }} title={`实验过程 ${weightConfig.process}%`} />
                                        <div className="bg-amber-500 transition-all" style={{ width: `${weightConfig.report}%` }} title={`实验报告 ${weightConfig.report}%`} />
                                    </div>
                                    <div className="flex justify-center gap-6 text-xs text-slate-600 dark:text-slate-400">
                                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-indigo-500" />问卷设计</span>
                                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-cyan-500" />实验过程</span>
                                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" />实验报告</span>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <DialogFooter className="border-t border-slate-200 dark:border-slate-800 pt-4 flex-shrink-0">
                    <Button onClick={() => onOpenChange(false)} className="bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200">关闭</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
