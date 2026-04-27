import { useState, useEffect, useRef, useMemo, memo } from "react";
import { X, Users, Target, Layers, Shuffle, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MethodKey as SamplingMethod } from "../api-client";
import { computeSampleProgressDisplay } from "./sample-progress-display";

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
    kValue?: number;
    /** For pps */
    sizeField?: string;
    /** For stratified */
    stratifyBy?: string;
    layers?: StratifiedLayer[];
    /** Called when animation finishes so parent can start the real API call */
    onAnimationComplete: () => void;
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

// PPS weight simulation: each dot gets a random "size" in [MIN, MIN + RANGE]
const PPS_WEIGHT_MIN = 0.1;
const PPS_WEIGHT_RANGE = 3;
// Unselected PPS dots use opacity to convey relative size (larger = brighter)
const PPS_OPACITY_MIN = 0.15;
const PPS_OPACITY_RANGE = 0.55; // max opacity = MIN + RANGE = 0.70

const METHOD_META: Record<SamplingMethod, {
    label: string; icon: typeof Shuffle;
    accentBg: string; accentBgLight: string; accentText: string;
    accentRing: string; accentBorder: string;
}> = {
    simple: { label: "简单随机抽样", icon: Shuffle, accentBg: "bg-primary", accentBgLight: "bg-primary/10", accentText: "text-primary", accentRing: "ring-primary/40", accentBorder: "border-primary/30" },
    systematic: { label: "系统抽样", icon: Target, accentBg: "bg-chart-3", accentBgLight: "bg-chart-3/10", accentText: "text-chart-3", accentRing: "ring-chart-3/40", accentBorder: "border-chart-3/30" },
    pps: { label: "PPS抽样", icon: Target, accentBg: "bg-chart-5", accentBgLight: "bg-chart-5/10", accentText: "text-chart-5", accentRing: "ring-chart-5/40", accentBorder: "border-chart-5/30" },
    stratified: { label: "分层抽样", icon: Layers, accentBg: "bg-chart-4", accentBgLight: "bg-chart-4/10", accentText: "text-chart-4", accentRing: "ring-chart-4/40", accentBorder: "border-chart-4/30" },
};

