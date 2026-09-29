import { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import { createPortal } from "react-dom";
import { X, Users, Target, Layers, Shuffle, ChevronLeft, ChevronRight, Loader2, CheckCircle2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MethodKey as SamplingMethod, SamplingResultsData } from "@/domain/experiment/types";
import { PpsProbabilityExplanation } from "@/components/PpsProbabilityExplanation";
import { createSeededRandom, performSimpleSamplingWithIndices, performPPSSampling, type PpsProbabilitySummary } from "@/domain/statistics/sampling";
import { computeSampleProgressDisplay } from "./sample-progress-display";
import { formatSystematicInterval } from "../experiment/systematic-sampling";
import { buildSamplingAnimationScale, buildStratifiedVisualAllocation } from "./sampling-animation-scale";
import { SamplingMethodExplanation } from "./SamplingMethodExplanation";

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
    /** Metadata from the completed server-side draw. */
    seed?: number;
    randomStart?: number;
    ppsProbabilitySummary?: PpsProbabilitySummary;
    ppsResult?: SamplingResultsData["pps"];
    /** For stratified */
    stratifyBy?: string;
    layers?: StratifiedLayer[];
    onClose: () => void;
    onSkipRest?: () => void;
    /** External run/rerun control that should regain focus when the overlay closes. */
    restoreFocusTo?: HTMLElement | null;
    /** Sampled data rows returned from API — when set, displayed as a table in complete phase */
    sampledData?: Array<Record<string, unknown>>;
    /** Total count of sampled rows (may exceed displayed rows) */
    sampledTotal?: number;
}

// ─── Constants ─────────────────────────────────────────────
const POPULATION_TICK_MS = 16;
const POPULATION_TICK_COUNT = 10;
const POPULATION_TO_SAMPLING_DELAY_MS = 200;
const MAX_SAMPLING_TICKS = 60;
const SAMPLING_TICK_MS = 40;
const COMPLETION_DELAY_MS = 1000;

// PPS weight simulation: each dot gets a random "size" in [MIN, MIN + RANGE]
const PPS_WEIGHT_MIN = 0.1;
const PPS_WEIGHT_RANGE = 3;
// Unselected PPS dots use opacity to convey relative size (larger = brighter)
const PPS_OPACITY_MIN = 0.15;
const PPS_OPACITY_RANGE = 0.55; // max opacity = MIN + RANGE = 0.70

