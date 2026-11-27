import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import {
    Calculator,
    Layers,
    ArrowRight,
} from "lucide-react";
import { calculateClusterSamplingSize, type ClusterSamplingResult } from "../experiment/sample-plan";
import { nonResponseDecimalToFormPercent } from "./inherit-planning-params";
import { primarySliderClassName } from "./sample-planning-styles";

interface ClusterSamplingCalculatorProps {
    populationSize: number;
    /** 决策面板传入，作为本工具内可改的初值 */
    confidenceLevel: string;
    marginOfError: number;
    /** 与决策面板一致，小数形式 0～1（如 0.1 表示 10%） */
    initialNonResponseRate?: number;
    onApplyResult?: (clusters: number, sampleSize: number) => void;
    /** 应用时回传完整输入与结果（用于高级规划快照持久化与服务端复算）。 */
    onSnapshot?: (snapshot: {
        inputs: {
            confidenceLevel: string;
            marginOfError: number;
            clusterSize: number;
            designEffect: number;
            nonResponseRate: number;
        };
        result: { requiredClusters: number; requiredSampleSize: number; intraClassCorrelation: number | null };
    }) => void;
}

export function ClusterSamplingCalculator({
    populationSize,
    confidenceLevel,
    marginOfError,
    initialNonResponseRate,
    onApplyResult,
    onSnapshot,
}: ClusterSamplingCalculatorProps) {
    const [confidenceLevelLocal, setConfidenceLevelLocal] = useState(() => confidenceLevel);
    const [marginOfErrorLocal, setMarginOfErrorLocal] = useState(() => marginOfError);

    const [clusterSize, setClusterSize] = useState(50);
    const [deff, setDeff] = useState(2.0);
    const [nonResponseRate, setNonResponseRate] = useState(() =>
        nonResponseDecimalToFormPercent(initialNonResponseRate),
    );
    const [result, setResult] = useState<ClusterSamplingResult | null>(null);

    useEffect(() => {
        setConfidenceLevelLocal(confidenceLevel);
    }, [confidenceLevel]);
    useEffect(() => {
        setMarginOfErrorLocal(marginOfError);
    }, [marginOfError]);
    useEffect(() => {
        setNonResponseRate(nonResponseDecimalToFormPercent(initialNonResponseRate));
    }, [initialNonResponseRate]);

    useEffect(() => {
        const newResult = calculateClusterSamplingSize({
            populationSize,
            confidenceLevel: confidenceLevelLocal,
            marginOfError: marginOfErrorLocal,
            clusterSize,
            deff,
            nonResponseRate: nonResponseRate / 100,
        });
        setResult(newResult);
    }, [populationSize, confidenceLevelLocal, marginOfErrorLocal, clusterSize, deff, nonResponseRate]);

    return (
        <Card className="rounded-surface border-border bg-card">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Layers className="w-5 h-5 text-primary" />
                        <CardTitle className="text-body text-foreground">
                            整群抽样样本量计算
                        </CardTitle>
                    </div>
                    <StatusBadge intent="neutral">设计效应应用</StatusBadge>
                </div>
                <CardDescription className="text-muted-foreground">
                    只用来估算建议发放量。应用结果只会改最终 n，不会把实验抽法改成整群抽样。
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                <div className="rounded-surface bg-muted p-3.5 text-meta text-muted-foreground space-y-1">
                    <p className="font-medium text-foreground">什么是整群抽样？</p>
                    <p className="leading-relaxed">
                        整群抽样以“群”为单位抽样（如整栋居民楼、整个班级），群内所有单元都调查。
                        当目标变量在群内正相关时，设计效应通常大于 1，需要增加样本量；实际 deff
                        取决于目标变量、群规模、群内相关和权重，而不是仅由“整群抽样”这个名称决定。
                        这里算出的 n 只会写回决策面板的最终样本量；抽样执行阶段仍是简单随机、系统、PPS 或分层。
                    </p>
                </div>

                {/* 参数设置 */}
                <div className="space-y-4">
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-meta text-foreground">
                                规划群规模（每群单位数）
                            </Label>
                            <span className="text-label font-medium tabular-nums text-foreground">
                                {clusterSize} 个单位
                            </span>
                        </div>
                        <Slider
                            aria-label="规划群规模"
                            value={[clusterSize]}
                            onValueChange={(v) => setClusterSize(v[0] ?? 50)}
                            min={10}
                            max={500}
                            step={10}
                            className={primarySliderClassName}
                        />
                        <p className="text-meta text-muted-foreground">
                            按每群固定单位数估算，末群可不足；请在执行前核对实际群框。
                        </p>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-meta text-foreground">
                                设计效应 (deff)
                            </Label>
                            <span className="text-label font-medium tabular-nums text-foreground">
                                {deff.toFixed(1)}
                            </span>
                        </div>
                        <Slider
                            aria-label="整群抽样设计效应"
                            value={[deff]}
                            onValueChange={(v) => setDeff(v[0] ?? 2)}
                            min={1}
                            max={5}
                            step={0.1}
                            className={primarySliderClassName}
                        />
                        <div className="flex justify-between text-meta tabular-nums text-muted-foreground">
                            <span>1.0（SRS 基准）</span>
                            <span>当前 {deff.toFixed(1)}</span>
                            <span>5.0（设置上限）</span>
                        </div>
                        <p className="text-meta text-muted-foreground leading-relaxed">
                            输入完整回答时，同一指标相对同样本量不放回简单随机抽样（SRSWOR）的方差比；无回答另行计算，不要重复计入 deff。
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-meta text-foreground">置信水平</Label>
                            <Select value={confidenceLevelLocal} onValueChange={setConfidenceLevelLocal}>
                                <SelectTrigger aria-label="整群抽样置信水平" className="h-9 text-label bg-card border-input text-foreground">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="90">90%</SelectItem>
                                    <SelectItem value="95">95%</SelectItem>
                                    <SelectItem value="99">99%</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <div className="flex justify-between">
                                <Label className="text-meta text-foreground">允许误差</Label>
                                <span className="text-meta font-medium text-foreground tabular-nums">
                                    ±{marginOfErrorLocal}%
                                </span>
                            </div>
                            <Slider
                                aria-label="整群抽样允许误差"
                                value={[marginOfErrorLocal]}
                                onValueChange={([v]) => v != null && setMarginOfErrorLocal(v)}
                                min={1}
                                max={10}
                                step={1}
                                className={primarySliderClassName}
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <Label htmlFor="cluster-non-response-rate" className="text-meta text-foreground">无回答率 (%)</Label>
                        <Input
                            id="cluster-non-response-rate"
                            type="number"
                            value={nonResponseRate}
                            onChange={(e) => setNonResponseRate(parseFloat(e.target.value) || 0)}
                            className="bg-card border-input text-foreground"
                            min={0}
                            max={50}
                            step={1}
                        />
                    </div>
                </div>

                {!result && <p role="alert" className="text-label text-destructive">当前参数无法形成有效规划：请核对设计效应、总体和群规模、无回答率；多单位群的预期回答人数不能少于 1。</p>}

                {/* 计算结果 */}
                {result && (
                    <div className="rounded-surface bg-muted p-4 space-y-4">
                        <div className="flex items-center gap-2">
                            <Calculator className="w-5 h-5 text-primary" />
                            <span className="font-medium text-foreground">计算结果</span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="text-center p-3 rounded-surface bg-card border border-border">
                                <div className="text-meta text-muted-foreground mb-1">所需群数</div>
                                <div className="text-page-title font-medium tabular-nums text-foreground">
                                    {result.requiredClusters}
                                </div>
                                <div className="text-meta text-muted-foreground">个群</div>
                            </div>
                            <div className="text-center p-3 rounded-surface bg-card border border-border">
                                <div className="text-meta text-muted-foreground mb-1">计划发放量上限</div>
                                <div className="text-page-title font-medium tabular-nums text-primary">
                                    {result.requiredSampleSize.toLocaleString()}
                                </div>
                                <div className="text-meta text-muted-foreground">个单位</div>
                            </div>
                        </div>

                        <p className="text-label text-muted-foreground">模型假设下的预期误差限：{(result.marginOfError * 100).toFixed(2)}%</p>
                        {result.precisionUnreachable && <p role="alert" className="text-label text-destructive">按当前模型，即使向全体发放仍无法达到目标精度。请调整精度或无回答率后再应用。</p>}

                        <div className="rounded-surface border border-border bg-card p-3 space-y-2 text-label">
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">输入设计效应 (deff)</span>
                                <span className="font-mono font-medium tabular-nums text-foreground">
                                    {result.deff.toFixed(2)}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">模型隐含群内相关系数 (ρ)</span>
                                <span className="font-mono font-medium tabular-nums text-foreground">
                                    {result.intraClassCorrelation === null ? "不适用" : result.intraClassCorrelation.toFixed(3)}
                                </span>
                            </div>
                            <p className="text-meta text-muted-foreground">由输入设计效应与群结构假设反推，不是根据观测数据估计的 ICC。</p>
                        </div>

                        <p className="text-meta text-muted-foreground leading-relaxed">
                            {result.explanation}
                        </p>

                        {onApplyResult && (
                            <div className="space-y-2 pt-1">
                                <p className="text-meta text-muted-foreground leading-relaxed">
                                    「应用」仅将总样本量写入最终样本量。若本工具内参数与左侧不一致，理解此 n 时以本工具为准；左侧不会随本工具更新，勿用左侧参数代回标准公式验算。
                                </p>
                                <Button
                                    disabled={result.precisionUnreachable}
                                    onClick={() => {
                                        onSnapshot?.({
                                            inputs: {
                                                confidenceLevel: confidenceLevelLocal,
                                                marginOfError: marginOfErrorLocal,
                                                clusterSize,
                                                designEffect: deff,
                                                nonResponseRate,
                                            },
                                            result: {
                                                requiredClusters: result.requiredClusters,
                                                requiredSampleSize: result.requiredSampleSize,
                                                intraClassCorrelation: result.intraClassCorrelation,
                                            },
                                        });
                                        onApplyResult(result.requiredClusters, result.requiredSampleSize);
                                    }}
                                    className="w-full"
                                >
                                    应用整群抽样方案
                                    <ArrowRight className="w-4 h-4 ml-2" />
                                </Button>
                            </div>
                        )}
                    </div>
                )}

                <div className="rounded-surface bg-muted p-3.5">
                    <p className="text-meta font-medium text-foreground mb-1">设计效应如何取值</p>
                    <p className="text-meta text-muted-foreground leading-relaxed">
                        可用同一有限总体上的完整回答设计模拟估计 deff。等规模多群时，设群数 K、群规模 M、总体量 N=KM，
                        则 deff=[1+(M−1)ρ](N−1)/[M(K−1)]。不要把 1+(M−1)ρ 直接当作有限总体的方差比。
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}
