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
        <Card className="rounded-2xl border-indigo-200/90 bg-indigo-50/90 shadow-sm dark:border-indigo-900/45 dark:bg-slate-950">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Layers className="w-5 h-5 text-indigo-500" />
                        <CardTitle className="text-base text-indigo-900 dark:text-indigo-200">
                            互斥子总体（层）估计支持
                        </CardTitle>
                    </div>
                    <Badge 
                        variant="outline" 
                        className="text-xs bg-indigo-100/50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-500/30 dark:text-indigo-300"
                    >
                        {domains.length} 个子总体
                    </Badge>
                </div>
                <CardDescription className="text-slate-700 dark:text-slate-300">
                    {isMeanEstimation
                        ? "当需要对互不重叠的细分层分别估计均值时，设置各层的绝对误差限"
                        : "当需要对互不重叠的细分层分别估计时，设置各层的精度要求"}
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                {isMeanEstimation && !(Number(populationVariance) > 0) && (
                    <div className="rounded-xl border border-rose-200/90 bg-rose-50/80 p-3 dark:border-rose-800/40 dark:bg-rose-950/25">
                        <div className="flex items-start gap-2 text-xs text-rose-900 dark:text-rose-100">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>
                                均值子总体估计需要先给出共同方差假设 σ²。当前未提供有效方差，因此暂时无法计算各层样本量。
                            </span>
                        </div>
                    </div>
                )}

                {/* 说明卡片 */}
                {showExplanation && (
                    <div className="rounded-xl border border-teal-200/90 bg-teal-50/70 p-3 dark:border-teal-800/40 dark:bg-teal-950/25">
                        <div className="flex gap-2">
                            <Info className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                            <div className="text-xs text-teal-950 dark:text-teal-100 space-y-1">
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
                                    className="text-teal-800 hover:underline dark:text-teal-200 text-xs"
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
                                    ? "border-indigo-300 bg-white shadow-sm dark:border-indigo-700/50 dark:bg-slate-950"
                                    : "border-indigo-200/80 bg-white/95 dark:border-indigo-800/40 dark:bg-slate-950"
                            }`}
                        >
                            {/* 域头部（可点击展开） */}
                            <div 
                                className="flex items-center justify-between p-3 cursor-pointer"
                                onClick={() => setExpandedDomain(expandedDomain === domain.id ? null : domain.id)}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-sm">
                                        {index + 1}
                                    </div>
                                    <div>
                                        <div className="font-medium text-indigo-900 dark:text-indigo-100">
                                            {domain.name}
                                        </div>
                                        <div className="text-xs text-slate-700 dark:text-slate-300">
                                            N = {domain.populationSize.toLocaleString()} | 需 n ≥{" "}
                                            <span className="font-semibold text-teal-700 dark:text-teal-300 tabular-nums">
                                                {domain.requiredSampleSize.toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Badge 
                                        variant="outline" 
                                        className="text-xs bg-indigo-100/50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-500/30"
                                    >
                                        {formatMarginOfError(domain.marginOfError, estimationType)} / {domain.confidenceLevel}%
                                    </Badge>
                                    {expandedDomain === domain.id ? (
                                        <ChevronUp className="w-4 h-4 text-indigo-500" />
                                    ) : (
                                        <ChevronDown className="w-4 h-4 text-indigo-500" />
                                    )}
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            removeDomain(domain.id);
                                        }}
                                        className="h-8 w-8 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>

                            {/* 展开的配置面板 */}
                            {expandedDomain === domain.id && (
                                <div className="px-4 pb-4 space-y-4">
                                    <div className="h-px bg-indigo-200/50 dark:bg-indigo-700/30" />
                                    
                                    {/* 名称 */}
                                    <div className="space-y-2">
                                        <Label className="text-xs text-indigo-700 dark:text-indigo-300">子总体名称</Label>
                                        <Input
                                            value={domain.name}
                                            onChange={(e) => updateDomain(domain.id, { name: e.target.value })}
                                            className="bg-white dark:bg-slate-950 border-indigo-200 dark:border-indigo-700 text-slate-900 dark:text-slate-100"
                                            placeholder="如：东部地区、31-50岁、A层"
                                        />
                                    </div>

                                    {/* 总体规模 */}
                                    <div className="space-y-2">
                                        <Label className="text-xs text-indigo-700 dark:text-indigo-300">子总体规模 (N)</Label>
                                        <Input
                                            type="number"
                                            value={domain.populationSize}
                                            onChange={(e) => updateDomain(domain.id, { populationSize: parseInt(e.target.value) || 0 })}
                                            className="bg-white dark:bg-slate-950 border-indigo-200 dark:border-indigo-700 text-slate-900 dark:text-slate-100"
                                            min={1}
                                            max={totalPopulationSize}
                                        />
                                        <p className="text-xs text-indigo-800 dark:text-indigo-200">
                                            该子总体在总体中的人数
                                        </p>
                                    </div>

                                    {/* 分层变量（可选） */}
                                    {stratifiedFields.length > 0 && (
                                        <div className="space-y-2">
                                            <Label className="text-xs text-indigo-700 dark:text-indigo-300">关联分层变量（可选）</Label>
                                            <Select 
                                                value={domain.stratifiedVariable || ""} 
                                                onValueChange={(value) => updateDomain(domain.id, { 
                                                    stratifiedVariable: value || undefined,
                                                    stratifiedValue: undefined 
                                                })}
                                            >
                                                <SelectTrigger className="bg-white dark:bg-slate-950 border-indigo-200 dark:border-indigo-700 text-slate-900 dark:text-slate-100">
                                                    <SelectValue placeholder="选择分层变量" />
                                                </SelectTrigger>
                                                <SelectContent className="bg-white dark:bg-slate-950 border-indigo-200 dark:border-indigo-700">
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
                                            <Label className="text-xs text-indigo-700 dark:text-indigo-300">置信水平</Label>
                                            <Select 
                                                value={domain.confidenceLevel} 
                                                onValueChange={(value) => updateDomain(domain.id, { confidenceLevel: value })}
                                            >
                                                <SelectTrigger className="bg-white dark:bg-slate-950 border-indigo-200 dark:border-indigo-700 text-slate-900 dark:text-slate-100">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="bg-white dark:bg-slate-950 border-indigo-200 dark:border-indigo-700">
                                                    <SelectItem value="90">90%</SelectItem>
                                                    <SelectItem value="95">95%</SelectItem>
                                                    <SelectItem value="99">99%</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs text-indigo-700 dark:text-indigo-300">{marginLabel}{marginInputSuffix}</Label>
                                            <Input
                                                type="number"
                                                value={domain.marginOfError}
                                                onChange={(e) => updateDomain(domain.id, { marginOfError: Number.parseFloat(e.target.value) || 0 })}
                                                className="bg-white dark:bg-slate-950 border-indigo-200 dark:border-indigo-700 text-slate-900 dark:text-slate-100"
                                                min={isMeanEstimation ? 0.1 : 1}
                                                max={isMeanEstimation ? undefined : 20}
                                                step={isMeanEstimation ? 0.1 : 1}
                                            />
                                        </div>
                                    </div>

                                    {/* 计算结果 */}
                                    <div className="rounded-lg border border-indigo-200 bg-white p-3 dark:border-indigo-800/50 dark:bg-slate-950">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-indigo-800 dark:text-indigo-200">所需样本量</span>
                                            <span className="text-lg font-bold tabular-nums text-teal-700 dark:text-teal-300">
                                                {domain.requiredSampleSize.toLocaleString()}
                                            </span>
                                        </div>
                                        <p className="text-xs text-indigo-800 dark:text-indigo-200 mt-1">
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
                    className="w-full border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-400 dark:hover:bg-indigo-900/30"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    添加子总体
                </Button>

                {/* 总样本量计算 */}
                {domains.length > 0 && (
                    <div className="rounded-xl border-2 border-indigo-300 bg-white p-4 shadow-sm dark:border-indigo-700/50 dark:bg-slate-950">
                        <div className="flex items-center gap-2 mb-3">
                            <Calculator className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                            <span className="font-bold text-indigo-900 dark:text-indigo-100">总样本量计算</span>
                        </div>
                        
                        <div className="space-y-3">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-indigo-700 dark:text-indigo-300">基准样本量（总体估计）</span>
                                <span className="font-mono text-indigo-900 dark:text-indigo-100">{baseSampleSize.toLocaleString()}</span>
                            </div>
                            
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-indigo-700 dark:text-indigo-300">单层最大需求</span>
                                <span className="font-mono text-indigo-900 dark:text-indigo-100">
                                    {largestRequiredSampleSize.toLocaleString()}
                                </span>
                            </div>

                            <div className="flex justify-between items-center text-sm">
                                <span className="text-indigo-700 dark:text-indigo-300">各层样本量合计</span>
                                <span className="font-mono text-indigo-900 dark:text-indigo-100">
                                    {totalRequiredSampleSize.toLocaleString()}
                                </span>
                            </div>

                            <div className="h-px bg-indigo-300/50 dark:bg-indigo-700/50" />

                            <div className="flex justify-between items-center">
                                <span className="font-bold text-indigo-900 dark:text-indigo-100">建议总样本量</span>
                                <span className="text-2xl font-bold tabular-nums text-teal-700 dark:text-teal-300">
                                    {totalRequiredSampleSize.toLocaleString()}
                                </span>
                            </div>

                            {sampleSizeIncrease > 0 && (
                                <div className="rounded-lg bg-amber-50/80 border border-amber-200 p-2 dark:bg-amber-900/30 dark:border-amber-700/50">
                                    <div className="flex items-center gap-2 text-xs text-amber-800 dark:text-amber-200">
                                        <AlertCircle className="w-4 h-4" />
                                        <span>
                                            相比仅估计总体，样本量需增加 {sampleSizeIncrease.toLocaleString()} 
                                            ({(increaseRatio * 100).toFixed(0)}%)
                                        </span>
                                    </div>
                                </div>
                            )}

                            {populationOverflow > 0 && (
                                <div className="rounded-lg bg-rose-50/80 border border-rose-200 p-2 dark:bg-rose-900/30 dark:border-rose-700/50">
                                    <div className="flex items-start gap-2 text-xs text-rose-800 dark:text-rose-200">
                                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                        <span>
                                            当前各层规模之和为 {allocatedPopulationSize.toLocaleString()}，已超过总体规模 {totalPopulationSize.toLocaleString()}。
                                            这通常表示层之间发生重叠，不能直接按 Σn_h 相加。
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <p className="text-xs text-indigo-900 dark:text-indigo-100 mt-3 leading-relaxed">
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
        <div className="rounded-xl border border-violet-200/90 bg-violet-50/50 p-4 dark:border-violet-800/40 dark:bg-violet-950/20">
            <div className="flex items-center gap-2 mb-3">
                <Info className="w-4 h-4 text-violet-500" />
                <span className="font-medium text-sm text-violet-900 dark:text-violet-200">
                    方案对比（课件例 7.2）
                </span>
            </div>

            <div className="space-y-2">
                <div className="rounded-lg border border-violet-200/60 bg-white p-3 dark:border-violet-700/40 dark:bg-slate-950">
                    <div className="flex justify-between items-center">
                        <div>
                            <span className="text-sm font-medium text-violet-900 dark:text-violet-100">方案一</span>
                            <span className="text-xs text-violet-500 ml-2">仅需整体估计</span>
                        </div>
                        <span className="font-mono font-bold text-violet-700 dark:text-violet-300">
                            n = {baseSampleSize.toLocaleString()}
                        </span>
                    </div>
                </div>

                <div className="rounded-lg border border-violet-200/60 bg-white p-3 dark:border-violet-700/40 dark:bg-slate-950">
                    <div className="flex justify-between items-center mb-2">
                        <div>
                            <span className="text-sm font-medium text-violet-900 dark:text-violet-100">方案二</span>
                            <span className="text-xs text-violet-500 ml-2">互斥各层分别精确估计</span>
                        </div>
                        <span className="font-mono font-bold text-violet-700 dark:text-violet-300">
                            n = {domainTotal.toLocaleString()}
                        </span>
                    </div>
                    <div className="text-xs text-violet-600/80 dark:text-violet-400/80">
                        {domains.map(d => `${d.name}: ${d.requiredSampleSize.toLocaleString()}`).join(" + ")} = {domainTotal.toLocaleString()}
                    </div>
                </div>

                {ratio > 1 && (
                    <div className="rounded-lg bg-amber-50/80 border border-amber-200 p-2 dark:bg-amber-900/30 dark:border-amber-700/50">
                        <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <div>
                                <p>
                                    <span className="font-medium">方案二是方案一的 {ratio.toFixed(1)} 倍</span>
                                    —— 当需要对互斥各层分别进行估计时，需确保每层样本量都足够大，总样本量往往远高于仅估计总体时的需求。
                                </p>
                                <p className="mt-1 text-amber-700/90 dark:text-amber-300/90">
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
