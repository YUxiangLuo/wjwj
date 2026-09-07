import { SamplingObservationNotice } from "../../components/SamplingObservationNotice";
import type { ReactNode } from "react";
import { Info } from "lucide-react";
import type { SamplePlanData, SamplingResultsData } from "@/domain/experiment/types";
import {
    formatMarginOfError,
    getAdvancedPlanSourceLabel,
    getEstimationTypeLabel,
    getMarginOfErrorLabel,
} from "../../experiment/sample-plan-display";
import {
    PPS_UNAVAILABLE_REASON,
    PPS_UNAVAILABLE_STATUS_MESSAGE,
} from "../../experiment/sampling-messages";
import {
    formatSystematicInterval,
    getStoredSystematicInterval,
} from "../../experiment/systematic-sampling";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { METHOD_META, type MethodKey } from "./analysis-utils";
import { resolveSamplingPolicy, type SamplingPolicyV1 } from "@/lib/sampling-policy";

const FIELD_LABELS: Record<string, string> = {
    gender: "性别",
    education: "学历",
    age: "年龄段",
    age_group: "年龄段",
    income: "收入水平",
    city: "城市",
    city_tier: "城市等级",
    monthly_expense: "月支出",
    spending: "消费支出",
};

function labelField(key: string) {
    return FIELD_LABELS[key] ?? key;
}

function ParamRow({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="grid border-b border-border py-2.5 last:border-0 grid-cols-[minmax(140px,200px)_1fr] gap-4">
            <div className="text-meta font-medium text-muted-foreground">{label}</div>
            <div className="text-label text-foreground break-words">{value}</div>
        </div>
    );
}

const notDoneHint = (
    <p className="text-meta text-muted-foreground">该方法尚未执行或结果未保存。</p>
);

