import { useState, useEffect, useRef, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    Plus, 
    Trash2, 
    Target, 
    Layers, 
    Calculator, 
    AlertCircle, 
    Info,
    ChevronDown,
    ChevronUp
} from "lucide-react";
import {
    calculateFinitePopulationSampleSize,
    calculateMeanEstimationSampleSize,
} from "../experiment/sample-plan";
import { formatMarginOfError } from "../experiment/sample-plan-display";

export interface Domain {
    id: string;
    name: string;
    populationSize: number;
    stratifiedVariable?: string;  // 如"省份"、"性别"
    stratifiedValue?: string;     // 如"广东省"、"女性"
    confidenceLevel: string;
    marginOfError: number;
    requiredSampleSize: number;
}

interface DomainEstimationManagerProps {
    totalPopulationSize: number;
    stratifiedFields: string[];
    onDomainsChange: (domains: Domain[]) => void;
    initialDomains?: Domain[];
    estimationType?: "proportion" | "mean";
    populationVariance?: number;
    defaultConfidenceLevel?: string;
    defaultMarginOfError?: number;
}

export function DomainEstimationManager({ 
    totalPopulationSize, 
    stratifiedFields,
    onDomainsChange,
    initialDomains = [],
    estimationType = "proportion",
    populationVariance,
    defaultConfidenceLevel = "95",
    defaultMarginOfError,
}: DomainEstimationManagerProps) {
    const [domains, setDomains] = useState<Domain[]>(initialDomains);
    const [expandedDomain, setExpandedDomain] = useState<string | null>(null);
    const [showExplanation, setShowExplanation] = useState(true);
    const isMeanEstimation = estimationType === "mean";
    const resolvedDefaultMarginOfError = defaultMarginOfError
        ?? (isMeanEstimation ? 2 : 5);
    const marginLabel = isMeanEstimation ? "绝对误差限" : "允许误差";
    const marginInputSuffix = isMeanEstimation ? "" : " (%)";

    const onDomainsChangeRef = useRef(onDomainsChange);
    onDomainsChangeRef.current = onDomainsChange;

    /** 仅当影响样本量公式的字段变化时变化，避免改名称等无关字段触发重算或二次 effect */
    const domainsSampleCalcKey = useMemo(
        () =>
            `${estimationType}|${populationVariance ?? ""}|${domains
                .map((d) => `${d.confidenceLevel}-${d.marginOfError}-${d.populationSize}`)
                .join(",")}`,
        [domains, estimationType, populationVariance],
    );

    // 计算每个域的所需样本量
    useEffect(() => {
        const updatedDomains = domains.map(domain => {
            const requiredSampleSize = isMeanEstimation
                ? calculateMeanEstimationSampleSize({
                    confidenceLevel: domain.confidenceLevel,
                    marginOfError: domain.marginOfError,
                    populationSize: domain.populationSize,
                    populationVariance: Number(populationVariance),
                    designEffect: 1,
                    nonResponseRate: 0,
                }) ?? 0
                : calculateFinitePopulationSampleSize({
                    confidenceLevel: domain.confidenceLevel,
                    marginOfError: domain.marginOfError,
                    populationSize: domain.populationSize,
                    designEffect: 1,  // 假设简单随机抽样
                    nonResponseRate: 0,
                }) ?? 0;

            return {
                ...domain,
                requiredSampleSize,
            };
        });

        // 只在样本量真正改变时才更新，避免无限循环
        const hasChanged = updatedDomains.some((domain, index) => {
            const oldDomain = domains[index];
            return oldDomain && domain.requiredSampleSize !== oldDomain.requiredSampleSize;
        });

        if (hasChanged || updatedDomains.length !== domains.length) {
            setDomains(updatedDomains);
            onDomainsChangeRef.current(updatedDomains);
        }
        // 依赖不含 onDomainsChange：用 ref 始终调用最新回调，避免父级内联函数导致 effect 每帧重跑
    }, [domainsSampleCalcKey, totalPopulationSize]);

    // 添加新域
    const addDomain = () => {
        const newDomain: Domain = {
            id: `domain-${Date.now()}`,
            name: `子总体 ${domains.length + 1}`,
            populationSize: Math.floor(totalPopulationSize / 2),
            confidenceLevel: defaultConfidenceLevel,
            marginOfError: resolvedDefaultMarginOfError,
            requiredSampleSize: 0,
        };
        const newDomains = [...domains, newDomain];
        setDomains(newDomains);
        setExpandedDomain(newDomain.id);
        onDomainsChange(newDomains);
    };

    // 删除域
    const removeDomain = (id: string) => {
        const newDomains = domains.filter(d => d.id !== id);
        setDomains(newDomains);
        onDomainsChange(newDomains);
    };

    // 更新域
    const updateDomain = (id: string, updates: Partial<Domain>) => {
        const newDomains = domains.map(d => 
            d.id === id ? { ...d, ...updates } : d
        );
        setDomains(newDomains);
        onDomainsChange(newDomains);
    };

    // 互斥子总体（层）下，总样本量为各层样本量之和。
    const largestRequiredSampleSize = Math.max(0, ...domains.map(d => d.requiredSampleSize));
    const totalRequiredSampleSize = domains.reduce((sum, d) => sum + d.requiredSampleSize, 0);
    const allocatedPopulationSize = domains.reduce((sum, d) => sum + d.populationSize, 0);
    const populationOverflow = allocatedPopulationSize - totalPopulationSize;

    // 计算简单随机抽样的基准样本量
    const baseSampleSize = isMeanEstimation
        ? calculateMeanEstimationSampleSize({
            confidenceLevel: defaultConfidenceLevel,
            marginOfError: resolvedDefaultMarginOfError,
            populationSize: totalPopulationSize,
            populationVariance: Number(populationVariance),
            designEffect: 1,
            nonResponseRate: 0,
        }) ?? 0
        : calculateFinitePopulationSampleSize({
            confidenceLevel: defaultConfidenceLevel,
            marginOfError: resolvedDefaultMarginOfError,
            populationSize: totalPopulationSize,
            designEffect: 1,
            nonResponseRate: 0,
        }) ?? 0;

    // 样本量增量
    const sampleSizeIncrease = totalRequiredSampleSize - baseSampleSize;
    const increaseRatio = baseSampleSize > 0 ? (sampleSizeIncrease / baseSampleSize) : 0;

    return (
        <Card className="rounded-2xl border-primary/90 bg-primary/90 shadow-sm dark:border-primary/45 dark:bg-background">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Layers className="w-5 h-5 text-primary" />
                        <CardTitle className="text-base text-primary">
                            互斥子总体（层）估计支持
                        </CardTitle>
                    </div>
                    <Badge 
                        variant="outline" 
                        className="text-xs bg-primary/50 border-primary text-primary dark:bg-primary/30 dark:border-primary/30 dark:text-primary"
                    >
                        {domains.length} 个子总体
                    </Badge>
                </div>
                <CardDescription className="text-foreground/90">
                    {isMeanEstimation
                        ? "当需要对互不重叠的细分层分别估计均值时，设置各层的绝对误差限"
                        : "当需要对互不重叠的细分层分别估计时，设置各层的精度要求"}
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                {isMeanEstimation && !(Number(populationVariance) > 0) && (
                    <div className="rounded-xl border border-destructive/90 bg-destructive/80 p-3 dark:border-destructive/40 dark:bg-destructive/25">
                        <div className="flex items-start gap-2 text-xs text-destructive">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>
                                均值子总体估计需要先给出共同方差假设 σ²。当前未提供有效方差，因此暂时无法计算各层样本量。
                            </span>
                        </div>
                    </div>
                )}

                {/* 说明卡片 */}
                {showExplanation && (
                    <div className="rounded-xl border border-info/90 bg-info/70 p-3 dark:border-info/40 dark:bg-info/25">
                        <div className="flex gap-2">
                            <Info className="w-4 h-4 text-info shrink-0 mt-0.5" />
                            <div className="text-xs text-info space-y-1">
                                <p className="font-medium">为什么要强调“互斥子总体”？</p>
                                <p>
                                    如果调查结果需要分别报告各层结果（如东部/中部/西部，或三个年龄组），则每一层都要单独满足精度要求。
                                    这里默认每一行代表一个<strong>互不重叠</strong>的子总体，同一个总体单元只能出现一次，因此总样本量按各层样本量求和。
                                </p>
                                <p>
                                    若你分析的是相互重叠的 domain（如“男性/女性”再叠加“年龄组”），则不能直接把所需样本量相加，应另行设计抽样与估计方案。
                                </p>
                                {isMeanEstimation && populationVariance != null && (
                                    <p>
                                        这里默认各层暂共用同一个方差假设 <strong>σ²={populationVariance}</strong>。
                                        如果已知各层方差差异很大，应分别估计各层方差后再规划。
                                    </p>
                                )}
                                <button 
                                    onClick={() => setShowExplanation(false)}
                                    className="text-info hover:underline dark:text-info text-xs"
                                >
                                    隐藏说明
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* 域列表 */}
                <div className="space-y-3">
                    {domains.map((domain, index) => (
                        <div 
                            key={domain.id}
                            className={`rounded-xl border transition-all ${
                                expandedDomain === domain.id
                                    ? "border-primary bg-background shadow-sm dark:border-primary/50 dark:bg-background"
                                    : "border-primary/80 bg-background/95 dark:border-primary/40 dark:bg-background"
                            }`}
                        >
                            {/* 域头部（可点击展开） */}
                            <div 
                                className="flex items-center justify-between p-3 cursor-pointer"
                                onClick={() => setExpandedDomain(expandedDomain === domain.id ? null : domain.id)}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary font-bold text-sm">
                                        {index + 1}
                                    </div>
                                    <div>
                                        <div className="font-medium text-primary">
                                            {domain.name}
                                        </div>
                                        <div className="text-xs text-foreground/90">
                                            N = {domain.populationSize.toLocaleString()} | 需 n ≥{" "}
                                            <span className="font-semibold text-info tabular-nums">
                                                {domain.requiredSampleSize.toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Badge 
                                        variant="outline" 
                                        className="text-xs bg-primary/50 border-primary text-primary dark:bg-primary/30 dark:border-primary/30"
                                    >
                                        {formatMarginOfError(domain.marginOfError, estimationType)} / {domain.confidenceLevel}%
                                    </Badge>
                                    {expandedDomain === domain.id ? (
                                        <ChevronUp className="w-4 h-4 text-primary" />
                                    ) : (
                                        <ChevronDown className="w-4 h-4 text-primary" />
                                    )}
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            removeDomain(domain.id);
                                        }}
                                        className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/30"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>

                            {/* 展开的配置面板 */}
                            {expandedDomain === domain.id && (
                                <div className="px-4 pb-4 space-y-4">
                                    <div className="h-px bg-primary/50" />
                                    
                                    {/* 名称 */}
                                    <div className="space-y-2">
                                        <Label className="text-xs text-primary">子总体名称</Label>
                                        <Input
                                            value={domain.name}
                                            onChange={(e) => updateDomain(domain.id, { name: e.target.value })}
                                            className="bg-background border-primary text-foreground"
                                            placeholder="如：东部地区、31-50岁、A层"
                                        />
                                    </div>

                                    {/* 总体规模 */}
                                    <div className="space-y-2">
                                        <Label className="text-xs text-primary">子总体规模 (N)</Label>
                                        <Input
                                            type="number"
                                            value={domain.populationSize}
                                            onChange={(e) => updateDomain(domain.id, { populationSize: parseInt(e.target.value) || 0 })}
                                            className="bg-background border-primary text-foreground"
                                            min={1}
                                            max={totalPopulationSize}
                                        />
                                        <p className="text-xs text-primary">
                                            该子总体在总体中的人数
                                        </p>
                                    </div>

                                    {/* 分层变量（可选） */}
                                    {stratifiedFields.length > 0 && (
                                        <div className="space-y-2">
                                            <Label className="text-xs text-primary">关联分层变量（可选）</Label>
                                            <Select 
                                                value={domain.stratifiedVariable || ""} 
                                                onValueChange={(value) => updateDomain(domain.id, { 
                                                    stratifiedVariable: value || undefined,
                                                    stratifiedValue: undefined 
                                                })}
                                            >
                                                <SelectTrigger className="bg-background border-primary text-foreground">
                                                    <SelectValue placeholder="选择分层变量" />
                                                </SelectTrigger>
                                                <SelectContent className="bg-background border-primary">
                                                    <SelectItem value="">无</SelectItem>
                                                    {stratifiedFields.map(field => (
                                                        <SelectItem key={field} value={field}>{field}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}

                                    {/* 精度要求 */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-2">
                                            <Label className="text-xs text-primary">置信水平</Label>
                                            <Select 
                                                value={domain.confidenceLevel} 
                                                onValueChange={(value) => updateDomain(domain.id, { confidenceLevel: value })}
                                            >
                                                <SelectTrigger className="bg-background border-primary text-foreground">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="bg-background border-primary">
                                                    <SelectItem value="90">90%</SelectItem>
                                                    <SelectItem value="95">95%</SelectItem>
                                                    <SelectItem value="99">99%</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs text-primary">{marginLabel}{marginInputSuffix}</Label>
                                            <Input
                                                type="number"
                                                value={domain.marginOfError}
                                                onChange={(e) => updateDomain(domain.id, { marginOfError: Number.parseFloat(e.target.value) || 0 })}
                                                className="bg-background border-primary text-foreground"
                                                min={isMeanEstimation ? 0.1 : 1}
                                                max={isMeanEstimation ? undefined : 20}
                                                step={isMeanEstimation ? 0.1 : 1}
                                            />
                                        </div>
                                    </div>

                                    {/* 计算结果 */}
                                    <div className="rounded-lg border border-primary bg-background p-3 dark:border-primary/50 dark:bg-background">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-primary">所需样本量</span>
                                            <span className="text-lg font-bold tabular-nums text-info">
                                                {domain.requiredSampleSize.toLocaleString()}
                                            </span>
                                        </div>
                                        <p className="text-xs text-primary mt-1">
                                            基于置信度 {domain.confidenceLevel}%、{marginLabel} {formatMarginOfError(domain.marginOfError, estimationType)}
                                            {isMeanEstimation && populationVariance != null ? ` 和 σ²=${populationVariance}` : ""}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* 添加按钮 */}
                <Button
                    variant="outline"
                    onClick={addDomain}
                    className="w-full border-primary text-primary hover:bg-primary dark:border-primary dark:text-primary dark:hover:bg-primary/30"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    添加子总体
                </Button>

                {/* 总样本量计算 */}
                {domains.length > 0 && (
                    <div className="rounded-xl border-2 border-primary bg-background p-4 shadow-sm dark:border-primary/50 dark:bg-background">
                        <div className="flex items-center gap-2 mb-3">
                            <Calculator className="w-5 h-5 text-primary" />
                            <span className="font-bold text-primary">总样本量计算</span>
                        </div>
                        
                        <div className="space-y-3">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-primary">基准样本量（总体估计）</span>
                                <span className="font-mono text-primary">{baseSampleSize.toLocaleString()}</span>
                            </div>
                            
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-primary">单层最大需求</span>
                                <span className="font-mono text-primary">
                                    {largestRequiredSampleSize.toLocaleString()}
                                </span>
                            </div>

                            <div className="flex justify-between items-center text-sm">
                                <span className="text-primary">各层样本量合计</span>
                                <span className="font-mono text-primary">
                                    {totalRequiredSampleSize.toLocaleString()}
                                </span>
                            </div>

                            <div className="h-px bg-primary/50" />

                            <div className="flex justify-between items-center">
                                <span className="font-bold text-primary">建议总样本量</span>
                                <span className="text-2xl font-bold tabular-nums text-info">
                                    {totalRequiredSampleSize.toLocaleString()}
                                </span>
                            </div>

                            {sampleSizeIncrease > 0 && (
                                <div className="rounded-lg bg-warning/80 border border-warning p-2 dark:bg-warning/30 dark:border-warning/50">
                                    <div className="flex items-center gap-2 text-xs text-warning">
                                        <AlertCircle className="w-4 h-4" />
                                        <span>
                                            相比仅估计总体，样本量需增加 {sampleSizeIncrease.toLocaleString()} 
                                            ({(increaseRatio * 100).toFixed(0)}%)
                                        </span>
                                    </div>
                                </div>
                            )}

                            {populationOverflow > 0 && (
                                <div className="rounded-lg bg-destructive/80 border border-destructive p-2 dark:bg-destructive/30 dark:border-destructive/50">
                                    <div className="flex items-start gap-2 text-xs text-destructive">
                                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                        <span>
                                            当前各层规模之和为 {allocatedPopulationSize.toLocaleString()}，已超过总体规模 {totalPopulationSize.toLocaleString()}。
                                            这通常表示层之间发生重叠，不能直接按 Σn_h 相加。
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <p className="text-xs text-primary mt-3 leading-relaxed">
                            原则：当各层互不重叠时，总样本量可写为 Σn_h。若录入的是重叠 domain，则不能直接相加。
                        </p>
                    </div>
                )}

                {/* 方案对比（课件例7.2） */}
                {domains.length >= 2 && (
                    <SchemeComparison domains={domains} baseSampleSize={baseSampleSize} />
                )}
            </CardContent>
        </Card>
    );
}

function SchemeComparison({ domains, baseSampleSize }: { domains: Domain[]; baseSampleSize: number }) {
    const domainTotal = domains.reduce((sum, d) => sum + d.requiredSampleSize, 0);
    const ratio = baseSampleSize > 0 ? domainTotal / baseSampleSize : 0;

    return (
        <div className="rounded-xl border border-auxiliary-border/90 bg-auxiliary-muted/50 p-4 dark:border-auxiliary-border/40 dark:bg-auxiliary-muted/20">
            <div className="flex items-center gap-2 mb-3">
                <Info className="w-4 h-4 text-auxiliary" />
                <span className="font-medium text-sm text-auxiliary-foreground">
                    方案对比（课件例 7.2）
                </span>
            </div>

            <div className="space-y-2">
                <div className="rounded-lg border border-auxiliary-border/60 bg-background p-3 dark:border-auxiliary-border/40 dark:bg-background">
                    <div className="flex justify-between items-center">
                        <div>
                            <span className="text-sm font-medium text-auxiliary-foreground">方案一</span>
                            <span className="text-xs text-auxiliary ml-2">仅需整体估计</span>
                        </div>
                        <span className="font-mono font-bold text-auxiliary-foreground">
                            n = {baseSampleSize.toLocaleString()}
                        </span>
                    </div>
                </div>

                <div className="rounded-lg border border-auxiliary-border/60 bg-background p-3 dark:border-auxiliary-border/40 dark:bg-background">
                    <div className="flex justify-between items-center mb-2">
                        <div>
                            <span className="text-sm font-medium text-auxiliary-foreground">方案二</span>
                            <span className="text-xs text-auxiliary ml-2">互斥各层分别精确估计</span>
                        </div>
                        <span className="font-mono font-bold text-auxiliary-foreground">
                            n = {domainTotal.toLocaleString()}
                        </span>
                    </div>
                    <div className="text-xs text-auxiliary/80 dark:text-auxiliary/80">
                        {domains.map(d => `${d.name}: ${d.requiredSampleSize.toLocaleString()}`).join(" + ")} = {domainTotal.toLocaleString()}
                    </div>
                </div>

                {ratio > 1 && (
                    <div className="rounded-lg bg-warning/80 border border-warning p-2 dark:bg-warning/30 dark:border-warning/50">
                        <div className="flex items-start gap-2 text-xs text-warning">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <div>
                                <p>
                                    <span className="font-medium">方案二是方案一的 {ratio.toFixed(1)} 倍</span>
                                    —— 当需要对互斥各层分别进行估计时，需确保每层样本量都足够大，总样本量往往远高于仅估计总体时的需求。
                                </p>
                                <p className="mt-1 text-warning/90">
                                    最终样本量的确定需要在精度、费用、时限和操作可行性之间进行协调。
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
