import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Calculator } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface DesignEffectEstimatorProps {
    currentDeff: number;
    onDeffChange: (deff: number) => void;
}

const SAMPLING_METHODS = [
    {
        key: "srs",
        name: "简单随机抽样 (SRS)",
        description: "在相同估计量和方差口径下，SRS 通常是 deff=1 的比较基准，但不一定对所有总体都有最小方差。",
        assumptions: ["固定样本量、等概率抽取", "作为比较基准时 deff=1", "有效分层或辅助信息可能比 SRS 更高效"],
    },
    {
        key: "stratified",
        name: "分层抽样",
        description: "效率取决于目标变量的层内方差、层间差异、各层分配和权重，不能仅凭“分层”确定 deff。",
        assumptions: ["应先明确目标估计量", "分层变量与目标变量相关时更可能提高效率", "需用历史调查、预调查或完整设计计算"],
    },
    {
        key: "cluster",
        name: "整群抽样",
        description: "整群设计常用 deff≈1+(b−1)ρ 做情景近似，其中 b 是平均群内样本数，ρ 是目标变量的群内相关系数。",
        assumptions: ["ρ 必须针对目标变量估计", "群规模不等时还需额外修正", "降低实施成本不等于降低抽样方差"],
    },
    {
        key: "pps",
        name: "PPS / 不等概率抽样",
        description: "是否提高效率取决于规模变量与目标变量的关系，以及是否使用正确权重；不存在通用固定 deff。",
        assumptions: ["规模变量应为正且可用", "目标变量与规模变量相关时才可能获益", "估计和方差计算必须使用设计权重"],
    },
    {
        key: "multi_stage",
        name: "多阶段抽样",
        description: "deff 由各阶段抽取、分层、整群、规模不等、权重差异和目标估计量共同决定。",
        assumptions: ["记录每阶段包含概率", "评估群内相关和权重变异", "优先采用同类历史调查或预调查估计"],
    },
] as const;

export function DesignEffectEstimator({ currentDeff, onDeffChange }: DesignEffectEstimatorProps) {
    const [selectedMethod, setSelectedMethod] = useState<(typeof SAMPLING_METHODS)[number]["key"]>("stratified");
    const method = SAMPLING_METHODS.find((item) => item.key === selectedMethod)!;

    return (
        <Card className="rounded-surface border-border bg-card">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <Calculator className="w-5 h-5 text-primary" />
                        <CardTitle className="text-body text-foreground">设计效应假设检查</CardTitle>
                    </div>
                    <StatusBadge intent="neutral">
                        当前假设 deff = {currentDeff.toFixed(1)}
                    </StatusBadge>
                </div>
                <CardDescription className="text-muted-foreground">
                    抽样方法不能直接决定设计效应。请核验以下条件，不要使用无来源的默认值。
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <label className="text-meta text-foreground font-medium">查看方法的假设</label>
                    <Select value={selectedMethod} onValueChange={(value) => setSelectedMethod(value as typeof selectedMethod)}>
                        <SelectTrigger aria-label="选择抽样方法" className="bg-card border-input text-foreground">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {SAMPLING_METHODS.map((item) => (
                                <SelectItem key={item.key} value={item.key}>{item.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="rounded-surface bg-muted p-4 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-label font-medium text-foreground">{method.name}</span>
                        {method.key === "srs" && (
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => onDeffChange(1)}
                            >
                                应用基准 1.0
                            </Button>
                        )}
                    </div>
                    <p className="text-meta leading-relaxed text-muted-foreground">{method.description}</p>
                    <ul className="list-disc space-y-1 pl-4 text-meta text-muted-foreground">
                        {method.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}
                    </ul>
                </div>

                <div className="rounded-surface bg-muted p-3.5 space-y-1.5 text-meta leading-relaxed text-muted-foreground">
                    <p className="font-medium text-foreground">如何设置当前参数</p>
                    <p>优先使用同一目标总体、同一估计量和相近抽样设计的历史方差，或用预调查/设计模拟估计 deff；同时记录来源和不确定性。</p>
                    <p>预期回答率也应来自同总体、同调查方式、同招募和跟访方案的数据。按回答率膨胀只能补足数量，不能消除非随机无回答偏差。</p>
                </div>
            </CardContent>
        </Card>
    );
}
