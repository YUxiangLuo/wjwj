import { useState, useEffect, useMemo, useCallback, memo } from "react";
import { X, Users, Target, Layers, Shuffle, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MethodKey as SamplingMethod } from "../api-client";
import { computeSampleProgressDisplay } from "./sample-progress-display";
import { formatSystematicInterval } from "../experiment/systematic-sampling";

interface StratifiedLayer {
    name: string;
    count: number;
    ratio: number;
    sampleCount: number;
}

interface Props {
    method: SamplingMethod;
    populationSize: number;
    sampleSize: number;
    /** For systematic */
    interval?: number;
    /** For pps */
    sizeField?: string;
    /** For stratified */
    stratifyBy?: string;
    layers?: StratifiedLayer[];
    onClose: () => void;
    /** Sampled data rows returned from API — when set, displayed as a table in complete phase */
    sampledData?: Array<Record<string, unknown>>;
    /** Total count of sampled rows (may exceed displayed rows) */
    sampledTotal?: number;
}

// ─── Constants ─────────────────────────────────────────────
const GRID_COLS = 40;
const GRID_ROWS = 25;
const TOTAL_DOTS = GRID_COLS * GRID_ROWS; // 1000 visual dots
const POPULATION_TICK_MS = 16;
const POPULATION_TICK_COUNT = Math.ceil(TOTAL_DOTS / 100);
const POPULATION_TO_SAMPLING_DELAY_MS = 200;
const MAX_SAMPLING_TICKS = 60;
const SAMPLING_TICK_MS = 40;
const COMPLETION_DELAY_MS = 300;

// PPS weight simulation: each dot gets a random "size" in [MIN, MIN + RANGE]
const PPS_WEIGHT_MIN = 0.1;
const PPS_WEIGHT_RANGE = 3;
// Unselected PPS dots use opacity to convey relative size (larger = brighter)
const PPS_OPACITY_MIN = 0.15;
const PPS_OPACITY_RANGE = 0.55; // max opacity = MIN + RANGE = 0.70

const METHOD_META: Record<SamplingMethod, {
    label: string; color: string; accent: string; icon: typeof Shuffle;
    accentBg: string; accentBgLight: string; accentText: string;
    accentRing: string; accentBorder: string;
}> = {
    simple: { label: "简单随机抽样", color: "from-primary/20 to-auxiliary/20", accent: "indigo", icon: Shuffle, accentBg: "bg-primary", accentBgLight: "bg-primary/20", accentText: "text-primary", accentRing: "ring-primary", accentBorder: "border-primary/30" },
    systematic: { label: "系统抽样", color: "from-info/20 to-info/20", accent: "teal", icon: Target, accentBg: "bg-info", accentBgLight: "bg-info/20", accentText: "text-info", accentRing: "ring-info", accentBorder: "border-info/30" },
    pps: { label: "PPS抽样", color: "from-auxiliary/20 to-auxiliary/20", accent: "purple", icon: Target, accentBg: "bg-auxiliary", accentBgLight: "bg-auxiliary/20", accentText: "text-auxiliary", accentRing: "ring-auxiliary", accentBorder: "border-auxiliary/30" },
    stratified: { label: "分层抽样", color: "from-warning/20 to-warning/20", accent: "amber", icon: Layers, accentBg: "bg-warning", accentBgLight: "bg-warning/20", accentText: "text-warning", accentRing: "ring-warning", accentBorder: "border-warning/30" },
};

const METHOD_PROGRESS_COPY: Record<SamplingMethod, { populating: string; sampling: string; complete: string }> = {
    simple: {
        populating: "构建总体样本池...",
        sampling: "随机命中样本点...",
        complete: "随机抽样完成",
    },
    systematic: {
        populating: "排列总体顺序...",
        sampling: "按分数间隔 K=N/n 依次抽取...",
        complete: "系统抽样完成",
    },
    pps: {
        populating: "计算各单位规模权重...",
        sampling: "按规模概率系统选取...",
        complete: "PPS抽样完成",
    },
    stratified: {
        populating: "按分层变量划分总体...",
        sampling: "从各层分别抽取样本...",
        complete: "分层抽样完成",
    },
};