const METHOD_META: Record<SamplingMethod, {
    label: string; accent: string; icon: typeof Shuffle;
    accentBg: string; accentBgLight: string; accentText: string;
    accentRing: string; accentBorder: string;
}> = {
    simple: { label: "简单随机抽样", accent: "indigo", icon: Shuffle, accentBg: "bg-primary", accentBgLight: "bg-primary-muted", accentText: "text-primary", accentRing: "ring-primary", accentBorder: "border-primary-border" },
    systematic: { label: "系统抽样", accent: "teal", icon: Target, accentBg: "bg-info", accentBgLight: "bg-info-muted", accentText: "text-info", accentRing: "ring-info", accentBorder: "border-info-border" },
    pps: { label: "PPS抽样", accent: "purple", icon: Target, accentBg: "bg-auxiliary", accentBgLight: "bg-auxiliary-muted", accentText: "text-auxiliary", accentRing: "ring-auxiliary", accentBorder: "border-auxiliary-border" },
    stratified: { label: "分层抽样", accent: "amber", icon: Layers, accentBg: "bg-warning", accentBgLight: "bg-warning-muted", accentText: "text-warning", accentRing: "ring-warning", accentBorder: "border-warning-border" },
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
        populating: "展示示例规模与入样概率...",
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

export function getSystematicPopulationDotClass(index: number, scanIndex: number | undefined) {
    return scanIndex !== undefined && index <= scanIndex ? "bg-info-muted" : "bg-muted";
}

function formatProbability(value: number) {
    if (!Number.isFinite(value)) return "—";
    if (value > 0 && value < 0.0001) return value.toExponential(2);
    return value.toLocaleString("zh-CN", { maximumFractionDigits: 4 });
}

// ─── Memoized dot grid to avoid re-creating 1000 DOM nodes on each tick ───
const DotGrid = memo(function DotGrid({
    totalDots,
    gridColumns,
    visiblePopCount,
    currentSelectIndex,
    dotSelectedAt,
    layerAssignment,
    dotWeights,
    method,
    systematicScanIndex,
}: {
    totalDots: number;
    gridColumns: number;
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
            className="grid w-fit justify-center gap-[2px]"
            style={{ gridTemplateColumns: `repeat(${gridColumns}, minmax(6px, 18px))` }}
            data-testid="sampling-animation-dot-grid"
            data-visual-population={totalDots}
        >
            {Array.from({ length: totalDots }, (_, i) => {
                const visible = i < visiblePopCount;
                const selected = dotSelectedAt[i]! >= 0 && dotSelectedAt[i]! < currentSelectIndex;
                const layerIdx = layerAssignment?.[i] ?? 0;

                let bgClass: string;
                let inlineStyle: React.CSSProperties | undefined;
                if (selected) {
                    if (method === "stratified") {
                        bgClass = `${lc(layerIdx).bg} ring-1 ring-inset ${lc(layerIdx).ring}`;
                    } else {
                        bgClass = `${methodMeta.accentBg} ring-1 ring-inset ${methodMeta.accentRing}`;
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
                        bgClass = getSystematicPopulationDotClass(i, systematicScanIndex);
                    } else {
                        // Already scanned points remain visibly stronger than the pending field.
                        bgClass = method === "systematic"
                            ? getSystematicPopulationDotClass(i, systematicScanIndex)
                            : "bg-input";
                    }
                } else {
                    bgClass = "bg-transparent";
                }

                return (
                    <div
                        key={i}
                        className={`aspect-square rounded-control transition-colors duration-150 ${bgClass}`}
                        style={inlineStyle}
                        aria-hidden="true"
                        data-selected={selected ? "true" : undefined}
                    />
                );
            })}
        </div>
    );
});

// ─── Phase state machine ──────────────────────────────────
type Phase =
    | { type: "intro" }     // show method name + brief explanation
    | { type: "populating" }   // fill grid with population dots
    | { type: "sampling" }    // highlight selected dots one by one
    | { type: "complete" };   // show summary, allow proceed

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
    seed,
    randomStart,
    ppsProbabilitySummary,
    ppsResult,
    stratifyBy,
    layers,
    onClose,
    onSkipRest,
    restoreFocusTo,
    sampledData,
    sampledTotal,
}: Props) {
    const canIllustrate = sampleSize > 0 && (method === "simple" ? Number.isSafeInteger(seed)
        : method === "systematic" ? Number.isFinite(randomStart) && randomStart! >= 0 && Number.isFinite(interval) && interval! > 0 && randomStart! < interval!
            : method === "pps" ? Number.isFinite(randomStart) && randomStart! >= 0 && randomStart! < 1 && Boolean(sizeField && ppsProbabilitySummary)
                : Number.isSafeInteger(seed) && Boolean(stratifyBy && layers?.length));
    const [phase, setPhase] = useState<Phase>({ type: canIllustrate ? "intro" : "complete" });
    const [visiblePopCount, setVisiblePopCount] = useState(0);
    const [currentSelectIndex, setCurrentSelectIndex] = useState(0);
    const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
    const [paused, setPaused] = useState(false);
    const [speed, setSpeed] = useState(1);
    const meta = METHOD_META[method];
    const progressCopy = METHOD_PROGRESS_COPY[method];
    const fieldLabel = FIELD_LABELS[stratifyBy ?? ""] ?? stratifyBy;
    const introDelay = method === "stratified" ? 900 : 700;
    const visualScale = useMemo(
        () => buildSamplingAnimationScale(populationSize, sampleSize),
        [populationSize, sampleSize],
    );
    const visualPopulationSize = visualScale.population;
    const visualSampleSize = visualScale.sample;
    const layerAllocation = useMemo(() => buildStratifiedVisualAllocation(layers ?? [], visualPopulationSize, visualSampleSize), [layers, visualPopulationSize, visualSampleSize]);

    // Prevent body scroll
    useEffect(() => {
        const previous = document.body.style.overflow;
        const background = Array.from(document.body.children).filter((element): element is HTMLElement => element instanceof HTMLElement && element !== overlayRef.current && !element.contains(overlayRef.current)).map(element => ({ element, inert: element.inert }));
        background.forEach(({ element }) => { element.inert = true; });
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = previous; background.forEach(({ element, inert }) => { element.inert = inert; }); };
    }, []);

    // ─── Precompute which dots get selected ───────────────
    const { selectionOrder, layerAssignment, dotSelectedAt, dotWeights } = useMemo(() => {
        const drawRng = createSeededRandom(seed ?? 42);

        let selection: number[] = [];
        let layerMap: number[] | undefined;
        let weights: Float32Array | undefined;

        if (method === "simple") {
            const frame = Array.from({ length: visualPopulationSize }, (_, index) => index);
            selection = performSimpleSamplingWithIndices(frame, visualSampleSize, drawRng).indices;
        } else if (method === "pps") {
            // PPS systematic selection: simulate varying sizes and walk
            // through the cumulative distribution, mirroring the real algorithm.
            // The synthetic size frame remains stable between runs; the saved
            // random start controls which units are highlighted within it.
            const frameRng = createSeededRandom("pps-animation-frame");
            const rawWeights = new Float32Array(visualPopulationSize);
            for (let i = 0; i < visualPopulationSize; i++) {
                rawWeights[i] = frameRng() * PPS_WEIGHT_RANGE + PPS_WEIGHT_MIN;
            }
            // Normalize to 0-1 for visual opacity
            let maxW = 0;
            for (let i = 0; i < visualPopulationSize; i++) {
                if (rawWeights[i]! > maxW) maxW = rawWeights[i]!;
            }
            const normalizedWeights = new Float32Array(visualPopulationSize);
            for (let i = 0; i < visualPopulationSize; i++) {
                normalizedWeights[i] = rawWeights[i]! / maxW;
            }

            const savedRandomUnit = Number.isFinite(randomStart) && randomStart! >= 0 && randomStart! < 1
                ? randomStart!
                : drawRng();
            // Use the production design even for an illustrative frame: certainty
            // units first, then systematic selection on inclusion probabilities.
            selection = performPPSSampling(
                Array.from(rawWeights, size => ({ size })), "size", visualSampleSize, () => savedRandomUnit,
            ).indices;
            weights = normalizedWeights;
        } else if (method === "systematic") {
            // Spread samples evenly across the entire grid so the animation
            // visibly scans from top-left to bottom-right. Reuse the saved
            // random-start fraction when mapping an actual frame to a compressed grid.
            const visualInterval = visualPopulationSize / Math.max(1, visualSampleSize);
            const savedRandomUnit = Number.isFinite(randomStart) && randomStart! >= 0
                && Number.isFinite(interval) && interval! > 0
                ? Math.min(1 - Number.EPSILON, randomStart! / interval!)
                : drawRng();
            const start = savedRandomUnit * visualInterval;
            for (let index = 0; index < visualSampleSize; index += 1) {
                selection.push(Math.floor(start + index * visualInterval));
            }
        } else if (method === "stratified" && layers && layers.length > 0) {
            // Keep both layer sizes and layer samples within the visual frame.
            layerMap = new Array(visualPopulationSize).fill(0);
            let offset = 0;
            const allocation = layerAllocation;

            for (let li = 0; li < layers.length; li++) {
                const dotCount = allocation.population[li] ?? 0;
                for (let d = 0; d < dotCount && offset + d < visualPopulationSize; d++) {
                    layerMap[offset + d] = li;
                }
                // Sample from this layer
                const layerStart = offset;
                const layerEnd = offset + dotCount;
                const layerIndices = Array.from({ length: layerEnd - layerStart }, (_, i) => layerStart + i);
                const visualLayerSample = allocation.sample[li] ?? 0;
                selection.push(...performSimpleSamplingWithIndices(layerIndices, visualLayerSample, drawRng).data);
                offset += dotCount;
            }
        }

        // Precompute a lookup: for each dot, at which selection step it gets highlighted (-1 = never)
        const selectedAtMap = new Int32Array(visualPopulationSize).fill(-1);
        for (let step = 0; step < selection.length; step++) {
            selectedAtMap[selection[step]!] = step;
        }

        return { selectionOrder: selection, layerAssignment: layerMap, dotSelectedAt: selectedAtMap, dotWeights: weights };
    }, [interval, layers, layerAllocation, method, randomStart, seed, visualPopulationSize, visualSampleSize]);

    const finishAnimation = useCallback(() => {
        setVisiblePopCount(visualPopulationSize);
        setCurrentSelectIndex(selectionOrder.length);
        setPhase({ type: "complete" });
    }, [selectionOrder.length, visualPopulationSize]);

    useEffect(() => {
        if (typeof window.matchMedia !== "function") return;
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        const syncMotionPreference = () => {
            setPrefersReducedMotion(reducedMotion.matches);
            if (reducedMotion.matches) finishAnimation();
        };
        syncMotionPreference();
        reducedMotion.addEventListener?.("change", syncMotionPreference);
        return () => reducedMotion.removeEventListener?.("change", syncMotionPreference);
    }, [finishAnimation]);

    const replayAnimation = useCallback(() => {
        setVisiblePopCount(0);
        setCurrentSelectIndex(0);
        setPaused(false);
        setPhase({ type: "intro" });
    }, []);

    // One pending timer, derived from the visible position. Pausing or changing
    // speed cancels it without resetting progress or leaving a phase timer alive.
    useEffect(() => {
        if (paused || prefersReducedMotion || phase.type === "complete") return;
        const delay = phase.type === "intro" ? introDelay
            : phase.type === "populating" ? (visiblePopCount < visualPopulationSize ? POPULATION_TICK_MS : POPULATION_TO_SAMPLING_DELAY_MS)
                : currentSelectIndex < selectionOrder.length ? SAMPLING_TICK_MS : COMPLETION_DELAY_MS;
        const timer = setTimeout(() => {
            if (phase.type === "intro") setPhase({ type: "populating" });
            else if (phase.type === "populating") {
                if (visiblePopCount < visualPopulationSize) setVisiblePopCount(Math.min(visualPopulationSize, visiblePopCount + Math.max(1, Math.ceil(visualPopulationSize / POPULATION_TICK_COUNT))));
                else setPhase({ type: "sampling" });
            } else if (currentSelectIndex < selectionOrder.length) {
                setCurrentSelectIndex(Math.min(selectionOrder.length, currentSelectIndex + Math.max(1, Math.ceil(selectionOrder.length / MAX_SAMPLING_TICKS))));
            } else {
                finishAnimation();
            }
        }, delay / speed);
        return () => clearTimeout(timer);
    }, [phase.type, paused, prefersReducedMotion, speed, introDelay, visiblePopCount, visualPopulationSize, currentSelectIndex, selectionOrder.length, finishAnimation]);

    const stepAnimation = () => {
        setPaused(true);
        setVisiblePopCount(visualPopulationSize);
        if (phase.type !== "sampling") setPhase({ type: "sampling" });
        else if (currentSelectIndex < selectionOrder.length) setCurrentSelectIndex(currentSelectIndex + 1);
        else finishAnimation();
    };

    const progress =
        phase.type === "intro" ? 0
            : phase.type === "populating" ? (visiblePopCount / Math.max(1, visualPopulationSize)) * 30
                : phase.type === "sampling" ? 30 + (currentSelectIndex / Math.max(1, selectionOrder.length)) * 70
                    : 100;

    // ─── Intro explanation text ───────────────────────────
    const introText = useMemo(() => {
        if (method === "simple") {
            return `从 ${populationSize.toLocaleString()} 个总体单位中随机抽取 ${sampleSize} 个样本，每个单位被选中的概率相等。`;
        } else if (method === "systematic") {
            return `将按分数间隔 K=${formatSystematicInterval(interval)} 和随机起点从当前抽样框顺序中抽取 ${sampleSize} 个样本。执行前应检查排序与周期结构，避免其与 K 同步。`;
        } else if (method === "pps") {
            const label = FIELD_LABELS[sizeField ?? ""] ?? sizeField ?? "规模";
            return `按“${label}”赋予不同入样概率，从 ${populationSize.toLocaleString()} 个总体单位中抽取 ${sampleSize} 个样本。`;
        } else {
            const layerList = layers ?? [];
            const layerDescription = layerList.length > LAYER_COLORS.length
                ? `${layerList.length} 层（完整名称与分配见结果凭证）`
                : layerList.map(layer => layer.name).join("、");
            return `先按“${FIELD_LABELS[stratifyBy ?? ""] ?? stratifyBy ?? "分层变量"}”将总体分为 ${layerDescription}，再按各层配置的样本量抽取。`;
        }
    }, [method, populationSize, sampleSize, interval, sizeField, stratifyBy, layers]);

    const systematicIndicator = useMemo(() => {
        if (method !== "systematic" || phase.type !== "sampling" || selectionOrder.length === 0) {
            return null;
        }
        const latestIndex = selectionOrder[Math.max(0, currentSelectIndex - 1)] ?? selectionOrder[0] ?? 0;
        const col = latestIndex % visualScale.gridColumns;
        const row = Math.floor(latestIndex / visualScale.gridColumns);
        return {
            left: `${((col + 0.5) / visualScale.gridColumns) * 100}%`,
            top: `${((row + 0.5) / visualScale.gridRows) * 100}%`,
            scanIndex: latestIndex,
        };
    }, [method, phase.type, selectionOrder, currentSelectIndex, visualScale.gridColumns, visualScale.gridRows]);

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

    const receiptItems = useMemo(() => {
        const fraction = sampleSize / populationSize;
        const items = [
            { label: "总体 → 样本", value: `${populationSize.toLocaleString()} → ${sampleSize.toLocaleString()}` },
            {
                label: "抽样比",
                value: populationSize > 0
                    ? fraction > 0 && fraction < 0.0001 ? "<0.01%"
                        : fraction > 0.9999 && sampleSize < populationSize ? ">99.99%"
                        : fraction.toLocaleString("zh-CN", { style: "percent", maximumFractionDigits: 2 })
                    : "—",
            },
        ];
        if (method === "simple") {
            items.push({ label: "抽样设计", value: "等概率、不放回" });
        } else if (method === "systematic") {
            items.push({ label: "分数间隔 K", value: formatSystematicInterval(interval) });
            if (randomStart !== undefined) items.push({ label: "实际随机起点 r", value: formatProbability(randomStart) });
        } else if (method === "pps") {
            items.push({ label: "规模变量", value: FIELD_LABELS[sizeField ?? ""] ?? sizeField ?? "规模" });
            if (randomStart !== undefined) items.push({ label: "PPS 系统随机起点 u", value: formatProbability(randomStart) });
            if (ppsProbabilitySummary) {
                items.push({
                    label: "纳入概率范围",
                    value: `${formatProbability(ppsProbabilitySummary.minInclusionProbability)}–${formatProbability(ppsProbabilitySummary.maxInclusionProbability)}`,
                });
                items.push({ label: "纳入概率之和 Σπᵢ", value: formatProbability(ppsProbabilitySummary.probabilitySum) });
                if (ppsProbabilitySummary.certaintyUnitCount > 0) {
                    items.push({ label: "必入单位（π=1）", value: `${ppsProbabilitySummary.certaintyUnitCount.toLocaleString()} 个` });
                }
            }
        } else if (layers?.length) {
            const layerPopulation = layers.reduce((sum, layer) => sum + layer.count, 0);
            const layerSample = layers.reduce((sum, layer) => sum + layer.sampleCount, 0);
            items.push({ label: "分层配置", value: `${layers.length} 层；${layerPopulation.toLocaleString()} → ${layerSample.toLocaleString()}` });
        }
        if (seed !== undefined) items.push({ label: "随机种子", value: String(seed) });
        return items;
    }, [interval, layers, method, populationSize, ppsProbabilitySummary, randomStart, sampleSize, seed, sizeField]);

    const Icon = meta.icon;
    const overlayRef = useRef<HTMLDivElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const onCloseRef = useRef(onClose);
    const restoreFocusRef = useRef<HTMLElement | null>(
        restoreFocusTo
        ?? (typeof document !== "undefined"
            && document.activeElement instanceof HTMLElement
            && document.activeElement !== document.body
            ? document.activeElement
            : null),
    );

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            onCloseRef.current();
        };
        document.addEventListener("keydown", handleEscape);
        return () => {
            document.removeEventListener("keydown", handleEscape);
            const opener = restoreFocusRef.current;
            requestAnimationFrame(() => {
                if (opener?.isConnected) opener.focus();
            });
        };
    }, []);

    // The close control changes when the animation reaches its completed phase.
    // Keep a deterministic focus target through that automatic transition.
    useEffect(() => {
        if (!overlayRef.current?.contains(document.activeElement) || document.activeElement === overlayRef.current) closeButtonRef.current?.focus();
    }, [phase.type]);

    const handleOverlayKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== "Tab") return;

        const focusable = [...(overlayRef.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])',
        ) ?? [])].filter((element) => {
            if (element.tabIndex < 0 || element.getClientRects().length === 0) return false;
            // Closed details can retain layout boxes for their hidden content.
            // Only their own summary participates in keyboard navigation.
            for (let parent = element.parentElement; parent; parent = parent.parentElement) {
                if (parent.tagName === "DETAILS" && !parent.hasAttribute("open")
                    && !parent.querySelector(":scope > summary")?.contains(element)) return false;
            }
            return true;
        });
        if (focusable.length === 0) {
            event.preventDefault();
            overlayRef.current?.focus();
            return;
        }
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    };

    const strataKey = method === "stratified" && layers && <div className="space-y-2">
        <div className="flex flex-wrap justify-center gap-2 text-meta text-muted-foreground" data-testid="sampling-animation-strata-legend">
            {layers.length <= LAYER_COLORS.length ? layers.map((layer, index) => <span key={layer.name} className="flex min-w-0 max-w-full items-center gap-2">
                <span className={`h-3 w-3 shrink-0 rounded-circle ${lc(index).bg}`} aria-hidden="true" /><span className="break-all">{layer.name}</span>
            </span>) : <span>共 {layers.length} 层；颜色循环仅区分相邻层，层名与配额见下表</span>}
        </div>
        <div className="grid max-h-24 grid-cols-2 gap-2 overflow-auto text-meta text-muted-foreground" tabIndex={0} role="region" aria-label="各层演示配额">
            {layers.map((layer, index) => <div key={layer.name} aria-current={stratifiedActiveLayer === index ? "step" : undefined} className={`min-w-0 rounded-control border p-2 ${stratifiedActiveLayer === index ? "border-warning-border bg-warning-muted text-foreground" : "border-border bg-card"}`}>
                <p className="break-all">{layer.name}</p>
                <p>总体 {layer.count} → 样本 {layer.sampleCount}</p>
                {layerAllocation.population[index] === 0 ? <p>规模过小，点阵未表示</p> : layerAllocation.sample[index] === 0 && layer.sampleCount > 0 ? <p>入样量过小，点阵未高亮</p> : layer.sampleCount === 0 ? <p>本层不抽取</p> : null}
            </div>)}
        </div>
    </div>;
    const diagramKey = <>
        <p className="mb-3 text-center text-meta text-muted-foreground" data-testid="sampling-animation-scale-note">
            {visualScale.compressed
                ? `比例示意：用 ${visualPopulationSize.toLocaleString()} 个点代表实际总体 ${populationSize.toLocaleString()}，样本高亮按 ${sampleSize.toLocaleString()}/${populationSize.toLocaleString()} 近似映射`
                : `按实际数量绘制：${visualPopulationSize.toLocaleString()} 个点分别代表 ${populationSize.toLocaleString()} 个总体单位`}
        </p>
        <div className="mb-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-meta text-muted-foreground" data-testid="sampling-animation-legend" role="group" aria-label="点阵图例">
            <span className="inline-flex items-center gap-2">
                <span className={`h-3 w-3 rounded-control ${method === "pps" ? `${meta.accentBg} opacity-40` : method === "stratified" ? "bg-warning-muted" : "bg-input"}`} aria-hidden="true" />
                {method === "pps" ? "点亮程度：规模大小（示意）" : method === "stratified" ? (layers && layers.length > LAYER_COLORS.length ? "颜色：循环区分相邻层" : "颜色：所属层") : "浅色：总体单位"}
            </span>
            <span className="inline-flex items-center gap-2">
                <span className={`h-3 w-3 rounded-control ${meta.accentBg} ring-1 ring-inset ${meta.accentRing}`} aria-hidden="true" />实色描边：已选样本
            </span>
        </div>
    </>;

    return createPortal(
        <div
            ref={overlayRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sampling-animation-title"
            tabIndex={-1}
            onKeyDown={handleOverlayKeyDown}
            className="fixed inset-0 z-50 overflow-auto bg-background outline-none"
            data-testid="immersive-sampling-animation"
        >
            <div className="relative flex min-h-full min-w-[64rem] flex-col bg-background">
            {/* Progress bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-muted z-10">
                <div
                    role="progressbar"
                    aria-label={`${meta.label}动画进度`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(progress)}
                    className={`h-full transition-[width] duration-300 ease-out ${meta.accentBg}`}
                    style={{ width: `${progress}%` }}
                />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-3 z-10">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-surface flex items-center justify-center ${meta.accentBgLight}`}>
                        <Icon className={`w-5 h-5 ${meta.accentText}`} />
                    </div>
                    <div>
                        <h2 id="sampling-animation-title" className="text-label font-semibold text-foreground">{meta.label}</h2>
                        <p className="text-meta text-muted-foreground">
                            {phase.type === "intro" && "准备中..."}
                            {phase.type === "populating" && progressCopy.populating}
                            {phase.type === "sampling" && (
                                currentSelectIndex >= selectionOrder.length && selectionOrder.length > 0
                                    ? `演示选取完成 ${sampleProgressDisplay.current}/${sampleProgressDisplay.total}`
                                    : `${progressCopy.sampling} ${sampleProgressDisplay.current}/${sampleProgressDisplay.total}`
                            )}
                            {phase.type === "complete" && "本次抽样结果已保存"}
                        </p>
                        <p className="text-meta text-muted-foreground">机制示意，不是实时计算；点位不用于核对具体入样记录。</p>
                    </div>
                </div>
                {phase.type === "complete" ? (
                    <div className="flex items-center gap-2">
                        {!prefersReducedMotion && canIllustrate && (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={replayAnimation}
                                data-testid="immersive-sampling-replay"
                                className="border-input text-foreground hover:bg-muted"
                            >
                                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                                重播本次动画
                            </Button>
                        )}
                        {onSkipRest && (
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => { onSkipRest(); onClose(); }}
                                data-testid="immersive-sampling-skip-rest"
                                className="text-muted-foreground"
                            >
                                本次实验不再播放
                            </Button>
                        )}
                    <Button
                        ref={closeButtonRef}
                        onClick={onClose}
                        variant="outline"
                        data-testid="immersive-sampling-return"
                        className="border-input text-foreground hover:bg-muted"
                    >
                        关闭
                        <X className="w-4 h-4 ml-1" />
                    </Button>
                    </div>
                ) : (
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={finishAnimation}
                            data-testid="immersive-sampling-skip"
                            className="border-input text-foreground hover:bg-muted"
                        >
                            跳过动画
                        </Button>
                        <button
                            ref={closeButtonRef}
                            type="button"
                            onClick={onClose}
                            className="w-10 h-10 rounded-control flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-none"
                            aria-label="关闭抽样动画"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                )}
            </div>

            <div className="px-6 pb-3 space-y-2">
                {!canIllustrate && <p role="status" className="text-label text-muted-foreground">该历史结果缺少演示所需参数，仅显示已保存结果和独立方法示例，不补造随机过程。</p>}
                <details className="text-meta text-muted-foreground">
                    <summary className="cursor-pointer">方法说明</summary>
                    <div className="mt-2 max-h-64 max-w-3xl overflow-auto leading-relaxed" tabIndex={0} role="region" aria-label="抽样机制说明">
                        <p>{introText}</p>
                        <SamplingMethodExplanation method={method} />
                    </div>
                </details>
                {phase.type !== "complete" && !prefersReducedMotion && (
                    <div className="flex items-center gap-3" role="group" aria-label="演示播放控制">
                        <Button variant="outline" onClick={() => setPaused(value => !value)} data-testid="sampling-animation-pause">{paused ? "继续播放" : "暂停"}</Button>
                        <Button variant="outline" onClick={stepAnimation} data-testid="sampling-animation-step">{phase.type === "sampling" ? currentSelectIndex === selectionOrder.length ? "查看结果" : "选取下一个点" : "进入选取"}</Button>
                        <label className="flex items-center gap-2 text-label">播放速度
                            <select aria-label="播放速度" className="rounded-control border border-input bg-card p-2" value={speed} onChange={event => setSpeed(Number(event.target.value))}>
                                <option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option>
                            </select>
                        </label>
                        <span className="text-meta text-muted-foreground" role="status">{paused ? "已暂停" : "播放中"}</span>
                    </div>
                )}
            </div>

            {/* Main content */}
            <div className={`flex-1 flex px-6 pb-6 overflow-hidden min-h-0 ${phase.type === "complete" ? "flex-col" : "items-center justify-center"}`}>
                {/* Intro phase */}
                {phase.type === "intro" && (
                    <div className="text-center space-y-6 animate-in fade-in zoom-in-95 duration-500 max-w-lg">
                        <div className={`w-20 h-20 mx-auto rounded-surface flex items-center justify-center ${meta.accentBgLight}`}>
                            <Icon className={`w-10 h-10 ${meta.accentText}`} />
                        </div>
                        <h1 className="text-page-title font-bold text-foreground">{meta.label}</h1>
                        <p className="text-muted-foreground leading-relaxed">{introText}</p>
                        <div className="flex items-center justify-center gap-6 text-label">
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Users className="w-4 h-4" />
                                <span>总体 {populationSize.toLocaleString()}</span>
                            </div>
                            <div className={`w-1 h-1 rounded-circle ${meta.accentBg}`} />
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
                        {phase.type !== "complete" && strataKey}

                        {/* Dot grid */}
                        {phase.type !== "complete" && (
                            <div className="relative bg-card rounded-surface border border-border p-4 overflow-hidden">
                                {method === "stratified" && phase.type === "populating" && (
                                    <div className="mb-3 flex items-center justify-center gap-2 text-meta text-warning">
                                        <Layers className="w-3.5 h-3.5" />
                                        <span>先按 {fieldLabel} 分层，再在各层内抽样</span>
                                    </div>
                                )}
                                {method === "pps" && phase.type === "populating" && (
                                    <div className={`mb-3 flex items-center justify-center gap-2 text-meta ${meta.accentText}`}>
                                        <Target className="w-3.5 h-3.5" />
                                        <span>按 {FIELD_LABELS[sizeField ?? ""] ?? sizeField ?? "规模"} 赋予不同权重；亮度仅示意规模差异，不对应具体总体行</span>
                                    </div>
                                )}
                                {diagramKey}
                                <div className="relative mx-auto w-fit">
                                    <DotGrid
                                        totalDots={visualPopulationSize}
                                        gridColumns={visualScale.gridColumns}
                                        visiblePopCount={visiblePopCount}
                                        currentSelectIndex={currentSelectIndex}
                                        dotSelectedAt={dotSelectedAt}
                                        layerAssignment={layerAssignment}
                                        dotWeights={dotWeights}
                                        method={method}
                                        systematicScanIndex={systematicIndicator?.scanIndex}
                                    />
                                    {method === "systematic" && phase.type === "sampling" && systematicIndicator && (
                                        <div className="pointer-events-none absolute inset-0">
                                            <div
                                                className="absolute inset-x-0 h-px bg-info-muted transition-[top] duration-[80ms]"
                                                style={{ top: systematicIndicator.top }}
                                            />
                                            <div
                                                className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-control border-2 border-info bg-background transition-[left,top] duration-[80ms]"
                                                style={{ left: systematicIndicator.left, top: systematicIndicator.top }}
                                            />
                                        </div>
                                    )}
                                </div>

                                {method === "systematic" && phase.type === "sampling" && (
                                    <div className="mt-3 text-center">
                                        <span className={`inline-flex items-center gap-2 rounded-control border ${meta.accentBorder} bg-card px-3 py-1.5 text-meta font-mono ${meta.accentText}`}>
                                            间隔 K = {formatSystematicInterval(interval)}，实际起点 r = {formatProbability(randomStart ?? Number.NaN)}，从总体首端至末端等距抽取
                                        </span>
                                    </div>
                                )}

                                {method === "simple" && phase.type === "sampling" && (
                                    <div className="mt-3 text-center">
                                        <span className={`inline-flex items-center gap-2 bg-card border ${meta.accentBorder} ${meta.accentText} text-meta px-3 py-1.5 rounded-control`}>
                                            <Shuffle className="w-3.5 h-3.5" />
                                            随机种子 {seed === undefined ? "—" : String(seed)}；每个样本点被抽中的机会相同
                                        </span>
                                    </div>
                                )}

                                {method === "pps" && phase.type === "sampling" && (
                                    <div className="mt-3 text-center">
                                        <span className={`inline-flex items-center gap-2 rounded-control border ${meta.accentBorder} bg-card px-3 py-1.5 text-meta ${meta.accentText}`}>
                                            <Target className="w-3.5 h-3.5" />
                                            按 {FIELD_LABELS[sizeField ?? ""] ?? sizeField ?? "规模"} 权重系统选取，实际起点 u = {formatProbability(randomStart ?? Number.NaN)}；点位仅示意机制，不对应具体总体行
                                        </span>
                                    </div>
                                )}

                                {method === "stratified" && phase.type === "sampling" && stratifiedActiveLayer !== null && layers?.[stratifiedActiveLayer] && (
                                    <div className="mt-3 text-center">
                                        <span className={`inline-flex max-w-full flex-wrap items-center justify-center gap-2 rounded-control border ${meta.accentBorder} bg-card px-3 py-1.5 text-meta ${meta.accentText}`} data-testid="sampling-animation-active-stratum">
                                            <div className={`h-2.5 w-2.5 rounded-circle ${lc(stratifiedActiveLayer).bg}`} />
                                            <span className="break-all">层 {stratifiedActiveLayer + 1}/{layers.length}：{layers[stratifiedActiveLayer].name}</span>
                                            <span className="font-mono text-foreground">Nₕ {layers[stratifiedActiveLayer].count} → nₕ {layers[stratifiedActiveLayer].sampleCount}</span>
                                            <span>随机种子 {seed === undefined ? "—" : String(seed)}</span>
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Sampling stats bar */}
                        {phase.type === "sampling" && (
                            <div className="flex items-center justify-between px-2 text-meta text-muted-foreground animate-in fade-in duration-200">
                                <span>总体 {populationSize.toLocaleString()} 个数据点</span>
                                <span className={meta.accentText}>
                                    演示进度 {sampleProgressDisplay.current} / {sampleProgressDisplay.total}
                                </span>
                            </div>
                        )}

                        {/* Complete phase */}
                        {phase.type === "complete" && (
                            <div className="animate-in fade-in duration-300 flex flex-col min-h-0 h-full gap-4">
                                {canIllustrate && <details className="shrink-0 rounded-surface border border-border bg-card p-3" data-testid="sampling-animation-final-diagram">
                                    <summary className="cursor-pointer text-label">查看最终示意图（不对应具体入样记录）</summary>
                                    <div className="mt-3 max-h-64 overflow-auto">
                                        {diagramKey}
                                        {strataKey}
                                        <DotGrid totalDots={visualPopulationSize} gridColumns={visualScale.gridColumns} visiblePopCount={visualPopulationSize} currentSelectIndex={selectionOrder.length} dotSelectedAt={dotSelectedAt} layerAssignment={layerAssignment} dotWeights={dotWeights} method={method} />
                                    </div>
                                </details>}
                                <section className="shrink-0 rounded-surface border border-success-border bg-success-muted p-3" data-testid="sampling-animation-receipt">
                                    <div className="mb-2 flex items-center gap-2 text-success">
                                        <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                                        <h3 className="text-subheading font-semibold">抽样结果凭证</h3>
                                        <span className="text-meta text-muted-foreground">参数来自本次已保存的抽样结果</span>
                                    </div>
                                    <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-2">
                                        {receiptItems.map(item => (
                                            <div key={item.label} className="rounded-control border border-success-border bg-card px-3 py-1.5">
                                                <dt className="text-meta text-muted-foreground">{item.label}</dt>
                                                <dd className="mt-1 break-words text-label font-medium text-foreground">{item.value}</dd>
                                            </div>
                                        ))}
                                    </dl>
                                    {method === "stratified" && layers && layers.length > 0 && (
                                        <details className="mt-2" data-testid="sampling-animation-layer-details">
                                            <summary className="cursor-pointer text-meta font-medium text-foreground">查看各层 Nₕ → nₕ（{layers.length} 层，可滚动查看全部）</summary>
                                            <div
                                                className="mt-2 max-h-24 overflow-auto rounded-control border border-success-border bg-card p-2"
                                                data-testid="sampling-animation-layer-list"
                                                role="region"
                                                tabIndex={0}
                                                aria-label="各层总体与样本分配"
                                            >
                                                <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-x-4 gap-y-2">
                                                    {layers.map(layer => (
                                                        <div key={layer.name} className="flex items-center justify-between gap-3 text-meta">
                                                            <dt className="min-w-0 truncate text-muted-foreground" title={layer.name}>{layer.name}</dt>
                                                            <dd className="shrink-0 font-mono text-foreground">{layer.count} → {layer.sampleCount}</dd>
                                                        </div>
                                                    ))}
                                                </dl>
                                            </div>
                                        </details>
                                    )}
                                </section>
                                {method === "pps" && ppsResult && <details className="shrink-0 text-label">
                                    <summary className="cursor-pointer">查看本次 PPS 纳入概率与权重</summary>
                                    <div className="mt-2 max-h-64 overflow-auto" tabIndex={0}><PpsProbabilityExplanation result={ppsResult} /></div>
                                </details>}
                                {!sampledData ? (
                                    <div role="status" aria-live="polite" className="flex-1 flex flex-col items-center justify-center gap-3 py-8">
                                        <Loader2 aria-hidden="true" className="w-8 h-8 animate-spin text-muted-foreground" />
                                        <p className="text-label text-muted-foreground">正在获取抽样数据...</p>
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
        </div>, document.body
    );
}

// ─── Inline data table for complete phase ────────────────
const PAGE_SIZE = 10;

function SampledDataTable({ data, total }: { data: Array<Record<string, unknown>>; total: number }) {
    const [page, setPage] = useState(1);

    // Reset to page 1 when data changes (e.g. re-execution)
    useEffect(() => { setPage(1); }, [data]);

    if (data.length === 0) {
        return <div className="flex-1 flex items-center justify-center text-label text-muted-foreground italic">暂无抽样数据</div>;
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
                className="min-h-0 flex-1 overflow-auto rounded-surface border border-border"
                role="region"
                tabIndex={0}
                aria-label="抽样结果数据表"
            >
                <table className="w-full text-left min-w-max">
                    <thead className="sticky top-0 bg-muted z-10">
                        <tr>
                            <th className="px-3 py-2 text-meta font-medium text-muted-foreground whitespace-nowrap border-b border-border">#</th>
                            {keys.map((key) => (
                                <th key={key} className="px-3 py-2 text-meta font-medium text-muted-foreground whitespace-nowrap border-b border-border">
                                    {FIELD_LABELS[key] || key}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, rowIndex) => (
                            <tr key={start + rowIndex} className="border-b border-border hover:bg-card">
                                <td className="px-3 py-1.5 text-meta text-muted-foreground font-mono whitespace-nowrap">{start + rowIndex + 1}</td>
                                {keys.map((key) => (
                                    <td key={key} className="px-3 py-1.5 text-meta text-foreground whitespace-nowrap">
                                        {String(row[key] ?? "")}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="flex shrink-0 items-center justify-between rounded-control bg-background px-1">
                <p className="text-meta text-muted-foreground" data-testid="sampling-animation-result-range">
                    显示第 {start + 1}-{end} 条{total > data.length ? `（已加载 ${data.length} 条，共 ${total} 条）` : `，共 ${data.length} 条`}
                </p>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        aria-label="抽样结果上一页"
                        className="h-7 px-2 text-meta border-input text-foreground hover:bg-muted"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage <= 1}
                    >
                        <ChevronLeft className="w-3.5 h-3.5" />
                    </Button>
                    <span className="text-meta text-muted-foreground font-mono tabular-nums">{currentPage}/{totalPages}</span>
                    <Button
                        variant="outline"
                        size="sm"
                        aria-label="抽样结果下一页"
                        className="h-7 px-2 text-meta border-input text-foreground hover:bg-muted"
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
