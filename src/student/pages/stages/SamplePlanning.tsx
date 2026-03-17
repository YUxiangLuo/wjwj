import { useState, useEffect, useCallback, useRef } from "react";
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
import { Calculator, Users, Info, CheckCircle, RotateCcw, Settings2 } from "lucide-react";
import { useExperiment } from "../ExperimentLayout";
import type { SamplePlanData } from "../../api-client";
import { ImmersiveExperimentLaunch } from "../../components/ImmersiveExperimentLaunch";

interface SamplePlanningProps {
    onNext: () => void;
    onPrev: () => void;
}

function computeRecommendedSampleSize(confidenceLevel: string, marginOfError: number, populationSize: number, designEffect: number, nonResponseRate: number) {
    const zValues: Record<string, number> = {
        "90": 1.645,
        "95": 1.96,
        "99": 2.576,
    };

    const z = zValues[confidenceLevel] ?? 1.96;
    const e = marginOfError / 100;
    const p = 0.5;

    const n0 = (z * z * p * (1 - p)) / (e * e);
    let n = n0 / (1 + (n0 - 1) / populationSize);

    // Apply design effect (deff)
    if (designEffect > 0) {
        n = n * designEffect;
    }

    // Apply non-response rate adjustment
    if (nonResponseRate > 0 && nonResponseRate < 1) {
        n = n / (1 - nonResponseRate);
    }

    return Math.ceil(n);
}

