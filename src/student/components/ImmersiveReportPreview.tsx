import { useState } from "react";
import { ResearchAppendix } from "@/components/ResearchResult";
import type { ResearchRun } from "@/domain/experiment/research-analysis";
import { X, FileText, Users, BarChart3, Layers, ChevronDown } from "lucide-react";
import { NumericQuestionSummary } from "@/components/questionnaire/NumericQuestionSummary";
import { RichTextContent } from "@/components/RichTextContent";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { ExperimentData, MethodKey } from "@/domain/experiment/types";
import {
    formatMarginOfError,
    formatSamplePlanNumber,
    getAdvancedPlanSourceLabel,
    getEstimationTypeLabel,
    getMarginOfErrorLabel,
} from "../experiment/sample-plan-display";
import { getSamplingResultCount } from "../experiment/sampling-results";
import {
    formatSystematicInterval,
    getStoredSystematicInterval,
} from "../experiment/systematic-sampling";
import { getSamplingMethodState, resolveSamplingPolicy } from "@/lib/sampling-policy";

interface Props {
    open: boolean;
    experiment: ExperimentData;
    taskName: string;
    analysisRuns: ResearchRun[];
    onClose: () => void;
}

type Section = "overview" | "questionnaire" | "sampling" | "report" | "research";

const SECTIONS: { key: Section; label: string; icon: typeof FileText }[] = [
    { key: "overview", label: "实验概览", icon: Users },
    { key: "questionnaire", label: "问卷设计", icon: FileText },
    { key: "sampling", label: "抽样结果", icon: BarChart3 },
    { key: "report", label: "分析报告", icon: Layers },
    { key: "research", label: "分析附录", icon: BarChart3 },
];

export function ImmersiveReportPreview({ open, experiment, taskName, analysisRuns, onClose }: Props) {
    return (
        <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
            <DialogContent
                showCloseButton={false}
                role="dialog"
                aria-modal="true"
                aria-label={`${taskName}实验报告全屏预览`}
                className="inset-0 left-0 top-0 block h-screen w-screen translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none border-0 bg-background p-0 max-w-none"
            >
                <DialogTitle className="sr-only">{taskName}实验报告全屏预览</DialogTitle>
                <DialogDescription className="sr-only">查看实验概览、问卷设计、抽样结果和分析报告。</DialogDescription>
                <ImmersiveReportPreviewContent experiment={experiment} taskName={taskName} analysisRuns={analysisRuns} onClose={onClose} />
            </DialogContent>
        </Dialog>
    );
}

