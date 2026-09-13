import { useState, useEffect } from "react";
import { VariableDictionaryDialog } from "./VariableDictionaryDialog";
import { BookOpen, FileText, Layers, ListChecks, PieChart, Table2, ExternalLink, CheckCircle2, Eye, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { RichTextContent } from "@/components/RichTextContent";
import { teacherApi, teacherResourceUrl, type TopicDetail, type Topic } from "../api-client";
import { questionTypeLabels } from "@/lib/questionnaire-labels";
import type { QuestionType } from "@/lib/questionnaire-types";
import { StatusBadge } from "@/components/StatusBadge";
import { resolveStudyContract } from "@/lib/analysis-target";
import { resolveSamplingPolicy, SAMPLING_METHODS } from "@/lib/sampling-policy";

type TabKey = "basic" | "data" | "mapping" | "sampling" | "attachments" | "questions" | "weights";

const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "basic", label: "基本信息", icon: BookOpen },
    { key: "data", label: "数据概览", icon: Table2 },
    { key: "mapping", label: "字段映射", icon: Layers },
    { key: "sampling", label: "抽样策略", icon: ShieldCheck },
    { key: "attachments", label: "教学资料", icon: FileText },
    { key: "questions", label: "推荐题目", icon: ListChecks },
    { key: "weights", label: "评分规则", icon: PieChart },
];

function safeParseJson(raw: unknown): Record<string, unknown> | null {
    if (!raw) return null;
    if (typeof raw === "object") return raw as Record<string, unknown>;
    if (typeof raw === "string") {
        try { return JSON.parse(raw); } catch { return null; }
    }
    return null;
}

export function resolveTopicViewStudyContract(fieldMapping: unknown, topicName: string) {
    return resolveStudyContract(safeParseJson(fieldMapping), { topicName });
}

interface TopicViewDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    topic: Topic | null;
}

/** The server only inlines pdf, image and video; everything else downloads. */
function canPreviewInline(fileName: string) {
    return /\.(pdf|png|jpe?g|gif|webp|bmp|svg|mp4|webm|ogg|mov)$/i.test(fileName);
}