function samplingMethodPanelForKey(
    key: MethodKey,
    samplingResults: SamplingResultsData,
    targetSampleSize: number | null,
): { completed: boolean; content: ReactNode } {
    switch (key) {
        case "simple": {
            const r = samplingResults.simple;
            if (!r?.completed) {
                return { completed: false, content: notDoneHint };
            }
            return {
                completed: true,
                content: (
                    <div className="space-y-0">
                        <ParamRow label="抽取样本量" value={r.sampleCount?.toLocaleString() ?? "—"} />
                        {targetSampleSize !== null && r.sampleCount !== targetSampleSize && (
                            <p className="mt-2 text-meta text-warning">
                                与规划目标 {targetSampleSize.toLocaleString()} 不一致时，请在报告中说明原因（若仅为整数舍入可简述）。
                            </p>
                        )}
                        <ParamRow label="随机种子" value={r.seed !== undefined ? String(r.seed) : "未设置（每次随机）"} />
                    </div>
                ),
            };
        }
        case "systematic": {
            const r = samplingResults.systematic;
            if (!r?.completed) {
                return { completed: false, content: notDoneHint };
            }
            const interval = getStoredSystematicInterval(r);
            return {
                completed: true,
                content: (
                    <div className="space-y-0">
                        <ParamRow label="间隔 K=N/n" value={formatSystematicInterval(interval)} />
                        <ParamRow label="实际抽取数量" value={r.sampleCount?.toLocaleString() ?? "—"} />
                        <ParamRow
                            label="随机起点 r"
                            value={r.randomStart !== undefined ? formatSystematicInterval(r.randomStart) : r.startIndex !== undefined ? String(r.startIndex) : "—"}
                        />
                        <ParamRow label="随机种子" value={r.seed !== undefined ? String(r.seed) : "未设置（每次随机）"} />
                        {targetSampleSize !== null && (
                            <p className="mt-2 text-meta text-muted-foreground">
                                分数间隔系统抽样固定抽取 {targetSampleSize.toLocaleString()} 个样本；随机起点只改变入选单位。
                            </p>
                        )}
                    </div>
                ),
            };
        }
        case "pps": {
            const r = samplingResults.pps;
            if (r?.unavailable) {
                return {
                    completed: false,
                    content: (
                        <div className="space-y-0">
                            <ParamRow label="执行状态" value={PPS_UNAVAILABLE_STATUS_MESSAGE} />
                            <p className="mt-2 text-meta text-muted-foreground">
                                {r.unavailableReason || PPS_UNAVAILABLE_REASON}
                            </p>
                        </div>
                    ),
                };
            }
            if (!r?.completed) {
                return { completed: false, content: notDoneHint };
            }
            return {
                completed: true,
                content: (
                    <div className="space-y-0">
                        <ParamRow
                            label="规模变量"
                            value={r.sizeField ? `${labelField(r.sizeField)}（${r.sizeField}）` : "—"}
                        />
                        <ParamRow label="抽样数量" value={r.sampleCount?.toLocaleString() ?? "—"} />
                        <ParamRow label="随机种子" value={r.seed !== undefined ? String(r.seed) : "未设置（每次随机）"} />
                        {targetSampleSize !== null && r.sampleCount !== targetSampleSize && (
                            <p className="mt-2 text-meta text-muted-foreground">
                                PPS 允许在规划样本量附近调整抽取数量；当前为 {r.sampleCount?.toLocaleString()}，规划目标 {targetSampleSize.toLocaleString()}。
                            </p>
                        )}
                    </div>
                ),
            };
        }
        case "stratified": {
            const r = samplingResults.stratified;
            if (!r?.completed) {
                return { completed: false, content: notDoneHint };
            }
            return {
                completed: true,
                content: (
                    <div className="space-y-3">
                        <div className="space-y-0">
                            <ParamRow label="分层变量" value={`${labelField(r.stratifyBy)}（${r.stratifyBy}）`} />
                            <ParamRow
                                label="总样本量（各层合计）"
                                value={r.layers?.reduce((s, l) => s + l.sampleCount, 0).toLocaleString() ?? "—"}
                            />
                            <ParamRow label="随机种子" value={r.seed !== undefined ? String(r.seed) : "未设置（每次随机）"} />
                        </div>
                        {r.layers && r.layers.length > 0 && (
                            <div className="overflow-hidden rounded-surface border border-border">
                                <Table>
                                    <TableHeader className="bg-card">
                                        <TableRow className="border-border hover:bg-transparent">
                                            <TableHead className="text-meta">层</TableHead>
                                            <TableHead className="text-meta text-right">Nₕ</TableHead>
                                            <TableHead className="text-meta text-right">占比</TableHead>
                                            <TableHead className="text-meta text-right">nₕ</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {r.layers.map((layer) => (
                                            <TableRow key={layer.name} className="border-border">
                                                <TableCell className="text-label font-medium">{layer.name}</TableCell>
                                                <TableCell className="text-right font-mono text-meta">{layer.count.toLocaleString()}</TableCell>
                                                <TableCell className="text-right text-meta text-muted-foreground">
                                                    {typeof layer.ratio === "number" && layer.ratio <= 1
                                                        ? `${(layer.ratio * 100).toFixed(1)}%`
                                                        : `${Number(layer.ratio).toFixed(1)}%`}
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-meta">{layer.sampleCount}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                        {targetSampleSize !== null && (
                            <p className="text-meta text-muted-foreground">
                                各层 nₕ 之和应等于规划目标 {targetSampleSize.toLocaleString()}（执行前已在阶段三校验）。
                            </p>
                        )}
                    </div>
                ),
            };
        }
    }
}

export function SamplePlanDecisionPanel({
    samplePlan,
    populationSize,
}: {
    samplePlan: SamplePlanData | null;
    populationSize: number;
}) {
    const advancedSourceLabel = getAdvancedPlanSourceLabel(samplePlan?.advancedPlanSource);

    return (
        <div className="space-y-4">
            <div className="rounded-surface border border-warning-border bg-warning-muted p-3">
                <div className="flex gap-2">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    <div className="space-y-1.5 text-meta leading-relaxed text-warning">
                        <p className="font-medium text-warning">关于高级工具（子总体、多变量、成本/CV/整群等）</p>
                        <p className="text-warning">
                            高级工具的<span className="font-medium">完整中间状态与推演明细不会完整写入实验存档</span>，
                            但回写到核心决策参数里的结果仍会保存，例如最终样本量或设计效应。
                            下方展示的是「确认并进入下一阶段」时真正保存下来的核心参数；若最终样本量来自某个非标准工具，页面会直接标出来源。
                        </p>
                    </div>
                </div>
            </div>

            {!samplePlan ? (
                <div className="rounded-surface border border-dashed border-input bg-background py-12 text-center text-label text-muted-foreground">
                    尚未保存样本量规划数据
                </div>
            ) : (
                <div className="rounded-surface border border-border bg-background p-4">
                    <SamplingObservationNotice nonResponseRate={samplePlan.nonResponseRate} />
<ParamRow label="总体规模 N" value={populationSize > 0 ? populationSize.toLocaleString() : "—"} />
                    <ParamRow
                        label="估计类型"
                        value={
                            samplePlan.estimationType == null
                                ? "比例估计（默认）"
                                : getEstimationTypeLabel(samplePlan.estimationType)
                        }
                    />
                    {advancedSourceLabel && (
                        <ParamRow
                            label="最终样本量来源"
                            value={`${advancedSourceLabel}（高级工具）`}
                        />
                    )}
                    <ParamRow label="置信水平" value={`${samplePlan.confidenceLevel}%`} />
                    <ParamRow
                        label={getMarginOfErrorLabel(samplePlan.estimationType)}
                        value={
                            samplePlan.estimationType === "mean"
                                ? `${formatMarginOfError(samplePlan.marginOfError, samplePlan.estimationType)}（与均值同单位）`
                                : `${formatMarginOfError(samplePlan.marginOfError, samplePlan.estimationType)}（允许误差）`
                        }
                    />
                    {samplePlan.estimationType === "mean" && samplePlan.populationVariance !== undefined && samplePlan.populationVariance !== null && (
                        <ParamRow label="总体方差 σ²（估计）" value={String(samplePlan.populationVariance)} />
                    )}
                    <ParamRow label="设计效应 deff" value={samplePlan.designEffect?.toFixed(2) ?? "—"} />
                    <ParamRow
                        label="预期无回答率"
                        value={
                            typeof samplePlan.nonResponseRate === "number"
                                ? `${Math.round(samplePlan.nonResponseRate * 100)}%`
                                : "—"
                        }
                    />
                    <ParamRow label="推荐样本量 n" value={samplePlan.recommendedSize?.toLocaleString() ?? "—"} />
                    <ParamRow label="最终样本量 n" value={samplePlan.finalSampleSize?.toLocaleString() ?? "—"} />
                    {advancedSourceLabel && (
                        <p className="mt-2 text-meta text-warning">
                            当前最终样本量由「{advancedSourceLabel}」回写；此处的“推荐样本量 n”仍是常规公式建议值。
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

export function SamplingMethodParamsPanel({
    samplingResults,
    targetSampleSize,
    populationSize,
    samplingPolicy,
}: {
    samplingResults: SamplingResultsData | null;
    targetSampleSize: number | null;
    populationSize: number;
    samplingPolicy?: SamplingPolicyV1;
}) {
    if (!samplingResults) {
        return (
            <div className="rounded-surface border border-dashed border-input bg-background py-12 text-center text-label text-muted-foreground">
                暂无抽样结果数据（请先在阶段三完成抽样）
            </div>
        );
    }

    const policy = resolveSamplingPolicy(samplingPolicy);
    const methods = (Object.keys(METHOD_META) as MethodKey[])
        .filter((key) => policy.methods[key] !== "disabled")
        .map((key) => ({ key, meta: METHOD_META[key] }));

    return (
        <div className="space-y-5">
            {targetSampleSize !== null && (
                <p className="text-meta text-muted-foreground">
                    阶段二规划目标样本量：<span className="font-mono font-medium text-foreground">{targetSampleSize.toLocaleString()}</span>
                    {populationSize > 0 && (
                        <span className="ml-2">（总体 N = {populationSize.toLocaleString()}）</span>
                    )}
                </p>
            )}

            {methods.map(({ key, meta }) => {
                const { completed, content } = samplingMethodPanelForKey(
                    key,
                    samplingResults,
                    targetSampleSize,
                );

                return (
                    <div
                        key={key}
                        className="rounded-surface border border-border bg-background p-4"
                        data-testid={`student-analysis-sampling-params-${key}`}
                    >
                        <div className="mb-3 flex items-center justify-between gap-2">
                            <h4 className="text-label font-semibold text-foreground">{meta.label}</h4>
                            <div className="flex items-center gap-2">
                                <span className={`rounded-control border px-2 py-0.5 text-meta font-medium ${policy.methods[key] === "required" ? "border-primary-border bg-primary-muted text-primary" : "border-border bg-card text-muted-foreground"}`}>
                                    {policy.methods[key] === "required" ? "必做" : "选做"}
                                </span>
                                <span
                                    className={`rounded-control px-2 py-0.5 text-meta font-medium ${completed ? "bg-success-muted text-success" : "bg-muted text-muted-foreground"}`}
                                >
                                    {key === "pps" && samplingResults.pps?.unavailable
                                        ? "不适用"
                                        : completed
                                            ? "已完成"
                                            : policy.methods[key] === "optional" ? "未选择" : "未完成"}
                                </span>
                            </div>
                        </div>
                        {content}
                    </div>
                );
            })}
        </div>
    );
}
