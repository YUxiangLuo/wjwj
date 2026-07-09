import { useState, useEffect, useCallback } from "react";
import { X, FileText, Users, BarChart3, Layers, ChevronDown } from "lucide-react";
import { RichTextContent } from "@/components/RichTextContent";
import type { ExperimentData } from "../api-client";
import {
    formatMarginOfError,
    getAdvancedPlanSourceLabel,
    getEstimationTypeLabel,
    getMarginOfErrorLabel,
} from "../experiment/sample-plan-display";

interface Props {
    experiment: ExperimentData;
    taskName: string;
    onClose: () => void;
}

type Section = "overview" | "questionnaire" | "sampling" | "report";

const SECTIONS: { key: Section; label: string; icon: typeof FileText }[] = [
    { key: "overview", label: "实验概览", icon: Users },
    { key: "questionnaire", label: "问卷设计", icon: FileText },
    { key: "sampling", label: "抽样结果", icon: BarChart3 },
    { key: "report", label: "分析报告", icon: Layers },
];

export function ImmersiveReportPreview({ experiment, taskName, onClose }: Props) {
    const [phase, setPhase] = useState<"entering" | "visible" | "exiting">("entering");
    const [activeSection, setActiveSection] = useState<Section>("overview");

    useEffect(() => {
        const t = setTimeout(() => setPhase("visible"), 50);
        return () => clearTimeout(t);
    }, []);

    const handleClose = useCallback(() => {
        setPhase("exiting");
        setTimeout(onClose, 300);
    }, [onClose]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") handleClose();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [handleClose]);

    const questionnaire = experiment.questionnaire;
    const samplePlan = experiment.samplePlan;
    const samplingResults = experiment.samplingResults;
    const reportContent = experiment.reportContent ?? "";

    const opacityClass = phase === "visible" ? "opacity-100" : "opacity-0";

    return (
        <div
            className={`fixed inset-0 z-50 bg-background/98 dark:bg-background/98 backdrop-blur-sm transition-opacity duration-300 ${opacityClass}`}
        >
            {/* top bar */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-border/60 bg-background/80 backdrop-blur">
                <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium text-foreground/90">{taskName}</span>
                    <span className="text-xs text-muted-foreground">实验报告预览</span>
                </div>
                <button
                    onClick={handleClose}
                    className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            <div className="flex h-[calc(100vh-49px)]">
                {/* sidebar nav */}
                <nav className="w-48 border-r border-border/60 p-3 space-y-1 hidden md:block">
                    {SECTIONS.map((s) => {
                        const Icon = s.icon;
                        const isActive = activeSection === s.key;
                        return (
                            <button
                                key={s.key}
                                onClick={() => setActiveSection(s.key)}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                                    isActive
                                        ? "bg-primary/10 text-primary border border-primary/20"
                                        : "text-muted-foreground hover:text-foreground/90 hover:bg-muted/50 border border-transparent"
                                }`}
                            >
                                <Icon className="w-4 h-4" />
                                {s.label}
                            </button>
                        );
                    })}
                </nav>

                {/* mobile nav */}
                <div className="md:hidden fixed bottom-0 left-0 right-0 z-10 bg-background border-t border-border/60 flex">
                    {SECTIONS.map((s) => {
                        const Icon = s.icon;
                        const isActive = activeSection === s.key;
                        return (
                            <button
                                key={s.key}
                                onClick={() => setActiveSection(s.key)}
                                className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] transition-colors ${
                                    isActive ? "text-primary" : "text-muted-foreground"
                                }`}
                            >
                                <Icon className="w-4 h-4" />
                                {s.label}
                            </button>
                        );
                    })}
                </div>

                {/* main content */}
                <main className="flex-1 overflow-auto p-6 md:p-10 pb-20 md:pb-10">
                    <div
                        className={`max-w-3xl mx-auto transition-all duration-500 ${
                            phase === "visible" ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                        }`}
                    >
                        {activeSection === "overview" && (
                            <OverviewSection
                                taskName={taskName}
                                populationSize={experiment.populationSize}
                                samplePlan={samplePlan}
                                samplingResults={samplingResults}
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
                            />
                        )}
                        {activeSection === "report" && (
                            <ReportSection content={reportContent} />
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}

/* ── Overview Section ── */
function OverviewSection({
    taskName,
    populationSize,
    samplePlan,
    samplingResults,
    questionCount,
}: {
    taskName: string;
    populationSize: number;
    samplePlan: ExperimentData["samplePlan"];
    samplingResults: ExperimentData["samplingResults"];
    questionCount: number;
}) {
    const advancedSourceLabel = getAdvancedPlanSourceLabel(samplePlan?.advancedPlanSource);
    const stats = [
        { label: "总体规模", value: populationSize.toLocaleString(), sub: "人" },
        { label: "最终样本量", value: samplePlan?.finalSampleSize?.toLocaleString() ?? "—", sub: "个" },
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
                : `${formatMarginOfError(samplePlan.marginOfError, samplePlan.estimationType)}（边际误差）`,
        },
        ...(samplePlan.estimationType === "mean" && samplePlan.populationVariance != null
            ? [{ label: "总体方差 σ²", value: String(samplePlan.populationVariance) }]
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
        { label: "简单随机", done: samplingResults?.simple?.completed, count: samplingResults?.simple?.sampleCount },
        { label: "系统抽样", done: samplingResults?.systematic?.completed, count: samplingResults?.systematic?.sampleCount },
        { label: "PPS抽样", done: samplingResults?.pps?.completed, count: samplingResults?.pps?.sampleCount },
        { label: "分层抽样", done: samplingResults?.stratified?.completed, count: samplingResults?.stratified?.completed ? samplingResults?.stratified?.layers?.reduce((s, l) => s + l.sampleCount, 0) : undefined },
    ];

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-foreground mb-2">{taskName}</h1>
                <p className="text-muted-foreground">实验报告预览</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {stats.map((s) => (
                    <div key={s.label} className="rounded-xl border border-border bg-card/60 p-4">
                        <div className="text-[11px] text-muted-foreground mb-1">{s.label}</div>
                        <div className="text-xl font-bold text-foreground font-mono">
                            {s.value}
                            {s.sub && <span className="text-xs font-normal text-muted-foreground ml-1">{s.sub}</span>}
                        </div>
                    </div>
                ))}
            </div>

            <div className="rounded-xl border border-border bg-card/60 p-5">
                <h3 className="text-sm font-semibold text-foreground/90 mb-4">样本量规划摘要</h3>
                {!samplePlan ? (
                    <div className="text-sm text-muted-foreground">暂无样本量规划数据</div>
                ) : (
                    <div className="space-y-2.5">
                        {samplePlanRows.map((row) => (
                            <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
                                <span className="text-muted-foreground">{row.label}</span>
                                <span className="text-right text-foreground">{row.value}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="rounded-xl border border-border bg-card/60 p-5">
                <h3 className="text-sm font-semibold text-foreground/90 mb-4">抽样方法完成情况</h3>
                <div className="space-y-3">
                    {methods.map((m) => (
                        <div key={m.label} className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">{m.label}</span>
                            <span className={`text-sm font-medium ${m.done ? "text-success" : "text-muted-foreground"}`}>
                                {m.done ? `已完成 (${m.count} 样本)` : "未完成"}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {advancedSourceLabel && (
                <div className="rounded-xl border border-warning/20 bg-warning/10 p-4 text-sm text-warning">
                    最终样本量来源：{advancedSourceLabel}。报告解读当前 n 时，应以该高级工具的推演结论为准；上方“推荐样本量 n”仅表示常规公式的基线建议。
                </div>
            )}

            <button
                onClick={() => {
                    // scroll hint—user can click "分析报告" in sidebar
                }}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-muted-foreground transition-colors mx-auto"
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
                <h2 className="text-2xl font-bold text-foreground mb-1">{questionnaire.title || "未命名问卷"}</h2>
                <p className="text-sm text-muted-foreground">{questionnaire.questions?.length ?? 0} 道题目</p>
            </div>

            {questionnaire.welcomeText && (
                <div className="rounded-xl border border-border bg-card/40 p-4">
                    <div className="text-xs text-muted-foreground mb-2">欢迎语</div>
                    <RichTextContent html={questionnaire.welcomeText} className="text-sm text-foreground/90" />
                </div>
            )}

            <div className="space-y-3">
                {(questionnaire.questions ?? []).map((q, i) => (
                    <div key={q.id} className="rounded-xl border border-border bg-card/40 p-4">
                        <div className="flex items-start gap-3">
                            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-bold">
                                {i + 1}
                            </span>
                            <div className="flex-1 space-y-2">
                                <p className="text-sm font-medium text-foreground">{q.content}</p>
                                {q.type === "boolean" && (
                                    <span className="text-xs text-muted-foreground bg-muted/60 px-2 py-1 rounded">是 / 否</span>
                                )}
                                {(q.type === "single" || q.type === "multiple") && (
                                    <ul className="space-y-1">
                                        {(q.options ?? []).map((opt, j) => (
                                            <li key={j} className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
                                                {opt}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                {q.type === "scale" && (
                                    <span className="text-xs text-muted-foreground bg-muted/60 px-2 py-1 rounded">
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
                <div className="rounded-xl border border-border bg-card/40 p-4">
                    <div className="text-xs text-muted-foreground mb-2">结束语</div>
                    <RichTextContent html={questionnaire.endingText} className="text-sm text-foreground/90" />
                </div>
            )}
        </div>
    );
}

/* ── Sampling Section ── */
function SamplingSection({
    samplingResults,
    samplePlan,
}: {
    samplingResults: ExperimentData["samplingResults"];
    samplePlan: ExperimentData["samplePlan"];
}) {
    if (!samplingResults) {
        return <EmptyState text="暂无抽样数据" />;
    }

    const advancedSourceLabel = getAdvancedPlanSourceLabel(samplePlan?.advancedPlanSource);

    const methodCards: { key: string; label: string; color: string; data: { completed?: boolean; sampleCount?: number; seed?: number; kValue?: number; stratifyBy?: string; sizeField?: string; layers?: Array<{ name: string; sampleCount: number }> } | undefined }[] = [
        {
            key: "simple",
            label: "简单随机抽样",
            color: "indigo",
            data: samplingResults.simple,
        },
        {
            key: "systematic",
            label: "系统抽样",
            color: "teal",
            data: samplingResults.systematic,
        },
        {
            key: "pps",
            label: "PPS抽样",
            color: "purple",
            data: samplingResults.pps,
        },
        {
            key: "stratified",
            label: "分层抽样",
            color: "amber",
            data: samplingResults.stratified,
        },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-foreground mb-1">抽样执行结果</h2>
                <p className="text-sm text-muted-foreground">
                    规划样本量: {samplePlan?.finalSampleSize?.toLocaleString() ?? "—"}
                </p>
                {advancedSourceLabel && (
                    <p className="text-xs text-warning mt-1">
                        当前最终样本量来自「{advancedSourceLabel}」。
                    </p>
                )}
            </div>

            <div className="space-y-4">
                {methodCards.map((m) => {
                    const d = m.data;
                    const completed = d?.completed ?? false;
                    return (
                        <div key={m.key} className="rounded-xl border border-border bg-card/40 p-5">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-base font-semibold text-foreground">{m.label}</h3>
                                <span className={`text-xs px-2 py-1 rounded-full ${completed ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                                    {completed ? "已完成" : "未完成"}
                                </span>
                            </div>
                            {completed && d && (
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                                    <div>
                                        <span className="text-muted-foreground">样本量</span>
                                        <div className="text-foreground font-mono">{d.sampleCount}</div>
                                    </div>
                                    {d.seed !== undefined && (
                                        <div>
                                            <span className="text-muted-foreground">随机种子</span>
                                            <div className="text-foreground font-mono">{d.seed}</div>
                                        </div>
                                    )}
                                    {d.kValue !== undefined && (
                                        <div>
                                            <span className="text-muted-foreground">间隔 K</span>
                                            <div className="text-foreground font-mono">{d.kValue}</div>
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
                                    <div className="text-xs text-muted-foreground mb-2">各层分配</div>
                                    <div className="flex flex-wrap gap-2">
                                        {d.layers.map((l) => (
                                            <span key={l.name} className="text-xs bg-muted text-foreground/90 px-2 py-1 rounded">
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
            <h2 className="text-2xl font-bold text-foreground">分析报告</h2>
            <div className="rounded-xl border border-border bg-card/40 p-6 md:p-8">
                <RichTextContent
                    html={content}
                    className="text-sm text-foreground/90 leading-relaxed prose prose-invert prose-sm max-w-none"
                />
            </div>
        </div>
    );
}

function EmptyState({ text }: { text: string }) {
    return (
        <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
            {text}
        </div>
    );
}

export default ImmersiveReportPreview;