export function TopicViewDialog({ open, onOpenChange, topic }: TopicViewDialogProps) {
    const [detail, setDetail] = useState<TopicDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<TabKey>("basic");
    const [dictionaryOpen, setDictionaryOpen] = useState(false);

    const topicId = topic?.id ?? null;

    useEffect(() => {
        setDictionaryOpen(false);
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

    const parsedFieldMapping = safeParseJson(detail?.topic?.fieldMapping);
    const fieldMapping = {
        identifier: parsedFieldMapping?.identifier as string | undefined,
        stratified: (parsedFieldMapping?.stratified ?? []) as string[],
        numeric: (parsedFieldMapping?.numeric ?? []) as string[],
        others: (parsedFieldMapping?.others ?? []) as string[],
    };
    const resolvedStudyContract = resolveTopicViewStudyContract(
        parsedFieldMapping,
        detail?.topic?.name ?? topic?.name ?? "",
    );
    const samplingPolicy = resolveSamplingPolicy(detail?.topic?.samplingPolicy);
    const samplingMethodLabels = { simple: "简单随机抽样", systematic: "系统抽样", pps: "PPS抽样", stratified: "分层抽样" } as const;

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
        <Dialog open={open} onOpenChange={value => { if (!dictionaryOpen) onOpenChange(value); }}>
            <DialogContent
                className="max-w-5xl h-[80vh] flex flex-col bg-card border-border text-foreground"
                showCloseButton={false}
                onInteractOutside={(e) => e.preventDefault()}
            >
                <DialogHeader>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-surface bg-primary-muted text-primary flex items-center justify-center border border-primary-border">
                            <Eye className="w-5 h-5" />
                        </div>
                        <div>
                            <DialogTitle className="text-foreground">{topic.name}</DialogTitle>
                            <DialogDescription className="sr-only">
                                查看实验模板的基本信息、总体数据、研究目标、抽样策略和评分规则。
                            </DialogDescription>
                            <div className="flex items-center gap-2 mt-1">
                                {topic.status === 1 ? (
                                    <StatusBadge intent="success" className="text-meta">已发布</StatusBadge>
                                ) : (
                                    <StatusBadge intent="warning" className="text-meta">草稿</StatusBadge>
                                )}
                                <span className="text-meta text-muted-foreground">创建于 {new Date(topic.createdAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}</span>
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
                            className={`flex items-center gap-1.5 px-3 py-2 text-meta font-medium rounded-control transition-none border-b-2 whitespace-nowrap ${
                                activeTab === key
                                    ? "text-primary border-primary bg-primary-muted"
                                    : "text-muted-foreground border-transparent hover:text-foreground hover:bg-muted"
                            }`}
                        >
                            <Icon className="w-3.5 h-3.5" />
                            {label}
                        </button>
                    ))}
                </div>

                {/* Tab content */}
                <div
                    role="region"
                    aria-label="实验模板详情内容，可滚动查看"
                    tabIndex={0}
                    className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
                >
                    {loading ? (
                        <div role="status" aria-live="polite" className="flex items-center justify-center py-20 text-muted-foreground">加载中...</div>
                    ) : (
                        <>
                            {/* Basic Info Tab */}
                            {activeTab === "basic" && (
                                <div className="space-y-4 py-4 animate-in fade-in duration-300">
                                    <div className="space-y-2">
                                        <div className="text-meta font-medium text-muted-foreground uppercase tracking-wider">实验模板名称</div>
                                        <div className="text-body text-foreground font-medium">{topic.name}</div>
                                    </div>
                                    <Separator className="bg-muted" />
                                    <div className="space-y-2">
                                        <div className="text-meta font-medium text-muted-foreground uppercase tracking-wider">背景描述</div>
                                        <div className="text-label text-foreground leading-relaxed bg-background border border-border rounded-surface p-4 max-h-[300px] overflow-y-auto">
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
                                        <div className="bg-background border border-border rounded-surface p-4 text-center">
                                            <div className="text-page-title font-bold text-foreground">{detail?.topic?.excelRowCount ?? topic.dataRows ?? 0}</div>
                                            <div className="text-meta text-muted-foreground mt-1">数据行数</div>
                                        </div>
                                        <div className="bg-background border border-border rounded-surface p-4 text-center">
                                            <div className="text-page-title font-bold text-foreground">{detail?.excelInfo?.columns?.length ?? 0}</div>
                                            <div className="text-meta text-muted-foreground mt-1">数据列数</div>
                                        </div>
                                        <div className="bg-background border border-border rounded-surface p-4 text-center">
                                            <div className="text-page-title font-bold text-foreground">
                                                {detail?.hasExcelFile ? (
                                                    <CheckCircle2 className="w-6 h-6 text-success mx-auto" />
                                                ) : (
                                                    <span className="text-muted-foreground">—</span>
                                                )}
                                            </div>
                                            <div className="text-meta text-muted-foreground mt-1">数据文件</div>
                                        </div>
                                    </div>
                                    {detail?.excelInfo?.preview && detail.excelInfo.preview.length > 0 && (
                                        <div className="space-y-2">
                                            <div className="text-meta text-muted-foreground font-medium">数据预览（前 {Math.min(detail.excelInfo.preview.length, 10)} 行）</div>
                                            <div className="overflow-x-auto border border-border rounded-surface">
                                                <table className="w-full text-meta">
                                                    <thead>
                                                        <tr className="bg-muted border-b border-border">
                                                            {detail.excelInfo.columns.map((col) => (
                                                                <th key={col} className="text-left px-3 py-2 text-muted-foreground font-medium whitespace-nowrap">{col}</th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {detail.excelInfo.preview.slice(0, 10).map((row, idx) => (
                                                            <tr key={idx} className="border-b border-border hover:bg-muted">
                                                                {detail.excelInfo!.columns.map((col) => (
                                                                    <td key={col} className="px-3 py-1.5 text-foreground whitespace-nowrap max-w-[200px] truncate">
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
                                        <div className="text-center py-8 text-label text-muted-foreground">暂无数据预览</div>
                                    )}
                                </div>
                            )}

                            {/* Field Mapping Tab */}
                            {activeTab === "mapping" && (
                                <div className="space-y-4 py-4 animate-in fade-in duration-300">
                                    <div className="flex items-center justify-between gap-4 rounded-surface border border-border bg-background p-4">
                                        <div className="space-y-1"><h3 className="text-label font-semibold">数据变量字典</h3><p className="text-meta text-muted-foreground">查看字段含义、类别及缺失编码；未确认的建议不会自动保存。</p></div>
                                        <Button variant="outline" disabled={!detail?.hasExcelFile || !fieldMapping.identifier} onClick={() => setDictionaryOpen(true)}>查看变量字典</Button>
                                    </div>
                                    {resolvedStudyContract && (
                                        <div
                                            className="space-y-3 rounded-surface border border-primary-border bg-primary-muted p-4"
                                            data-testid="teacher-topic-view-study-contract"
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="text-label font-semibold text-foreground">研究合同</div>
                                                {resolvedStudyContract.inferred && (
                                                    <StatusBadge intent="neutral" className="text-meta">兼容推断</StatusBadge>
                                                )}
                                            </div>
                                            <dl className="grid grid-cols-2 gap-3 text-label">
                                                <div className="col-span-2 rounded-control bg-background p-3">
                                                    <dt className="text-meta text-muted-foreground">研究问题</dt>
                                                    <dd className="mt-1 text-foreground">{resolvedStudyContract.contract.researchQuestion}</dd>
                                                </div>
                                                <div className="rounded-control bg-background p-3">
                                                    <dt className="text-meta text-muted-foreground">目标总体</dt>
                                                    <dd className="mt-1 text-foreground">{resolvedStudyContract.contract.targetPopulation}</dd>
                                                </div>
                                                <div className="rounded-control bg-background p-3">
                                                    <dt className="text-meta text-muted-foreground">分析单位</dt>
                                                    <dd className="mt-1 text-foreground">{resolvedStudyContract.contract.unitOfAnalysis}</dd>
                                                </div>
                                                <div className="col-span-2 rounded-control bg-background p-3">
                                                    <dt className="text-meta text-muted-foreground">估计目标</dt>
                                                    <dd className="mt-1 text-foreground">
                                                        {resolvedStudyContract.contract.target.kind === "mean"
                                                            ? `${resolvedStudyContract.contract.target.field} 的均值`
                                                            : `${resolvedStudyContract.contract.target.field} 中「${resolvedStudyContract.contract.target.value}」的比例`}
                                                    </dd>
                                                </div>
                                            </dl>
                                        </div>
                                    )}
                                    {fieldMapping.identifier || fieldMapping.stratified.length > 0 || fieldMapping.numeric.length > 0 || fieldMapping.others.length > 0 ? (
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="bg-background border border-border rounded-surface p-4 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-circle bg-info" />
                                                    <div className="text-meta font-medium text-muted-foreground uppercase tracking-wider">标识符</div>
                                                </div>
                                                {fieldMapping.identifier ? (
                                                    <StatusBadge intent="info">{fieldMapping.identifier}</StatusBadge>
                                                ) : (
                                                    <span className="text-label text-muted-foreground">未设置</span>
                                                )}
                                            </div>
                                            <div className="bg-background border border-border rounded-surface p-4 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-circle bg-warning" />
                                                    <div className="text-meta font-medium text-muted-foreground uppercase tracking-wider">分层变量（{fieldMapping.stratified.length}）</div>
                                                </div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {fieldMapping.stratified.length > 0
                                                        ? fieldMapping.stratified.map((f) => (
                                                            <StatusBadge intent="warning" key={f} className="text-meta">{f}</StatusBadge>
                                                        ))
                                                        : <span className="text-label text-muted-foreground">未设置</span>
                                                    }
                                                </div>
                                            </div>
                                            <div className="bg-background border border-border rounded-surface p-4 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-circle bg-success" />
                                                    <div className="text-meta font-medium text-muted-foreground uppercase tracking-wider">数值变量（{fieldMapping.numeric.length}）</div>
                                                </div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {fieldMapping.numeric.length > 0
                                                        ? fieldMapping.numeric.map((f) => (
                                                            <StatusBadge intent="success" key={f} className="text-meta">{f}</StatusBadge>
                                                        ))
                                                        : <span className="text-label text-muted-foreground">未设置</span>
                                                    }
                                                </div>
                                            </div>
                                            <div data-testid="teacher-topic-other-fields" className="bg-background border border-border rounded-surface p-4 space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-circle bg-info" />
                                                    <div className="text-meta font-medium text-muted-foreground">其他分类变量（{fieldMapping.others.length}）</div>
                                                </div>
                                                <p className="text-meta text-muted-foreground">用于比例目标或分类分布比较，不用于分层。</p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {fieldMapping.others.length > 0
                                                        ? fieldMapping.others.map(field => <StatusBadge intent="info" key={field}>{field}</StatusBadge>)
                                                        : <span className="text-label text-muted-foreground">未设置</span>}
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center py-8 text-label text-muted-foreground">暂未配置字段映射</div>
                                    )}
                                </div>
                            )}

                            {/* Attachments Tab */}
                            {activeTab === "sampling" && (
                                <div className="space-y-4 py-4 animate-in fade-in duration-300">
                                    <p className="rounded-surface border border-info-border bg-info-muted p-3 text-label text-info">
                                        学生必须完成所有必做方法，并至少实际完成两种启用的方法。
                                    </p>
                                    <div className="grid grid-cols-2 gap-3">
                                        {SAMPLING_METHODS.map((method) => {
                                            const requirement = samplingPolicy.methods[method];
                                            return (
                                                <div key={method} className="flex items-center justify-between rounded-surface border border-border bg-background p-4">
                                                    <span className="text-label font-medium text-foreground">{samplingMethodLabels[method]}</span>
                                                    <StatusBadge intent={requirement === "required" ? "primary" : requirement === "optional" ? "info" : "neutral"}>
                                                        {requirement === "required" ? "必做" : requirement === "optional" ? "选做" : "不适用"}
                                                    </StatusBadge>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {activeTab === "attachments" && (
                                <div className="space-y-3 py-4 animate-in fade-in duration-300">
                                    {detail?.attachments && detail.attachments.length > 0 ? (
                                        detail.attachments.map((a) => (
                                            <div key={a.id} className="flex items-center justify-between p-3 bg-background border border-border rounded-surface hover:border-input transition-none">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-surface bg-primary-muted text-primary flex items-center justify-center border border-primary-border">
                                                        <FileText className="w-4 h-4" />
                                                    </div>
                                                    <div>
                                                        <div className="text-label text-foreground">{a.fileName}</div>
                                                        <div className="text-meta text-muted-foreground">
                                                            {a.fileSize > 0 ? `${(a.fileSize / 1024).toFixed(1)} KB` : ""}
                                                            {a.createdAt ? ` · ${new Date(a.createdAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}` : ""}
                                                        </div>
                                                    </div>
                                                </div>
                                                {canPreviewInline(a.fileName) ? (
                                                    <a
                                                        href={teacherResourceUrl(`/api/teacher/topics/${topic.id}/attachments/${a.id}/download?mode=preview`)}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-meta text-primary hover:text-primary flex items-center gap-1"
                                                    >
                                                        <ExternalLink className="w-3 h-3" />
                                                        查看
                                                    </a>
                                                ) : (
                                                    <a
                                                        href={teacherResourceUrl(`/api/teacher/topics/${topic.id}/attachments/${a.id}/download`)}
                                                        className="text-meta text-primary hover:text-primary flex items-center gap-1"
                                                    >
                                                        <ExternalLink className="w-3 h-3" />
                                                        下载
                                                    </a>
                                                )}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-8 text-label text-muted-foreground">暂无教学资料</div>
                                    )}
                                </div>
                            )}

                            {/* Questions Tab */}
                            {activeTab === "questions" && (
                                <div className="space-y-3 py-4 animate-in fade-in duration-300">
                                    {detail?.recommendQuestions && detail.recommendQuestions.length > 0 ? (
                                        detail.recommendQuestions.map((q, idx) => (
                                            <div key={q.id} className="bg-background border border-border rounded-surface p-4 space-y-2">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-meta text-muted-foreground font-mono w-6 shrink-0">{idx + 1}.</span>
                                                    <Badge variant="secondary" className="bg-muted text-muted-foreground border-input text-meta">
                                                        {questionTypeLabels[q.type as QuestionType] ?? "未知"}
                                                    </Badge>
                                                </div>
                                                <div className="text-label text-foreground pl-9">{q.content || "（无内容）"}</div>
                                                {(q.type === "single" || q.type === "multiple") && q.options && q.options.length > 0 && (
                                                    <div className="pl-9 text-meta text-muted-foreground">
                                                        选项：{q.options.join("；")}
                                                    </div>
                                                )}
                                                {q.type === "scale" && (
                                                    <div className="pl-9 text-meta text-muted-foreground">
                                                        量表 {q.scaleMin ?? 1}–{q.scaleMax ?? 10}
                                                        {(q.scaleMinLabel || q.scaleMaxLabel) && `（${q.scaleMinLabel ?? ""} — ${q.scaleMaxLabel ?? ""}）`}
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-8 text-label text-muted-foreground">暂无推荐题目</div>
                                    )}
                                </div>
                            )}

                            {/* Weights Tab */}
                            {activeTab === "weights" && (
                                <div className="space-y-6 py-4 animate-in fade-in duration-300">
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="bg-background border border-border rounded-surface p-6 text-center space-y-2">
                                            <div className="text-meta font-medium text-muted-foreground uppercase tracking-wider">问卷设计</div>
                                            <div className="text-display font-bold text-primary">{weightConfig.questionnaire}%</div>
                                        </div>
                                        <div className="bg-background border border-border rounded-surface p-6 text-center space-y-2">
                                            <div className="text-meta font-medium text-muted-foreground uppercase tracking-wider">实验过程</div>
                                            <div className="text-display font-bold text-info">{weightConfig.process}%</div>
                                        </div>
                                        <div className="bg-background border border-border rounded-surface p-6 text-center space-y-2">
                                            <div className="text-meta font-medium text-muted-foreground uppercase tracking-wider">实验报告</div>
                                            <div className="text-display font-bold text-warning">{weightConfig.report}%</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-center gap-2">
                                        <span className="text-label text-muted-foreground">总权重：</span>
                                        <span className={`text-subheading font-bold ${(weightConfig.questionnaire + weightConfig.process + weightConfig.report) === 100 ? "text-success" : "text-destructive"}`}>
                                            {weightConfig.questionnaire + weightConfig.process + weightConfig.report}%
                                        </span>
                                    </div>
                                    {/* Weight bar visualization */}
                                    <div className="h-3 rounded-control overflow-hidden flex bg-muted">
                                        <div className="bg-primary transition-[width]" style={{ width: `${weightConfig.questionnaire}%` }} title={`问卷设计 ${weightConfig.questionnaire}%`} />
                                        <div className="bg-info transition-[width]" style={{ width: `${weightConfig.process}%` }} title={`实验过程 ${weightConfig.process}%`} />
                                        <div className="bg-warning transition-[width]" style={{ width: `${weightConfig.report}%` }} title={`实验报告 ${weightConfig.report}%`} />
                                    </div>
                                    <div className="flex justify-center gap-6 text-meta text-muted-foreground">
                                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-circle bg-primary" />问卷设计</span>
                                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-circle bg-info" />实验过程</span>
                                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-circle bg-warning" />实验报告</span>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <DialogFooter className="border-t border-border pt-4 flex-shrink-0">
                    <Button disabled={dictionaryOpen} onClick={() => onOpenChange(false)} className="bg-muted hover:bg-input text-foreground">关闭</Button>
                </DialogFooter>
            </DialogContent>
            {open && dictionaryOpen && <VariableDictionaryDialog topicId={topic.id} readOnly onClose={() => setDictionaryOpen(false)} />}
        </Dialog>
    );
}
