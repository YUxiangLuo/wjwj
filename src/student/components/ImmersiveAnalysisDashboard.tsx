import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { X, BarChart3, TrendingUp, Layers, Activity, AlertTriangle } from "lucide-react";

/* ── types ── */
type MethodKey = "simple" | "systematic" | "pps" | "stratified";
type SampleRow = Record<string, unknown>;

interface MethodMeta {
    label: string;
    color: string;
    glow: string;
    icon: typeof BarChart3;
}

interface Props {
    methodRows: Record<MethodKey, SampleRow[]>;
    populationStats: Record<string, Record<string, number>>;
    numericFields: string[];
    categoricalFields: string[];
    onClose: () => void;
}

/* ── constants ── */
const METHOD_META: Record<MethodKey, MethodMeta> = {
    simple: { label: "简单随机抽样", color: "#6366f1", glow: "shadow-indigo-500/30", icon: BarChart3 },
    systematic: { label: "系统抽样", color: "#14b8a6", glow: "shadow-teal-500/30", icon: TrendingUp },
    pps: { label: "PPS抽样", color: "#a855f7", glow: "shadow-purple-500/30", icon: Activity },
    stratified: { label: "分层抽样", color: "#f59e0b", glow: "shadow-amber-500/30", icon: Layers },
};

const METHODS: MethodKey[] = ["simple", "systematic", "pps", "stratified"];

