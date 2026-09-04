import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
    Calculator,
    Layers,
    Info,
    ArrowRight,
    AlertTriangle
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
        result: { requiredClusters: number; requiredSampleSize: number; intraClassCorrelation: number };
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

    const [clusterSize, setClusterSize] = useState(50); // 群规模（每群平均单位数）
    const [deff, setDeff] = useState(2.0); // 设计效应
    const [nonResponseRate, setNonResponseRate] = useState(() =>
        nonResponseDecimalToFormPercent(initialNonResponseRate),
    );
    const [result, setResult] = useState<ClusterSamplingResult | null>(null);

    // 父级决策参数变化时同步本地
    useEffect(() => {
        setConfidenceLevelLocal(confidenceLevel);
    }, [confidenceLevel]);
    useEffect(() => {
        setMarginOfErrorLocal(marginOfError);
    }, [marginOfError]);
    useEffect(() => {
        setNonResponseRate(nonResponseDecimalToFormPercent(initialNonResponseRate));
    }, [initialNonResponseRate]);

    // 计算整群抽样
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
        <Card className="rounded-surface border-primary-border bg-primary-muted ">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Layers className="w-5 h-5 text-primary" />
                        <CardTitle className="text-body text-primary">
                            整群抽样样本量计算
                        </CardTitle>
                    </div>
                    <Badge
                        variant="outline"
                        className="text-meta bg-primary-muted border-primary-border text-primary"
                    >
                        设计效应应用
                    </Badge>
                </div>
                <CardDescription className="text-foreground">
                    只用来估算建议发放量。应用结果只会改最终 n，不会把实验抽法改成整群抽样。
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* 说明 */}
                <div className="rounded-surface border border-info-border bg-info-muted p-3">
                    <div className="flex gap-2">
                        <Info className="w-4 h-4 text-info shrink-0 mt-0.5" />
                        <div className="text-meta text-info space-y-1">
                            <p className="font-medium">什么是整群抽样？</p>
                            <p>
                                整群抽样以"群"为单位抽样（如整栋居民楼、整个班级），群内所有单元都调查。
                                当目标变量在群内正相关时，设计效应通常大于 1，需要增加样本量；实际 deff
                                取决于目标变量、群规模、群内相关和权重，而不是仅由“整群抽样”这个名称决定。
                                这里算出的 n 只会写回决策面板的最终样本量；抽样执行阶段仍是简单随机、系统、PPS 或分层。
                            </p>
                        </div>
                    </div>
                </div>

                {/* 参数设置 */}
                <div className="space-y-4">
                    {/* 群规模 */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-meta text-primary">
                                平均群规模（每群单位数）
                            </Label>
                            <span className="text-label font-bold text-primary">
                                {clusterSize} 个单位
                            </span>
                        </div>
                        <Slider
                            aria-label="平均群规模"
                            value={[clusterSize]}
                            onValueChange={(v) => setClusterSize(v[0] ?? 50)}
                            min={10}
                            max={500}
                            step={10}
                            className={primarySliderClassName}
                        />
                        <p className="text-meta text-muted-foreground">
                            例如：每栋楼平均50户、每班平均30名学生
                        </p>
                    </div>

                    {/* 设计效应 */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label className="text-meta text-primary">
                                设计效应 (deff)
                            </Label>
                            <span className="text-label font-bold text-primary">
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
                        <div className="flex justify-between text-meta text-muted-foreground">
                            <span>1.0（SRS 基准）</span>
                            <span>当前 {deff.toFixed(1)}</span>
                            <span>5.0（设置上限）</span>
                        </div>
                        <p className="text-meta text-muted-foreground leading-relaxed">
                            优先采用同类历史调查中同一指标的 deff，或用预调查、设计模拟估计；不要按抽样方法套用固定区间。
                        </p>
                    </div>

                    {/* 其他参数（继承决策面板，可在本工具内调整） */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-meta text-primary">置信水平</Label>
                            <Select value={confidenceLevelLocal} onValueChange={setConfidenceLevelLocal}>
                                <SelectTrigger aria-label="整群抽样置信水平" className="h-9 text-label bg-card border-primary">
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
                                <Label className="text-meta text-primary">允许误差</Label>
                                <span className="text-meta font-bold text-info tabular-nums">
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
                        <Label htmlFor="cluster-non-response-rate" className="text-meta text-primary">无回答率 (%)</Label>
                        <Input
                            id="cluster-non-response-rate"
                            type="number"
                            value={nonResponseRate}
                            onChange={(e) => setNonResponseRate(parseFloat(e.target.value) || 0)}
                            className="bg-card border-primary text-foreground"
                            min={0}
                            max={50}
                            step={1}
                        />
                    </div>
                </div>

                {/* 计算结果 */}
                {result && (
                    <div className="rounded-surface border-2 border-primary bg-background p-4 ">
                        <div className="flex items-center gap-2 mb-4">
                            <Calculator className="w-5 h-5 text-primary" />
                            <span className="font-bold text-primary">计算结果</span>
                        </div>

                        <div className="space-y-4">
                            {/* 主要结果 */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="text-center p-3 rounded-surface bg-background border border-primary-border">
                                    <div className="text-meta text-primary mb-1">所需群数</div>
                                    <div className="text-page-title font-bold tabular-nums text-primary">
                                        {result.requiredClusters}
                                    </div>
                                    <div className="text-meta text-primary">个群</div>
                                </div>
                                <div className="text-center p-3 rounded-surface bg-background border border-primary-border">
                                    <div className="text-meta text-primary mb-1">总样本量</div>
                                    <div className="text-page-title font-bold tabular-nums text-info">
                                        {result.requiredSampleSize.toLocaleString()}
                                    </div>
                                    <div className="text-meta text-primary">个单位</div>
                                </div>
                            </div>

                            {/* 设计效应说明 */}
                            <div className="rounded-surface border border-primary bg-background p-3">
                                <div className="space-y-2 text-label">
                                    <div className="flex items-center justify-between">
                                        <span className="text-primary">设计效应 (deff)</span>
                                        <span className="font-mono font-bold text-primary">
                                            {result.deff.toFixed(2)}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-primary">估计群内相关系数 (ρ)</span>
                                        <span className="font-mono font-bold text-primary">
                                            {result.intraClassCorrelation.toFixed(3)}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* 公式解释 */}
                            <div className="rounded-surface border border-warning-border bg-warning-muted p-2">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                                    <p className="text-meta text-warning">
                                        {result.explanation} 群内相关系数 ρ = (deff-1)/(M-1)，
                                        其中 M={clusterSize} 为群规模。ρ 越大说明群内同质性越高，
                                        需要的补偿样本量越大。
                                    </p>
                                </div>
                            </div>

                            {/* 应用按钮 */}
                            {onApplyResult && (
                                <>
                                    <p className="text-meta text-muted-foreground leading-relaxed">
                                        「应用」仅将总样本量写入最终样本量。若本工具内参数与左侧不一致，理解此 n 时以本工具为准；左侧不会随本工具更新，勿用左侧参数代回标准公式验算。
                                    </p>
                                    <Button
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
                                        className="w-full bg-primary text-primary-foreground hover:bg-primary-hover"
                                    >
                                        应用整群抽样方案
                                        <ArrowRight className="w-4 h-4 ml-2" />
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* 取值依据 */}
                <div className="rounded-surface border border-border bg-background p-3">
                    <p className="text-meta font-medium text-foreground mb-1.5">设计效应如何取值</p>
                    <p className="text-meta text-muted-foreground leading-relaxed">
                        SRS 的基准为 deff=1。复杂设计的 deff 应针对当前目标变量和估计量确定；不同指标即使来自同一调查，也可能有不同设计效应。
                        若只有群规模 M 和可信的群内相关系数 ρ，可用 deff≈1+(M−1)ρ 作规划近似。
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}