export function SamplePlanning({ onNext, onPrev }: SamplePlanningProps) {
    const { populationSize, experiment, saveExperiment } = useExperiment();

    // Initialize from saved data
    const initialData = experiment?.samplePlan as SamplePlanData | null;

    const [confidenceLevel, setConfidenceLevel] = useState(initialData?.confidenceLevel ?? "95");
    const [marginOfError, setMarginOfError] = useState([initialData?.marginOfError ?? 5]);
    const [designEffect, setDesignEffect] = useState(initialData?.designEffect ?? 1);
    const [nonResponseRate, setNonResponseRate] = useState(initialData?.nonResponseRate ?? 0);
    const [finalSampleSize, setFinalSampleSize] = useState(initialData?.finalSampleSize ?? 384);
    const [confirmNextOpen, setConfirmNextOpen] = useState(false);
    const serverSnapshotRef = useRef("");
    const saveInFlightRef = useRef(false);

    const N = populationSize;

    // Z values for confidence levels
    const zValues: Record<string, number> = {
        "90": 1.645,
        "95": 1.96,
        "99": 2.576,
    };

    // Calculate recommended sample size
    const calculateSampleSize = useCallback(() => {
        return computeRecommendedSampleSize(confidenceLevel, marginOfError[0] ?? 5, N, designEffect, nonResponseRate);
    }, [confidenceLevel, marginOfError, N, designEffect, nonResponseRate]);

    const recommendedSize = calculateSampleSize();
    const minSize = 30;
    const maxSize = Math.floor(N * 0.5);

    const isValidSize = finalSampleSize >= minSize && finalSampleSize <= maxSize;

    const buildSamplePlanData = useCallback((): SamplePlanData => ({
        confidenceLevel,
        marginOfError: marginOfError[0] ?? 5,
        designEffect,
        nonResponseRate,
        recommendedSize,
        finalSampleSize,
    }), [confidenceLevel, marginOfError, designEffect, nonResponseRate, recommendedSize, finalSampleSize]);

    useEffect(() => {
        if (initialData) {
            const initialRecommended = initialData.recommendedSize ?? computeRecommendedSampleSize(
                initialData.confidenceLevel ?? "95",
                initialData.marginOfError ?? 5,
                N,
                initialData.designEffect ?? 1,
                initialData.nonResponseRate ?? 0,
            );
            serverSnapshotRef.current = JSON.stringify({
                confidenceLevel: initialData.confidenceLevel ?? "95",
                marginOfError: initialData.marginOfError ?? 5,
                designEffect: initialData.designEffect ?? 1,
                nonResponseRate: initialData.nonResponseRate ?? 0,
                recommendedSize: initialRecommended,
                finalSampleSize: initialData.finalSampleSize ?? initialRecommended,
            });
            return;
        }

        serverSnapshotRef.current = "";
    }, [initialData, N]);

    const autoSaveSamplePlan = useCallback(async () => {
        const payload = buildSamplePlanData();
        const snapshot = JSON.stringify(payload);
        if (snapshot === serverSnapshotRef.current || saveInFlightRef.current) return;

        saveInFlightRef.current = true;
        try {
            const success = await saveExperiment({ samplePlan: payload });
            if (success) {
                serverSnapshotRef.current = snapshot;
            }
        } finally {
            saveInFlightRef.current = false;
        }
    }, [buildSamplePlanData, saveExperiment]);

    // Auto-update final sample size when recommended changes (only if user hasn't modified it - simplified logic for now: update if no initial data)
    useEffect(() => {
        if (!initialData) {
            setFinalSampleSize(recommendedSize);
        }
    }, [recommendedSize, initialData]);

    // Keep a ref to the latest autoSaveSamplePlan so the 30-second interval doesn't reset on every change
    const autoSaveRef = useRef(autoSaveSamplePlan);
    useEffect(() => { autoSaveRef.current = autoSaveSamplePlan; }, [autoSaveSamplePlan]);

    // Debounce: save 3 seconds after user stops editing
    useEffect(() => {
        const debounceTimer = window.setTimeout(() => {
            void autoSaveSamplePlan();
        }, 3000);

        return () => {
            window.clearTimeout(debounceTimer);
        };
    }, [autoSaveSamplePlan]);

    // Fixed 30-second interval: uses ref so the interval is never reset by content changes
    useEffect(() => {
        const intervalTimer = window.setInterval(() => {
            void autoSaveRef.current();
        }, 30 * 1000);

        return () => {
            window.clearInterval(intervalTimer);
        };
    }, []);

    useEffect(() => {
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            const snapshot = JSON.stringify(buildSamplePlanData());
            if (snapshot === serverSnapshotRef.current) return;
            event.preventDefault();
            event.returnValue = "";
        };

        window.addEventListener("beforeunload", onBeforeUnload);
        return () => {
            window.removeEventListener("beforeunload", onBeforeUnload);
        };
    }, [buildSamplePlanData]);

    const handleConfirmNext = async () => {
        const samplePlanData = buildSamplePlanData();
        await saveExperiment({ samplePlan: samplePlanData, currentStage: 3 });
        setShowLaunch(true);
    };

    const [showLaunch, setShowLaunch] = useState(false);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300" data-testid="student-stage-sample-plan">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <Card className="rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm">
                        <CardHeader className="border-b border-slate-200 dark:border-slate-800 pb-4">
                            <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
                                <Users className="w-5 h-5 text-indigo-500" />
                                总体信息
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between p-4 rounded-xl bg-white/50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800">
                                <span className="text-slate-600 dark:text-slate-400">总体规模 (N)</span>
                                <span className="text-2xl font-bold text-indigo-500">{N.toLocaleString()} <span className="text-sm font-normal text-slate-500">人</span></span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm">
                        <CardHeader className="border-b border-slate-200 dark:border-slate-800 pb-4">
                            <div className="flex items-center justify-between">
                                <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
                                    <Calculator className="w-5 h-5 text-teal-500" />
                                    参数设置
                                </CardTitle>
                            </div>
                            <CardDescription className="text-slate-600 dark:text-slate-400 mt-1">
                                调整置信水平和允许误差来计算建议样本量
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-8 pt-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <div className="flex justify-between">
                                        <Label className="text-slate-700 dark:text-slate-300">置信水平</Label>
                                        <span className="text-xs font-mono text-indigo-500 bg-indigo-500/10 px-2 py-0.5 rounded">Z = {zValues[confidenceLevel]}</span>
                                    </div>
                                    <Select value={confidenceLevel} onValueChange={setConfidenceLevel}>
                                        <SelectTrigger data-testid="student-sample-plan-confidence" className="bg-white/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:ring-teal-500/50">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                                            <SelectItem value="90">90% (宽松)</SelectItem>
                                            <SelectItem value="95">95% (标准)</SelectItem>
                                            <SelectItem value="99">99% (严谨)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-slate-500">
                                        置信水平越高，结果的可信度越高，但所需样本量也越大。
                                    </p>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <Label className="text-slate-700 dark:text-slate-300">允许误差 (Margin of Error)</Label>
                                        <div className="flex items-center gap-1">
                                            <Input
                                                type="number"
                                                value={marginOfError[0]}
                                                onChange={(e) => {
                                                    const v = parseInt(e.target.value);
                                                    if (!Number.isNaN(v) && v >= 1 && v <= 10) {
                                                        setMarginOfError([v]);
                                                    }
                                                }}
                                                min={1}
                                                max={10}
                                                data-testid="student-sample-plan-margin-input"
                                                className="w-16 h-7 text-sm font-bold text-teal-600 dark:text-teal-400 bg-white/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-center px-1"
                                            />
                                            <span className="text-sm font-bold text-teal-600 dark:text-teal-400">%</span>
                                        </div>
                                    </div>
                                    <Slider
                                        value={marginOfError}
                                        onValueChange={setMarginOfError}
                                        min={1}
                                        max={10}
                                        step={1}
                                        className="py-4 [&>.relative>.absolute]:bg-teal-500"
                                    />
                                    <p className="text-xs text-slate-500 flex justify-between">
                                        <span>1% (精确)</span>
                                        <span>10% (粗略)</span>
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm">
                        <CardHeader className="border-b border-slate-200 dark:border-slate-800 pb-4">
                            <div className="flex items-center justify-between">
                                <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
                                    <Settings2 className="w-5 h-5 text-amber-500" />
                                    调整参数
                                </CardTitle>
                            </div>
                            <CardDescription className="text-slate-600 dark:text-slate-400 mt-1">
                                根据实际调查情况设置设计效应和预期无回答率
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-8 pt-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <Label className="text-slate-700 dark:text-slate-300">设计效应 (deff)</Label>
                                        <span className="text-xs font-mono text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                                            deff = {designEffect.toFixed(1)}
                                        </span>
                                    </div>
                                    <Input
                                        type="number"
                                        value={designEffect}
                                        onChange={(e) => {
                                            const v = parseFloat(e.target.value);
                                            if (!Number.isNaN(v) && v >= 1 && v <= 5) {
                                                setDesignEffect(Math.round(v * 10) / 10);
                                            }
                                        }}
                                        min={1}
                                        max={5}
                                        step={0.1}
                                        data-testid="student-sample-plan-deff"
                                        className="bg-white/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:ring-amber-500/50"
                                    />
                                    <p className="text-xs text-slate-500">
                                        设计效应反映复杂抽样设计对方差的影响。简单随机抽样时为 1.0，使用整群抽样时通常为 1.5-3.0。
                                    </p>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <Label className="text-slate-700 dark:text-slate-300">预期无回答率</Label>
                                        <div className="flex items-center gap-1">
                                            <Input
                                                type="number"
                                                value={Math.round(nonResponseRate * 100)}
                                                onChange={(e) => {
                                                    const v = parseInt(e.target.value);
                                                    if (!Number.isNaN(v) && v >= 0 && v <= 50) {
                                                        setNonResponseRate(v / 100);
                                                    }
                                                }}
                                                min={0}
                                                max={50}
                                                data-testid="student-sample-plan-nrr-input"
                                                className="w-16 h-7 text-sm font-bold text-amber-600 dark:text-amber-400 bg-white/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-center px-1"
                                            />
                                            <span className="text-sm font-bold text-amber-600 dark:text-amber-400">%</span>
                                        </div>
                                    </div>
                                    <Slider
                                        value={[Math.round(nonResponseRate * 100)]}
                                        onValueChange={(v) => setNonResponseRate((v[0] ?? 0) / 100)}
                                        min={0}
                                        max={50}
                                        step={5}
                                        data-testid="student-sample-plan-nrr"
                                        className="py-4 [&>.relative>.absolute]:bg-amber-500"
                                    />
                                    <p className="text-xs text-slate-500">
                                        预期无回答率用于补偿调查中不回应的比例。一般线上调查约 10%-30%，面对面调查约 5%-15%。
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className={`rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm transition-colors ${!isValidSize ? "border-rose-500/50 ring-1 ring-rose-500/20" : ""}`}>
                        <CardHeader className="border-b border-slate-200 dark:border-slate-800 pb-4">
                            <CardTitle className="text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                <CheckCircle className="w-5 h-5 text-emerald-500" />
                                最终样本量
                            </CardTitle>
                            <CardDescription className="text-slate-600 dark:text-slate-400">您可以根据实际情况微调最终样本量</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-6">
                            <div className="flex flex-col md:flex-row items-end gap-4">
                                <div className="flex-1 w-full space-y-2">
                                    <div className="flex items-center justify-between gap-3">
                                        <Label htmlFor="finalSize" className="text-slate-700 dark:text-slate-300">设定样本量</Label>
                                        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                            建议值 {recommendedSize.toLocaleString()} 人
                                        </span>
                                    </div>
                                    <div className="relative">
                                        <Input
                                            id="finalSize"
                                            type="number"
                                            value={finalSampleSize}
                                            onChange={(e) => setFinalSampleSize(parseInt(e.target.value) || 0)}
                                            min={minSize}
                                            max={maxSize}
                                            data-testid="student-sample-plan-final-size"
                                            className={`pr-16 bg-white/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-lg font-bold ${!isValidSize ? "text-rose-500 border-rose-500/50 focus-visible:ring-rose-500" : "text-emerald-600 focus-visible:ring-emerald-500"}`}
                                        />
                                        <span className="pointer-events-none absolute right-8 top-1/2 -translate-y-1/2 text-slate-500 text-sm">人</span>
                                    </div>
                                </div>
                                <Button
                                    variant="outline"
                                    onClick={() => setFinalSampleSize(recommendedSize)}
                                    data-testid="student-sample-plan-reset"
                                    className="border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-100"
                                >
                                    <RotateCcw className="w-4 h-4 mr-2" />
                                    重置为建议值
                                </Button>
                            </div>

                            {!isValidSize ? (
                                <div className="p-3 bg-rose-500/10 text-rose-600 border border-rose-500/20 rounded-xl text-sm flex items-center gap-2">
                                    <Info className="w-4 h-4" />
                                    样本量超出有效范围，建议在 {minSize} - {maxSize.toLocaleString()} 之间
                                </div>
                            ) : (
                                <div className="p-3 bg-white/50 dark:bg-slate-950/50 text-slate-500 border border-slate-200 dark:border-slate-800 rounded-xl text-xs flex justify-between">
                                    <span>最小建议: {minSize}</span>
                                    <span>最大建议 (总体50%): {maxSize.toLocaleString()}</span>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card className="rounded-2xl border-sky-200 bg-sky-50/80 shadow-sm dark:border-sky-500/20 dark:bg-sky-500/10">
                        <CardHeader>
                            <CardTitle className="text-base text-sky-900 dark:text-sky-200">学习指南</CardTitle>
                            <CardDescription className="text-sky-700 dark:text-sky-300">理解公式与参数含义</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 text-sm text-sky-950/80 dark:text-sky-100/80">
                            <div className="rounded-xl border border-sky-200 bg-white/80 p-4 font-mono text-xs text-sky-800 shadow-sm dark:border-sky-400/20 dark:bg-sky-950/40 dark:text-sky-200 space-y-1">
                                <p className="mb-2 text-sky-500 dark:text-sky-300/70">// 样本量计算公式</p>
                                <p>n₀ = (Z² × p × (1-p)) / E²</p>
                                <p>n₁ = n₀ / (1 + (n₀ - 1) / N)</p>
                                <p className="mt-1 text-sky-500 dark:text-sky-300/70">// 调整公式</p>
                                <p>n = n₁ × deff / (1 - NRR)</p>
                            </div>
                            <div className="space-y-2 text-xs leading-relaxed">
                                <p>• <strong className="text-sky-900 dark:text-sky-200">置信水平 (Z)</strong>：结果的可信程度。95% 意味着如果重复调查 100 次，有 95 次的结果都在误差范围内。</p>
                                <p>• <strong className="text-sky-900 dark:text-sky-200">允许误差 (E)</strong>：结果与真实值的最大允许偏差。</p>
                                <p>• <strong className="text-sky-900 dark:text-sky-200">设计效应 (deff)</strong>：复杂抽样设计相对简单随机抽样的方差膨胀系数。整群抽样时 deff 通常 &gt; 1。</p>
                                <p>• <strong className="text-sky-900 dark:text-sky-200">无回答率 (NRR)</strong>：预期调查中不回应的比例，用于扩大样本量以弥补无效问卷。</p>
                            </div>
                            <div className="rounded-xl bg-slate-50/50 dark:bg-slate-900/50 p-3 border border-slate-200 dark:border-slate-800">
                                <p className="text-xs text-slate-500 mb-2 font-medium">常用 Z 值参考</p>
                                <div className="grid grid-cols-3 gap-2 text-xs text-slate-600 dark:text-slate-400 text-center">
                                    <div className="bg-white dark:bg-slate-950 rounded p-1">90%<br /><span className="text-slate-500">1.645</span></div>
                                    <div className="bg-white dark:bg-slate-950 rounded p-1 text-emerald-600 font-medium ring-1 ring-emerald-500/20">95%<br /><span className="text-emerald-600">1.96</span></div>
                                    <div className="bg-white dark:bg-slate-950 rounded p-1">99%<br /><span className="text-slate-500">2.576</span></div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shadow-sm sticky top-24">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base text-slate-800 dark:text-slate-200">参数摘要</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-4">
                            <div className="flex justify-between text-sm py-1 border-b border-slate-200/50 dark:border-slate-800/50">
                                <span className="text-slate-500">置信水平</span>
                                <span className="text-slate-800 dark:text-slate-200 font-mono">{confidenceLevel}%</span>
                            </div>
                            <div className="flex justify-between text-sm py-1 border-b border-slate-200/50 dark:border-slate-800/50">
                                <span className="text-slate-500">允许误差</span>
                                <span className="text-slate-800 dark:text-slate-200 font-mono">{marginOfError[0]}%</span>
                            </div>
                            <div className="flex justify-between text-sm py-1 border-b border-slate-200/50 dark:border-slate-800/50">
                                <span className="text-slate-500">设计效应</span>
                                <span className="text-slate-800 dark:text-slate-200 font-mono">{designEffect.toFixed(1)}</span>
                            </div>
                            <div className="flex justify-between text-sm py-1 border-b border-slate-200/50 dark:border-slate-800/50">
                                <span className="text-slate-500">无回答率</span>
                                <span className="text-slate-800 dark:text-slate-200 font-mono">{Math.round(nonResponseRate * 100)}%</span>
                            </div>
                            <div className="flex justify-between text-sm py-1 border-b border-slate-200/50 dark:border-slate-800/50">
                                <span className="text-slate-500">建议样本量</span>
                                <span className="text-teal-600 dark:text-teal-400 font-mono font-bold">{recommendedSize}</span>
                            </div>
                            <div className="flex justify-between text-sm py-1 pt-2">
                                <span className="text-slate-500">最终设定</span>
                                <span className="text-indigo-500 font-mono font-bold text-lg">{finalSampleSize}</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <div className="flex justify-between pt-6 border-t border-slate-200/50 dark:border-slate-800/50">
                <Button variant="outline" onClick={onPrev} data-testid="student-sample-plan-prev" className="border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-100">
                    上一阶段
                </Button>
                <div className="flex gap-3">
                    <Button onClick={() => setConfirmNextOpen(true)} disabled={!isValidSize} data-testid="student-sample-plan-next" className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20">
                        确认并进入下一阶段
                    </Button>
                </div>
            </div>

            {/* Confirm Next Stage Dialog */}
            <AlertDialog open={confirmNextOpen} onOpenChange={setConfirmNextOpen}>
                <AlertDialogContent className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200" data-testid="student-sample-plan-confirm-dialog">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-900 dark:text-slate-100">确认样本量规划</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-600 dark:text-slate-400 text-base">
                            您设定的最终样本量为 <strong className="text-emerald-600 text-lg">{finalSampleSize}</strong>。
                            <br /><br />
                            确认后将进入抽样执行阶段。如需修改，您需要返回本阶段，届时后续阶段（抽样执行、分析报告）的数据将被<strong className="text-rose-600">清空</strong>。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100">取消</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmNext} data-testid="student-sample-plan-confirm" className="bg-indigo-600 hover:bg-indigo-700 text-white">确认</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {showLaunch && (
                <ImmersiveExperimentLaunch
                    populationSize={N}
                    sampleSize={finalSampleSize}
                    confidenceLevel={confidenceLevel}
                    marginOfError={marginOfError[0] ?? 5}
                    onComplete={() => { setShowLaunch(false); onNext(); }}
                    onClose={() => { setShowLaunch(false); onNext(); }}
                />
            )}
        </div>
    );
}

export default SamplePlanning;