/* ── helpers ── */
function toNumber(v: unknown): number | null {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
        const n = Number(v.trim().replace(/,/g, ""));
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

function calcMean(rows: SampleRow[], field: string) {
    const vals = rows.map((r) => toNumber(r[field])).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
}

function calcStdError(rows: SampleRow[], field: string) {
    const vals = rows.map((r) => toNumber(r[field])).filter((v): v is number => v !== null);
    if (vals.length <= 1) return 0;
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (vals.length - 1);
    return Math.sqrt(variance) / Math.sqrt(vals.length);
}

function calcDistribution(rows: SampleRow[], field: string): Record<string, number> {
    if (!rows.length) return {};
    const counts: Record<string, number> = {};
    for (const row of rows) {
        const v = String(row[field] ?? "").trim();
        if (v) counts[v] = (counts[v] ?? 0) + 1;
    }
    const total = rows.length;
    const result: Record<string, number> = {};
    for (const [k, c] of Object.entries(counts)) {
        result[k] = (c / total) * 100;
    }
    return result;
}

function calcDeviation(
    methodRows: Record<MethodKey, SampleRow[]>,
    field: string,
    populationStats: Record<string, Record<string, number>>
): Record<MethodKey, number> {
    const popField = populationStats[field];
    if (!popField) return { simple: 0, systematic: 0, pps: 0, stratified: 0 };
    const totalPop = Object.values(popField).reduce((s, v) => s + v, 0);
    if (!totalPop) return { simple: 0, systematic: 0, pps: 0, stratified: 0 };

    const categories = new Set(Object.keys(popField));
    for (const m of METHODS) {
        for (const row of methodRows[m]) {
            const v = String(row[field] ?? "").trim();
            if (v) categories.add(v);
        }
    }

    const result: Record<string, number> = {};
    for (const m of METHODS) {
        const mRows = methodRows[m];
        if (!mRows.length) { result[m] = 0; continue; }
        const counts: Record<string, number> = {};
        for (const row of mRows) {
            const v = String(row[field] ?? "").trim();
            if (v) counts[v] = (counts[v] ?? 0) + 1;
        }
        let totalDiff = 0;
        for (const cat of categories) {
            const popProp = ((popField[cat] ?? 0) / totalPop) * 100;
            const sampleProp = ((counts[cat] ?? 0) / mRows.length) * 100;
            totalDiff += Math.abs(sampleProp - popProp);
        }
        result[m] = totalDiff / categories.size;
    }
    return result as Record<MethodKey, number>;
}

/* ── animated counter hook ── */
function useAnimatedNumber(target: number, duration: number, delay: number, decimals = 2) {
    const [current, setCurrent] = useState(0);
    const rafRef = useRef(0);

    useEffect(() => {
        let start: number | null = null;
        let startValue = 0;

        const animate = (ts: number) => {
            if (!start) {
                start = ts + delay;
                startValue = 0;
            }
            if (ts < start) {
                rafRef.current = requestAnimationFrame(animate);
                return;
            }
            const elapsed = ts - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - (1 - progress) ** 3; // ease-out cubic
            setCurrent(startValue + (target - startValue) * eased);
            if (progress < 1) {
                rafRef.current = requestAnimationFrame(animate);
            }
        };

        rafRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(rafRef.current);
    }, [target, duration, delay]);

    return Number(current.toFixed(decimals));
}

/* ── mini bar chart (horizontal) ── */
function MiniBarChart({
    rows,
    color,
    maxVal,
}: {
    rows: { label: string; value: number }[];
    color: string;
    maxVal: number;
}) {
    return (
        <div className="space-y-1.5">
            {rows.map((r) => (
                <div key={r.label} className="flex items-center gap-2">
                    <span className="w-16 text-[10px] text-slate-500 truncate text-right">{r.label}</span>
                    <div className="flex-1 h-2 rounded bg-slate-200 dark:bg-slate-800 overflow-hidden">
                        <div
                            className="h-full rounded transition-all duration-1000 ease-out"
                            style={{
                                width: `${maxVal > 0 ? Math.min((r.value / maxVal) * 100, 100) : 0}%`,
                                backgroundColor: color,
                            }}
                        />
                    </div>
                    <span className="w-12 text-[10px] text-slate-500 font-mono">{r.value.toFixed(1)}%</span>
                </div>
            ))}
        </div>
    );
}

/* ── main ── */
export function ImmersiveAnalysisDashboard({
    methodRows,
    populationStats,
    numericFields,
    categoricalFields,
    onClose,
}: Props) {
    const [phase, setPhase] = useState<"entering" | "visible" | "exiting">("entering");
    const [selectedNumField, setSelectedNumField] = useState(numericFields[0] ?? "");
    const [selectedCatField, setSelectedCatField] = useState(categoricalFields[0] ?? "");

    useEffect(() => {
        const t = setTimeout(() => setPhase("visible"), 50);
        return () => clearTimeout(t);
    }, []);

    const handleClose = useCallback(() => {
        setPhase("exiting");
        setTimeout(onClose, 300);
    }, [onClose]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") handleClose();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [handleClose]);

    // computed stats
    const totalSamples = METHODS.reduce((s, m) => s + methodRows[m].length, 0);

    const methodStats = useMemo(() => {
        return METHODS.map((m) => {
            const rows = methodRows[m];
            const mean = selectedNumField ? calcMean(rows, selectedNumField) : 0;
            const stdErr = selectedNumField ? calcStdError(rows, selectedNumField) : 0;
            return { method: m, count: rows.length, mean, stdErr };
        });
    }, [methodRows, selectedNumField]);

    const distributionData = useMemo<Record<MethodKey, Record<string, number>>>(() => {
        if (!selectedCatField) return { simple: {}, systematic: {}, pps: {}, stratified: {} };
        const result: Record<MethodKey, Record<string, number>> = {
            simple: {},
            systematic: {},
            pps: {},
            stratified: {},
        };
        for (const m of METHODS) {
            result[m] = calcDistribution(methodRows[m], selectedCatField);
        }
        return result;
    }, [methodRows, selectedCatField]);

    const allCategories = useMemo(() => {
        if (!selectedCatField) return [];
        const cats = new Set<string>();
        for (const m of METHODS) {
            Object.keys(distributionData[m] ?? {}).forEach((k) => cats.add(k));
        }
        const popField = populationStats[selectedCatField];
        if (popField) Object.keys(popField).forEach((k) => cats.add(k));
        return Array.from(cats).sort((a, b) => a.localeCompare(b, "zh-CN"));
    }, [distributionData, selectedCatField, populationStats]);

    const deviations = useMemo(() => {
        if (!selectedCatField) return { simple: 0, systematic: 0, pps: 0, stratified: 0 };
        return calcDeviation(methodRows, selectedCatField, populationStats);
    }, [methodRows, selectedCatField, populationStats]);

    // animated counters for header
    const animTotal = useAnimatedNumber(totalSamples, 1200, 300, 0);
    const animMethods = useAnimatedNumber(3, 800, 500, 0);

    const opacityClass = phase === "visible" ? "opacity-100" : "opacity-0";
    const scaleClass = phase === "visible" ? "scale-100" : "scale-95";

    return (
        <div
            className={`fixed inset-0 z-50 bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm flex flex-col transition-opacity duration-300 ${opacityClass}`}
        >
            {/* top bar */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200/60 dark:border-slate-800/60">
                <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">数据分析仪表盘</span>
                    <span className="text-xs text-slate-400 dark:text-slate-600">LIVE DASHBOARD</span>
                </div>
                <button
                    onClick={handleClose}
                    className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* content */}
            <div
                className={`flex-1 overflow-auto p-4 md:p-6 transition-all duration-500 ${scaleClass} ${opacityClass}`}
            >
                {/* header stats bar */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    <StatCard label="总样本量" value={animTotal} color="text-indigo-600 dark:text-indigo-400" />
                    <StatCard label="抽样方法" value={animMethods} color="text-teal-600 dark:text-teal-400" />
                    <StatCard label="数值变量" value={numericFields.length} color="text-amber-600 dark:text-amber-400" />
                    <StatCard label="分类变量" value={categoricalFields.length} color="text-rose-600 dark:text-rose-400" />
                </div>

                {/* field selectors */}
                <div className="flex flex-wrap gap-3 mb-6">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">数值变量:</span>
                        <select
                            value={selectedNumField}
                            onChange={(e) => setSelectedNumField(e.target.value)}
                            className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500"
                        >
                            {numericFields.map((f) => (
                                <option key={f} value={f}>{f}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">分类变量:</span>
                        <select
                            value={selectedCatField}
                            onChange={(e) => setSelectedCatField(e.target.value)}
                            className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:border-indigo-500"
                        >
                            {categoricalFields.map((f) => (
                                <option key={f} value={f}>{f}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* main grid: 3 method cards */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                    {METHODS.map((m, mi) => {
                        const meta = METHOD_META[m];
                        const stat = methodStats[mi]!;
                        const Icon = meta.icon;
                        const dist = distributionData[m];
                        const distRows = allCategories.map((cat) => ({
                            label: cat,
                            value: dist[cat] ?? 0,
                        }));
                        const maxDist = Math.max(...distRows.map((r) => r.value), 1);

                        return (
                            <div
                                key={m}
                                className={`rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 p-5 shadow-lg ${meta.glow} transition-all duration-700`}
                                style={{
                                    animationDelay: `${mi * 150}ms`,
                                    opacity: phase === "visible" ? 1 : 0,
                                    transform: phase === "visible" ? "translateY(0)" : "translateY(20px)",
                                    transitionDelay: `${mi * 150}ms`,
                                }}
                            >
                                {/* method header */}
                                <div className="flex items-center gap-3 mb-4">
                                    <div
                                        className="w-10 h-10 rounded-xl flex items-center justify-center"
                                        style={{ backgroundColor: `${meta.color}20` }}
                                    >
                                        <Icon className="w-5 h-5" style={{ color: meta.color }} />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{meta.label}</h3>
                                        <p className="text-xs text-slate-500">{stat.count} 样本</p>
                                    </div>
                                </div>

                                {/* key metrics */}
                                <div className="grid grid-cols-2 gap-3 mb-4">
                                    <MetricBox
                                        label="均值"
                                        value={stat.mean}
                                        color={meta.color}
                                        delay={mi * 150 + 300}
                                    />
                                    <MetricBox
                                        label="标准误"
                                        value={stat.stdErr}
                                        color={meta.color}
                                        delay={mi * 150 + 500}
                                    />
                                </div>

                                {/* deviation indicator */}
                                <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-slate-200/60 dark:bg-slate-800/60">
                                    <AlertTriangle className="w-3.5 h-3.5 text-slate-500" />
                                    <span className="text-[11px] text-slate-500">分布偏差</span>
                                    <span className="ml-auto text-sm font-mono" style={{ color: meta.color }}>
                                        <AnimNum target={deviations[m]} delay={mi * 150 + 700} />%
                                    </span>
                                </div>

                                {/* mini distribution chart */}
                                {distRows.length > 0 && (
                                    <div>
                                        <div className="text-[10px] text-slate-400 dark:text-slate-600 uppercase tracking-wider mb-2">
                                            {selectedCatField} 分布
                                        </div>
                                        <MiniBarChart rows={distRows} color={meta.color} maxVal={maxDist} />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* bottom: comparison chart (horizontal bars for mean comparison) */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 p-5">
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        {selectedNumField ? `${selectedNumField} — 三方法对比` : "均值对比"}
                    </h3>
                    {selectedNumField ? (
                        <ComparisonBars stats={methodStats} />
                    ) : (
                        <div className="text-sm text-slate-400 dark:text-slate-600 text-center py-8">无可用数值变量</div>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ── sub-components ── */

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 px-4 py-3">
            <div className="text-[11px] text-slate-500 mb-1">{label}</div>
            <div className={`text-2xl font-bold font-mono ${color}`}>{Math.round(value)}</div>
        </div>
    );
}

function MetricBox({
    label,
    value,
    color,
    delay,
}: {
    label: string;
    value: number;
    color: string;
    delay: number;
}) {
    const animated = useAnimatedNumber(value, 1000, delay);
    return (
        <div className="rounded-lg bg-slate-200/50 dark:bg-slate-800/50 px-3 py-2">
            <div className="text-[10px] text-slate-500 mb-0.5">{label}</div>
            <div className="text-lg font-bold font-mono" style={{ color }}>
                {animated.toFixed(2)}
            </div>
        </div>
    );
}

function AnimNum({ target, delay }: { target: number; delay: number }) {
    const v = useAnimatedNumber(target, 1000, delay);
    return <>{v.toFixed(2)}</>;
}

function ComparisonBars({
    stats,
}: {
    stats: { method: MethodKey; count: number; mean: number; stdErr: number }[];
}) {
    const maxMean = Math.max(...stats.map((s) => s.mean), 1);
    const maxErr = Math.max(...stats.map((s) => s.stdErr), 0.01);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* mean bars */}
            <div>
                <div className="text-[10px] text-slate-400 dark:text-slate-600 uppercase tracking-wider mb-3">均值</div>
                <div className="space-y-3">
                    {stats.map((s) => {
                        const meta = METHOD_META[s.method];
                        const pct = (s.mean / maxMean) * 100;
                        return (
                            <div key={s.method}>
                                <div className="flex justify-between mb-1">
                                    <span className="text-xs text-slate-600 dark:text-slate-400">{meta.label}</span>
                                    <span className="text-xs font-mono" style={{ color: meta.color }}>
                                        {s.mean.toFixed(2)}
                                    </span>
                                </div>
                                <div className="h-3 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-1000 ease-out"
                                        style={{
                                            width: `${Math.max(0, Math.min(100, pct))}%`,
                                            backgroundColor: meta.color,
                                        }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* std error bars */}
            <div>
                <div className="text-[10px] text-slate-400 dark:text-slate-600 uppercase tracking-wider mb-3">标准误</div>
                <div className="space-y-3">
                    {stats.map((s) => {
                        const meta = METHOD_META[s.method];
                        const pct = (s.stdErr / maxErr) * 100;
                        return (
                            <div key={s.method}>
                                <div className="flex justify-between mb-1">
                                    <span className="text-xs text-slate-600 dark:text-slate-400">{meta.label}</span>
                                    <span className="text-xs font-mono" style={{ color: meta.color }}>
                                        {s.stdErr.toFixed(4)}
                                    </span>
                                </div>
                                <div className="h-3 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-1000 ease-out"
                                        style={{
                                            width: `${Math.max(0, Math.min(100, pct))}%`,
                                            backgroundColor: meta.color,
                                            opacity: 0.7,
                                        }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

export default ImmersiveAnalysisDashboard;
