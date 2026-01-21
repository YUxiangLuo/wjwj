import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Calculator } from "lucide-react";
import { useExperiment } from "../ExperimentLayout";
import type { SamplePlanData } from "../../api-client";

interface SamplePlanningProps {
    onNext: () => void;
    onPrev: () => void;
}

export function SamplePlanning({ onNext, onPrev }: SamplePlanningProps) {
    const { populationSize, experiment, saveExperiment } = useExperiment();

    // Initialize from saved data
    const initialData = experiment?.samplePlan as SamplePlanData | null;

    const [confidenceLevel, setConfidenceLevel] = useState(initialData?.confidenceLevel ?? "95");
    const [marginOfError, setMarginOfError] = useState([initialData?.marginOfError ?? 5]);
    const [finalSampleSize, setFinalSampleSize] = useState(initialData?.finalSampleSize ?? 384);
    const [confirmNextOpen, setConfirmNextOpen] = useState(false);

    const N = populationSize;

    // Z values for confidence levels
    const zValues: Record<string, number> = {
        "90": 1.645,
        "95": 1.96,
        "99": 2.576,
    };

    // Calculate recommended sample size
    const calculateSampleSize = useCallback(() => {
        const z = zValues[confidenceLevel] ?? 1.96;
        const e = (marginOfError[0] ?? 5) / 100;
        const p = 0.5;

        const n0 = (z * z * p * (1 - p)) / (e * e);
        const n = n0 / (1 + (n0 - 1) / N);
        return Math.ceil(n);
    }, [confidenceLevel, marginOfError, N]);

    const recommendedSize = calculateSampleSize();
    const minSize = 30;
    const maxSize = Math.floor(N * 0.5);

    const isValidSize = finalSampleSize >= minSize && finalSampleSize <= maxSize;

    // Auto-update final sample size when recommended changes (only if user hasn't modified it)
    useEffect(() => {
        if (!initialData) {
            setFinalSampleSize(recommendedSize);
        }
    }, [recommendedSize, initialData]);


    const handleConfirmNext = async () => {
        // Save current data
        const samplePlanData: SamplePlanData = {
            confidenceLevel,
            marginOfError: marginOfError[0] ?? 5,
            recommendedSize,
            finalSampleSize,
        };
        await saveExperiment({ samplePlan: samplePlanData, currentStage: 3 });
        onNext();
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <Card className="rounded-2xl border-white/70 bg-white/80 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Calculator className="w-5 h-5" />
                                总体信息
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-lg">
                                本次调查的总体规模为 <span className="font-bold text-teal-600">N = {N.toLocaleString()}</span> 人
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="rounded-2xl border-white/70 bg-white/80 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
                        <CardHeader>
                            <CardTitle>参数设置</CardTitle>
                            <CardDescription>调整置信水平和允许误差来计算建议样本量</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label>置信水平</Label>
                                    <Select value={confidenceLevel} onValueChange={setConfidenceLevel}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="90">90%</SelectItem>
                                            <SelectItem value="95">95%</SelectItem>
                                            <SelectItem value="99">99%</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground">
                                        Z = {zValues[confidenceLevel]}
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <Label>允许误差: {marginOfError[0]}%</Label>
                                    <Slider
                                        value={marginOfError}
                                        onValueChange={setMarginOfError}
                                        min={1}
                                        max={10}
                                        step={1}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        范围: 1% - 10%
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="rounded-2xl border-white/70 bg-white/80 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
                        <CardHeader>
                            <CardTitle>最终样本量</CardTitle>
                            <CardDescription>您可以根据实际情况调整最终样本量</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <div className="flex items-center gap-4">
                                    <div className="flex-1 space-y-2">
                                        <Label htmlFor="finalSize">最终样本量</Label>
                                        <Input
                                            id="finalSize"
                                            type="number"
                                            value={finalSampleSize}
                                            onChange={(e) => setFinalSampleSize(parseInt(e.target.value) || 0)}
                                            min={minSize}
                                            max={maxSize}
                                        />
                                    </div>
                                    <Button
                                        variant="outline"
                                        onClick={() => setFinalSampleSize(recommendedSize)}
                                        className="mt-6"
                                    >
                                        使用建议值
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    有效范围: {minSize} - {maxSize.toLocaleString()}（总体的50%）
                                </p>
                            </div>

                            {!isValidSize && (
                                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                                    样本量超出有效范围，请调整
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card className="rounded-2xl border-white/70 bg-gradient-to-b from-indigo-50 via-slate-50 to-white shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
                        <CardHeader>
                            <CardTitle>学习指南</CardTitle>
                            <CardDescription>理解公式与参数含义</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 text-sm text-muted-foreground">
                            <div className="rounded-xl bg-white/80 p-3">
                                <p className="text-xs text-slate-500">样本量公式</p>
                                <p className="font-mono text-sm text-slate-700">n = n₀ / (1 + (n₀ - 1) / N)</p>
                                <p className="font-mono text-sm text-slate-700">n₀ = Z² × p × (1-p) / E²</p>
                            </div>
                            <p>置信水平越高，样本量越大；允许误差越小，样本量越大。</p>
                            <div className="rounded-xl bg-white/80 p-3">
                                <p className="text-xs text-slate-500">参考值</p>
                                <div className="flex justify-between text-xs text-slate-600">
                                    <span>90% → Z=1.645</span>
                                    <span>95% → Z=1.96</span>
                                    <span>99% → Z=2.576</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="rounded-2xl border-white/70 bg-amber-50/70 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
                        <CardHeader>
                            <CardTitle className="text-base">参数摘要</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm text-slate-700">
                            <div className="flex justify-between"><span>置信水平</span><span>{confidenceLevel}%</span></div>
                            <div className="flex justify-between"><span>允许误差</span><span>{marginOfError[0]}%</span></div>
                            <div className="flex justify-between"><span>总体规模</span><span>{N.toLocaleString()}</span></div>
                            <div className="flex justify-between font-semibold text-slate-900">
                                <span>建议样本量</span><span>{recommendedSize}</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <div className="flex justify-between">
                <Button variant="outline" onClick={onPrev}>
                    上一阶段
                </Button>
                <div className="flex gap-3">
                    <Button
                        variant="outline"
                        onClick={() => setFinalSampleSize(recommendedSize)}
                    >
                        重新计算
                    </Button>
                    <Button onClick={() => setConfirmNextOpen(true)} disabled={!isValidSize}>
                        保存并进入下一阶段
                    </Button>
                </div>
            </div>

            {/* Confirm Next Stage Dialog */}
            <AlertDialog open={confirmNextOpen} onOpenChange={setConfirmNextOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>确认样本量规划</AlertDialogTitle>
                        <AlertDialogDescription>
                            您设定的最终样本量为 <strong>{finalSampleSize}</strong>。
                            <br /><br />
                            确认后将进入抽样执行阶段。如需修改，您可以返回本阶段。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmNext}>确认</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

export default SamplePlanning;
