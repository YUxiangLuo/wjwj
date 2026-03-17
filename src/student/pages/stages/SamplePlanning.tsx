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
import { Calculator, Users, Info, CheckCircle, RotateCcw } from "lucide-react";
import { useExperiment } from "../ExperimentLayout";
import type { SamplePlanData } from "../../api-client";
import { ImmersiveExperimentLaunch } from "../../components/ImmersiveExperimentLaunch";
import { calculateFinitePopulationSampleSize } from "../../experiment/sample-plan";

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
    const [expectedProportion, setExpectedProportion] = useState(initialData?.expectedProportion ?? 50);
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
        return calculateFinitePopulationSampleSize({
            confidenceLevel,
            marginOfError: marginOfError[0] ?? 5,
            expectedProportion,
            designEffect,
            nonResponseRate,
            populationSize: N,
        }) ?? 0;
    }, [confidenceLevel, marginOfError, expectedProportion, designEffect, nonResponseRate, N]);

    const recommendedSize = calculateSampleSize();
    const baseRecommendedSize = calculateFinitePopulationSampleSize({
        confidenceLevel,
        marginOfError: marginOfError[0] ?? 5,
        expectedProportion,
        populationSize: N,
    }) ?? 0;
    const minSize = 30;
    const maxSize = Math.floor(N * 0.5);

    const isValidSize = finalSampleSize >= minSize && finalSampleSize <= maxSize;

    const buildSamplePlanData = useCallback((): SamplePlanData => ({
        confidenceLevel,
        marginOfError: marginOfError[0] ?? 5,
        expectedProportion,
        designEffect,
        nonResponseRate,
        recommendedSize,
        finalSampleSize,
    }), [confidenceLevel, marginOfError, expectedProportion, designEffect, nonResponseRate, recommendedSize, finalSampleSize]);

    useEffect(() => {
        if (initialData) {
            const initialRecommended = initialData.recommendedSize ?? calculateFinitePopulationSampleSize({
                confidenceLevel: initialData.confidenceLevel ?? "95",
                marginOfError: initialData.marginOfError ?? 5,
                expectedProportion: initialData.expectedProportion ?? 50,
                designEffect: initialData.designEffect ?? 1,
                nonResponseRate: initialData.nonResponseRate ?? 0,
                populationSize: N,
            }) ?? 0;
            serverSnapshotRef.current = JSON.stringify({
                confidenceLevel: initialData.confidenceLevel ?? "95",
                marginOfError: initialData.marginOfError ?? 5,
                expectedProportion: initialData.expectedProportion ?? 50,
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
            <Card className="rounded-2xl border-indigo-200 bg-indigo-50/80 shadow-sm dark:border-indigo-500/20 dark:bg-indigo-500/10">
                <CardContent className="grid gap-4 px-6 py-5 md:grid-cols-3">
                    <div className="rounded-xl border border-indigo-200/80 bg-white/80 p-4 dark:border-indigo-400/20 dark:bg-slate-950/40">
                        <p className="text-xs font-medium text-indigo-600 dark:text-indigo-300">第 1 步</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">先算基础样本量</p>
                        <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">根据总体规模、置信水平、允许误差和预计比例得到有限总体的基础样本量。</p>
                    </div>
                    <div className="rounded-xl border border-indigo-200/80 bg-white/80 p-4 dark:border-indigo-400/20 dark:bg-slate-950/40">
                        <p className="text-xs font-medium text-indigo-600 dark:text-indigo-300">第 2 步</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">再乘设计效应</p>
                        <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">若后续采用复杂抽样设计，需要用 DEFF 对基础样本量做放大修正。</p>
                    </div>
                    <div className="rounded-xl border border-indigo-200/80 bg-white/80 p-4 dark:border-indigo-400/20 dark:bg-slate-950/40">
                        <p className="text-xs font-medium text-indigo-600 dark:text-indigo-300">第 3 步</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">最后预留无回答损耗</p>
                        <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">预计会出现拒访或无效问卷时，应按无回答率进一步放大计划样本量。</p>
                    </div>
                </CardContent>
            </Card>
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
                                按“基础样本量 → 设计效应 → 无回答率”的顺序修正建议样本量
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
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <Label className="text-slate-700 dark:text-slate-300">预计比例 p</Label>
                                        <div className="flex items-center gap-1">
                                            <Input
                                                type="number"
                                                value={expectedProportion}
                                                onChange={(e) => {
                                                    const v = parseInt(e.target.value);
                                                    if (!Number.isNaN(v) && v >= 1 && v <= 99) {
                                                        setExpectedProportion(v);
                                                    }
                                                }}
                                                min={1}
                                                max={99}
                                                data-testid="student-sample-plan-expected-proportion"
                                                className="w-16 h-7 text-sm font-bold text-indigo-600 dark:text-indigo-400 bg-white/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-center px-1"
                                            />
                                            <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">%</span>
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-500">
                                        若已有资料可据此填写；没有先验信息时，50% 是常用的保守估计。
                                    </p>
                                </div>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="designEffect" className="text-slate-700 dark:text-slate-300">设计效应 DEFF</Label>
                                            <Input
                                                id="designEffect"
                                                type="number"
                                                value={designEffect}
                                                onChange={(e) => {
                                                    const v = Number(e.target.value);
                                                    if (!Number.isNaN(v) && v >= 1 && v <= 5) {
                                                        setDesignEffect(Number(v.toFixed(1)));
                                                    }
                                                }}
                                                min={1}
                                                max={5}
                                                step={0.1}
                                                data-testid="student-sample-plan-design-effect"
                                                className="bg-white/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="nonResponseRate" className="text-slate-700 dark:text-slate-300">无回答率</Label>
                                            <div className="relative">
                                                <Input
                                                    id="nonResponseRate"
                                                    type="number"
                                                    value={nonResponseRate}
                                                    onChange={(e) => {
                                                        const v = parseInt(e.target.value);
                                                        if (!Number.isNaN(v) && v >= 0 && v <= 60) {
                                                            setNonResponseRate(v);
                                                        }
                                                    }}
                                                    min={0}
                                                    max={60}
                                                    data-testid="student-sample-plan-nonresponse"
                                                    className="pr-8 bg-white/50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200"
                                                />
                                                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
                                            </div>
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-500">
                                        DEFF 反映复杂设计导致的方差放大；无回答率用于为失访和无效问卷预留补样空间。
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
                                <p>n = n₀ / (1 + (n₀ - 1) / N)</p>
                                <p>n′ = n × DEFF</p>
                                <p>n_final = n′ / (1 - 无回答率)</p>
                            </div>
                            <div className="space-y-2 text-xs leading-relaxed">
                                <p>• <strong className="text-sky-900 dark:text-sky-200">置信水平 (Z)</strong>：结果的可信程度。95% 意味着如果重复调查 100 次，有 95 次的结果都在误差范围内。</p>
                                <p>• <strong className="text-sky-900 dark:text-sky-200">允许误差 (E)</strong>：结果与真实值的最大允许偏差。</p>
                                <p>• <strong className="text-sky-900 dark:text-sky-200">预计比例 (p)</strong>：目标指标的先验比例，没有先验信息时可使用 50%。</p>
                                <p>• <strong className="text-sky-900 dark:text-sky-200">设计效应 (DEFF)</strong>：复杂抽样设计相对简单随机抽样的方差放大倍数。</p>
                                <p>• <strong className="text-sky-900 dark:text-sky-200">无回答率</strong>：预计不能回收或无法使用的样本比例。</p>
                            </div>
                            <div className="rounded-xl bg-slate-50/50 dark:bg-slate-900/50 p-3 border border-slate-200 dark:border-slate-800">
                                <p className="text-xs text-slate-500 mb-2 font-medium">常用 Z 值参考</p>
                                <div className="grid grid-cols-3 gap-2 text-xs text-slate-600 dark:text-slate-400 text-center">
                                    <div className="bg-white dark:bg-slate-950 rounded p-1">90%<br /><span className="text-slate-500">1.645</span></div>
                                    <div className="bg-white dark:bg-slate-950 rounded p-1 text-emerald-600 font-medium ring-1 ring-emerald-500/20">95%<br /><span className="text-emerald-600">1.96</span></div>
                                    <div className="bg-white dark:bg-slate-950 rounded p-1">99%<br /><span className="text-slate-500">2.576</span></div>
                                </div>
                            </div>
                            <div className="rounded-xl border border-indigo-200 bg-white/80 p-3 text-xs text-indigo-800 shadow-sm dark:border-indigo-400/20 dark:bg-indigo-950/40 dark:text-indigo-200 space-y-1">
                                <p>当前基础样本量：<strong>{baseRecommendedSize.toLocaleString()}</strong></p>
                                <p>设计效应修正后：<strong>{Math.ceil(baseRecommendedSize * designEffect).toLocaleString()}</strong></p>
                                <p>考虑无回答率后建议样本量：<strong>{recommendedSize.toLocaleString()}</strong></p>
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
                                <span className="text-slate-500">预计比例</span>
                                <span className="text-slate-800 dark:text-slate-200 font-mono">{expectedProportion}%</span>
                            </div>
                            <div className="flex justify-between text-sm py-1 border-b border-slate-200/50 dark:border-slate-800/50">
                                <span className="text-slate-500">设计效应</span>
                                <span className="text-slate-800 dark:text-slate-200 font-mono">{designEffect.toFixed(1)}</span>
                            </div>
                            <div className="flex justify-between text-sm py-1 border-b border-slate-200/50 dark:border-slate-800/50">
                                <span className="text-slate-500">无回答率</span>
                                <span className="text-slate-800 dark:text-slate-200 font-mono">{nonResponseRate}%</span>
                            </div>
                            <div className="flex justify-between text-sm py-1 border-b border-slate-200/50 dark:border-slate-800/50">
                                <span className="text-slate-500">基础样本量</span>
                                <span className="text-slate-800 dark:text-slate-200 font-mono">{baseRecommendedSize}</span>
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
