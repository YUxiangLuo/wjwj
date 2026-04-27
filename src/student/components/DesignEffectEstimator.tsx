import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { 
    Calculator, 
    Info, 
    CheckCircle2,
    ArrowRight
} from "lucide-react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface DesignEffectEstimatorProps {
    currentDeff: number;
    onDeffChange: (deff: number) => void;
}

const SAMPLING_METHODS = [
    {
        key: "srs",
        name: "简单随机抽样 (SRS)",
        deff: 1.0,
        description: "最基础的抽样方法，设计效应为1.0（基准）",
        characteristics: ["每个单元被抽中的概率相等", "方差最小", "无需辅助信息"],
    },
    {
        key: "stratified",
        name: "分层抽样",
        deffRange: [0.7, 0.9],
        deff: 0.8,
        description: "将总体分成若干层，每层内随机抽样。通常能降低方差",
        characteristics: ["层内同质性高时方差小", "deff 通常 < 1", "需要分层变量"],
    },
    {
        key: "cluster",
        name: "整群抽样",
        deffRange: [1.5, 3.0],
        deff: 2.0,
        description: "以群体为单位抽样，群内再抽样本。会增加方差",
        characteristics: ["群内同质性高时方差大", "deff 通常 > 1", "操作简便成本低"],
    },
    {
        key: "pps",
        name: "PPS 抽样",
        deffRange: [0.8, 1.2],
        deff: 1.0,
        description: "按规模大小成比例抽样，适合规模差异大的总体",
        characteristics: ["规模差异大时效率高", "deff ≈ 1", "需要规模变量"],
    },
    {
        key: "multi_stage",
        name: "多阶段抽样",
        deffRange: [1.2, 2.5],
        deff: 1.5,
        description: "分多个阶段逐步缩小抽样范围，常用于大规模调查",
        characteristics: ["结合多种抽样方法", "deff 取决于阶段设计", "适合大规模调查"],
    },
];

const SURVEY_MODES = [
    {
        key: "face_to_face",
        name: "面对面访谈",
        responseRate: 0.85,
        responseRateRange: "80%-90%",
        description: "回答率最高，但成本也高",
    },
    {
        key: "telephone",
        name: "电话调查",
        responseRate: 0.60,
        responseRateRange: "50%-70%",
        description: "中等回答率，成本适中",
    },
    {
        key: "online",
        name: "线上问卷",
        responseRate: 0.30,
        responseRateRange: "20%-40%",
        description: "成本低但回答率较低，需要更大样本补偿",
    },
    {
        key: "mail",
        name: "邮寄问卷",
        responseRate: 0.40,
        responseRateRange: "30%-50%",
        description: "回答率较低，适合特定人群",
    },
];

