import { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";
import { X, CheckCircle2, Users, Target, Layers, Shuffle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

type SamplingMethod = "simple" | "systematic" | "stratified";

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
    /** For stratified */
    stratifyBy?: string;
    layers?: StratifiedLayer[];
    /** Called when animation finishes so parent can start the real API call */
    onAnimationComplete: () => void;
    onClose: () => void;
}

// ─── Constants ─────────────────────────────────────────────
const GRID_COLS = 40;
const GRID_ROWS = 25;
const TOTAL_DOTS = GRID_COLS * GRID_ROWS; // 1000 visual dots

const METHOD_META: Record<SamplingMethod, { label: string; color: string; accent: string; icon: typeof Shuffle }> = {
    simple: { label: "简单随机抽样", color: "from-indigo-600/20 to-violet-600/20", accent: "indigo", icon: Shuffle },
    systematic: { label: "系统抽样", color: "from-teal-600/20 to-cyan-600/20", accent: "teal", icon: Target },
    stratified: { label: "分层抽样", color: "from-amber-600/20 to-orange-600/20", accent: "amber", icon: Layers },
};

const LAYER_COLORS = [
    { bg: "bg-rose-500", ring: "ring-rose-400", text: "text-rose-600 dark:text-rose-400" },
    { bg: "bg-sky-500", ring: "ring-sky-400", text: "text-sky-600 dark:text-sky-400" },
    { bg: "bg-emerald-500", ring: "ring-emerald-400", text: "text-emerald-600 dark:text-emerald-400" },
    { bg: "bg-amber-500", ring: "ring-amber-400", text: "text-amber-600 dark:text-amber-400" },
    { bg: "bg-violet-500", ring: "ring-violet-400", text: "text-violet-600 dark:text-violet-400" },
    { bg: "bg-pink-500", ring: "ring-pink-400", text: "text-pink-600 dark:text-pink-400" },
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
    method,
}: {
    visiblePopCount: number;
    currentSelectIndex: number;
    dotSelectedAt: Int32Array;
    layerAssignment: number[] | undefined;
    method: SamplingMethod;
}) {
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
                if (selected) {
                    if (method === "stratified") {
                        bgClass = `${lc(layerIdx).bg} ring-1 ${lc(layerIdx).ring} scale-125`;
                    } else if (method === "simple") {
                        bgClass = "bg-indigo-500 ring-1 ring-indigo-400 scale-125";
                    } else {
                        bgClass = "bg-teal-500 ring-1 ring-teal-400 scale-125";
                    }
                } else if (visible) {
                    if (method === "stratified" && layerAssignment) {
                        bgClass = `${lc(layerIdx).bg} opacity-20`;
                    } else {
                        bgClass = "bg-slate-300 dark:bg-slate-700";
                    }
                } else {
                    bgClass = "bg-transparent";
                }

                return (
                    <div
                        key={i}
                        className={`aspect-square rounded-[2px] transition-all duration-150 ${bgClass}`}
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

export function ImmersiveSamplingAnimation({
    method,
    populationSize,
    sampleSize,
    kValue,
    stratifyBy,
    layers,
    onAnimationComplete,
    onClose,
}: Props) {
    const [phase, setPhase] = useState<Phase>({ type: "intro" });
    const [visiblePopCount, setVisiblePopCount] = useState(0);
    const [currentSelectIndex, setCurrentSelectIndex] = useState(0);
    const animFrameRef = useRef(0);
    const hasCalledComplete = useRef(false);
    const meta = METHOD_META[method];

    // Prevent body scroll
    useEffect(() => {
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = ""; };
    }, []);

    // ─── Precompute which dots get selected ───────────────
    const { selectionOrder, layerAssignment, dotSelectedAt } = useMemo(() => {
        const rng = mulberry32(42);

        let selection: number[] = [];
        let layerMap: number[] | undefined;

        // Scale sample size to visual grid
        const visualSampleSize = Math.min(Math.round((sampleSize / populationSize) * TOTAL_DOTS), TOTAL_DOTS);

        if (method === "simple") {
            const shuffled = shuffleIndices(TOTAL_DOTS, rng);
            selection = shuffled.slice(0, visualSampleSize);
        } else if (method === "systematic") {
            const k = kValue ?? Math.round(populationSize / sampleSize);
            const visualK = Math.max(2, Math.round((k / populationSize) * TOTAL_DOTS));
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

        return { selectionOrder: selection, layerAssignment: layerMap, dotSelectedAt: selectedAtMap };
    }, [method, populationSize, sampleSize, kValue, layers]);

    // ─── Phase transitions ────────────────────────────────
    // Intro → Populating after 1.5s
    useEffect(() => {
        if (phase.type === "intro") {
            const timer = setTimeout(() => setPhase({ type: "populating" }), 1500);
            return () => clearTimeout(timer);
        }
    }, [phase]);

    // Populating animation: fill grid rapidly
    useEffect(() => {
        if (phase.type !== "populating") return;
        const batchSize = 50;
        const interval = setInterval(() => {
            setVisiblePopCount((prev) => {
                const next = Math.min(prev + batchSize, TOTAL_DOTS);
                if (next >= TOTAL_DOTS) {
                    clearInterval(interval);
                    setTimeout(() => setPhase({ type: "sampling" }), 400);
                }
                return next;
            });
        }, 20);
        return () => clearInterval(interval);
    }, [phase]);

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
        const batchSize = Math.max(1, Math.ceil(total / 60)); // ~60 frames total
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
        }, 35);

        return () => clearInterval(interval);
    }, [phase, selectionOrder, onAnimationComplete]);

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
        } else {
            const layerNames = (layers ?? []).map((l) => l.name).join("、");
            const fieldLabel: Record<string, string> = { gender: "性别", education: "学历", age: "年龄段", age_group: "年龄段", income: "收入水平", city: "城市", city_tier: "城市等级" };
            return `先按"${fieldLabel[stratifyBy ?? ""] ?? stratifyBy}"将总体分为 ${layerNames} 等层，再从各层中按比例抽取样本。`;
        }
    }, [method, populationSize, sampleSize, kValue, stratifyBy, layers]);

    const Icon = meta.icon;

    return (
        <div className="fixed inset-0 z-50 bg-white dark:bg-slate-950 flex flex-col" data-testid="immersive-sampling-animation">
            {/* Progress bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-slate-200 dark:bg-slate-800 z-10">
                <div
                    className={`h-full transition-all duration-300 ease-out ${
                        method === "simple" ? "bg-indigo-500" : method === "systematic" ? "bg-teal-500" : "bg-amber-500"
                    }`}
                    style={{ width: `${progress}%` }}
                />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-3 z-10">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        method === "simple" ? "bg-indigo-500/20" : method === "systematic" ? "bg-teal-500/20" : "bg-amber-500/20"
                    }`}>
                        <Icon className={`w-5 h-5 ${
                            method === "simple" ? "text-indigo-600 dark:text-indigo-400" : method === "systematic" ? "text-teal-600 dark:text-teal-400" : "text-amber-600 dark:text-amber-400"
                        }`} />
                    </div>
                    <div>
                        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{meta.label}</h2>
                        <p className="text-xs text-slate-500">
                            {phase.type === "intro" && "准备中..."}
                            {phase.type === "populating" && "生成总体..."}
                            {phase.type === "sampling" && `正在抽样 ${currentSelectIndex}/${selectionOrder.length}`}
                            {phase.type === "complete" && "抽样完成"}
                        </p>
                    </div>
                </div>
                {phase.type !== "complete" && (
                    <button
                        onClick={onClose}
                        className="w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                        aria-label="关闭"
                    >
                        <X className="w-5 h-5" />
                    </button>
                )}
            </div>

            {/* Main content */}
            <div className="flex-1 flex items-center justify-center px-6 pb-6 overflow-hidden">
                {/* Intro phase */}
                {phase.type === "intro" && (
                    <div className="text-center space-y-6 animate-in fade-in zoom-in-95 duration-500 max-w-lg">
                        <div className={`w-20 h-20 mx-auto rounded-2xl flex items-center justify-center ${
                            method === "simple" ? "bg-indigo-500/20" : method === "systematic" ? "bg-teal-500/20" : "bg-amber-500/20"
                        }`}>
                            <Icon className={`w-10 h-10 ${
                                method === "simple" ? "text-indigo-600 dark:text-indigo-400" : method === "systematic" ? "text-teal-600 dark:text-teal-400" : "text-amber-600 dark:text-amber-400"
                            }`} />
                        </div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{meta.label}</h1>
                        <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{introText}</p>
                        <div className="flex items-center justify-center gap-6 text-sm">
                            <div className="flex items-center gap-2 text-slate-500">
                                <Users className="w-4 h-4" />
                                <span>总体 {populationSize.toLocaleString()}</span>
                            </div>
                            <div className={`w-1 h-1 rounded-full ${
                                method === "simple" ? "bg-indigo-500" : method === "systematic" ? "bg-teal-500" : "bg-amber-500"
                            }`} />
                            <div className="flex items-center gap-2 text-slate-500">
                                <Target className="w-4 h-4" />
                                <span>抽取 {sampleSize}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Populating + Sampling + Complete: Show the grid */}
                {phase.type !== "intro" && (
                    <div className="w-full max-w-4xl space-y-4 animate-in fade-in duration-300">
                        {/* Legend for stratified */}
                        {method === "stratified" && layers && phase.type !== "complete" && (
                            <div className="flex flex-wrap items-center justify-center gap-4 mb-2">
                                {layers.map((layer, i) => (
                                    <div key={layer.name} className="flex items-center gap-2">
                                        <div className={`w-3 h-3 rounded-full ${lc(i).bg}`} />
                                        <span className="text-xs text-slate-600 dark:text-slate-400">{layer.name}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Dot grid */}
                        {phase.type !== "complete" && (
                            <div className="relative bg-slate-50/50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 overflow-hidden">
                                <DotGrid
                                    visiblePopCount={visiblePopCount}
                                    currentSelectIndex={currentSelectIndex}
                                    dotSelectedAt={dotSelectedAt}
                                    layerAssignment={layerAssignment}
                                    method={method}
                                />

                                {/* Systematic: show interval indicator */}
                                {method === "systematic" && phase.type === "sampling" && (
                                    <div className="absolute bottom-3 left-0 right-0 text-center">
                                        <span className="inline-flex items-center gap-2 bg-slate-50/90 dark:bg-slate-900/90 border border-teal-500/30 text-teal-600 dark:text-teal-400 text-xs font-mono px-3 py-1.5 rounded-full">
                                            间隔 K = {kValue}，等距抽取
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Sampling stats bar */}
                        {phase.type === "sampling" && (
                            <div className="flex items-center justify-between px-2 text-xs text-slate-500 animate-in fade-in duration-200">
                                <span>总体 {TOTAL_DOTS} 个数据点</span>
                                <span className={
                                    method === "simple" ? "text-indigo-600 dark:text-indigo-400" : method === "systematic" ? "text-teal-600 dark:text-teal-400" : "text-amber-600 dark:text-amber-400"
                                }>
                                    已选中 {currentSelectIndex} / {selectionOrder.length}
                                </span>
                            </div>
                        )}

                        {/* Complete phase */}
                        {phase.type === "complete" && (
                            <div className="text-center space-y-6 animate-in fade-in zoom-in-95 duration-500 py-8">
                                <div className="w-20 h-20 mx-auto rounded-full bg-emerald-500/20 flex items-center justify-center animate-in zoom-in duration-500">
                                    <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                                </div>
                                <div className="space-y-2">
                                    <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">抽样执行完成</h2>
                                    <p className="text-slate-600 dark:text-slate-400">
                                        {meta.label}已成功完成，正在获取样本数据...
                                    </p>
                                </div>

                                {/* Method-specific summary */}
                                <div className="max-w-sm mx-auto bg-slate-50/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">抽样方法</span>
                                        <span className="text-slate-800 dark:text-slate-200 font-medium">{meta.label}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">总体规模</span>
                                        <span className="text-slate-800 dark:text-slate-200 font-mono">{populationSize.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">目标样本量</span>
                                        <span className="text-slate-800 dark:text-slate-200 font-mono">{sampleSize}</span>
                                    </div>
                                    {method === "systematic" && kValue && (
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-500">间隔 K</span>
                                            <span className="text-slate-800 dark:text-slate-200 font-mono">{kValue}</span>
                                        </div>
                                    )}
                                    {method === "stratified" && layers && (
                                        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                                            <div className="text-xs text-slate-500 text-left">各层分配：</div>
                                            {layers.map((layer, i) => (
                                                <div key={layer.name} className="flex justify-between text-sm">
                                                    <span className={`flex items-center gap-2 ${lc(i).text}`}>
                                                        <div className={`w-2 h-2 rounded-full ${lc(i).bg}`} />
                                                        {layer.name}
                                                    </span>
                                                    <span className="text-slate-700 dark:text-slate-300 font-mono">{layer.sampleCount}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <Button
                                    onClick={onClose}
                                    size="lg"
                                    data-testid="immersive-sampling-return"
                                    className={`px-10 py-6 rounded-xl text-base text-white shadow-lg ${
                                        method === "simple" ? "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20"
                                            : method === "systematic" ? "bg-teal-600 hover:bg-teal-700 shadow-teal-500/20"
                                                : "bg-amber-600 hover:bg-amber-700 shadow-amber-500/20"
                                    }`}
                                >
                                    查看抽样结果
                                    <ArrowRight className="w-5 h-5 ml-2" />
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
