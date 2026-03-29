import type { ReactNode } from "react";
import { Info } from "lucide-react";
import type { SamplePlanData, SamplingResultsData } from "../../api-client";
import {
    formatMarginOfError,
    getAdvancedPlanSourceLabel,
    getEstimationTypeLabel,
    getMarginOfErrorLabel,
} from "../../experiment/sample-plan-display";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { METHOD_META, type MethodKey } from "./analysis-utils";

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
        <div className="grid grid-cols-1 gap-1 border-b border-slate-200/80 py-2.5 last:border-0 dark:border-slate-800/80 sm:grid-cols-[minmax(140px,200px)_1fr] sm:gap-4">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
            <div className="text-sm text-slate-800 dark:text-slate-200 break-words">{value}</div>
        </div>
    );
}

const notDoneHint = (
    <p className="text-xs text-slate-500 dark:text-slate-400">该方法尚未执行或结果未保存。</p>
);

function samplingMethodPanelForKey(
    key: MethodKey,
    samplingResults: SamplingResultsData,
    targetSampleSize: number | null,
    populationSize: number,
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
                            <p className="mt-2 text-[11px] text-amber-700/90 dark:text-amber-300/90">
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
            return {
                completed: true,
                content: (
                    <div className="space-y-0">
                        <ParamRow label="间隔 K" value={String(r.kValue)} />
                        <ParamRow label="实际抽取数量" value={r.sampleCount?.toLocaleString() ?? "—"} />
                        <ParamRow
                            label="按 N/K 推算"
                            value={
                                populationSize > 0 && r.kValue > 0
                                    ? `约 ⌈N/K⌉ = ⌈${populationSize}/${r.kValue}⌉ = ${Math.ceil(populationSize / r.kValue)}`
                                    : "—"
                            }
                        />
                        <ParamRow label="随机种子" value={r.seed !== undefined ? String(r.seed) : "未设置（每次随机）"} />
                        {targetSampleSize !== null && (
                            <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                                系统抽样实际样本量可能随 K 与随机起点在较小范围内波动；规划目标为 {targetSampleSize.toLocaleString()}。
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
                    completed: true,
                    content: (
                        <div className="space-y-0">
                            <ParamRow label="执行状态" value="当前任务无可用规模变量，已跳过" />
                            {r.unavailableReason && (
                                <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                                    {r.unavailableReason}
                                </p>
                            )}
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
                            <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
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
                            <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                                <Table>
                                    <TableHeader className="bg-slate-50/80 dark:bg-slate-900/80">
                                        <TableRow className="border-slate-200 dark:border-slate-800 hover:bg-transparent">
                                            <TableHead className="text-xs">层</TableHead>
                                            <TableHead className="text-xs text-right">Nₕ</TableHead>
                                            <TableHead className="text-xs text-right">占比</TableHead>
                                            <TableHead className="text-xs text-right">nₕ</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {r.layers.map((layer) => (
                                            <TableRow key={layer.name} className="border-slate-200 dark:border-slate-800">
                                                <TableCell className="text-sm font-medium">{layer.name}</TableCell>
                                                <TableCell className="text-right font-mono text-xs">{layer.count.toLocaleString()}</TableCell>
                                                <TableCell className="text-right text-xs text-slate-600 dark:text-slate-400">
                                                    {typeof layer.ratio === "number" && layer.ratio <= 1
                                                        ? `${(layer.ratio * 100).toFixed(1)}%`
                                                        : `${Number(layer.ratio).toFixed(1)}%`}
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-xs">{layer.sampleCount}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                        {targetSampleSize !== null && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
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
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-3 dark:border-amber-800/40 dark:bg-amber-950/20">
                <div className="flex gap-2">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div className="space-y-1.5 text-xs leading-relaxed text-amber-900/90 dark:text-amber-100/90">
                        <p className="font-medium text-amber-950 dark:text-amber-50">关于高级工具（子总体、多变量、成本/CV/整群等）</p>
                        <p className="text-amber-800/85 dark:text-amber-200/80">
                            高级工具的<span className="font-medium">完整中间状态与推演明细不会完整写入实验存档</span>，
                            但回写到核心决策参数里的结果仍会保存，例如最终样本量或设计效应。
                            下方展示的是「确认并进入下一阶段」时真正保存下来的核心参数；若最终样本量来自某个非标准工具，页面会直接标出来源。
                        </p>
                    </div>
                </div>
            </div>

            {!samplePlan ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white/40 py-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950/30 dark:text-slate-400">
                    尚未保存样本量规划数据
                </div>
            ) : (
                <div className="rounded-xl border border-slate-200/90 bg-white/50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
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
                                : `${formatMarginOfError(samplePlan.marginOfError, samplePlan.estimationType)}（边际误差）`
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
                        <p className="mt-2 text-[11px] text-amber-700/90 dark:text-amber-300/90">
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
}: {
    samplingResults: SamplingResultsData | null;
    targetSampleSize: number | null;
    populationSize: number;
}) {
    if (!samplingResults) {
        return (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/40 py-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950/30 dark:text-slate-400">
                暂无抽样结果数据（请先在阶段三完成抽样）
            </div>
        );
    }

    const methods = (Object.keys(METHOD_META) as MethodKey[]).map((key) => ({ key, meta: METHOD_META[key] }));

    return (
        <div className="space-y-5">
            {targetSampleSize !== null && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                    阶段二规划目标样本量：<span className="font-mono font-medium text-slate-700 dark:text-slate-300">{targetSampleSize.toLocaleString()}</span>
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
                    populationSize,
                );

                return (
                    <div
                        key={key}
                        className="rounded-xl border border-slate-200/90 bg-white/50 p-4 dark:border-slate-800 dark:bg-slate-950/40"
                        data-testid={`student-analysis-sampling-params-${key}`}
                    >
                        <div className="mb-3 flex items-center justify-between gap-2">
                            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{meta.label}</h4>
                            <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                    completed
                                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                        : "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-500"
                                }`}
                            >
                                {completed ? "已完成" : "未完成"}
                            </span>
                        </div>
                        {content}
                    </div>
                );
            })}
        </div>
    );
}
