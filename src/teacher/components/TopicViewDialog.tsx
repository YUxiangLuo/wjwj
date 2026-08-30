import { useState, useEffect } from "react";
import { BookOpen, FileText, Layers, ListChecks, PieChart, Table2, ExternalLink, CheckCircle2, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { RichTextContent } from "@/components/RichTextContent";
import { teacherApi, type TopicDetail, type Topic } from "../api-client";
import { questionTypeLabels } from "@/lib/questionnaire-labels";
import type { QuestionType } from "@/lib/questionnaire-types";
import { StatusBadge } from "@/components/StatusBadge";

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
                className="max-w-5xl h-[80vh] flex flex-col bg-card border-border text-foreground"
                onInteractOutside={(e) => e.preventDefault()}
            >
                <DialogHeader>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
                            <Eye className="w-5 h-5" />
                        </div>
                        <div>
                            <DialogTitle className="text-foreground">{topic.name}</DialogTitle>
                            <DialogDescription className="sr-only">
                                查看课题的基本信息、数据配置、字段映射和评分权重。
                            </DialogDescription>
                            <div className="flex items-center gap-2 mt-1">
                                {topic.status === 1 ? (
                                    <StatusBadge intent="success" className="text-xs">已发布</StatusBadge>
                                ) : (
                                    <StatusBadge intent="warning" className="text-xs">草稿</StatusBadge>
                                )}
                                <span className="text-xs text-muted-foreground">创建于 {new Date(topic.createdAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}</span>
                            </div>
                        </div>
                    </div>
                </DialogHeader>

                {/* Tab navigation */}
                <div className="flex gap-1 border-b border-border pb-0 overflow-x-auto scrollbar-thin scrollbar-thumb-border">
                    {TABS.map(({ key, label, icon: Icon }) => (
                        <button
                            key={key}
                            onClick={() => setActiveTab(key)}
                            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-md transition-colors border-b-2 whitespace-nowrap ${
                                activeTab === key
                                    ? "text-primary border-primary bg-primary/5"
                                    : "text-muted-foreground border-transparent hover:text-foreground/90 hover:bg-muted/50"
                            }`}
                        >
                            <Icon className="w-3.5 h-3.5" />
                            {label}
                        </button>
                    ))}
                </div>

                {/* Tab content */}
                <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                    {loading ? (
                        <div role="status" aria-live="polite" className="flex items-center justify-center py-20 text-muted-foreground">加载中...</div>
                    ) : (
                        <>
                            {/* Basic Info Tab */}
                            {activeTab === "basic" && (
                                <div className="space-y-4 py-4 animate-in fade-in duration-300">
                                    <div className="space-y-2">
                                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">课题名称</div>
                                        <div className="text-base text-foreground font-medium">{topic.name}</div>
                                    </div>
                                    <Separator className="bg-muted" />
                                    <div className="space-y-2">
                                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">背景描述</div>
                                        <div className="text-sm text-foreground/90 leading-relaxed bg-background/50 border border-border rounded-lg p-4 max-h-[300px] overflow-y-auto">
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
                                        <div className="bg-background border border-border rounded-lg p-4 text-center">
                                            <div className="text-2xl font-bold text-foreground">{detail?.topic?.excelRowCount ?? topic.dataRows ?? 0}</div>
                                            <div className="text-xs text-muted-foreground mt-1">数据行数</div>
                                        </div>
                                        <div className="bg-background border border-border rounded-lg p-4 text-center">
                                            <div className="text-2xl font-bold text-foreground">{detail?.excelInfo?.columns?.length ?? 0}</div>
                                            <div className="text-xs text-muted-foreground mt-1">数据列数</div>
                                        </div>
                                        <div className="bg-background border border-border rounded-lg p-4 text-center">
                                            <div className="text-2xl font-bold text-foreground">
                                                {detail?.hasExcelFile ? (
                                                    <CheckCircle2 className="w-6 h-6 text-success mx-auto" />
                                                ) : (
                                                    <span className="text-muted-foreground">—</span>
                                                )}
                                            </div>
                                            <div className="text-xs text-muted-foreground mt-1">数据文件</div>
                                        </div>
                                    </div>
                                    {detail?.excelInfo?.preview && detail.excelInfo.preview.length > 0 && (
                                        <div className="space-y-2">
                                            <div className="text-xs text-muted-foreground font-medium">数据预览（前 {Math.min(detail.excelInfo.preview.length, 10)} 行）</div>
                                            <div className="overflow-x-auto border border-border rounded-lg">
                                                <table className="w-full text-xs">
                                                    <thead>
                                                        <tr className="bg-muted/50 border-b border-border">
                                                            {detail.excelInfo.columns.map((col) => (
                                                                <th key={col} className="text-left px-3 py-2 text-muted-foreground font-medium whitespace-nowrap">{col}</th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {detail.excelInfo.preview.slice(0, 10).map((row, idx) => (
                                                            <tr key={idx} className="border-b border-border/50 hover:bg-muted/30">
                                                                {detail.excelInfo!.columns.map((col) => (
                                                                    <td key={col} className="px-3 py-1.5 text-foreground/90 whitespace-nowrap max-w-[200px] truncate">
                                                                        {row?.[col] != null ? String(row[col]) : <span className="text-muted-foreground">-</span>}
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
                                        <div className="text-center py-8 text-sm text-muted-foreground">暂无数据预览</div>
                                    )}
                                </div>
                            )}

                            {/* Field Mapping Tab */}
                            {activeTab === "mapping" && (
                                <div className="space-y-4 py-4 animate-in fade-in duration-300">
                                    {fieldMapping.identifier || fieldMapping.stratified.length > 0 || fieldMapping.numeric.length > 0 ? (
                                        <div className="grid grid-cols-3 gap-4">
                                            <div className="bg-background border border-border rounded-lg p-4 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-info" />
                                                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">标识符</div>
                                                </div>
                                                {fieldMapping.identifier ? (
                                                    <StatusBadge intent="info">{fieldMapping.identifier}</StatusBadge>
                                                ) : (
                                                    <span className="text-sm text-muted-foreground">未设置</span>
                                                )}
                                            </div>
                                            <div className="bg-background border border-border rounded-lg p-4 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-warning" />
                                                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">分层变量（{fieldMapping.stratified.length}）</div>
                                                </div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {fieldMapping.stratified.length > 0
                                                        ? fieldMapping.stratified.map((f) => (
                                                            <StatusBadge intent="warning" key={f} className="text-xs">{f}</StatusBadge>
                                                        ))
                                                        : <span className="text-sm text-muted-foreground">未设置</span>
                                                    }
                                                </div>
                                            </div>
                                            <div className="bg-background border border-border rounded-lg p-4 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-success" />
                                                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">数值变量（{fieldMapping.numeric.length}）</div>
                                                </div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {fieldMapping.numeric.length > 0
                                                        ? fieldMapping.numeric.map((f) => (
                                                            <StatusBadge intent="success" key={f} className="text-xs">{f}</StatusBadge>
                                                        ))
                                                        : <span className="text-sm text-muted-foreground">未设置</span>
                                                    }
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center py-8 text-sm text-muted-foreground">暂未配置字段映射</div>
                                    )}
                                </div>
                            )}

                            {/* Attachments Tab */}
                            {activeTab === "attachments" && (
                                <div className="space-y-3 py-4 animate-in fade-in duration-300">
                                    {detail?.attachments && detail.attachments.length > 0 ? (
                                        detail.attachments.map((a) => (
                                            <div key={a.id} className="flex items-center justify-between p-3 bg-background border border-border rounded-lg hover:border-input transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
                                                        <FileText className="w-4 h-4" />
                                                    </div>
                                                    <div>
                                                        <div className="text-sm text-foreground">{a.fileName}</div>
                                                        <div className="text-xs text-muted-foreground">
                                                            {a.fileSize > 0 ? `${(a.fileSize / 1024).toFixed(1)} KB` : ""}
                                                            {a.createdAt ? ` · ${new Date(a.createdAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}` : ""}
                                                        </div>
                                                    </div>
                                                </div>
                                                <a
                                                    href={`/api/teacher/topics/${topic.id}/attachments/${a.id}/download?mode=preview`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs text-primary hover:text-primary flex items-center gap-1"
                                                >
                                                    <ExternalLink className="w-3 h-3" />
                                                    查看
                                                </a>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-8 text-sm text-muted-foreground">暂无辅助资料</div>
                                    )}
                                </div>
                            )}

                            {/* Questions Tab */}
                            {activeTab === "questions" && (
                                <div className="space-y-3 py-4 animate-in fade-in duration-300">
                                    {detail?.recommendQuestions && detail.recommendQuestions.length > 0 ? (
                                        detail.recommendQuestions.map((q, idx) => (
                                            <div key={q.id} className="bg-background border border-border rounded-lg p-4 space-y-2">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-xs text-muted-foreground font-mono w-6 shrink-0">{idx + 1}.</span>
                                                    <Badge variant="secondary" className="bg-muted text-muted-foreground border-input text-xs">
                                                        {questionTypeLabels[q.type as QuestionType] ?? "未知"}
                                                    </Badge>
                                                </div>
                                                <div className="text-sm text-foreground pl-9">{q.content || "（无内容）"}</div>
                                                {(q.type === "single" || q.type === "multiple") && q.options && q.options.length > 0 && (
                                                    <div className="pl-9 text-xs text-muted-foreground">
                                                        选项：{q.options.join("；")}
                                                    </div>
                                                )}
                                                {q.type === "scale" && (
                                                    <div className="pl-9 text-xs text-muted-foreground">
                                                        量表 {q.scaleMin ?? 1}–{q.scaleMax ?? 10}
                                                        {(q.scaleMinLabel || q.scaleMaxLabel) && `（${q.scaleMinLabel ?? ""} — ${q.scaleMaxLabel ?? ""}）`}
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-8 text-sm text-muted-foreground">暂无推荐题目</div>
                                    )}
                                </div>
                            )}

                            {/* Weights Tab */}
                            {activeTab === "weights" && (
                                <div className="space-y-6 py-4 animate-in fade-in duration-300">
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="bg-background border border-border rounded-lg p-6 text-center space-y-2">
                                            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">问卷设计</div>
                                            <div className="text-3xl font-bold text-primary">{weightConfig.questionnaire}%</div>
                                        </div>
                                        <div className="bg-background border border-border rounded-lg p-6 text-center space-y-2">
                                            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">实验过程</div>
                                            <div className="text-3xl font-bold text-info">{weightConfig.process}%</div>
                                        </div>
                                        <div className="bg-background border border-border rounded-lg p-6 text-center space-y-2">
                                            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">实验报告</div>
                                            <div className="text-3xl font-bold text-warning">{weightConfig.report}%</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-center gap-2">
                                        <span className="text-sm text-muted-foreground">总权重：</span>
                                        <span className={`text-lg font-bold ${(weightConfig.questionnaire + weightConfig.process + weightConfig.report) === 100 ? "text-success" : "text-destructive"}`}>
                                            {weightConfig.questionnaire + weightConfig.process + weightConfig.report}%
                                        </span>
                                    </div>
                                    {/* Weight bar visualization */}
                                    <div className="h-3 rounded-full overflow-hidden flex bg-muted">
                                        <div className="bg-primary transition-all" style={{ width: `${weightConfig.questionnaire}%` }} title={`问卷设计 ${weightConfig.questionnaire}%`} />
                                        <div className="bg-info transition-all" style={{ width: `${weightConfig.process}%` }} title={`实验过程 ${weightConfig.process}%`} />
                                        <div className="bg-warning transition-all" style={{ width: `${weightConfig.report}%` }} title={`实验报告 ${weightConfig.report}%`} />
                                    </div>
                                    <div className="flex justify-center gap-6 text-xs text-muted-foreground">
                                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-primary" />问卷设计</span>
                                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-info" />实验过程</span>
                                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-warning" />实验报告</span>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <DialogFooter className="border-t border-border pt-4 flex-shrink-0">
                    <Button onClick={() => onOpenChange(false)} className="bg-muted hover:bg-muted-foreground/20 text-foreground">关闭</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
