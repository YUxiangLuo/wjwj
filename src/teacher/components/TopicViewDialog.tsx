import { useState, useEffect, type ComponentType, type SVGProps } from "react";
import { BookOpen, FileText, Layers, ListChecks, PieChart, Table2, ExternalLink, CheckCircle2, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RichTextContent } from "@/components/RichTextContent";
import { teacherApi, type TopicDetail, type Topic } from "../api-client";
import { questionTypeLabels } from "@/lib/questionnaire-labels";
import type { QuestionType } from "@/lib/questionnaire-types";

type TabKey = "basic" | "data" | "mapping" | "attachments" | "questions" | "weights";
type WeightSegmentKey = "questionnaire" | "process" | "report";

const TABS: { key: TabKey; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
    { key: "basic", label: "基本信息", icon: BookOpen },
    { key: "data", label: "数据概览", icon: Table2 },
    { key: "mapping", label: "字段映射", icon: Layers },
    { key: "attachments", label: "辅助资料", icon: FileText },
    { key: "questions", label: "推荐题目", icon: ListChecks },
    { key: "weights", label: "评分权重", icon: PieChart },
];

export const WEIGHT_SEGMENTS: { key: WeightSegmentKey; label: string; barClass: string; textClass: string }[] = [
    { key: "questionnaire", label: "问卷设计", barClass: "bg-primary", textClass: "text-primary" },
    { key: "process", label: "实验过程", barClass: "bg-success", textClass: "text-success" },
    { key: "report", label: "实验报告", barClass: "bg-warning", textClass: "text-warning" },
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
                className="sm:max-w-5xl h-[80vh] flex flex-col"
                onInteractOutside={(e) => e.preventDefault()}
            >
                <DialogHeader>
                    <div className="flex items-center gap-3">
                        <div className="app-stat-icon app-stat-icon-primary rounded-lg">
                            <Eye className="size-5" />
                        </div>
                        <div>
                            <DialogTitle>{topic.name}</DialogTitle>
                            <DialogDescription className="sr-only">
                                查看课题的基本信息、数据配置、字段映射和评分权重。
                            </DialogDescription>
                            <div className="flex items-center gap-2 mt-1">
                                {topic.status === 1 ? (
                                    <Badge variant="success">已发布</Badge>
                                ) : (
                                    <Badge variant="warning">草稿</Badge>
                                )}
                                <span className="text-xs text-muted-foreground">创建于 {new Date(topic.createdAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}</span>
                            </div>
                        </div>
                    </div>
                </DialogHeader>

                <Tabs
                    value={activeTab}
                    onValueChange={(value) => setActiveTab(value as TabKey)}
                    className="min-h-0 flex-1 gap-0"
                >
                    <TabsList
                        variant="line"
                        className="h-auto w-full justify-start overflow-x-auto border-b border-border p-0 scrollbar-thin scrollbar-thumb-muted-foreground/20"
                    >
                        {TABS.map(({ key, label, icon: Icon }) => (
                            <TabsTrigger key={key} value={key} className="flex-none">
                                <Icon data-icon="inline-start" />
                                {label}
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    {/* Tab content */}
                    <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
                    {loading ? (
                        <div className="flex items-center justify-center py-20 text-muted-foreground">加载中...</div>
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
                                        <div className="text-sm text-foreground leading-relaxed bg-background/50 border border-border p-4 max-h-[300px] overflow-y-auto">
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
                                        <div className="bg-background border border-border p-4 text-center">
                                            <div className="text-2xl font-bold text-foreground">{detail?.topic?.excelRowCount ?? topic.dataRows ?? 0}</div>
                                            <div className="text-xs text-muted-foreground mt-1">数据行数</div>
                                        </div>
                                        <div className="bg-background border border-border p-4 text-center">
                                            <div className="text-2xl font-bold text-foreground">{detail?.excelInfo?.columns?.length ?? 0}</div>
                                            <div className="text-xs text-muted-foreground mt-1">数据列数</div>
                                        </div>
                                        <div className="bg-background border border-border p-4 text-center">
                                            <div className="text-2xl font-bold text-foreground">
                                                {detail?.topic?.excelFilePath ? (
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
                                            <div className="border border-border">
                                                <Table className="text-xs">
                                                    <TableHeader>
                                                        <TableRow className="bg-muted/50">
                                                            {detail.excelInfo.columns.map((col) => (
                                                                <TableHead key={col} className="h-auto py-2 normal-case tracking-normal">{col}</TableHead>
                                                            ))}
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {detail.excelInfo.preview.slice(0, 10).map((row, idx) => (
                                                            <TableRow key={idx} className="hover:bg-muted/30">
                                                                {detail.excelInfo!.columns.map((col) => (
                                                                    <TableCell key={col} className="max-w-[200px] truncate py-1.5 text-foreground">
                                                                        {row?.[col] != null ? String(row[col]) : <span className="text-muted-foreground">-</span>}
                                                                    </TableCell>
                                                                ))}
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
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
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div className="bg-background border border-border p-4 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-primary" />
                                                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">标识符</div>
                                                </div>
                                                {fieldMapping.identifier ? (
                                                    <Badge variant="info">{fieldMapping.identifier}</Badge>
                                                ) : (
                                                    <span className="text-sm text-muted-foreground">未设置</span>
                                                )}
                                            </div>
                                            <div className="bg-background border border-border p-4 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-warning" />
                                                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">分层变量（{fieldMapping.stratified.length}）</div>
                                                </div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {fieldMapping.stratified.length > 0
                                                        ? fieldMapping.stratified.map((f) => (
                                                            <Badge key={f} variant="warning">{f}</Badge>
                                                        ))
                                                        : <span className="text-sm text-muted-foreground">未设置</span>
                                                    }
                                                </div>
                                            </div>
                                            <div className="bg-background border border-border p-4 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-success" />
                                                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">数值变量（{fieldMapping.numeric.length}）</div>
                                                </div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {fieldMapping.numeric.length > 0
                                                        ? fieldMapping.numeric.map((f) => (
                                                            <Badge key={f} variant="success">{f}</Badge>
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
                                            <div key={a.id} className="flex items-center justify-between p-3 bg-background border border-border hover:border-border transition-colors">
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
                                                    href={a.filePath}
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
                                            <div key={q.id} className="flex gap-3 bg-background border border-border p-4">
                                                <span className="text-xs text-muted-foreground font-mono w-6 shrink-0">{idx + 1}.</span>
                                                <div className="min-w-0 flex-1 space-y-2">
                                                    <Badge variant="muted">
                                                        {questionTypeLabels[q.type as QuestionType] ?? "未知"}
                                                    </Badge>
                                                    <div className="text-sm text-foreground">{q.content || "（无内容）"}</div>
                                                    {(q.type === "single" || q.type === "multiple") && q.options && q.options.length > 0 && (
                                                        <div className="text-xs text-muted-foreground">
                                                            选项：{q.options.join("；")}
                                                        </div>
                                                    )}
                                                    {q.type === "scale" && (
                                                        <div className="text-xs text-muted-foreground">
                                                            量表 {q.scaleMin ?? 1}–{q.scaleMax ?? 10}
                                                            {(q.scaleMinLabel || q.scaleMaxLabel) && `（${q.scaleMinLabel ?? ""} — ${q.scaleMaxLabel ?? ""}）`}
                                                        </div>
                                                    )}
                                                </div>
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
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {WEIGHT_SEGMENTS.map((segment) => (
                                            <div key={segment.key} className="flex flex-col gap-2 bg-background border border-border p-6 text-center">
                                                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{segment.label}</div>
                                                <div className={`text-3xl font-bold ${segment.textClass}`}>{weightConfig[segment.key]}%</div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex items-center justify-center gap-2">
                                        <span className="text-sm text-muted-foreground">总权重：</span>
                                        <span className={`text-lg font-bold ${(weightConfig.questionnaire + weightConfig.process + weightConfig.report) === 100 ? "text-success" : "text-destructive"}`}>
                                            {weightConfig.questionnaire + weightConfig.process + weightConfig.report}%
                                        </span>
                                    </div>
                                    {/* Weight bar visualization */}
                                    <div className="h-3 rounded-full overflow-hidden flex bg-muted">
                                        {WEIGHT_SEGMENTS.map((segment) => (
                                            <div
                                                key={segment.key}
                                                className={`${segment.barClass} transition-all`}
                                                style={{ width: `${weightConfig[segment.key]}%` }}
                                                title={`${segment.label} ${weightConfig[segment.key]}%`}
                                            />
                                        ))}
                                    </div>
                                    <div className="flex justify-center gap-6 text-xs text-muted-foreground">
                                        {WEIGHT_SEGMENTS.map((segment) => (
                                            <span key={segment.key} className="flex items-center gap-1.5">
                                                <span className={`w-2 h-2 rounded-full ${segment.barClass}`} />
                                                {segment.label}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                    </div>
                </Tabs>

                <DialogFooter className="border-t border-border pt-4 flex-shrink-0">
                    <Button onClick={() => onOpenChange(false)}>关闭</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
