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
import { AnalysisResultChart } from "@/components/charts/AnalysisResultChart";
import type { AnalysisConfig, SavedAnalysisView, VariableDictionary } from "@/domain/variables/types";
import type { ExperimentWaveView } from "@/domain/experiment/types";
import { isCompletedSamplingResult, SAMPLING_METHODS } from "@/lib/sampling-policy";
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
    const [analysesLoaded, setAnalysesLoaded] = useState(false);
    const [capacity, setCapacity] = useState(20);
    const defaultWaveNumber = useMemo(() => {
        if (!waves || waves.length === 0) return activeWaveNumber;
        if (activeWaveNumber && waves.some((w) => w.waveNumber === activeWaveNumber)) return activeWaveNumber;
        return waves[waves.length - 1]!.waveNumber;
    }, [waves, activeWaveNumber]);
    const [config, setConfig] = useState<AnalysisConfig>(() => ({
        question: "",
        method: completedMethods[0] ?? "simple",
        field: "",
        weighted: false,
        datasetMode: "cleaned_respondents",
        ...(defaultWaveNumber ? { waveNumber: defaultWaveNumber } : {}),
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
    const effectiveWaveNumber = useMemo(() => {
        if (!waves || waves.length === 0) return config.waveNumber;
        if (config.waveNumber && waves.some((w) => w.waveNumber === config.waveNumber)) return config.waveNumber;
        return defaultWaveNumber;
    }, [waves, config.waveNumber, defaultWaveNumber]);
    const availableMethods = useMemo<AnalysisConfig["method"][]>(() => {
        if (waves && waves.length > 0 && effectiveWaveNumber) {
            const targetWave = waves.find((w) => w.waveNumber === effectiveWaveNumber);
            const waveMethods = SAMPLING_METHODS.filter((m) => isCompletedSamplingResult(targetWave?.samplingResults?.[m]));
            if (waveMethods.length > 0) return waveMethods;
        }
        return completedMethods;
    }, [waves, effectiveWaveNumber, completedMethods]);

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
            setAnalysesLoaded(true);
        }
        if (!dictionaryResponse.success || !analysesResponse.success) {
            setError(dictionaryResponse.error?.message ?? analysesResponse.error?.message ?? "分析工作区加载失败");
        }
    };

    useEffect(() => {
        setAnalysesLoaded(false);
        void load();
    }, [taskId]);

    useEffect(() => {
        if (waves && waves.length > 0 && effectiveWaveNumber && config.waveNumber !== effectiveWaveNumber) {
            setConfig((current) => ({ ...current, waveNumber: effectiveWaveNumber }));
        }
    }, [waves, effectiveWaveNumber, config.waveNumber]);

    useEffect(() => {
        if (availableMethods.length > 0 && !availableMethods.includes(config.method)) {
            setConfig((current) => ({ ...current, method: availableMethods[0]! }));
        }
    }, [availableMethods, config.method]);

    useEffect(() => {
        if (!dictionary) return;
        setConfig((current) => {
            const nextField = current.field && variables.some((v) => v.field === current.field) ? current.field : "";
            const nextGroup = current.groupByField
                && current.groupByField !== nextField
                && variables.some((v) => v.field === current.groupByField && (v.kind === "nominal" || v.kind === "ordinal"))
                ? current.groupByField
                : undefined;
            if (nextField === current.field && nextGroup === current.groupByField) return current;
            const next: AnalysisConfig = { ...current, field: nextField };
            if (nextGroup) next.groupByField = nextGroup;
            else delete next.groupByField;
            return next;
        });
    }, [dictionary, variables]);

    useEffect(() => {
        if (!analysesLoaded) return;
        const recordById = new Map(records.map((r) => [r.id, r]));
        onStaleReferencesChange?.(
            references.filter((id) => {
                const match = recordById.get(id);
                return !match || match.stale;
            }),
        );
    }, [analysesLoaded, records, references, onStaleReferencesChange]);

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
                ...(effectiveWaveNumber ? { waveNumber: effectiveWaveNumber } : {}),
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

    const selectedWaveObj = useMemo(
        () => (waves && effectiveWaveNumber ? waves.find((w) => w.waveNumber === effectiveWaveNumber) ?? null : null),
        [waves, effectiveWaveNumber],
    );
    const boundFieldsInWave = useMemo(() => {
        if (!selectedWaveObj?.questionnaire) return null;
        const fields = new Set<string>();
        for (const q of selectedWaveObj.questionnaire.questions ?? []) {
            for (const m of q.variableBinding?.mappings ?? []) {
                if (m.field) fields.add(m.field);
            }
        }
        return fields;
    }, [selectedWaveObj]);
    const unboundRespondentFields = useMemo(() => {
        if ((config.datasetMode ?? "cleaned_respondents") !== "cleaned_respondents" || !boundFieldsInWave) return [];
        const list: string[] = [];
        if (config.field && !boundFieldsInWave.has(config.field)) {
            const v = variables.find((item) => item.field === config.field);
            list.push(v?.label ?? config.field);
        }
        if (config.groupByField && !boundFieldsInWave.has(config.groupByField)) {
            const g = variables.find((item) => item.field === config.groupByField);
            list.push(g?.label ?? config.groupByField);
        }
        return list;
    }, [config.datasetMode, config.field, config.groupByField, boundFieldsInWave, variables]);

    const trimmedQuestionLen = config.question.trim().length;
    const runDisabledReason = useMemo<string | null>(() => {
        if (refreshRequired || running || records.length >= capacity) return null;
        if (trimmedQuestionLen < 5 && !config.field) return "请输入至少 5 字分析问题并选择目标变量";
        if (trimmedQuestionLen < 5) return `分析问题还差 ${5 - trimmedQuestionLen} 字（至少 5 字）`;
        if (trimmedQuestionLen > 500) return `分析问题已超出 ${trimmedQuestionLen - 500} 字`;
        if (!config.field) return "请选择目标分析变量";
        return null;
    }, [refreshRequired, running, records.length, capacity, trimmedQuestionLen, config.field]);

    if (loading) return <p role="status" className="py-8 text-label text-muted-foreground">正在加载商务客群与单变量分析工作台…</p>;

    const canOfferUnweightedFix = Boolean(error && config.weighted && (error.includes("加权") || error.includes("分层")));
    const canOfferFullInvitedFix = Boolean(
        error
        && (config.datasetMode ?? "cleaned_respondents") === "cleaned_respondents"
        && (error.includes("发放回收") || error.includes("有效回收答卷")),
    );

    return (
        <div className="space-y-5" data-testid="student-univariate-workspace">
            {error && (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-surface border border-destructive-border bg-destructive-muted p-4 text-label text-destructive">
                    <span className="min-w-0 flex-1">{error}</span>
                    <div className="flex flex-wrap items-center gap-2">
                        {canOfferUnweightedFix && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="bg-card text-foreground"
                                data-testid="student-univariate-fix-unweighted"
                                onClick={() => {
                                    update({ weighted: false });
                                    setError(null);
                                }}
                            >
                                切换为未加权描述
                            </Button>
                        )}
                        {canOfferFullInvitedFix && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="bg-card text-foreground"
                                data-testid="student-univariate-fix-full-invited"
                                onClick={() => {
                                    update({ datasetMode: "full_invited" });
                                    setError(null);
                                }}
                            >
                                切换为完整入样名单对照
                            </Button>
                        )}
                        <Button variant="outline" size="sm" className="bg-card" onClick={() => void load()}>
                            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                            重新加载
                        </Button>
                    </div>
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
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <Label htmlFor="analysis-question-input" className="text-foreground">
                                    本次验证的商业子假设或分析问题（5–500 字）
                                </Label>
                                <span className={`text-meta tabular-nums ${
                                    trimmedQuestionLen > 500
                                        ? "text-destructive font-semibold"
                                        : trimmedQuestionLen >= 5
                                            ? "text-success"
                                            : "text-muted-foreground"
                                }`}>
                                    {trimmedQuestionLen} / 500 字
                                </span>
                            </div>
                            <Textarea
                                id="analysis-question-input"
                                placeholder="例如：对比黑金会员与普通会员在最高支付意愿上的均值差异，判断高价值客群是否支撑新品溢价定价？"
                                value={config.question}
                                onChange={(event) => update({ question: event.target.value })}
                                rows={2}
                                className="bg-background"
                            />
                        </div>

                        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-4">
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
                                        {availableMethods.map((method) => (
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

                        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] items-center gap-4 rounded-surface border border-border bg-background p-3.5">
                            {waves && waves.length > 0 ? (
                                <div className="space-y-1.5">
                                    <Label className="text-meta text-muted-foreground">数据所属波次</Label>
                                    <Select
                                        value={String(effectiveWaveNumber ?? waves[waves.length - 1]!.waveNumber)}
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

                        {unboundRespondentFields.length > 0 && (
                            <div
                                role="status"
                                data-testid="student-univariate-unbound-notice"
                                className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-info-border bg-info-muted px-3.5 py-2 text-meta text-foreground"
                            >
                                <span>
                                    提示：所选变量「{unboundRespondentFields.join("、")}」未关联当前波次问卷题目；若非抽样框固有分层字段，在“质检有效回收答卷”口径下将计为未采集缺失，可按需切换完整入样名单做框内对照。
                                </span>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 bg-card px-2.5 text-meta"
                                    onClick={() => update({ datasetMode: "full_invited" })}
                                >
                                    切换完整入样对照
                                </Button>
                            </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                            <p className="max-w-2xl text-meta leading-relaxed text-muted-foreground" data-testid="student-univariate-category-contract">
                                口径说明：本工作台按课题变量字典保留 JSON 原始编码（数字 1 与文本“1”不同），并从有效分母排除字典声明的缺失编码，因此与概览主图两处分类比例可能不同；未绑定题目在有效回收口径下计为未采集缺失。
                            </p>
                            <div className="flex flex-wrap items-center gap-3">
                                {runDisabledReason && (
                                    <span className="text-meta text-muted-foreground" data-testid="student-univariate-disabled-hint">
                                        {runDisabledReason}
                                    </span>
                                )}
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
                                {!record.stale && record.result.validCount === 0 && (
                                    <p className="my-2 rounded-control border border-warning-border bg-warning-muted px-3 py-1.5 text-meta text-warning">
                                        当前分析结果有效观测数为 0（缺失 {record.result.missingCount}）：所选变量在本轮回收答卷中尚无有效值（可能未绑定问卷题目或全部缺失）。
                                    </p>
                                )}
                                <AnalysisResultChart
                                    record={record}
                                    className="mt-3"
                                    testId={`univariate-result-chart-${record.id}`}
                                />
                                <div
                                    role="region"
                                    aria-label={`分析卡片 ${record.id} 结果表`}
                                    tabIndex={0}
                                    className="mt-3 overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
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