export function DesignEffectEstimator({ currentDeff, onDeffChange }: DesignEffectEstimatorProps) {
    const [selectedMethod, setSelectedMethod] = useState("stratified");
    const [selectedMode, setSelectedMode] = useState("telephone");

    const method = SAMPLING_METHODS.find(m => m.key === selectedMethod);
    const mode = SURVEY_MODES.find(m => m.key === selectedMode);

    const handleMethodChange = (key: string) => {
        setSelectedMethod(key);
        const selected = SAMPLING_METHODS.find(m => m.key === key);
        if (selected) {
            onDeffChange(selected.deff);
        }
    };

    return (
        <Card className="rounded-2xl border-primary/20 bg-primary/10 shadow-sm">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Calculator className="size-5 text-primary" />
                        <CardTitle className="text-base text-foreground">
                            设计效应与回答率参考
                        </CardTitle>
                    </div>
                    <Badge 
                        variant="outline" 
                        className="bg-background text-xs text-primary"
                    >
                        deff = {currentDeff.toFixed(1)}
                    </Badge>
                </div>
                <CardDescription className="text-muted-foreground">
                    根据抽样方法和调查方式估算设计效应与回答率
                </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-4">
                {/* 抽样方法选择 */}
                <div className="flex flex-col gap-2">
                    <label className="text-xs font-medium text-primary">抽样方法</label>
                    <Select value={selectedMethod} onValueChange={handleMethodChange}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectGroup>
                                {SAMPLING_METHODS.map(method => (
                                    <SelectItem key={method.key} value={method.key}>
                                        {method.name}
                                    </SelectItem>
                                ))}
                            </SelectGroup>
                        </SelectContent>
                    </Select>
                </div>

                {/* 抽样方法详情 */}
                {method && (
                    <div className="flex flex-col gap-3 rounded-xl border bg-background p-3">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-foreground">
                                {method.name}
                            </span>
                            <Badge
                                className={cn(
                                    "text-primary-foreground",
                                    method.deff < 1
                                        ? "bg-chart-3"
                                        : method.deff === 1
                                            ? "bg-primary"
                                            : "bg-chart-4",
                                )}
                            >
                                deff = {method.deff.toFixed(1)}
                            </Badge>
                        </div>

                        <p className="text-xs text-foreground">
                            {method.description}
                        </p>

                        {/* 特征标签 */}
                        <div className="flex flex-wrap gap-1.5">
                            {method.characteristics.map((char, idx) => (
                                <Badge
                                    key={idx}
                                    variant="secondary"
                                    className="rounded-full text-xs"
                                >
                                    {char}
                                </Badge>
                            ))}
                        </div>

                        {/* deff 解释 */}
                        <div className="rounded-lg border bg-muted/60 p-2">
                            <div className="flex items-center gap-2 text-xs">
                                <Info className="size-3.5 text-primary" />
                                <span className="text-foreground">
                                    {method.deff < 1 
                                        ? "deff < 1 表示比简单随机抽样更高效，所需样本量可减少"
                                        : method.deff > 1 
                                            ? "deff > 1 表示比简单随机抽样方差更大，需要更多样本补偿"
                                            : "deff = 1 表示与简单随机抽样效率相同"
                                    }
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* 调查方式选择 */}
                <div className="flex flex-col gap-2">
                    <label className="text-xs font-medium text-primary">调查方式</label>
                    <Select value={selectedMode} onValueChange={setSelectedMode}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectGroup>
                                {SURVEY_MODES.map(mode => (
                                    <SelectItem key={mode.key} value={mode.key}>
                                        {mode.name}
                                    </SelectItem>
                                ))}
                            </SelectGroup>
                        </SelectContent>
                    </Select>
                </div>

                {/* 调查方式详情 */}
                {mode && (
                    <div className="flex flex-col gap-2 rounded-xl border bg-background p-3">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-foreground">
                                {mode.name}
                            </span>
                            <Badge variant="outline" className="text-xs text-primary">
                                回答率 {mode.responseRateRange}
                            </Badge>
                        </div>

                        <p className="text-xs text-foreground">
                            {mode.description}
                        </p>

                        {/* 样本量补偿计算 */}
                        <div className="rounded-lg border border-chart-4/20 bg-chart-4/10 p-2">
                            <div className="flex items-center gap-2 text-xs text-foreground">
                                <Calculator className="size-3.5 text-chart-4" />
                                <span>
                                    为补偿 {(100 - mode.responseRate * 100).toFixed(0)}% 不回答，
                                    样本量需扩大至基准的 {(1 / mode.responseRate).toFixed(1)} 倍
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* 综合建议 */}
                <div className="rounded-xl border-2 border-chart-3/30 bg-chart-3/10 p-3 shadow-sm">
                    <div className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-chart-3" />
                        <div className="flex flex-col gap-2">
                            <p className="text-sm font-medium text-foreground">
                                参数建议
                            </p>
                            <div className="flex flex-col gap-1 text-xs text-foreground">
                                <div className="flex items-center gap-2">
                                    <ArrowRight className="size-3" />
                                    <span>
                                        设计效应 (deff)：建议设置为 <strong>{method?.deff.toFixed(1)}</strong>
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <ArrowRight className="size-3" />
                                    <span>
                                        无回答率：建议设置为 <strong>{((1 - (mode?.responseRate || 0.6)) * 100).toFixed(0)}%</strong>
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