export function ImmersiveReportPreviewContent({ experiment, taskName, analysisRuns, onClose }: Omit<Props, "open">) {
    const [activeSection, setActiveSection] = useState<Section>("overview");
    const questionnaire = experiment.questionnaire;
    const samplePlan = experiment.samplePlan;
    const samplingResults = experiment.samplingResults;
    const reportContent = experiment.reportContent ?? "";
    const samplingPolicy = resolveSamplingPolicy(experiment.samplingPolicy);

    return (
        <>
            {/* top bar */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-background">
                <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-primary" />
                    <span className="text-label font-medium text-foreground">{taskName}</span>
                    <span className="text-meta text-muted-foreground">实验报告预览</span>
                </div>
                <button
                    type="button"
                    aria-label="关闭全屏预览"
                    onClick={onClose}
                    className="p-2 rounded-control hover:bg-muted text-muted-foreground hover:text-foreground transition-none"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            <div className="flex h-[calc(100vh-49px)]">
                {/* sidebar nav */}
                <nav className="w-48 border-r border-border p-3 space-y-1">
                    {SECTIONS.filter(s => s.key !== "research" || analysisRuns.length > 0).map((s) => {
                        const Icon = s.icon;
                        const isActive = activeSection === s.key;
                        return (
                            <button
                                key={s.key}
                                onClick={() => setActiveSection(s.key)}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-surface text-label transition-none ${
                                    isActive
                                        ? "bg-primary-muted text-primary border border-primary-border"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent"
                                }`}
                            >
                                <Icon className="w-4 h-4" />
                                {s.label}
                            </button>
                        );
                    })}
                </nav>

                {/* main content */}
                <main className="flex-1 overflow-auto p-10 pb-10">
                    <div className="max-w-3xl mx-auto">
                        {activeSection === "overview" && (
                            <OverviewSection
                                taskName={taskName}
                                populationSize={experiment.populationSize}
                                samplePlan={samplePlan}
                                samplingResults={samplingResults}
                                samplingPolicy={samplingPolicy}
                                questionCount={questionnaire?.questions?.length ?? 0}
                            />
                        )}
                        {activeSection === "questionnaire" && (
                            <QuestionnaireSection questionnaire={questionnaire} />
                        )}
                        {activeSection === "sampling" && (
                            <SamplingSection
                                samplingResults={samplingResults}
                                samplePlan={samplePlan}
                                samplingPolicy={samplingPolicy}
                            />
                        )}
                        {activeSection === "report" && (
                            <ReportSection content={reportContent} />
                        )}
                        {activeSection === "research" && <ResearchAppendix runs={analysisRuns} />}
                    </div>
                </main>
            </div>
        </>
    );
}

/* ── Overview Section ── */
function OverviewSection({
    taskName,
    populationSize,
    samplePlan,
    samplingResults,
    questionCount,
    samplingPolicy,
}: {
    taskName: string;
    populationSize: number;
    samplePlan: ExperimentData["samplePlan"];
    samplingResults: ExperimentData["samplingResults"];
    questionCount: number;
    samplingPolicy: ReturnType<typeof resolveSamplingPolicy>;
}) {
    const advancedSourceLabel = getAdvancedPlanSourceLabel(samplePlan?.advancedPlanSource);
    const stats = [
        { label: "总体规模", value: populationSize.toLocaleString(), sub: "个单位" },
        { label: "最终样本量", value: samplePlan?.finalSampleSize?.toLocaleString() ?? "—", sub: "个单位" },
        { label: "置信水平", value: samplePlan ? `${samplePlan.confidenceLevel}%` : "—", sub: "" },
        { label: "问卷题数", value: String(questionCount), sub: "题" },
    ];
    const samplePlanRows = samplePlan ? [
        { label: "估计类型", value: getEstimationTypeLabel(samplePlan.estimationType) },
        ...(advancedSourceLabel
            ? [{ label: "最终样本量来源", value: `${advancedSourceLabel}（高级工具）` }]
            : []),
        { label: "置信水平", value: `${samplePlan.confidenceLevel}%` },
        {
            label: getMarginOfErrorLabel(samplePlan.estimationType),
            value: samplePlan.estimationType === "mean"
                ? `${formatMarginOfError(samplePlan.marginOfError, samplePlan.estimationType)}（与均值同单位）`
                : `${formatMarginOfError(samplePlan.marginOfError, samplePlan.estimationType)}（允许误差）`,
        },
        ...(samplePlan.estimationType === "mean" && samplePlan.populationVariance != null
            ? [{ label: "总体方差 σ²", value: formatSamplePlanNumber(samplePlan.populationVariance) }]
            : []),
        { label: "设计效应 deff", value: samplePlan.designEffect?.toFixed(2) ?? "—" },
        {
            label: "预期无回答率",
            value: typeof samplePlan.nonResponseRate === "number"
                ? `${Math.round(samplePlan.nonResponseRate * 100)}%`
                : "—",
        },
        { label: "推荐样本量 n", value: samplePlan.recommendedSize?.toLocaleString() ?? "—" },
        { label: "最终样本量 n", value: samplePlan.finalSampleSize?.toLocaleString() ?? "—" },
    ] : [];

    const methods = [
        { key: "simple" as const, label: "简单随机", result: samplingResults?.simple },
        { key: "systematic" as const, label: "系统抽样", result: samplingResults?.systematic },
        { key: "pps" as const, label: "PPS抽样", result: samplingResults?.pps },
        { key: "stratified" as const, label: "分层抽样", result: samplingResults?.stratified },
    ].map((method) => ({
        ...method,
        state: getSamplingMethodState(samplingPolicy, method.key, method.result),
        count: getSamplingResultCount(method.key, method.result),
    })).filter(({ state }) => state !== "disabled");

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-display font-bold text-foreground mb-2">{taskName}</h1>
                <p className="text-muted-foreground">实验报告预览</p>
            </div>

            <div className="grid grid-cols-4 gap-4">
                {stats.map((s) => (
                    <div key={s.label} className="rounded-surface border border-border bg-card p-4">
                        <div className="text-meta text-muted-foreground mb-1">{s.label}</div>
                        <div className="text-section-title font-bold text-foreground font-mono">
                            {s.value}
                            {s.sub && <span className="text-meta font-normal text-muted-foreground ml-1">{s.sub}</span>}
                        </div>
                    </div>
                ))}
            </div>

            <div className="rounded-surface border border-border bg-card p-5">
                <h3 className="text-label font-semibold text-foreground mb-4">样本量规划摘要</h3>
                {!samplePlan ? (
                    <div className="text-label text-muted-foreground">暂无样本量规划数据</div>
                ) : (
                    <div className="space-y-2.5">
                        {samplePlanRows.map((row) => (
                            <div key={row.label} className="flex items-center justify-between gap-3 text-label">
                                <span className="text-muted-foreground">{row.label}</span>
                                <span className="text-right text-foreground">{row.value}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="rounded-surface border border-border bg-card p-5">
                <h3 className="text-label font-semibold text-foreground mb-4">抽样方法完成情况</h3>
                <div className="space-y-3">
                    {methods.map((m) => (
                        <div key={m.label} className="flex items-center justify-between">
                            <span className="text-label text-muted-foreground">{m.label}</span>
                            <span className={`text-label font-medium ${m.state === "completed" ? "text-success" : "text-muted-foreground"}`}>
                                {m.state === "completed"
                                    ? `已完成 (${m.count} 样本)`
                                    : m.state === "unavailable"
                                        ? "不适用"
                                        : m.state === "unselected"
                                            ? "未选择"
                                            : "未完成"}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {advancedSourceLabel && (
                <div className="rounded-surface border border-warning-border bg-warning-muted p-4 text-label text-warning">
                    最终样本量来源：{advancedSourceLabel}。报告解读当前 n 时，应以该高级工具的推演结论为准；上方“推荐样本量 n”仅表示常规公式的基线建议。
                </div>
            )}

            <button
                onClick={() => {
                    // scroll hint—user can click "分析报告" in sidebar
                }}
                className="flex items-center gap-2 text-label text-muted-foreground hover:text-muted-foreground transition-none mx-auto"
            >
                <ChevronDown className="w-4 h-4 animate-bounce" />
                使用左侧导航查看各部分详情
            </button>
        </div>
    );
}

/* ── Questionnaire Section ── */
function QuestionnaireSection({ questionnaire }: { questionnaire: ExperimentData["questionnaire"] }) {
    if (!questionnaire) {
        return <EmptyState text="暂无问卷数据" />;
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-page-title font-bold text-foreground mb-1">{questionnaire.title || "未命名问卷"}</h2>
                <p className="text-label text-muted-foreground">{questionnaire.questions?.length ?? 0} 道题目</p>
            </div>

            {questionnaire.welcomeText && (
                <div className="rounded-surface border border-border bg-card p-4">
                    <div className="text-meta text-muted-foreground mb-2">欢迎语</div>
                    <RichTextContent html={questionnaire.welcomeText} className="text-label text-foreground" />
                </div>
            )}

            <div className="space-y-3">
                {(questionnaire.questions ?? []).map((q, i) => (
                    <div key={q.id} className="rounded-surface border border-border bg-card p-4">
                        <div className="flex items-start gap-3">
                            <span className="flex-shrink-0 w-7 h-7 rounded-control bg-primary-muted text-primary flex items-center justify-center text-label font-bold">
                                {i + 1}
                            </span>
                            <div className="flex-1 space-y-2">
                                <p className="text-label font-medium text-foreground">{q.content}</p>
                                <NumericQuestionSummary question={q} />
                                {q.type === "boolean" && (
                                    <span className="text-meta text-muted-foreground bg-muted px-2 py-1 rounded-control">是 / 否</span>
                                )}
                                {(q.type === "single" || q.type === "multiple") && (
                                    <ul className="space-y-1">
                                        {(q.options ?? []).map(opt => (
                                            <li key={opt.id} className="flex items-center gap-2 text-label text-muted-foreground">
                                                <div className="w-1.5 h-1.5 rounded-circle bg-input" />
                                                {opt.label}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                {q.type === "scale" && (
                                    <span className="text-meta text-muted-foreground bg-muted px-2 py-1 rounded-control">
                                        量表 {q.scaleMin ?? 1}-{q.scaleMax ?? 10}
                                        {q.scaleMinLabel && ` (${q.scaleMinLabel} ~ ${q.scaleMaxLabel})`}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {questionnaire.endingText && (
                <div className="rounded-surface border border-border bg-card p-4">
                    <div className="text-meta text-muted-foreground mb-2">结束语</div>
                    <RichTextContent html={questionnaire.endingText} className="text-label text-foreground" />
                </div>
            )}
        </div>
    );
}

/* ── Sampling Section ── */
function SamplingSection({
    samplingResults,
    samplePlan,
    samplingPolicy,
}: {
    samplingResults: ExperimentData["samplingResults"];
    samplePlan: ExperimentData["samplePlan"];
    samplingPolicy: ReturnType<typeof resolveSamplingPolicy>;
}) {
    if (!samplingResults) {
        return <EmptyState text="暂无抽样数据" />;
    }

    const advancedSourceLabel = getAdvancedPlanSourceLabel(samplePlan?.advancedPlanSource);

    const methodCards: { key: MethodKey; label: string; color: string; data: { completed?: boolean; unavailable?: boolean; sampleCount?: number; seed?: number; interval?: number; kValue?: number; randomStart?: number; stratifyBy?: string; sizeField?: string; layers?: Array<{ name: string; sampleCount: number }> } | undefined }[] = [
        {
            key: "simple" as const,
            label: "简单随机抽样",
            color: "indigo",
            data: samplingResults.simple,
        },
        {
            key: "systematic" as const,
            label: "系统抽样",
            color: "teal",
            data: samplingResults.systematic,
        },
        {
            key: "pps" as const,
            label: "PPS抽样",
            color: "purple",
            data: samplingResults.pps,
        },
        {
            key: "stratified" as const,
            label: "分层抽样",
            color: "amber",
            data: samplingResults.stratified,
        },
    ].filter((method) => samplingPolicy.methods[method.key] !== "disabled");

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-page-title font-bold text-foreground mb-1">抽样执行结果</h2>
                <p className="text-label text-muted-foreground">
                    规划样本量: {samplePlan?.finalSampleSize?.toLocaleString() ?? "—"}
                </p>
                {advancedSourceLabel && (
                    <p className="text-meta text-warning mt-1">
                        当前最终样本量来自「{advancedSourceLabel}」。
                    </p>
                )}
            </div>

            <div className="space-y-4">
                {methodCards.map((m) => {
                    const d = m.data;
                    const completed = d?.completed ?? false;
                    return (
                        <div key={m.key} className="rounded-surface border border-border bg-card p-5">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-body font-semibold text-foreground">{m.label}</h3>
                                <span className={`text-meta px-2 py-1 rounded-control ${completed ? "bg-success-muted text-success" : "bg-muted text-muted-foreground"}`}>
                                    {d?.unavailable ? "不适用" : completed ? "已完成" : samplingPolicy.methods[m.key] === "optional" ? "未选择" : "未完成"}
                                </span>
                            </div>
                            {completed && d && (
                                <div className="grid grid-cols-3 gap-3 text-label">
                                    <div>
                                        <span className="text-muted-foreground">样本量</span>
                                        <div className="text-foreground font-mono">{getSamplingResultCount(m.key, d)}</div>
                                    </div>
                                    {d.seed !== undefined && (
                                        <div>
                                            <span className="text-muted-foreground">随机种子</span>
                                            <div className="text-foreground font-mono">{d.seed}</div>
                                        </div>
                                    )}
                                    {m.key === "systematic" && getStoredSystematicInterval(d) !== null && (
                                        <div>
                                            <span className="text-muted-foreground">间隔 K</span>
                                            <div className="text-foreground font-mono">{formatSystematicInterval(getStoredSystematicInterval(d))}</div>
                                        </div>
                                    )}
                                    {d.stratifyBy && (
                                        <div>
                                            <span className="text-muted-foreground">分层变量</span>
                                            <div className="text-foreground">{d.stratifyBy}</div>
                                        </div>
                                    )}
                                </div>
                            )}
                            {completed && d?.layers && (
                                <div className="mt-3 pt-3 border-t border-border">
                                    <div className="text-meta text-muted-foreground mb-2">各层分配</div>
                                    <div className="flex flex-wrap gap-2">
                                        {d.layers.map((l) => (
                                            <span key={l.name} className="text-meta bg-muted text-foreground px-2 py-1 rounded-control">
                                                {l.name}: {l.sampleCount}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/* ── Report Section ── */
function ReportSection({ content }: { content: string }) {
    if (!content) {
        return <EmptyState text="暂无报告内容" />;
    }

    return (
        <div className="space-y-6">
            <h2 className="text-page-title font-bold text-foreground">分析报告</h2>
            <div className="rounded-surface border border-border bg-card p-8">
                <RichTextContent
                    html={content}
                    className="prose max-w-none text-body text-foreground"
                />
            </div>
        </div>
    );
}

function EmptyState({ text }: { text: string }) {
    return (
        <div className="flex items-center justify-center py-20 text-muted-foreground text-label">
            {text}
        </div>
    );
}

export default ImmersiveReportPreview;
