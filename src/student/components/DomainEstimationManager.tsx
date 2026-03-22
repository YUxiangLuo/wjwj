import { useState, useEffect } from "react";
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
import { calculateFinitePopulationSampleSize } from "../experiment/sample-plan";

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
}

export function DomainEstimationManager({ 
    totalPopulationSize, 
    stratifiedFields,
    onDomainsChange,
    initialDomains = []
}: DomainEstimationManagerProps) {
    const [domains, setDomains] = useState<Domain[]>(initialDomains);
    const [expandedDomain, setExpandedDomain] = useState<string | null>(null);
    const [showExplanation, setShowExplanation] = useState(true);

    // 计算每个域的所需样本量
    useEffect(() => {
        const updatedDomains = domains.map(domain => {
            const requiredSampleSize = calculateFinitePopulationSampleSize({
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
            onDomainsChange(updatedDomains);
        }
    }, [domains.map(d => `${d.confidenceLevel}-${d.marginOfError}-${d.populationSize}`).join(','), totalPopulationSize]);

    // 添加新域
    const addDomain = () => {
        const newDomain: Domain = {
            id: `domain-${Date.now()}`,
            name: `子总体 ${domains.length + 1}`,
            populationSize: Math.floor(totalPopulationSize / 2),
            confidenceLevel: "95",
            marginOfError: 5,
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

    // 计算总样本量需求（取各域样本量的最大值）
    const maxRequiredSampleSize = Math.max(0, ...domains.map(d => d.requiredSampleSize));
    const totalRequiredSampleSize = maxRequiredSampleSize;

    // 计算简单随机抽样的基准样本量
    const baseSampleSize = calculateFinitePopulationSampleSize({
        confidenceLevel: "95",
        marginOfError: 5,
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
                            子总体（域）估计支持
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
                    当需要对总体的细分部分（如分省、分性别）进行估计时，设置各子总体的精度要求
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* 说明卡片 */}
                {showExplanation && (
                    <div className="rounded-xl border border-teal-200/90 bg-teal-50/70 p-3 dark:border-teal-800/40 dark:bg-teal-950/25">
                        <div className="flex gap-2">
                            <Info className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                            <div className="text-xs text-teal-950 dark:text-teal-100 space-y-1">
                                <p className="font-medium">为什么需要子总体估计？</p>
                                <p>
                                    如果调查结果需要包括细分数据（如各省指标、分性别特征），则需要确保每个子总体都有足够的样本量。
                                    总样本量取各子总体所需样本量的最大值，而非简单相加。
                                </p>
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
                                        ±{domain.marginOfError}% / {domain.confidenceLevel}%
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
                                            placeholder="如：广东省、女性群体、18-25岁"
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
                                            <Label className="text-xs text-indigo-700 dark:text-indigo-300">允许误差 (%)</Label>
                                            <Input
                                                type="number"
                                                value={domain.marginOfError}
                                                onChange={(e) => updateDomain(domain.id, { marginOfError: parseInt(e.target.value) || 0 })}
                                                className="bg-white dark:bg-slate-950 border-indigo-200 dark:border-indigo-700 text-slate-900 dark:text-slate-100"
                                                min={1}
                                                max={20}
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
                                            基于置信度 {domain.confidenceLevel}% 和误差限 ±{domain.marginOfError}%
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
                                <span className="text-indigo-700 dark:text-indigo-300">子总体最大需求</span>
                                <span className="font-mono text-indigo-900 dark:text-indigo-100">
                                    {Math.max(0, ...domains.map(d => d.requiredSampleSize)).toLocaleString()}
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
                        </div>

                        <p className="text-xs text-indigo-900 dark:text-indigo-100 mt-3 leading-relaxed">
                            原则：总样本量 = max(基准样本量, 各子总体所需样本量)。取最大值可确保所有子总体都有足够精度。
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
