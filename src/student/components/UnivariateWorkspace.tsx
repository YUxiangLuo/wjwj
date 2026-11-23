import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, CheckCircle2, Layers, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { createApiClient } from "@/lib/api-client";
import { createRequestId } from "@/lib/request-id";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/StatusBadge";
import { AnalysisResultTable } from "@/components/AnalysisAppendices";
import type { AnalysisConfig, SavedAnalysisView, VariableDictionary } from "@/domain/variables/types";
import type { ExperimentWaveView } from "@/domain/experiment/types";
import { shortSourceHash } from "@/student/pages/stages/analysis-utils";

const client = createApiClient("student");
const methods = { simple: "简单随机抽样", systematic: "系统抽样", pps: "PPS抽样", stratified: "分层抽样" } as const;
const signature = (config: AnalysisConfig) => JSON.stringify(config);

const NONE_GROUP_VALUE = "__NONE__";

export function UnivariateWorkspace({
    taskId,
    observedVersion,
    completedMethods,
    waves,
    activeWaveNumber,
    references,
    refreshRequired,
    onReferencesChange,
    onRefreshRequired,
    onStaleReferencesChange,
}: {
    taskId: number;
    observedVersion: number;
    completedMethods: AnalysisConfig["method"][];
    waves?: ExperimentWaveView[];
    activeWaveNumber?: number;
    references: number[];
    refreshRequired: boolean;
    onReferencesChange: (ids: number[]) => void;
    onRefreshRequired: () => void;
    onStaleReferencesChange?: (ids: number[]) => void;
}) {
    const [dictionary, setDictionary] = useState<VariableDictionary | null>(null);
    const [records, setRecords] = useState<SavedAnalysisView[]>([]);
    const [capacity, setCapacity] = useState(20);
    const [config, setConfig] = useState<AnalysisConfig>(() => ({
        question: "",
        method: completedMethods[0] ?? "simple",
        field: "",
        weighted: false,
        datasetMode: "cleaned_respondents",
        ...(activeWaveNumber ? { waveNumber: activeWaveNumber } : {}),
    }));
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const pending = useRef<{ signature: string; requestId: string } | null>(null);

    const variables = useMemo(() => dictionary?.variables.filter(item => item.kind !== "identifier") ?? [], [dictionary]);
    const groupingVariables = useMemo(
        () => variables.filter((item) => (item.kind === "nominal" || item.kind === "ordinal") && item.field !== config.field),
        [variables, config.field],
    );

    const load = async () => {
        setLoading(true);
        setError(null);
        const [dictionaryResponse, analysesResponse] = await Promise.all([
            client.request<{ dictionary: VariableDictionary | null }>(`/api/student/tasks/${taskId}/variables`),
            client.request<{ records: SavedAnalysisView[]; capacity: number }>(`/api/student/tasks/${taskId}/analyses`),
        ]);
        setLoading(false);
        setDictionary(dictionaryResponse.data?.dictionary ?? null);
        if (analysesResponse.success) {
            setRecords(analysesResponse.data?.records ?? []);
            setCapacity(analysesResponse.data?.capacity ?? 20);
        }
        if (!dictionaryResponse.success || !analysesResponse.success) {
            setError(dictionaryResponse.error?.message ?? analysesResponse.error?.message ?? "分析工作区加载失败");
        }
    };

    useEffect(() => {
        void load();
    }, [taskId]);

    useEffect(() => {
        if (completedMethods.length > 0 && !completedMethods.includes(config.method)) {
            setConfig((current) => ({ ...current, method: completedMethods[0]! }));
        }
    }, [completedMethods, config.method]);

    useEffect(() => {
        onStaleReferencesChange?.(
            records.filter(record => record.stale && references.includes(record.id)).map(record => record.id),
        );
    }, [records, references, onStaleReferencesChange]);

    const update = (patch: Partial<AnalysisConfig>) => {
        const next: AnalysisConfig = { ...config, ...patch };
        if (patch.field && next.groupByField === patch.field) {
            delete next.groupByField;
        }
        setConfig(next);
        if (pending.current?.signature !== signature(next)) pending.current = null;
    };

    const run = async () => {
        if (
            refreshRequired
            || running
            || config.question.trim().length < 5
            || config.question.trim().length > 500
            || !config.field
            || records.length >= capacity
        ) return;
        setRunning(true);
        setError(null);
        try {
            const payloadConfig: AnalysisConfig = {
                question: config.question.trim(),
                method: config.method,
                field: config.field,
                weighted: config.weighted,
                ...(config.groupByField ? { groupByField: config.groupByField } : {}),
                ...(config.waveNumber ? { waveNumber: config.waveNumber } : {}),
                ...(config.datasetMode ? { datasetMode: config.datasetMode } : {}),
            };
            const key = signature(payloadConfig);
            if (!pending.current || pending.current.signature !== key) {
                pending.current = { signature: key, requestId: createRequestId() };
            }
            const response = await client.request<SavedAnalysisView>(`/api/student/tasks/${taskId}/analyses`, {
                method: "POST",
                body: JSON.stringify({
                    requestId: pending.current.requestId,
                    observedVersion,
                    config: payloadConfig,
                }),
            });
            if (!response.success || !response.data) {
                const conflict = ["VERSION_CONFLICT", "SOURCE_CONFLICT", "DICTIONARY_CONFLICT", "SAMPLING_CONFLICT"].includes(response.error?.code ?? "");
                if (conflict) {
                    onRefreshRequired();
                    return;
                }
                setError(response.error?.message ?? "执行失败，配置已保留，可以重新执行。");
                return;
            }
            setRecords(current => [response.data!, ...current.filter(item => item.id !== response.data!.id)]);
            pending.current = null;
        } catch {
            setError("执行失败，配置已保留，可以重新执行；若仍失败，请刷新页面或更换浏览器。");
        } finally {
            setRunning(false);
        }
    };

    const toggleReference = (record: SavedAnalysisView) => {
        if (references.includes(record.id)) return onReferencesChange(references.filter(id => id !== record.id));
        if (record.stale || references.length >= 10) return;
        onReferencesChange([...references, record.id]);
    };

    if (loading) return <p role="status" className="py-8 text-label text-muted-foreground">正在加载商务客群与单变量分析工作台…</p>;

    return (
        <div className="space-y-5" data-testid="student-univariate-workspace">
            {error && (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-surface border border-destructive-border bg-destructive-muted p-4 text-label text-destructive">
                    <span>{error}</span>
                    <Button variant="outline" size="sm" onClick={() => void load()}>
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                        重新加载
                    </Button>
                </div>
            )}

            {!dictionary ? (
                <p className="rounded-surface border border-warning-border bg-warning-muted p-4 text-label text-warning">
                    教师尚未提供变量字典，暂不能运行深度分析。
                </p>
            ) : (
                <Card className="rounded-surface border-border bg-card">
                    <CardHeader className="border-b border-border pb-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <CardTitle className="flex items-center gap-2 text-section-title text-foreground">
                                    <BarChart3 className="h-5 w-5 text-primary" />
                                    细分客群交叉对比与单变量探索台
                                </CardTitle>
                                <CardDescription className="mt-1">
                                    支持对单一指标做描述统计，或选择客群维度（如会员等级、城市线级、活跃分层）执行交叉透视表并一键引用至商业决策报告附录
                                </CardDescription>
                            </div>
                            <StatusBadge intent="info">容量 {records.length}/{capacity}</StatusBadge>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-5">
                        <div className="space-y-2">
                            <Label htmlFor="analysis-question-input" className="text-foreground">
                                本次验证的商业子假设或分析问题（5–500 字）
                            </Label>
                            <Textarea
                                id="analysis-question-input"
                                placeholder="例如：对比黑金会员与普通会员在最高支付意愿上的均值差异，判断高价值客群是否支撑新品溢价定价？"
                                value={config.question}
                                onChange={(event) => update({ question: event.target.value })}
                                rows={2}
                                className="bg-background"
                            />
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label className="text-foreground">抽样方法来源</Label>
                                <Select
                                    value={config.method}
                                    onValueChange={(val) => update({ method: val as AnalysisConfig["method"] })}
                                >
                                    <SelectTrigger aria-label="选择抽样方法来源" className="bg-background">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {completedMethods.map((method) => (
                                            <SelectItem key={method} value={method}>
                                                {methods[method]}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-foreground">目标分析变量</Label>
                                <Select
                                    value={config.field}
                                    onValueChange={(val) => update({ field: val })}
                                >
                                    <SelectTrigger aria-label="选择目标分析变量" className="bg-background">
                                        <SelectValue placeholder="请选择目标指标" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {variables.map((variable) => (
                                            <SelectItem key={variable.field} value={variable.field}>
                                                {variable.label}{variable.unit ? `（${variable.unit}）` : ""}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-foreground">细分客群交叉分组维度（可选）</Label>
                                <Select
                                    value={config.groupByField ?? NONE_GROUP_VALUE}
                                    onValueChange={(val) =>
                                        update({ groupByField: val === NONE_GROUP_VALUE ? undefined : val })
                                    }
                                >
                                    <SelectTrigger aria-label="选择交叉分组维度" className="bg-background">
                                        <SelectValue placeholder="不分组（单变量描述）" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NONE_GROUP_VALUE}>不分组（整体单变量描述）</SelectItem>
                                        {groupingVariables.map((variable) => (
                                            <SelectItem key={variable.field} value={variable.field}>
                                                按「{variable.label}」交叉对比
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 items-center gap-4 rounded-surface border border-border bg-background p-3.5">
                            {waves && waves.length > 0 ? (
                                <div className="space-y-1.5">
                                    <Label className="text-meta text-muted-foreground">数据所属波次</Label>
                                    <Select
                                        value={String(config.waveNumber ?? activeWaveNumber ?? waves[waves.length - 1]!.waveNumber)}
                                        onValueChange={(val) => update({ waveNumber: Number(val) })}
                                    >
                                        <SelectTrigger aria-label="选择分析波次" className="h-9 bg-card">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {waves.map((w) => (
                                                <SelectItem key={w.waveNumber} value={String(w.waveNumber)}>
                                                    {w.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            ) : (
                                <div className="text-meta text-muted-foreground">
                                    <Layers className="mr-1.5 inline h-4 w-4 text-primary" />
                                    使用当前抽样批次样本
                                </div>
                            )}

                            <div className="space-y-1.5">
                                <Label className="text-meta text-muted-foreground">答卷数据集口径</Label>
                                <Select
                                    value={config.datasetMode ?? "cleaned_respondents"}
                                    onValueChange={(val) =>
                                        update({ datasetMode: val as "cleaned_respondents" | "full_invited" })
                                    }
                                >
                                    <SelectTrigger aria-label="选择答卷数据集口径" className="h-9 bg-card">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="cleaned_respondents">质检清洗后有效回收答卷（推荐实证口径）</SelectItem>
                                        <SelectItem value="full_invited">理想 100% 应答完整入样名单（教学对照）</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex items-center justify-between gap-3 rounded-control border border-border bg-card px-3 py-2">
                                <Label htmlFor="analysis-weighted-switch" className="cursor-pointer text-label text-foreground">
                                    启用抽样设计权重加权
                                </Label>
                                <Switch
                                    id="analysis-weighted-switch"
                                    checked={config.weighted}
                                    onCheckedChange={(checked) => update({ weighted: checked })}
                                />
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                            <p className="max-w-2xl text-meta leading-relaxed text-muted-foreground" data-testid="student-univariate-category-contract">
                                口径说明：本工作台按课题变量字典保留 JSON 原始编码（数字 1 与文本“1”不同），并从有效分母排除字典声明的缺失编码，因此与概览主图两处分类比例可能不同；未绑定题目在有效回收口径下计为未采集缺失。
                            </p>
                            <Button
                                onClick={() => void run()}
                                disabled={
                                    refreshRequired
                                    || running
                                    || config.question.trim().length < 5
                                    || config.question.trim().length > 500
                                    || !config.field
                                    || records.length >= capacity
                                }
                                data-testid="student-univariate-run"
                            >
                                {running ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />正在计算…</>
                                ) : (
                                    <><Sparkles className="mr-2 h-4 w-4" />执行并保存分析卡片</>
                                )}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {records.length >= capacity && (
                <p className="rounded-surface border border-warning-border bg-warning-muted p-3 text-label text-warning">
                    已达到 {capacity} 条分析卡片上限。历史记录会保留且不可删除；可直接从下方卡片选择引用到报告。
                </p>
            )}

            <section className="space-y-3">
                <h2 className="text-section-title font-semibold text-foreground">
                    已保存实证分析卡片（{records.length}/{capacity}）
                </h2>
                {records.length === 0 ? (
                    <div className="rounded-surface border border-dashed border-border bg-card py-10 text-center text-label text-muted-foreground">
                        尚未保存分析记录。在上方输入商业子问题并选择目标变量（及可选客群维度）后点击「执行并保存分析卡片」。
                    </div>
                ) : (
                    records.map(record => {
                        const isReferenced = references.includes(record.id);
                        return (
                            <article key={record.id} className="rounded-surface border border-border bg-card p-5">
                                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
                                    <div className="min-w-0 flex-1 space-y-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="text-subheading font-semibold text-foreground">{record.config.question}</h3>
                                            {record.result.kind === "crosstab" && (
                                                <StatusBadge intent="primary">客群交叉对比</StatusBadge>
                                            )}
                                            {record.waveNumber && (
                                                <StatusBadge intent="info">Wave {record.waveNumber}</StatusBadge>
                                            )}
                                            {isReferenced && (
                                                <StatusBadge intent="success">
                                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                                    已纳入报告附录
                                                </StatusBadge>
                                            )}
                                        </div>
                                        <p className="break-all text-meta text-muted-foreground">
                                            指标：{record.variable.label}
                                            {record.result.kind === "crosstab" ? ` × 分组：${record.result.groupLabel}` : ""} ·{" "}
                                            {methods[record.config.method]} ·{" "}
                                            {record.config.datasetMode === "full_invited" ? "完整入样对照" : "质检有效回收"} ·{" "}
                                            {record.config.weighted ? "设计加权" : "等权"} · 来源哈希{" "}
                                            <span className="font-mono" title={record.source}>{shortSourceHash(record.source)}</span>
                                        </p>
                                    </div>
                                    <Button
                                        variant={isReferenced ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => toggleReference(record)}
                                        disabled={!isReferenced && (record.stale || references.length >= 10)}
                                    >
                                        {isReferenced ? "移出报告附录" : "引用到报告附录"}
                                    </Button>
                                </div>
                                {record.stale && (
                                    <p className="my-2 rounded-control border border-warning-border bg-warning-muted px-3 py-1.5 text-meta text-warning">
                                        后续重抽样或重新发放已产生新批次数据，此旧分析卡片已过期；若已引用，请移出并重新执行。
                                    </p>
                                )}
                                <div className="mt-3 overflow-x-auto">
                                    <AnalysisResultTable record={record} />
                                </div>
                            </article>
                        );
                    })
                )}
            </section>
        </div>
    );
}