export function getSamplingAnimationDurationUpperBound(method: SamplingMethod) {
    const introDelay = method === "stratified" ? 900 : 700;
    return introDelay
        + POPULATION_TICK_COUNT * POPULATION_TICK_MS
        + POPULATION_TO_SAMPLING_DELAY_MS
        + MAX_SAMPLING_TICKS * SAMPLING_TICK_MS
        + COMPLETION_DELAY_MS;
}

const LAYER_COLORS = [
    { bg: "bg-chart-8", ring: "ring-chart-8" },
    { bg: "bg-chart-2", ring: "ring-chart-2" },
    { bg: "bg-chart-7", ring: "ring-chart-7" },
    { bg: "bg-chart-5", ring: "ring-chart-5" },
    { bg: "bg-chart-4", ring: "ring-chart-4" },
    { bg: "bg-chart-6", ring: "ring-chart-6" },
] as const;

function lc(index: number) {
    return LAYER_COLORS[index % LAYER_COLORS.length]!;
}

// ─── Seeded RNG (deterministic visual order) ──────────────
function mulberry32(seed: number) {
    return () => {
        let t = (seed += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function shuffleIndices(count: number, rng: () => number): number[] {
    const arr = Array.from({ length: count }, (_, i) => i);
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = arr[i]!;
        arr[i] = arr[j]!;
        arr[j] = tmp;
    }
    return arr;
}

// ─── Memoized dot grid to avoid re-creating 1000 DOM nodes on each tick ───
const DotGrid = memo(function DotGrid({
    visiblePopCount,
    currentSelectIndex,
    dotSelectedAt,
    layerAssignment,
    dotWeights,
    method,
    systematicScanIndex,
}: {
    visiblePopCount: number;
    currentSelectIndex: number;
    dotSelectedAt: Int32Array;
    layerAssignment: number[] | undefined;
    /** Normalized 0-1 weights per dot, used by PPS to show size variation */
    dotWeights: Float32Array | undefined;
    method: SamplingMethod;
    /** For systematic: index of the latest scanned dot. Dots beyond this appear dimmer. */
    systematicScanIndex?: number;
}) {
    const methodMeta = METHOD_META[method];
    return (
        <div
            className="grid gap-[2px]"
            style={{ gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)` }}
        >
            {Array.from({ length: TOTAL_DOTS }, (_, i) => {
                const visible = i < visiblePopCount;
                const selected = dotSelectedAt[i]! >= 0 && dotSelectedAt[i]! < currentSelectIndex;
                const layerIdx = layerAssignment?.[i] ?? 0;

                let bgClass: string;
                let inlineStyle: React.CSSProperties | undefined;
                if (selected) {
                    if (method === "stratified") {
                        bgClass = `${lc(layerIdx).bg} ring-1 ${lc(layerIdx).ring} scale-125`;
                    } else {
                        bgClass = `${methodMeta.accentBg} ring-1 ${methodMeta.accentRing} scale-125`;
                    }
                } else if (visible) {
                    if (method === "stratified" && layerAssignment) {
                        bgClass = `${lc(layerIdx).bg} opacity-20`;
                    } else if (method === "pps" && dotWeights) {
                        // PPS: vary opacity by size weight so larger units appear more prominent
                        const w = dotWeights[i] ?? 0.5;
                        const opacity = PPS_OPACITY_MIN + w * PPS_OPACITY_RANGE;
                        bgClass = methodMeta.accentBg;
                        inlineStyle = { opacity };
                    } else if (method === "systematic" && systematicScanIndex !== undefined && i > systematicScanIndex) {
                        // Not yet scanned — dimmer to show the scan sweeping through
                        bgClass = "bg-muted-foreground/15";
                    } else {
                        // Already scanned points remain visibly stronger than the pending field.
                        bgClass = method === "systematic" ? "bg-muted-foreground/80" : "bg-muted-foreground/20";
                    }
                } else {
                    bgClass = "bg-transparent";
                }

                return (
                    <div
                        key={i}
                        className={`aspect-square rounded-[2px] transition-all duration-150 ${bgClass}`}
                        style={inlineStyle}
                    />
                );
            })}
        </div>
    );
});

// ─── Phase state machine ──────────────────────────────────
type Phase =
    | { type: "intro" }          // show method name + brief explanation
    | { type: "populating" }     // fill grid with population dots
    | { type: "sampling" }       // highlight selected dots one by one
    | { type: "complete" };      // show summary, allow proceed

const FIELD_LABELS: Record<string, string> = {
    gender: "性别",
    education: "学历",
    age: "年龄段",
    age_group: "年龄段",
    income: "收入水平",
    city: "城市",
    city_tier: "城市等级",
    monthly_expense: "月支出",
    spending: "消费支出",
};

export function ImmersiveSamplingAnimation({
    method,
    populationSize,
    sampleSize,
    interval,
    sizeField,
    stratifyBy,
    layers,
    onClose,
    sampledData,
    sampledTotal,
}: Props) {
    const [phase, setPhase] = useState<Phase>({ type: "intro" });
    const [visiblePopCount, setVisiblePopCount] = useState(0);
    const [currentSelectIndex, setCurrentSelectIndex] = useState(0);
    const meta = METHOD_META[method];
    const progressCopy = METHOD_PROGRESS_COPY[method];
    const fieldLabel = FIELD_LABELS[stratifyBy ?? ""] ?? stratifyBy;
    const introDelay = method === "stratified" ? 900 : 700;

    // Prevent body scroll
    useEffect(() => {
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = ""; };
    }, []);

    // ─── Precompute which dots get selected ───────────────
    const { selectionOrder, layerAssignment, dotSelectedAt, dotWeights } = useMemo(() => {
        const rng = mulberry32(42);

        let selection: number[] = [];
        let layerMap: number[] | undefined;
        let weights: Float32Array | undefined;

        // Scale sample size to visual grid
        const visualSampleSize = sampleSize > 0 && populationSize > 0
            ? Math.min(Math.max(1, Math.round((sampleSize / populationSize) * TOTAL_DOTS)), TOTAL_DOTS)
            : 0;

        if (method === "simple") {
            const shuffled = shuffleIndices(TOTAL_DOTS, rng);
            selection = shuffled.slice(0, visualSampleSize);
        } else if (method === "pps") {
            // PPS systematic selection: simulate varying sizes and walk
            // through the cumulative distribution, mirroring the real algorithm.
            const rawWeights = new Float32Array(TOTAL_DOTS);
            for (let i = 0; i < TOTAL_DOTS; i++) {
                rawWeights[i] = rng() * PPS_WEIGHT_RANGE + PPS_WEIGHT_MIN;
            }
            // Normalize to 0-1 for visual opacity
            let maxW = 0;
            for (let i = 0; i < TOTAL_DOTS; i++) {
                if (rawWeights[i]! > maxW) maxW = rawWeights[i]!;
            }
            const normalizedWeights = new Float32Array(TOTAL_DOTS);
            for (let i = 0; i < TOTAL_DOTS; i++) {
                normalizedWeights[i] = rawWeights[i]! / maxW;
            }

            // Cumulative distribution for systematic PPS selection
            const cumulative: number[] = [];
            let cumSum = 0;
            for (let i = 0; i < TOTAL_DOTS; i++) {
                cumSum += rawWeights[i]!;
                cumulative.push(cumSum);
            }
            const totalSize = cumSum;
            const interval = totalSize / visualSampleSize;
            const start = rng() * interval;
            let pointer = start;
            let dataIdx = 0;
            const selected = new Set<number>();
            for (let i = 0; i < visualSampleSize; i++) {
                while (dataIdx < TOTAL_DOTS - 1 && cumulative[dataIdx]! < pointer) {
                    dataIdx++;
                }
                if (!selected.has(dataIdx)) {
                    selected.add(dataIdx);
                    selection.push(dataIdx);
                } else {
                    // Duplicate hit — advance to find next unselected dot
                    let next = (dataIdx + 1) % TOTAL_DOTS;
                    while (selected.has(next) && next !== dataIdx) {
                        next = (next + 1) % TOTAL_DOTS;
                    }
                    if (!selected.has(next)) {
                        selected.add(next);
                        selection.push(next);
                    }
                }
                pointer += interval;
                if (pointer >= totalSize && i < visualSampleSize - 1) {
                    pointer -= totalSize;
                    dataIdx = 0;
                }
            }
            weights = normalizedWeights;
        } else if (method === "systematic") {
            // Spread samples evenly across the entire grid so the animation
            // visibly scans from top-left to bottom-right.
            const visualInterval = TOTAL_DOTS / Math.max(1, visualSampleSize);
            const start = rng() * visualInterval;
            for (let index = 0; index < visualSampleSize; index += 1) {
                selection.push(Math.floor(start + index * visualInterval));
            }
        } else if (method === "stratified" && layers && layers.length > 0) {
            // Assign dots to layers proportionally
            layerMap = new Array(TOTAL_DOTS).fill(0);
            let offset = 0;
            const layerDotCounts = layers.map((l) => Math.round((l.count / populationSize) * TOTAL_DOTS));
            // Fix rounding: adjust the largest layer to ensure sum === TOTAL_DOTS
            const layerTotal = layerDotCounts.reduce((a, b) => a + b, 0);
            if (layerTotal !== TOTAL_DOTS && layerDotCounts.length > 0) {
                // Find the largest layer to absorb the rounding difference
                let maxIdx = 0;
                for (let i = 1; i < layerDotCounts.length; i++) {
                    if (layerDotCounts[i]! > layerDotCounts[maxIdx]!) maxIdx = i;
                }
                layerDotCounts[maxIdx]! += TOTAL_DOTS - layerTotal;
            }

            for (let li = 0; li < layers.length; li++) {
                const dotCount = layerDotCounts[li] ?? 0;
                for (let d = 0; d < dotCount && offset + d < TOTAL_DOTS; d++) {
                    layerMap[offset + d] = li;
                }
                // Sample from this layer
                const layerStart = offset;
                const layerEnd = offset + dotCount;
                const layerIndices = Array.from({ length: layerEnd - layerStart }, (_, i) => layerStart + i);
                // Shuffle within layer
                for (let i = layerIndices.length - 1; i > 0; i--) {
                    const j = Math.floor(rng() * (i + 1));
                    const tmp = layerIndices[i]!;
                    layerIndices[i] = layerIndices[j]!;
                    layerIndices[j] = tmp;
                }
                const visualLayerSample = Math.round((layers[li]!.sampleCount / sampleSize) * visualSampleSize);
                selection.push(...layerIndices.slice(0, visualLayerSample));
                offset += dotCount;
            }
        }

        // Precompute a lookup: for each dot, at which selection step it gets highlighted (-1 = never)
        const selectedAtMap = new Int32Array(TOTAL_DOTS).fill(-1);
        for (let step = 0; step < selection.length; step++) {
            selectedAtMap[selection[step]!] = step;
        }

        return { selectionOrder: selection, layerAssignment: layerMap, dotSelectedAt: selectedAtMap, dotWeights: weights };
    }, [method, populationSize, sampleSize, layers]);

    const finishAnimation = useCallback(() => {
        setVisiblePopCount(TOTAL_DOTS);
        setCurrentSelectIndex(selectionOrder.length);
        setPhase({ type: "complete" });
    }, [selectionOrder.length]);

    useEffect(() => {
        if (typeof window.matchMedia !== "function") return;
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        if (reducedMotion.matches) finishAnimation();
    }, [finishAnimation]);

    // ─── Phase transitions ────────────────────────────────
    // Intro → Populating after 1.5s
    useEffect(() => {
        if (phase.type === "intro") {
            const timer = setTimeout(() => setPhase({ type: "populating" }), introDelay);
            return () => clearTimeout(timer);
        }
    }, [phase, introDelay]);

    // Populating animation: fill grid rapidly
    useEffect(() => {
        if (phase.type !== "populating") return;
        let transitionTimer: ReturnType<typeof setTimeout> | undefined;
        const batchSize = 100;
        const populationTimer = setInterval(() => {
            setVisiblePopCount((prev) => {
                const next = Math.min(prev + batchSize, TOTAL_DOTS);
                if (next >= TOTAL_DOTS) {
                    clearInterval(populationTimer);
                    transitionTimer = setTimeout(() => setPhase({ type: "sampling" }), POPULATION_TO_SAMPLING_DELAY_MS);
                }
                return next;
            });
        }, POPULATION_TICK_MS);
        return () => {
            clearInterval(populationTimer);
            if (transitionTimer) clearTimeout(transitionTimer);
        };
    }, [phase]);

    // Sampling animation: highlight selected dots progressively
    useEffect(() => {
        if (phase.type !== "sampling") return;
        const total = selectionOrder.length;
        if (total === 0) {
            setPhase({ type: "complete" });
            return;
        }

        // At most 60 ticks keeps the full visual sequence well under six seconds.
        let index = 0;
        const batchSize = Math.max(1, Math.ceil(total / MAX_SAMPLING_TICKS));
        let completionTimer: ReturnType<typeof setTimeout> | undefined;
        const samplingTimer = setInterval(() => {
            index = Math.min(index + batchSize, total);
            setCurrentSelectIndex(index);
            if (index >= total) {
                clearInterval(samplingTimer);
                completionTimer = setTimeout(finishAnimation, COMPLETION_DELAY_MS);
            }
        }, SAMPLING_TICK_MS);

        return () => {
            clearInterval(samplingTimer);
            if (completionTimer) clearTimeout(completionTimer);
        };
    }, [phase, selectionOrder, finishAnimation]);

    const progress =
        phase.type === "intro" ? 0
            : phase.type === "populating" ? (visiblePopCount / TOTAL_DOTS) * 30
                : phase.type === "sampling" ? 30 + (currentSelectIndex / Math.max(1, selectionOrder.length)) * 70
                    : 100;

    // ─── Intro explanation text ───────────────────────────
    const introText = useMemo(() => {
        if (method === "simple") {
            return `即将从 ${populationSize.toLocaleString()} 个总体中随机选取 ${sampleSize} 个样本，每个个体被选中的概率完全相等。`;
        } else if (method === "systematic") {
            return `将按分数间隔 K=${formatSystematicInterval(interval)} 和随机起点从当前抽样框顺序中抽取 ${sampleSize} 个样本。执行前应检查排序与周期结构，避免其与 K 同步。`;
        } else if (method === "pps") {
            const label = FIELD_LABELS[sizeField ?? ""] ?? sizeField ?? "规模";
            return `按"${label}"大小赋予不同选中概率，从 ${populationSize.toLocaleString()} 个总体中抽取 ${sampleSize} 个样本。`;
        } else {
            const layerNames = (layers ?? []).map((l) => l.name).join("、");
            return `先按"${FIELD_LABELS[stratifyBy ?? ""] ?? stratifyBy ?? "分层变量"}"将总体分为 ${layerNames} 等层，再按已配置的各层样本量分别抽取。`;
        }
    }, [method, populationSize, sampleSize, interval, sizeField, stratifyBy, layers]);

    const systematicIndicator = useMemo(() => {
        if (method !== "systematic" || phase.type !== "sampling" || selectionOrder.length === 0) {
            return null;
        }
        const latestIndex = selectionOrder[Math.max(0, currentSelectIndex - 1)] ?? selectionOrder[0] ?? 0;
        const col = latestIndex % GRID_COLS;
        const row = Math.floor(latestIndex / GRID_COLS);
        return {
            left: `${((col + 0.5) / GRID_COLS) * 100}%`,
            top: `${((row + 0.5) / GRID_ROWS) * 100}%`,
            scanIndex: latestIndex,
        };
    }, [method, phase.type, selectionOrder, currentSelectIndex]);

    const stratifiedActiveLayer = useMemo(() => {
        if (method !== "stratified" || !layers?.length || !layerAssignment?.length || phase.type !== "sampling") {
            return null;
        }
        const currentDotIndex = selectionOrder[Math.max(0, currentSelectIndex - 1)] ?? selectionOrder[0];
        if (currentDotIndex === undefined) return null;
        return layerAssignment[currentDotIndex] ?? null;
    }, [method, layers, layerAssignment, phase.type, selectionOrder, currentSelectIndex]);

    const sampleProgressDisplay = useMemo(
        () => computeSampleProgressDisplay(selectionOrder.length, currentSelectIndex, sampleSize),
        [selectionOrder.length, currentSelectIndex, sampleSize],
    );

    const Icon = meta.icon;

    return (
        <div className="fixed inset-0 z-50 bg-background flex flex-col" data-testid="immersive-sampling-animation">
            {/* Progress bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-muted z-10">
                <div
                    role="progressbar"
                    aria-label={`${meta.label}动画进度`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(progress)}
                    className={`h-full transition-all duration-300 ease-out ${meta.accentBg}`}
                    style={{ width: `${progress}%` }}
                />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-3 z-10">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${meta.accentBgLight}`}>
                        <Icon className={`w-5 h-5 ${meta.accentText}`} />
                    </div>
                    <div>
                        <h2 className="text-sm font-semibold text-foreground">{meta.label}</h2>
                        <p className="text-xs text-muted-foreground">
                            {phase.type === "intro" && "准备中..."}
                            {phase.type === "populating" && progressCopy.populating}
                            {phase.type === "sampling" && `${progressCopy.sampling} ${sampleProgressDisplay.current}/${sampleProgressDisplay.total}`}
                            {phase.type === "complete" && progressCopy.complete}
                        </p>
                    </div>
                </div>
                {phase.type === "complete" ? (
                    <Button
                        onClick={onClose}
                        variant="outline"
                        data-testid="immersive-sampling-return"
                        className="border-input text-foreground/90 hover:bg-muted"
                    >
                        关闭
                        <X className="w-4 h-4 ml-1" />
                    </Button>
                ) : (
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={finishAnimation}
                            data-testid="immersive-sampling-skip"
                            className="border-input text-foreground/90 hover:bg-muted"
                        >
                            跳过动画
                        </Button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground/90 hover:bg-muted transition-colors"
                            aria-label="关闭抽样动画"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                )}
            </div>

            {/* Main content */}
            <div className={`flex-1 flex px-6 pb-6 overflow-hidden min-h-0 ${phase.type === "complete" ? "flex-col" : "items-center justify-center"}`}>
                {/* Intro phase */}
                {phase.type === "intro" && (
                    <div className="text-center space-y-6 animate-in fade-in zoom-in-95 duration-500 max-w-lg">
                        <div className={`w-20 h-20 mx-auto rounded-2xl flex items-center justify-center ${meta.accentBgLight}`}>
                            <Icon className={`w-10 h-10 ${meta.accentText}`} />
                        </div>
                        <h1 className="text-2xl font-bold text-foreground">{meta.label}</h1>
                        <p className="text-muted-foreground leading-relaxed">{introText}</p>
                        <div className="flex items-center justify-center gap-6 text-sm">
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Users className="w-4 h-4" />
                                <span>总体 {populationSize.toLocaleString()}</span>
                            </div>
                            <div className={`w-1 h-1 rounded-full ${meta.accentBg}`} />
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Target className="w-4 h-4" />
                                <span>抽取 {sampleSize}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Populating + Sampling + Complete: Show the grid */}
                {phase.type !== "intro" && (
                    <div className={`w-full max-w-5xl mx-auto animate-in fade-in duration-300 ${phase.type === "complete" ? "flex flex-col min-h-0 h-full" : "space-y-4"}`}>
                        {/* Legend for stratified */}
                        {method === "stratified" && layers && (
                            <div className="flex flex-wrap items-center justify-center gap-4 mb-2">
                                {layers.map((layer, i) => (
                                    <div key={layer.name} className="flex items-center gap-2">
                                        <div className={`w-3 h-3 rounded-full ${lc(i).bg}`} />
                                        <span className="text-xs text-muted-foreground">{layer.name}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Dot grid */}
                        {phase.type !== "complete" && (
                            <div className="relative bg-card/50 rounded-2xl border border-border p-4 overflow-hidden">
                                {method === "stratified" && phase.type === "populating" && (
                                    <div className="mb-3 flex items-center justify-center gap-2 text-xs text-warning">
                                        <Layers className="w-3.5 h-3.5" />
                                        <span>先按 {fieldLabel} 分层，再在各层内抽样</span>
                                    </div>
                                )}
                                {method === "pps" && phase.type === "populating" && (
                                    <div className={`mb-3 flex items-center justify-center gap-2 text-xs ${meta.accentText}`}>
                                        <Target className="w-3.5 h-3.5" />
                                        <span>按 {FIELD_LABELS[sizeField ?? ""] ?? sizeField ?? "规模"} 赋予不同权重，亮度反映规模大小</span>
                                    </div>
                                )}
                                <DotGrid
                                    visiblePopCount={visiblePopCount}
                                    currentSelectIndex={currentSelectIndex}
                                    dotSelectedAt={dotSelectedAt}
                                    layerAssignment={layerAssignment}
                                    dotWeights={dotWeights}
                                    method={method}
                                    systematicScanIndex={systematicIndicator?.scanIndex}
                                />

                                {/* Systematic: scan line sweeping top→bottom + cursor */}
                                {method === "systematic" && phase.type === "sampling" && (
                                    <>
                                        {systematicIndicator && (
                                            <div className="pointer-events-none absolute inset-4">
                                                {/* Horizontal scan line showing current row */}
                                                <div
                                                    className="absolute inset-x-0 h-px bg-info/50 transition-all duration-[80ms]"
                                                    style={{ top: systematicIndicator.top }}
                                                />
                                                {/* Scan cursor */}
                                                <div
                                                    className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-info bg-background shadow-md transition-all duration-[80ms]"
                                                    style={{ left: systematicIndicator.left, top: systematicIndicator.top }}
                                                />
                                            </div>
                                        )}
                                        <div className="absolute bottom-3 left-0 right-0 text-center">
                                            <span className={`inline-flex items-center gap-2 rounded-full border ${meta.accentBorder} bg-card/90 px-3 py-1.5 text-xs font-mono ${meta.accentText}`}>
                                                间隔 K = {formatSystematicInterval(interval)}，从总体首端至末端等距抽取
                                            </span>
                                        </div>
                                    </>
                                )}

                                {method === "simple" && phase.type === "sampling" && (
                                    <div className="absolute bottom-3 left-0 right-0 text-center">
                                        <span className={`inline-flex items-center gap-2 bg-card/90 border ${meta.accentBorder} ${meta.accentText} text-xs px-3 py-1.5 rounded-full`}>
                                            <Shuffle className="w-3.5 h-3.5" />
                                            每个样本点被抽中的机会相同
                                        </span>
                                    </div>
                                )}

                                {method === "pps" && phase.type === "sampling" && (
                                    <div className="absolute bottom-3 left-0 right-0 text-center">
                                        <span className={`inline-flex items-center gap-2 rounded-full border ${meta.accentBorder} bg-card/90 px-3 py-1.5 text-xs ${meta.accentText}`}>
                                            <Target className="w-3.5 h-3.5" />
                                            按 {FIELD_LABELS[sizeField ?? ""] ?? sizeField ?? "规模"} 权重系统选取，亮度越高规模越大
                                        </span>
                                    </div>
                                )}

                                {method === "stratified" && phase.type === "sampling" && stratifiedActiveLayer !== null && layers?.[stratifiedActiveLayer] && (
                                    <div className="absolute bottom-3 left-0 right-0 text-center">
                                        <span className={`inline-flex items-center gap-2 rounded-full border ${meta.accentBorder} bg-card/90 px-3 py-1.5 text-xs ${meta.accentText}`}>
                                            <div className={`h-2.5 w-2.5 rounded-full ${lc(stratifiedActiveLayer).bg}`} />
                                            当前正在抽取 {layers[stratifiedActiveLayer].name} 层样本
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Sampling stats bar */}
                        {phase.type === "sampling" && (
                            <div className="flex items-center justify-between px-2 text-xs text-muted-foreground animate-in fade-in duration-200">
                                <span>总体 {populationSize.toLocaleString()} 个数据点</span>
                                <span className={meta.accentText}>
                                    已选中 {sampleProgressDisplay.current} / {sampleProgressDisplay.total}
                                </span>
                            </div>
                        )}

                        {/* Complete phase */}
                        {phase.type === "complete" && (
                            <div className="animate-in fade-in duration-300 flex flex-col min-h-0 h-full">
                                {!sampledData ? (
                                    <div className="flex-1 flex flex-col items-center justify-center gap-3 py-8">
                                        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                                        <p className="text-sm text-muted-foreground">正在获取抽样数据...</p>
                                    </div>
                                ) : (
                                    <SampledDataTable data={sampledData} total={sampledTotal ?? sampledData.length} />
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Inline data table for complete phase ────────────────
const PAGE_SIZE = 20;

function SampledDataTable({ data, total }: { data: Array<Record<string, unknown>>; total: number }) {
    const [page, setPage] = useState(1);

    // Reset to page 1 when data changes (e.g. re-execution)
    useEffect(() => { setPage(1); }, [data]);

    if (data.length === 0) {
        return <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground italic">暂无抽样数据</div>;
    }

    const keys = Object.keys(data[0] ?? {});
    const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const start = (currentPage - 1) * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, data.length);
    const rows = data.slice(start, end);

    return (
        <div className="flex flex-col min-h-0 h-full gap-2">
            <div
                className="min-h-0 flex-1 overflow-auto rounded-xl border border-border"
                role="region"
                tabIndex={0}
                aria-label="抽样结果数据表"
            >
                <table className="w-full text-left min-w-max">
                    <thead className="sticky top-0 bg-muted/95 backdrop-blur-sm z-10">
                        <tr>
                            <th className="px-3 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap border-b border-border">#</th>
                            {keys.map((key) => (
                                <th key={key} className="px-3 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap border-b border-border">
                                    {FIELD_LABELS[key] || key}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, rowIndex) => (
                            <tr key={start + rowIndex} className="border-b border-border hover:bg-card">
                                <td className="px-3 py-1.5 text-xs text-muted-foreground font-mono whitespace-nowrap">{start + rowIndex + 1}</td>
                                {keys.map((key) => (
                                    <td key={key} className="px-3 py-1.5 text-xs text-foreground/90 whitespace-nowrap">
                                        {String(row[key] ?? "")}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="flex shrink-0 items-center justify-between rounded bg-background px-1">
                <p className="text-xs text-muted-foreground">
                    显示第 {start + 1}-{end} 条{total > data.length ? `（已加载 ${data.length} 条，共 ${total} 条）` : `，共 ${data.length} 条`}
                </p>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        aria-label="抽样结果上一页"
                        className="h-7 px-2 text-xs border-input text-foreground/90 hover:bg-muted"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage <= 1}
                    >
                        <ChevronLeft className="w-3.5 h-3.5" />
                    </Button>
                    <span className="text-xs text-muted-foreground font-mono tabular-nums">{currentPage}/{totalPages}</span>
                    <Button
                        variant="outline"
                        size="sm"
                        aria-label="抽样结果下一页"
                        className="h-7 px-2 text-xs border-input text-foreground/90 hover:bg-muted"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage >= totalPages}
                    >
                        <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