const METHOD_PROGRESS_COPY: Record<SamplingMethod, { populating: string; sampling: string; complete: string }> = {
    simple: {
        populating: "构建总体样本池...",
        sampling: "随机命中样本点...",
        complete: "随机抽样完成",
    },
    systematic: {
        populating: "排列总体顺序...",
        sampling: "按固定间隔依次抽取...",
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

const LAYER_COLORS = [
    { bg: "bg-destructive", ring: "ring-destructive/40" },
    { bg: "bg-chart-2", ring: "ring-chart-2/40" },
    { bg: "bg-chart-3", ring: "ring-chart-3/40" },
    { bg: "bg-chart-4", ring: "ring-chart-4/40" },
    { bg: "bg-chart-5", ring: "ring-chart-5/40" },
    { bg: "bg-primary", ring: "ring-primary/40" },
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
                        bgClass = cn(lc(layerIdx).bg, "scale-125 ring-1", lc(layerIdx).ring);
                    } else {
                        bgClass = cn(methodMeta.accentBg, "scale-125 ring-1", methodMeta.accentRing);
                    }
                } else if (visible) {
                    if (method === "stratified" && layerAssignment) {
                        bgClass = cn(lc(layerIdx).bg, "opacity-20");
                    } else if (method === "pps" && dotWeights) {
                        // PPS: vary opacity by size weight so larger units appear more prominent
                        const w = dotWeights[i] ?? 0.5;
                        const opacity = PPS_OPACITY_MIN + w * PPS_OPACITY_RANGE;
                        bgClass = methodMeta.accentBg;
                        inlineStyle = { opacity };
                    } else if (method === "systematic" && systematicScanIndex !== undefined && i > systematicScanIndex) {
                        // Not yet scanned — dimmer to show the scan sweeping through
                        bgClass = "bg-muted/30";
                    } else {
                        bgClass = "bg-muted";
                    }
                } else {
                    bgClass = "bg-transparent";
                }

                return (
                    <div
                        key={i}
                        className={cn("aspect-square rounded-[2px] transition-all duration-150", bgClass)}
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
    kValue,
    sizeField,
    stratifyBy,
    layers,
    onAnimationComplete,
    onClose,
    sampledData,
    sampledTotal,
}: Props) {
    const [phase, setPhase] = useState<Phase>({ type: "intro" });
    const [visiblePopCount, setVisiblePopCount] = useState(0);
    const [currentSelectIndex, setCurrentSelectIndex] = useState(0);
    const hasCalledComplete = useRef(false);
    const meta = METHOD_META[method];
    const progressCopy = METHOD_PROGRESS_COPY[method];
    const fieldLabel = FIELD_LABELS[stratifyBy ?? ""] ?? stratifyBy;
    const introDelay = method === "stratified" ? 1700 : 1200;

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
        const visualSampleSize = Math.min(Math.round((sampleSize / populationSize) * TOTAL_DOTS), TOTAL_DOTS);

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
            const visualK = Math.max(2, Math.round(TOTAL_DOTS / Math.max(1, visualSampleSize)));
            const start = Math.floor(rng() * visualK);
            for (let i = start; i < TOTAL_DOTS && selection.length < visualSampleSize; i += visualK) {
                selection.push(i);
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
    }, [method, populationSize, sampleSize, kValue, layers]);

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
        const batchSize = method === "stratified" ? 36 : 50;
        const interval = setInterval(() => {
            setVisiblePopCount((prev) => {
                const next = Math.min(prev + batchSize, TOTAL_DOTS);
                if (next >= TOTAL_DOTS) {
                    clearInterval(interval);
                    setTimeout(() => setPhase({ type: "sampling" }), method === "stratified" ? 650 : 400);
                }
                return next;
            });
        }, 20);
        return () => clearInterval(interval);
    }, [phase, method]);

    // Sampling animation: highlight selected dots progressively
    useEffect(() => {
        if (phase.type !== "sampling") return;
        const total = selectionOrder.length;
        if (total === 0) {
            setPhase({ type: "complete" });
            return;
        }

        // Reveal in batches, speed up as we go
        let index = 0;
        const batchSize = method === "systematic"
            ? 1
            : method === "pps"
                ? 1  // PPS walks through cumulative distribution one-by-one like systematic
                : method === "stratified"
                    ? Math.max(1, Math.ceil(total / 75))
                    : Math.max(1, Math.ceil(total / 60));
        const tick = method === "systematic" ? 55 : method === "pps" ? 50 : method === "stratified" ? 45 : 35;
        const interval = setInterval(() => {
            index = Math.min(index + batchSize, total);
            setCurrentSelectIndex(index);
            if (index >= total) {
                clearInterval(interval);
                setTimeout(() => {
                    setPhase({ type: "complete" });
                    if (!hasCalledComplete.current) {
                        hasCalledComplete.current = true;
                        onAnimationComplete();
                    }
                }, 600);
            }
        }, tick);

        return () => clearInterval(interval);
    }, [phase, selectionOrder, onAnimationComplete, method]);

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
            return `将按固定间隔 K=${kValue} 从总体中等距抽取样本，以确保样本均匀覆盖整个总体。`;
        } else if (method === "pps") {
            const label = FIELD_LABELS[sizeField ?? ""] ?? sizeField ?? "规模";
            return `按"${label}"大小赋予不同选中概率，从 ${populationSize.toLocaleString()} 个总体中抽取 ${sampleSize} 个样本。`;
        } else {
            const layerNames = (layers ?? []).map((l) => l.name).join("、");
            return `先按"${FIELD_LABELS[stratifyBy ?? ""] ?? stratifyBy ?? "分层变量"}"将总体分为 ${layerNames} 等层，再从各层中按比例抽取样本。`;
        }
    }, [method, populationSize, sampleSize, kValue, sizeField, stratifyBy, layers]);

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
        <div className="fixed inset-0 z-50 flex flex-col bg-background" data-testid="immersive-sampling-animation">
            {/* Progress bar */}
            <div className="absolute left-0 right-0 top-0 z-10 h-1 bg-muted">
                <div
                    className={cn("h-full transition-all duration-300 ease-out", meta.accentBg)}
                    style={{ width: `${progress}%` }}
                />
            </div>

            {/* Header */}
            <div className="z-10 flex items-center justify-between px-6 pb-3 pt-5">
                <div className="flex items-center gap-3">
                    <div className={cn("flex size-10 items-center justify-center rounded-xl", meta.accentBgLight)}>
                        <Icon className={cn("size-5", meta.accentText)} />
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
                    >
                        关闭
                        <X data-icon="inline-end" />
                    </Button>
                ) : (
                    <button
                        onClick={onClose}
                        className="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label="关闭"
                    >
                        <X className="size-5" />
                    </button>
                )}
            </div>

            {/* Main content */}
            <div className={cn("flex min-h-0 flex-1 overflow-hidden px-6 pb-6", phase.type === "complete" ? "flex-col" : "items-center justify-center")}>
                {/* Intro phase */}
                {phase.type === "intro" && (
                    <div className="animate-in mx-auto flex max-w-lg flex-col items-center gap-6 text-center fade-in zoom-in-95 duration-500">
                        <div className={cn("mx-auto flex size-20 items-center justify-center rounded-2xl", meta.accentBgLight)}>
                            <Icon className={cn("size-10", meta.accentText)} />
                        </div>
                        <h1 className="text-2xl font-bold text-foreground">{meta.label}</h1>
                        <p className="leading-relaxed text-muted-foreground">{introText}</p>
                        <div className="flex items-center justify-center gap-6 text-sm">
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Users className="size-4" />
                                <span>总体 {populationSize.toLocaleString()}</span>
                            </div>
                            <div className={cn("size-1 rounded-full", meta.accentBg)} />
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Target className="size-4" />
                                <span>抽取 {sampleSize}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Populating + Sampling + Complete: Show the grid */}
                {phase.type !== "intro" && (
                    <div className={cn("animate-in mx-auto w-full max-w-5xl fade-in duration-300", phase.type === "complete" ? "flex h-full min-h-0 flex-col" : "flex flex-col gap-4")}>
                        {/* Legend for stratified */}
                        {method === "stratified" && layers && (
                            <div className="mb-2 flex flex-wrap items-center justify-center gap-4">
                                {layers.map((layer, i) => (
                                    <div key={layer.name} className="flex items-center gap-2">
                                        <div className={cn("size-3 rounded-full", lc(i).bg)} />
                                        <span className="text-xs text-muted-foreground">{layer.name}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Dot grid */}
                        {phase.type !== "complete" && (
                            <div className="relative overflow-hidden rounded-2xl border bg-muted/30 p-4">
                                {method === "stratified" && phase.type === "populating" && (
                                    <div className="mb-3 flex items-center justify-center gap-2 text-xs text-chart-4">
                                        <Layers className="size-3.5" />
                                        <span>先按 {fieldLabel} 分层，再在各层内抽样</span>
                                    </div>
                                )}
                                {method === "pps" && phase.type === "populating" && (
                                    <div className={cn("mb-3 flex items-center justify-center gap-2 text-xs", meta.accentText)}>
                                        <Target className="size-3.5" />
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
                                                    className="absolute inset-x-0 h-px bg-chart-3/50 transition-all duration-[80ms]"
                                                    style={{ top: systematicIndicator.top }}
                                                />
                                                {/* Scan cursor */}
                                                <div
                                                    className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-chart-3 bg-background shadow-md transition-all duration-[80ms]"
                                                    style={{ left: systematicIndicator.left, top: systematicIndicator.top }}
                                                />
                                            </div>
                                        )}
                                        <div className="absolute bottom-3 left-0 right-0 text-center">
                                            <span className={cn("inline-flex items-center gap-2 rounded-full border bg-background/90 px-3 py-1.5 font-mono text-xs", meta.accentBorder, meta.accentText)}>
                                                间隔 K = {kValue}，从总体首端至末端等距抽取
                                            </span>
                                        </div>
                                    </>
                                )}

                                {method === "simple" && phase.type === "sampling" && (
                                    <div className="absolute bottom-3 left-0 right-0 text-center">
                                        <span className={cn("inline-flex items-center gap-2 rounded-full border bg-background/90 px-3 py-1.5 text-xs", meta.accentBorder, meta.accentText)}>
                                            <Shuffle className="size-3.5" />
                                            每个样本点被抽中的机会相同
                                        </span>
                                    </div>
                                )}

                                {method === "pps" && phase.type === "sampling" && (
                                    <div className="absolute bottom-3 left-0 right-0 text-center">
                                        <span className={cn("inline-flex items-center gap-2 rounded-full border bg-background/90 px-3 py-1.5 text-xs", meta.accentBorder, meta.accentText)}>
                                            <Target className="size-3.5" />
                                            按 {FIELD_LABELS[sizeField ?? ""] ?? sizeField ?? "规模"} 权重系统选取，亮度越高规模越大
                                        </span>
                                    </div>
                                )}

                                {method === "stratified" && phase.type === "sampling" && stratifiedActiveLayer !== null && layers?.[stratifiedActiveLayer] && (
                                    <div className="absolute bottom-3 left-0 right-0 text-center">
                                        <span className={cn("inline-flex items-center gap-2 rounded-full border bg-background/90 px-3 py-1.5 text-xs", meta.accentBorder, meta.accentText)}>
                                            <div className={cn("size-2.5 rounded-full", lc(stratifiedActiveLayer).bg)} />
                                            当前正在抽取 {layers[stratifiedActiveLayer].name} 层样本
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Sampling stats bar */}
                        {phase.type === "sampling" && (
                            <div className="animate-in flex items-center justify-between px-2 text-xs text-muted-foreground fade-in duration-200">
                                <span>总体 {populationSize.toLocaleString()} 个数据点</span>
                                <span className={meta.accentText}>
                                    已选中 {sampleProgressDisplay.current} / {sampleProgressDisplay.total}
                                </span>
                            </div>
                        )}

                        {/* Complete phase */}
                        {phase.type === "complete" && (
                            <div className="animate-in flex h-full min-h-0 flex-col fade-in duration-300">
                                {!sampledData ? (
                                    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8">
                                        <Loader2 className="size-8 animate-spin text-muted-foreground" />
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
        return <div className="flex flex-1 items-center justify-center text-sm italic text-muted-foreground">暂无抽样数据</div>;
    }

    const keys = Object.keys(data[0] ?? {});
    const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const start = (currentPage - 1) * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, data.length);
    const rows = data.slice(start, end);

    return (
        <div className="flex h-full min-h-0 flex-col gap-2">
            <div className="min-h-0 flex-1 overflow-auto rounded-xl border">
                <table className="min-w-max w-full text-left">
                    <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
                        <tr>
                            <th className="whitespace-nowrap border-b px-3 py-2 text-xs font-medium text-muted-foreground">#</th>
                            {keys.map((key) => (
                                <th key={key} className="whitespace-nowrap border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                                    {FIELD_LABELS[key] || key}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, rowIndex) => (
                            <tr key={start + rowIndex} className="border-b hover:bg-muted/60">
                                <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs text-muted-foreground">{start + rowIndex + 1}</td>
                                {keys.map((key) => (
                                    <td key={key} className="whitespace-nowrap px-3 py-1.5 text-xs text-foreground">
                                        {String(row[key] ?? "")}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="flex shrink-0 items-center justify-between px-1">
                <p className="text-xs text-muted-foreground">
                    显示第 {start + 1}-{end} 条{total > data.length ? `（已加载 ${data.length} 条，共 ${total} 条）` : `，共 ${data.length} 条`}
                </p>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="icon-xs"
                        aria-label="上一页"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage <= 1}
                    >
                        <ChevronLeft />
                    </Button>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">{currentPage}/{totalPages}</span>
                    <Button
                        variant="outline"
                        size="icon-xs"
                        aria-label="下一页"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage >= totalPages}
                    >
                        <ChevronRight />
                    </Button>
                </div>
            </div>
        </div>
    );
}
