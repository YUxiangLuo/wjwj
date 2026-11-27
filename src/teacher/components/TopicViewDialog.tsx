import { useState, useEffect } from "react";
import { BookOpen, FileText, Layers, ListChecks, PieChart, Table2, ExternalLink, CheckCircle2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { RichTextContent } from "@/components/RichTextContent";
import { teacherApi, teacherResourceUrl, type TopicDetail, type Topic } from "../api-client";
import { questionTypeLabels } from "@/lib/questionnaire-labels";
import type { QuestionType } from "@/lib/questionnaire-types";
import { StatusBadge } from "@/components/StatusBadge";
import { resolveStudyContract } from "@/lib/analysis-target";
import { resolveFieldworkConfig, type FieldworkPreset } from "@/domain/fieldwork";
import { resolveSamplingPolicy, SAMPLING_METHODS } from "@/lib/sampling-policy";
import { VariableDictionaryEditor } from "./VariableDictionaryEditor";

const FIELDWORK_PRESET_LABELS: Record<FieldworkPreset, string> = {
    balanced: "常规均衡实地回收",
    stratum_differential: "细分客群差异化拒访",
    high_burden_sensitive: "问卷题量负担高敏感",
    peak_congestion: "高峰拥堵漏接场景",
};

const FIELDWORK_PRESET_DESCRIPTIONS: Record<FieldworkPreset, string> = {
    balanced: "各客群应答概率均衡；学生首轮试投观察常规触达损耗，正式轮代入实测回收率与方差校准样本量。",
    stratum_differential: "细分客群存在差异化拒访梯度；首轮等概率抽样易产生无回答结构偏倚，正式轮需通过分层抽样或权重校准修正。",
    high_burden_sensitive: "中途弃答按 1.35 倍放大且高负担易诱发闪电/直线废卷；引导学生在质检清洗后精简问卷并优化量程。",
    peak_congestion: "实地触达叠加 +4% 高峰拥堵漏接损耗；引导学生在试投后上调无回答膨胀系数重算正式轮样本量。",
};

type TabKey = "basic" | "data" | "variables" | "mapping" | "sampling" | "attachments" | "questions" | "weights";

const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "basic", label: "基本信息", icon: BookOpen },
    { key: "data", label: "数据概览", icon: Table2 },
    { key: "variables", label: "变量字典", icon: ListChecks },
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

    const topicId = topic?.id ?? null;

    useEffect(() => {
        if (open && topicId !== null) {
            setActiveTab("basic");
            void loadDetail(topicId);
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
    const fieldworkConfig = resolveFieldworkConfig(detail?.topic?.fieldworkConfig);
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
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="flex h-[80vh] max-w-5xl flex-col border-border bg-card text-foreground"
                onInteractOutside={(e) => e.preventDefault()}
            >
                <DialogHeader>
                    <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2.5">
                            <DialogTitle className="text-section-title font-medium text-foreground">{topic.name}</DialogTitle>
                            {topic.status === 1 ? (
                                <StatusBadge intent="success">已发布</StatusBadge>
                            ) : (
                                <StatusBadge intent="neutral">草稿</StatusBadge>
                            )}
                        </div>
                        <DialogDescription className="sr-only">
                            查看实验模板的基本信息、总体数据、研究目标、抽样策略和评分规则。
                        </DialogDescription>
                        <div className="text-meta text-muted-foreground">
                            创建于 {new Date(topic.createdAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })}
                        </div>
                    </div>
                </DialogHeader>

                {/* Tab navigation */}
                <div className="custom-scrollbar flex gap-1 overflow-x-auto border-b border-border">
                    {TABS.map(({ key, label, icon: Icon }) => (
                        <button
                            key={key}
                            type="button"
                            aria-pressed={activeTab === key}
                            onClick={() => setActiveTab(key)}
                            className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-meta font-medium transition-none outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                activeTab === key
                                    ? "border-primary text-primary"
                                    : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                            }`}
                        >
                            <Icon className="h-3.5 w-3.5" />
                            {label}
                        </button>
                    ))}
                </div>

                {/* Tab content */}
                <div
                    role="region"
                    aria-label="实验模板详情内容，可滚动查看"
                    tabIndex={0}
                    className="custom-scrollbar flex-1 overflow-y-auto"
                >
                    {loading ? (
                        <div role="status" aria-live="polite" className="flex items-center justify-center py-20 text-label text-muted-foreground">加载中...</div>
                    ) : (
                        <>
                            {/* Basic Info Tab */}
                            {activeTab === "basic" && (
                                <div className="space-y-4 py-4">
                                    <div className="space-y-1.5">
                                        <div className="text-meta font-medium text-muted-foreground">实验模板名称</div>
                                        <div className="text-body font-medium text-foreground">{topic.name}</div>
                                    </div>
                                    <Separator />
                                    <div className="space-y-2">
                                        <div className="text-meta font-medium text-muted-foreground">背景描述</div>
                                        <div className="max-h-[300px] overflow-y-auto rounded-surface border border-border bg-muted p-4 text-label leading-relaxed text-foreground">
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
                                <div className="space-y-4 py-4">
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="rounded-surface border border-border bg-muted p-4">
                                            <div className="text-meta font-medium text-muted-foreground">数据行数</div>
                                            <div className="mt-1.5 text-page-title font-medium tabular-nums text-foreground">{detail?.topic?.excelRowCount ?? topic.dataRows ?? 0}</div>
                                        </div>
                                        <div className="rounded-surface border border-border bg-muted p-4">
                                            <div className="text-meta font-medium text-muted-foreground">数据列数</div>
                                            <div className="mt-1.5 text-page-title font-medium tabular-nums text-foreground">{detail?.excelInfo?.columns?.length ?? 0}</div>
                                        </div>
                                        <div className="rounded-surface border border-border bg-muted p-4">
                                            <div className="text-meta font-medium text-muted-foreground">数据文件</div>
                                            <div className="mt-1.5 flex items-center gap-2 text-subheading font-medium text-foreground">
                                                {detail?.hasExcelFile ? (
                                                    <>
                                                        <CheckCircle2 className="h-5 w-5 text-success" />
                                                        <span>已上传</span>
                                                    </>
                                                ) : (
                                                    <span className="text-muted-foreground">未上传</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    {detail?.excelInfo?.preview && detail.excelInfo.preview.length > 0 && (
                                        <div className="space-y-2">
                                            <div className="text-meta font-medium text-muted-foreground">数据预览（前 {Math.min(detail.excelInfo.preview.length, 10)} 行）</div>
                                            <div className="overflow-x-auto rounded-surface border border-border bg-card">
                                                <table className="w-full text-meta">
                                                    <thead>
                                                        <tr className="border-b border-border bg-muted">
                                                            {detail.excelInfo.columns.map((col) => (
                                                                <th key={col} className="whitespace-nowrap px-3 py-2 text-left font-medium text-muted-foreground">{col}</th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {detail.excelInfo.preview.slice(0, 10).map((row, idx) => (
                                                            <tr key={idx} className="border-b border-border last:border-b-0 hover:bg-muted">
                                                                {detail.excelInfo!.columns.map((col) => (
                                                                    <td key={col} className="max-w-[200px] truncate whitespace-nowrap px-3 py-2 text-foreground">
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
                                        <div className="py-8 text-center text-label text-muted-foreground">暂无数据预览</div>
                                    )}
                                </div>
                            )}

                            {activeTab === "variables" && (
                                <div className="py-4"><VariableDictionaryEditor topicId={topic.id} readOnly /></div>
                            )}

                            {/* Field Mapping Tab */}
                            {activeTab === "mapping" && (
                                <div className="space-y-4 py-4">
                                    {resolvedStudyContract && (
                                        <div
                                            className="space-y-3 rounded-surface border border-border bg-card p-4"
                                            data-testid="teacher-topic-view-study-contract"
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="text-label font-medium text-foreground">研究合同</div>
                                                {resolvedStudyContract.inferred && (
                                                    <StatusBadge intent="neutral">兼容推断</StatusBadge>
                                                )}
                                            </div>
                                            <dl className="grid grid-cols-2 gap-3 text-label">
                                                <div className="col-span-2 rounded-control bg-muted px-3.5 py-2.5">
                                                    <dt className="text-meta text-muted-foreground">研究问题</dt>
                                                    <dd className="mt-1 text-foreground">{resolvedStudyContract.contract.researchQuestion}</dd>
                                                </div>
                                                <div className="rounded-control bg-muted px-3.5 py-2.5">
                                                    <dt className="text-meta text-muted-foreground">目标总体</dt>
                                                    <dd className="mt-1 text-foreground">{resolvedStudyContract.contract.targetPopulation}</dd>
                                                </div>
                                                <div className="rounded-control bg-muted px-3.5 py-2.5">
                                                    <dt className="text-meta text-muted-foreground">分析单位</dt>
                                                    <dd className="mt-1 text-foreground">{resolvedStudyContract.contract.unitOfAnalysis}</dd>
                                                </div>
                                                <div className="col-span-2 rounded-control bg-muted px-3.5 py-2.5">
                                                    <dt className="text-meta text-muted-foreground">估计目标</dt>
                                                    <dd className="mt-1 text-foreground">
                                                        {resolvedStudyContract.contract.target.kind === "mean"
                                                            ? `${resolvedStudyContract.contract.target.field} 的均值`
                                                            : `${resolvedStudyContract.contract.target.field} 中「${resolvedStudyContract.contract.target.value}」的比例`}
                                                    </dd>
                                                </div>
                                                {resolvedStudyContract.contract.businessDecision && (
                                                    <div className="col-span-2 rounded-control bg-muted px-3.5 py-2.5">
                                                        <dt className="text-meta text-muted-foreground">支撑的商业管理决策</dt>
                                                        <dd className="mt-1 text-foreground">{resolvedStudyContract.contract.businessDecision}</dd>
                                                    </div>
                                                )}
                                            </dl>
                                        </div>
                                    )}
                                    {fieldMapping.identifier || fieldMapping.stratified.length > 0 || fieldMapping.numeric.length > 0 || fieldMapping.others.length > 0 ? (
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2.5 rounded-surface border border-border bg-card p-4">
                                                <div className="text-meta font-medium text-muted-foreground">标识符</div>
                                                {fieldMapping.identifier ? (
                                                    <StatusBadge intent="primary">{fieldMapping.identifier}</StatusBadge>
                                                ) : (
                                                    <span className="text-label text-muted-foreground">未设置</span>
                                                )}
                                            </div>
                                            <div className="space-y-2.5 rounded-surface border border-border bg-card p-4">
                                                <div className="text-meta font-medium text-muted-foreground">分层变量（{fieldMapping.stratified.length}）</div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {fieldMapping.stratified.length > 0
                                                        ? fieldMapping.stratified.map((f) => (
                                                            <StatusBadge intent="neutral" key={f}>{f}</StatusBadge>
                                                        ))
                                                        : <span className="text-label text-muted-foreground">未设置</span>
                                                    }
                                                </div>
                                            </div>
                                            <div className="space-y-2.5 rounded-surface border border-border bg-card p-4">
                                                <div className="text-meta font-medium text-muted-foreground">数值变量（{fieldMapping.numeric.length}）</div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {fieldMapping.numeric.length > 0
                                                        ? fieldMapping.numeric.map((f) => (
                                                            <StatusBadge intent="neutral" key={f}>{f}</StatusBadge>
                                                        ))
                                                        : <span className="text-label text-muted-foreground">未设置</span>
                                                    }
                                                </div>
                                            </div>
                                            <div data-testid="teacher-topic-other-fields" className="space-y-2.5 rounded-surface border border-border bg-card p-4">
                                                <div className="text-meta font-medium text-muted-foreground">其他分类变量（{fieldMapping.others.length}）</div>
                                                <p className="text-meta text-muted-foreground">用于比例目标或分类分布比较，不用于分层。</p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {fieldMapping.others.length > 0
                                                        ? fieldMapping.others.map(field => <StatusBadge intent="neutral" key={field}>{field}</StatusBadge>)
                                                        : <span className="text-label text-muted-foreground">未设置</span>}
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="py-8 text-center text-label text-muted-foreground">暂未配置字段映射</div>
                                    )}
                                </div>
                            )}

                            {/* Sampling Tab */}
                            {activeTab === "sampling" && (
                                <div className="space-y-4 py-4">
                                    <p className="rounded-surface border border-border bg-muted px-4 py-3 text-label text-muted-foreground">
                                        学生必须完成所有必做方法，并至少实际完成两种启用的方法。
                                    </p>
                                    <div className="grid grid-cols-2 gap-3">
                                        {SAMPLING_METHODS.map((method) => {
                                            const requirement = samplingPolicy.methods[method];
                                            return (
                                                <div key={method} className="space-y-3 rounded-surface border border-border bg-card p-4">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="text-label font-medium text-foreground">{samplingMethodLabels[method]}</span>
                                                        <StatusBadge intent={requirement === "required" ? "primary" : "neutral"}>
                                                            {requirement === "required" ? "必做" : requirement === "optional" ? "选做" : "不适用"}
                                                        </StatusBadge>
                                                    </div>
                                                    {method === "pps" && requirement !== "disabled" && (
                                                        <div className="border-t border-border pt-3">
                                                            <p className="text-meta text-muted-foreground">PPS 规模变量</p>
                                                            {samplingPolicy.ppsSizeFields?.length ? (
                                                                <div className="mt-2 flex flex-wrap gap-1.5">
                                                                    {samplingPolicy.ppsSizeFields.map((field) => (
                                                                        <StatusBadge intent="neutral" key={field}>{field}</StatusBadge>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <p className="mt-1 text-meta text-muted-foreground">从总体中符合条件的正值数值字段选择</p>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="space-y-3 rounded-surface border border-border bg-card p-4" data-testid="teacher-topic-view-fieldwork-config">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div className="text-label font-medium text-foreground">虚拟问卷投放环境参数</div>
                                            <StatusBadge intent="neutral">{FIELDWORK_PRESET_LABELS[fieldworkConfig.preset]}</StatusBadge>
                                        </div>
                                        <p className="text-meta text-muted-foreground">
                                            {FIELDWORK_PRESET_DESCRIPTIONS[fieldworkConfig.preset]}
                                        </p>
                                        <dl className="grid grid-cols-4 gap-3 text-meta">
                                            <div className="rounded-control bg-muted p-3">
                                                <dt className="text-muted-foreground">基准单元无回答率</dt>
                                                <dd className="mt-1 font-medium tabular-nums text-foreground">{Math.round(fieldworkConfig.baseUnitNonResponseRate * 100)}%</dd>
                                            </div>
                                            <div className="rounded-control bg-muted p-3">
                                                <dt className="text-muted-foreground">闪电 / 直线废卷率</dt>
                                                <dd className="mt-1 font-medium tabular-nums text-foreground">
                                                    {Math.round(fieldworkConfig.baseSpeederRate * 100)}% / {Math.round(fieldworkConfig.baseStraightlinerRate * 100)}%
                                                </dd>
                                            </div>
                                            <div className="rounded-control bg-muted p-3">
                                                <dt className="text-muted-foreground">普通题项漏答率</dt>
                                                <dd className="mt-1 font-medium tabular-nums text-foreground">
                                                    {Math.round(fieldworkConfig.baseItemSkipRate * 100)}%
                                                </dd>
                                            </div>
                                            <div className="rounded-control bg-muted p-3">
                                                <dt className="text-muted-foreground">触达 / 完答参考成本</dt>
                                                <dd className="mt-1 font-medium tabular-nums text-foreground">
                                                    {fieldworkConfig.contactCostPerUnit} 元 / {fieldworkConfig.incentiveCostPerComplete} 元
                                                </dd>
                                            </div>
                                        </dl>
                                        {fieldworkConfig.stratumField && fieldworkConfig.stratumNonResponseRates && Object.keys(fieldworkConfig.stratumNonResponseRates).length > 0 && (
                                            <div className="space-y-2 rounded-control bg-muted p-3">
                                                <div className="text-meta text-muted-foreground">
                                                    差异化应答分层字段：<span className="font-medium text-foreground">{fieldworkConfig.stratumField}</span>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {Object.entries(fieldworkConfig.stratumNonResponseRates).map(([stratum, rate]) => (
                                                        <StatusBadge key={stratum} intent="neutral" className="bg-card tabular-nums">
                                                            {stratum}：无回答 {Math.round(rate * 100)}%
                                                        </StatusBadge>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Attachments Tab */}
                            {activeTab === "attachments" && (
                                <div className="space-y-2.5 py-4">
                                    {detail?.attachments && detail.attachments.length > 0 ? (
                                        detail.attachments.map((a) => (
                                            <div key={a.id} className="flex items-center justify-between rounded-surface border border-border bg-card px-4 py-3 transition-none hover:bg-muted">
                                                <div className="flex items-center gap-3">
                                                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                                                    <div>
                                                        <div className="text-label font-medium text-foreground">{a.fileName}</div>
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
                                                        className="flex items-center gap-1 text-meta font-medium text-primary hover:underline"
                                                    >
                                                        <ExternalLink className="h-3.5 w-3.5" />
                                                        查看
                                                    </a>
                                                ) : (
                                                    <a
                                                        href={teacherResourceUrl(`/api/teacher/topics/${topic.id}/attachments/${a.id}/download`)}
                                                        className="flex items-center gap-1 text-meta font-medium text-primary hover:underline"
                                                    >
                                                        <ExternalLink className="h-3.5 w-3.5" />
                                                        下载
                                                    </a>
                                                )}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="py-8 text-center text-label text-muted-foreground">暂无教学资料</div>
                                    )}
                                </div>
                            )}

                            {/* Questions Tab */}
                            {activeTab === "questions" && (
                                <div className="space-y-3 py-4">
                                    {detail?.recommendQuestions && detail.recommendQuestions.length > 0 ? (
                                        detail.recommendQuestions.map((q, idx) => (
                                            <div key={q.id} className="space-y-2 rounded-surface border border-border bg-card p-4">
                                                <div className="flex items-center gap-2.5">
                                                    <span className="w-6 shrink-0 font-mono text-meta text-muted-foreground">{idx + 1}.</span>
                                                    <StatusBadge intent="neutral">
                                                        {questionTypeLabels[q.type as QuestionType] ?? "未知"}
                                                    </StatusBadge>
                                                </div>
                                                <div className="pl-8 text-label text-foreground">{q.content || "（无内容）"}</div>
                                                {(q.type === "single" || q.type === "multiple") && q.options && q.options.length > 0 && (
                                                    <div className="pl-8 text-meta text-muted-foreground">
                                                        选项：{q.options.join("；")}
                                                    </div>
                                                )}
                                                {q.type === "boolean" && (
                                                    <div className="pl-8 text-meta text-muted-foreground">选项：是 / 否</div>
                                                )}
                                                {q.type === "scale" && (
                                                    <div className="pl-8 text-meta text-muted-foreground">
                                                        量表 {q.scaleMin ?? 1}–{q.scaleMax ?? 10}
                                                        {(q.scaleMinLabel || q.scaleMaxLabel) && `（${q.scaleMinLabel ?? ""} — ${q.scaleMaxLabel ?? ""}）`}
                                                    </div>
                                                )}
                                                {q.type === "numeric" && (q.unit || q.numericMin !== undefined || q.numericMax !== undefined) && (
                                                    <div className="pl-8 text-meta tabular-nums text-muted-foreground">
                                                        {q.unit ? `单位：${q.unit}` : "数值题"}
                                                        {(q.numericMin !== undefined || q.numericMax !== undefined) && ` · 量程 ${q.numericMin ?? "-∞"} ～ ${q.numericMax ?? "+∞"}`}
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="py-8 text-center text-label text-muted-foreground">暂无推荐题目</div>
                                    )}
                                </div>
                            )}

                            {/* Weights Tab */}
                            {activeTab === "weights" && (
                                <div className="space-y-5 py-4">
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="space-y-1.5 rounded-surface border border-border bg-card p-5 text-center">
                                            <div className="text-meta font-medium text-muted-foreground">问卷设计</div>
                                            <div className="text-page-title font-medium tabular-nums text-foreground">{weightConfig.questionnaire}%</div>
                                        </div>
                                        <div className="space-y-1.5 rounded-surface border border-border bg-card p-5 text-center">
                                            <div className="text-meta font-medium text-muted-foreground">实验过程</div>
                                            <div className="text-page-title font-medium tabular-nums text-foreground">{weightConfig.process}%</div>
                                        </div>
                                        <div className="space-y-1.5 rounded-surface border border-border bg-card p-5 text-center">
                                            <div className="text-meta font-medium text-muted-foreground">实验报告</div>
                                            <div className="text-page-title font-medium tabular-nums text-foreground">{weightConfig.report}%</div>
                                        </div>
                                    </div>
                                    <div className="space-y-2.5 rounded-surface bg-muted p-4">
                                        <div className="flex items-center justify-between text-label">
                                            <span className="text-muted-foreground">总权重</span>
                                            <span className={`font-medium tabular-nums ${(weightConfig.questionnaire + weightConfig.process + weightConfig.report) === 100 ? "text-success" : "text-destructive"}`}>
                                                {weightConfig.questionnaire + weightConfig.process + weightConfig.report}%
                                            </span>
                                        </div>
                                        <div className="flex h-2.5 overflow-hidden rounded-pill bg-secondary">
                                            <div className="bg-chart-2 transition-[width]" style={{ width: `${weightConfig.questionnaire}%` }} title={`问卷设计 ${weightConfig.questionnaire}%`} />
                                            <div className="bg-chart-3 transition-[width]" style={{ width: `${weightConfig.process}%` }} title={`实验过程 ${weightConfig.process}%`} />
                                            <div className="bg-chart-4 transition-[width]" style={{ width: `${weightConfig.report}%` }} title={`实验报告 ${weightConfig.report}%`} />
                                        </div>
                                        <div className="flex justify-center gap-6 text-meta text-muted-foreground">
                                            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-circle bg-chart-2" />问卷设计</span>
                                            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-circle bg-chart-3" />实验过程</span>
                                            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-circle bg-chart-4" />实验报告</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <DialogFooter className="shrink-0 border-t border-border pt-4">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>关闭</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
