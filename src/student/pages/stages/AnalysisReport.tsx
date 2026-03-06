import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BarChart3, Download, FileText, Send, Loader2, Sparkles, AlertCircle, Maximize2, CheckCircle } from "lucide-react";
import { getRichTextPlainLength } from "@/utils/rich-text";
import { formatSaveTime } from "@/utils/format";
import { useExperiment } from "../ExperimentLayout";
import { RichTextEditor } from "../../components/RichTextEditor";
import { experimentApi } from "../../api-client";

interface AnalysisReportProps {
    onPrev: () => void;
    onSubmit: () => void;
}

type MethodKey = "simple" | "systematic" | "stratified";
type ZoomChartType = "mean" | "dist" | "error" | "represent" | null;
type SampleRow = Record<string, unknown>;

interface ChartSeries {
    key: string;
    label: string;
    color: string;
}

interface ChartRow {
    label: string;
    values: Record<string, number>;
}

const METHOD_META: Record<MethodKey, { label: string; color: string }> = {
    simple: { label: "简单随机", color: "#6366f1" },
    systematic: { label: "系统抽样", color: "#14b8a6" },
    stratified: { label: "分层抽样", color: "#f59e0b" },
};

const POPULATION_SERIES: ChartSeries = { key: "population", label: "总体", color: "#94a3b8" };

function sanitizeFileName(input: string) {
    return input.replace(/[\\/:*?"<>|\s]+/g, "_").replace(/_+/g, "_");
}

function escapeXml(input: string) {
    return input
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function toNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
        const normalized = value.trim().replace(/,/g, "");
        if (!normalized) return null;
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function calculateMean(rows: SampleRow[], field: string) {
    const values = rows
        .map((row) => toNumber(row[field]))
        .filter((value): value is number => value !== null);
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function calculateStdError(rows: SampleRow[], field: string) {
    const values = rows
        .map((row) => toNumber(row[field]))
        .filter((value): value is number => value !== null);
    if (values.length <= 1) return 0;

    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
    const stdDev = Math.sqrt(variance);
    return stdDev / Math.sqrt(values.length);
}

function collectNumericFields(rows: SampleRow[]) {
    const fieldStats = new Map<string, { numericCount: number; totalCount: number }>();

    for (const row of rows) {
        for (const key of Object.keys(row)) {
            const stat = fieldStats.get(key) ?? { numericCount: 0, totalCount: 0 };
            const rawValue = row[key];
            if (rawValue !== null && rawValue !== undefined && String(rawValue).trim() !== "") {
                stat.totalCount += 1;
                if (toNumber(rawValue) !== null) {
                    stat.numericCount += 1;
                }
            }
            fieldStats.set(key, stat);
        }
    }

    return Array.from(fieldStats.entries())
        .filter(([, stat]) => stat.totalCount > 0 && stat.numericCount / stat.totalCount >= 0.8 && stat.numericCount >= 2)
        .map(([field]) => field)
        .sort();
}

function collectCategoricalFields(
    rows: SampleRow[],
    populationStats: Record<string, Record<string, number>>
) {
    const fields = new Set<string>(Object.keys(populationStats));

    for (const row of rows) {
        for (const key of Object.keys(row)) {
            const rawValue = row[key];
            if (rawValue === null || rawValue === undefined) continue;
            if (toNumber(rawValue) === null) {
                fields.add(key);
            }
        }
    }

    return Array.from(fields).sort();
}

function buildDistributionRows(
    field: string,
    methodRows: Record<MethodKey, SampleRow[]>,
    populationStats: Record<string, Record<string, number>>
) {
    if (!field) {
        return { rows: [] as ChartRow[], withPopulation: false };
    }

    const categories = new Set<string>();

    (Object.keys(methodRows) as MethodKey[]).forEach((method) => {
        for (const row of methodRows[method]) {
            const raw = row[field];
            if (raw === null || raw === undefined) continue;
            const category = String(raw).trim();
            if (category) categories.add(category);
        }
    });

    const populationFieldStats = populationStats[field];
    if (populationFieldStats) {
        Object.keys(populationFieldStats).forEach((category) => categories.add(category));
    }

    const orderedCategories = Array.from(categories).sort((a, b) => a.localeCompare(b, "zh-CN"));
    const rows = orderedCategories.map((category) => {
        const values: Record<string, number> = {};

        (Object.keys(methodRows) as MethodKey[]).forEach((method) => {
            const rowsOfMethod = methodRows[method];
            if (rowsOfMethod.length === 0) {
                values[method] = 0;
                return;
            }

            const count = rowsOfMethod.filter((row) => String(row[field] ?? "").trim() === category).length;
            values[method] = (count / rowsOfMethod.length) * 100;
        });

        if (populationFieldStats) {
            const totalPopulation = Object.values(populationFieldStats).reduce((sum, value) => sum + value, 0);
            const categoryCount = populationFieldStats[category] ?? 0;
            values.population = totalPopulation > 0 ? (categoryCount / totalPopulation) * 100 : 0;
        }

        return { label: category, values };
    });

    return { rows, withPopulation: Boolean(populationFieldStats) };
}

function buildRepresentativenessRows(
    numericFields: string[],
    categoricalFields: string[],
    methodRows: Record<MethodKey, SampleRow[]>,
    populationStats: Record<string, Record<string, number>>
) {
    const rows: ChartRow[] = [];

    // Numeric fields: populationStats only contains categorical distributions,
    // so we use the combined-sample mean as a proxy for the population mean.
    for (const field of numericFields) {
        const allValues: number[] = [];
        for (const method of Object.keys(methodRows) as MethodKey[]) {
            for (const row of methodRows[method]) {
                const v = toNumber(row[field]);
                if (v !== null) allValues.push(v);
            }
        }
        if (allValues.length === 0) continue;
        const combinedMean = allValues.reduce((s, v) => s + v, 0) / allValues.length;
        if (combinedMean === 0) continue;

        const values: Record<string, number> = {};
        for (const method of Object.keys(METHOD_META) as MethodKey[]) {
            const methodMean = calculateMean(methodRows[method], field);
            values[method] = Math.abs(methodMean - combinedMean) / Math.abs(combinedMean) * 100;
        }
        rows.push({ label: `${field}（均值偏差）`, values });
    }

    // Categorical fields: average absolute proportion difference vs population.
    // Categories are the union of population and sample categories.
    for (const field of categoricalFields) {
        const popFieldStats = populationStats[field];
        if (!popFieldStats) continue;
        const totalPop = Object.values(popFieldStats).reduce((s, v) => s + v, 0);
        if (totalPop === 0) continue;

        // Build union of population + sample categories
        const categorySet = new Set<string>(Object.keys(popFieldStats));
        for (const method of Object.keys(methodRows) as MethodKey[]) {
            for (const row of methodRows[method]) {
                const val = String(row[field] ?? "").trim();
                if (val) categorySet.add(val);
            }
        }
        const categories = Array.from(categorySet);

        const values: Record<string, number> = {};

        for (const method of Object.keys(METHOD_META) as MethodKey[]) {
            const mRows = methodRows[method];
            if (mRows.length === 0) { values[method] = 0; continue; }

            // Precompute frequency map for this method and field (single pass)
            const categoryCounts: Record<string, number> = {};
            for (const row of mRows) {
                const key = String(row[field] ?? "").trim();
                categoryCounts[key] = (categoryCounts[key] ?? 0) + 1;
            }

            let totalDiff = 0;
            for (const cat of categories) {
                const popProp = (popFieldStats[cat] ?? 0) / totalPop * 100;
                const sampleCount = categoryCounts[cat] ?? 0;
                const sampleProp = (sampleCount / mRows.length) * 100;
                totalDiff += Math.abs(sampleProp - popProp);
            }
            values[method] = totalDiff / categories.length;
        }
        rows.push({ label: `${field}（分布偏差）`, values });
    }

    return rows;
}

function triggerSvgDownload(fileName: string, svgContent: string) {
    const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function downloadChartAsSvg(params: {
    title: string;
    rows: ChartRow[];
    series: ChartSeries[];
    fileName: string;
    unit?: string;
}) {
    const { title, rows, series, fileName, unit = "" } = params;
    if (rows.length === 0 || series.length === 0) return;

    const values = rows.flatMap((row) => series.map((s) => row.values[s.key] ?? 0));
    const maxValue = Math.max(...values, 1);

    const width = 1080;
    const height = 620;
    const margin = { top: 90, right: 60, bottom: 150, left: 90 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const groupWidth = plotWidth / rows.length;
    const barGroupWidth = groupWidth * 0.72;
    const barWidth = barGroupWidth / Math.max(series.length, 1);

    const gridLines = Array.from({ length: 6 }, (_, i) => {
        const ratio = i / 5;
        const y = margin.top + plotHeight * (1 - ratio);
        const value = maxValue * ratio;
        return { y, value };
    });

    const legend = series
        .map((s, index) => {
            const x = margin.left + index * 180;
            return `
      <rect x="${x}" y="38" width="14" height="14" rx="3" fill="${s.color}" />
      <text x="${x + 22}" y="49" fill="#cbd5e1" font-size="14">${escapeXml(s.label)}</text>
    `;
        })
        .join("\n");

    const bars = rows
        .map((row, rowIndex) => {
            const groupStart = margin.left + rowIndex * groupWidth + (groupWidth - barGroupWidth) / 2;
            const rowBars = series
                .map((s, seriesIndex) => {
                    const value = row.values[s.key] ?? 0;
                    const barHeight = maxValue > 0 ? (value / maxValue) * plotHeight : 0;
                    const x = groupStart + seriesIndex * barWidth;
                    const y = margin.top + plotHeight - barHeight;
                    const labelY = y - 8;
                    return `
          <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${Math.max(barWidth - 4, 1).toFixed(2)}" height="${barHeight.toFixed(2)}" rx="4" fill="${s.color}" />
          <text x="${(x + (barWidth - 4) / 2).toFixed(2)}" y="${labelY.toFixed(2)}" text-anchor="middle" fill="#94a3b8" font-size="11">${value.toFixed(2)}${escapeXml(unit)}</text>
        `;
                })
                .join("\n");

            const labelX = groupStart + barGroupWidth / 2;
            return `
        ${rowBars}
        <text x="${labelX.toFixed(2)}" y="${(margin.top + plotHeight + 28).toFixed(2)}" text-anchor="middle" fill="#cbd5e1" font-size="12">${escapeXml(row.label)}</text>
      `;
        })
        .join("\n");

    const grid = gridLines
        .map((line) => `
      <line x1="${margin.left}" y1="${line.y.toFixed(2)}" x2="${(margin.left + plotWidth).toFixed(2)}" y2="${line.y.toFixed(2)}" stroke="#334155" stroke-width="1" />
      <text x="${margin.left - 12}" y="${(line.y + 4).toFixed(2)}" text-anchor="end" fill="#64748b" font-size="11">${line.value.toFixed(1)}${escapeXml(unit)}</text>
    `)
        .join("\n");

    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#020617" />
  <text x="${margin.left}" y="30" fill="#e2e8f0" font-size="22" font-weight="700">${escapeXml(title)}</text>
  ${legend}
  ${grid}
  <line x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${margin.left + plotWidth}" y2="${margin.top + plotHeight}" stroke="#475569" stroke-width="1.2" />
  <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotHeight}" stroke="#475569" stroke-width="1.2" />
  ${bars}
</svg>`.trim();

    triggerSvgDownload(fileName, svg);
}

function ChartBars({
    rows,
    series,
    unit = "",
    emptyMessage,
    heightClass = "h-72",
}: {
    rows: ChartRow[];
    series: ChartSeries[];
    unit?: string;
    emptyMessage: string;
    heightClass?: string;
}) {
    const maxValue = useMemo(() => {
        const values = rows.flatMap((row) => series.map((s) => row.values[s.key] ?? 0));
        return Math.max(...values, 1);
    }, [rows, series]);

    if (rows.length === 0) {
        return (
            <div className={`${heightClass} rounded-2xl bg-slate-950/30 border border-slate-800 flex items-center justify-center text-slate-500 text-sm`}>
                {emptyMessage}
            </div>
        );
    }

    return (
        <div className={`${heightClass} rounded-2xl bg-slate-950/30 border border-slate-800 p-4 overflow-auto`}>
            <div className="space-y-4 min-w-[620px]">
                {rows.map((row) => (
                    <div key={row.label} className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                        <div className="text-xs text-slate-300 font-medium mb-2">{row.label}</div>
                        <div className="space-y-2">
                            {series.map((s) => {
                                const value = row.values[s.key] ?? 0;
                                const widthPercent = maxValue > 0 ? (value / maxValue) * 100 : 0;
                                return (
                                    <div key={`${row.label}-${s.key}`} className="flex items-center gap-2">
                                        <span className="w-20 text-[11px] text-slate-500 shrink-0">{s.label}</span>
                                        <div className="h-3 flex-1 rounded bg-slate-800 overflow-hidden">
                                            <div
                                                className="h-full rounded"
                                                style={{
                                                    width: `${Math.max(0, Math.min(100, widthPercent))}%`,
                                                    backgroundColor: s.color,
                                                }}
                                            />
                                        </div>
                                        <span className="w-20 text-right text-[11px] text-slate-400 font-mono">
                                            {value.toFixed(2)}{unit}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function AnalysisReport({ onPrev, onSubmit }: AnalysisReportProps) {
    const { experiment, saveExperiment } = useExperiment();

    // Initialize from saved data
    const [reportContent, setReportContent] = useState(experiment?.reportContent ?? "");
    const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [restoreDraftOpen, setRestoreDraftOpen] = useState(false);
    const [pendingDraft, setPendingDraft] = useState<string | null>(null);
    const [zoomChart, setZoomChart] = useState<ZoomChartType>(null);
    const [populationStats, setPopulationStats] = useState<Record<string, Record<string, number>>>({});
    const [selectedNumericField, setSelectedNumericField] = useState("");
    const [selectedCategoricalField, setSelectedCategoricalField] = useState("");
    const [isOnline, setIsOnline] = useState(
        typeof navigator === "undefined" ? true : navigator.onLine
    );
    const [networkNotice, setNetworkNotice] = useState<string | null>(null);
    const [syncConflictOpen, setSyncConflictOpen] = useState(false);
    const [serverConflictDraft, setServerConflictDraft] = useState<string | null>(null);
    const [localConflictDraft, setLocalConflictDraft] = useState<string | null>(null);
    const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

    const draftKey = experiment?.taskId ? `student_report_draft_${experiment.taskId}` : null;
    const serverSnapshotRef = useRef("");
    const saveInFlightRef = useRef(false);
    const reconnectSyncingRef = useRef(false);
    const draftResolvedRef = useRef(false);

    const minLength = 100;
    const maxLength = 5000;
    const reportTextLength = useMemo(() => getRichTextPlainLength(reportContent), [reportContent]);
    const isValidLength = reportTextLength >= minLength && reportTextLength <= maxLength;

    const methodRows = useMemo<Record<MethodKey, SampleRow[]>>(() => ({
        simple: ((experiment?.samplingResults as any)?.simple?.data ?? []) as SampleRow[],
        systematic: ((experiment?.samplingResults as any)?.systematic?.data ?? []) as SampleRow[],
        stratified: ((experiment?.samplingResults as any)?.stratified?.data ?? []) as SampleRow[],
    }), [experiment?.samplingResults]);

    const allRows = useMemo(() => {
        return [...methodRows.simple, ...methodRows.systematic, ...methodRows.stratified];
    }, [methodRows]);

    const numericFields = useMemo(() => collectNumericFields(allRows), [allRows]);
    const categoricalFields = useMemo(() => collectCategoricalFields(allRows, populationStats), [allRows, populationStats]);

    useEffect(() => {
        if (!numericFields.includes(selectedNumericField)) {
            setSelectedNumericField(numericFields[0] ?? "");
        }
    }, [numericFields, selectedNumericField]);

    useEffect(() => {
        if (!categoricalFields.includes(selectedCategoricalField)) {
            setSelectedCategoricalField(categoricalFields[0] ?? "");
        }
    }, [categoricalFields, selectedCategoricalField]);

    useEffect(() => {
        async function loadPopulationStats() {
            if (!experiment?.taskId) return;
            const res = await experimentApi.getStats(experiment.taskId);
            if (res.success && res.data?.stats) {
                setPopulationStats(res.data.stats);
            }
        }

        loadPopulationStats().catch((error) => {
            console.error("Failed to load population stats:", error);
        });
    }, [experiment?.taskId]);

    const meanRows = useMemo<ChartRow[]>(() => {
        if (!selectedNumericField) return [];

        return (Object.keys(METHOD_META) as MethodKey[]).map((method) => ({
            label: METHOD_META[method].label,
            values: {
                value: calculateMean(methodRows[method], selectedNumericField),
            },
        }));
    }, [methodRows, selectedNumericField]);

    const errorRows = useMemo<ChartRow[]>(() => {
        if (!selectedNumericField) return [];

        return (Object.keys(METHOD_META) as MethodKey[]).map((method) => ({
            label: METHOD_META[method].label,
            values: {
                value: calculateStdError(methodRows[method], selectedNumericField),
            },
        }));
    }, [methodRows, selectedNumericField]);

    const distributionResult = useMemo(() => {
        return buildDistributionRows(selectedCategoricalField, methodRows, populationStats);
    }, [selectedCategoricalField, methodRows, populationStats]);

    const distributionRows = distributionResult.rows;

    const representativenessRows = useMemo(() => {
        return buildRepresentativenessRows(numericFields, categoricalFields, methodRows, populationStats);
    }, [numericFields, categoricalFields, methodRows, populationStats]);

    const meanSeries: ChartSeries[] = [
        {
            key: "value",
            label: selectedNumericField || "均值",
            color: "#60a5fa",
        },
    ];

    const errorSeries: ChartSeries[] = [
        {
            key: "value",
            label: `${selectedNumericField || "字段"} 标准误`,
            color: "#f59e0b",
        },
    ];

    const distributionSeries: ChartSeries[] = [
        { key: "simple", label: METHOD_META.simple.label, color: METHOD_META.simple.color },
        { key: "systematic", label: METHOD_META.systematic.label, color: METHOD_META.systematic.color },
        { key: "stratified", label: METHOD_META.stratified.label, color: METHOD_META.stratified.color },
        ...(distributionResult.withPopulation ? [POPULATION_SERIES] : []),
    ];

    const representativenessSeries: ChartSeries[] = [
        { key: "simple", label: METHOD_META.simple.label, color: METHOD_META.simple.color },
        { key: "systematic", label: METHOD_META.systematic.label, color: METHOD_META.systematic.color },
        { key: "stratified", label: METHOD_META.stratified.label, color: METHOD_META.stratified.color },
    ];

    useEffect(() => {
        serverSnapshotRef.current = experiment?.reportContent ?? "";
    }, [experiment?.reportContent]);

    // Restore draft from localStorage
    useEffect(() => {
        if (!draftKey) return;
        const raw = localStorage.getItem(draftKey);
        if (!raw) { draftResolvedRef.current = true; return; }
        // Skip empty/trivial drafts
        const plainLen = getRichTextPlainLength(raw);
        if (plainLen === 0) { draftResolvedRef.current = true; return; }
        const hasServerData = Boolean(experiment?.reportContent);
        if (hasServerData && raw === experiment?.reportContent) { draftResolvedRef.current = true; return; }
        setPendingDraft(raw);
        setRestoreDraftOpen(true);
    }, [draftKey, experiment?.reportContent]);

    const saveReport = useCallback(async () => {
        const snapshot = reportContent;
        if (snapshot === serverSnapshotRef.current || saveInFlightRef.current) return;
        if (typeof navigator !== "undefined" && !navigator.onLine) return;

        saveInFlightRef.current = true;
        try {
            const success = await saveExperiment({ reportContent: snapshot });
            if (success) {
                serverSnapshotRef.current = snapshot;
                setLastSavedAt(formatSaveTime());
                setNetworkNotice((prev) => (prev === "网络已恢复，正在同步本地数据..." ? "网络已恢复，本地草稿已同步到服务器" : prev));
            }
        } finally {
            saveInFlightRef.current = false;
        }
    }, [reportContent, saveExperiment]);

    // Save draft to localStorage (guard: only after draft recovery dialog resolved)
    useEffect(() => {
        if (!draftKey || !draftResolvedRef.current) return;
        try {
            localStorage.setItem(draftKey, reportContent);
        } catch {
            // ignore write errors
        }
    }, [draftKey, reportContent]);

    // Keep a ref to the latest saveReport so the 30-second interval doesn't reset on every keystroke
    const saveReportRef = useRef(saveReport);
    useEffect(() => { saveReportRef.current = saveReport; }, [saveReport]);

    // Debounce: save 3 seconds after user stops editing
    useEffect(() => {
        const debounceTimer = window.setTimeout(() => {
            void saveReport();
        }, 3000);

        return () => {
            window.clearTimeout(debounceTimer);
        };
    }, [saveReport]);

    // Fixed 30-second interval: uses ref so the interval is never reset by content changes
    useEffect(() => {
        const intervalTimer = window.setInterval(() => {
            void saveReportRef.current();
        }, 30 * 1000);

        return () => {
            window.clearInterval(intervalTimer);
        };
    }, []);

    const syncAfterReconnect = useCallback(async () => {
        if (!experiment?.taskId || reconnectSyncingRef.current) return;
        reconnectSyncingRef.current = true;
        setNetworkNotice("网络已恢复，正在同步本地数据...");

        try {
            const localData = reportContent;
            const localSnapshot = localData;
            const lastSyncedSnapshot = serverSnapshotRef.current;

            const res = await experimentApi.get(experiment.taskId);
            if (!res.success || !res.data) {
                setNetworkNotice("网络已恢复，但自动同步失败，请稍后重试");
                return;
            }

            const serverData = typeof res.data.reportContent === "string" ? res.data.reportContent : "";
            const serverSnapshot = serverData;
            const localChanged = localSnapshot !== lastSyncedSnapshot;
            const serverChanged = serverSnapshot !== lastSyncedSnapshot;

            if (localSnapshot === serverSnapshot) {
                serverSnapshotRef.current = serverSnapshot;
                setNetworkNotice("网络已恢复，数据已同步");
                return;
            }

            if (localChanged && serverChanged) {
                setLocalConflictDraft(localData);
                setServerConflictDraft(serverData);
                setSyncConflictOpen(true);
                setNetworkNotice("检测到本地与服务器草稿冲突，请选择保留版本");
                return;
            }

            if (localChanged) {
                const success = await saveExperiment({ reportContent: localData });
                if (success) {
                    serverSnapshotRef.current = localSnapshot;
                    if (draftKey) {
                        try {
                            localStorage.setItem(draftKey, localSnapshot);
                        } catch {
                            // ignore write errors
                        }
                    }
                    setNetworkNotice("网络已恢复，本地草稿已同步到服务器");
                } else {
                    setNetworkNotice("网络已恢复，但自动同步失败，请稍后重试");
                }
                return;
            }

            setReportContent(serverData);
            serverSnapshotRef.current = serverSnapshot;
            if (draftKey) {
                try {
                    localStorage.setItem(draftKey, serverSnapshot);
                } catch {
                    // ignore write errors
                }
            }
            setNetworkNotice("检测到服务器有更新，已同步最新草稿");
        } catch {
            setNetworkNotice("网络已恢复，但自动同步失败，请稍后重试");
        } finally {
            reconnectSyncingRef.current = false;
        }
    }, [draftKey, experiment?.taskId, reportContent, saveExperiment]);

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            void syncAfterReconnect();
        };
        const handleOffline = () => {
            setIsOnline(false);
            setNetworkNotice("网络已断开，数据将保存在本地");
        };

        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);
        return () => {
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
        };
    }, [syncAfterReconnect]);

    useEffect(() => {
        if (!isOnline) {
            setNetworkNotice("网络已断开，数据将保存在本地");
        }
    }, [isOnline]);

    useEffect(() => {
        if (!networkNotice || syncConflictOpen || !isOnline) return;
        const timer = window.setTimeout(() => {
            setNetworkNotice(null);
        }, 5000);
        return () => {
            window.clearTimeout(timer);
        };
    }, [isOnline, networkNotice, syncConflictOpen]);

    const handleKeepServerDraft = useCallback(() => {
        if (serverConflictDraft === null) {
            setSyncConflictOpen(false);
            return;
        }

        setReportContent(serverConflictDraft);
        serverSnapshotRef.current = serverConflictDraft;
        if (draftKey) {
            try {
                localStorage.setItem(draftKey, serverConflictDraft);
            } catch {
                // ignore write errors
            }
        }
        setSyncConflictOpen(false);
        setNetworkNotice("已保留服务器草稿版本");
    }, [draftKey, serverConflictDraft]);

    const handleKeepLocalDraft = useCallback(async () => {
        const localData = localConflictDraft ?? reportContent;
        const success = await saveExperiment({ reportContent: localData });

        if (success) {
            serverSnapshotRef.current = localData;
            if (draftKey) {
                try {
                    localStorage.setItem(draftKey, localData);
                } catch {
                    // ignore write errors
                }
            }
            setNetworkNotice("已保留本地草稿并同步到服务器");
        } else {
            setNetworkNotice("保留本地草稿失败，请稍后重试");
        }

        setSyncConflictOpen(false);
    }, [draftKey, localConflictDraft, reportContent, saveExperiment]);

    useEffect(() => {
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            if (reportContent === serverSnapshotRef.current) return;
            event.preventDefault();
            event.returnValue = "";
        };

        window.addEventListener("beforeunload", onBeforeUnload);
        return () => {
            window.removeEventListener("beforeunload", onBeforeUnload);
        };
    }, [reportContent]);

    const handleSubmit = async () => {
        setIsSubmitting(true);
        try {
            // Save final report content before preview
            await saveReport();
            // Clear localStorage draft after successful submission
            if (draftKey) localStorage.removeItem(draftKey);
            onSubmit();
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleExport = async (type: "simple" | "systematic" | "stratified" | "all") => {
        if (!experiment?.taskId) return;
        try {
            const res = await fetch(`/api/student/tasks/${experiment.taskId}/export?type=${type}`, {
                credentials: "include",
            });
            if (!res.ok) throw new Error("导出失败");
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `sampling_${type}.csv`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Export failed:", error);
        }
    };

    const downloadMeanChart = () => {
        if (!selectedNumericField || meanRows.length === 0) return;
        downloadChartAsSvg({
            title: `均值对比 - ${selectedNumericField}`,
            rows: meanRows,
            series: meanSeries,
            fileName: `mean_${sanitizeFileName(selectedNumericField)}.svg`,
        });
    };

    const downloadDistributionChart = () => {
        if (!selectedCategoricalField || distributionRows.length === 0) return;
        downloadChartAsSvg({
            title: `分布对比 - ${selectedCategoricalField}`,
            rows: distributionRows,
            series: distributionSeries,
            fileName: `distribution_${sanitizeFileName(selectedCategoricalField)}.svg`,
            unit: "%",
        });
    };

    const downloadErrorChart = () => {
        if (!selectedNumericField || errorRows.length === 0) return;
        downloadChartAsSvg({
            title: `抽样标准误对比 - ${selectedNumericField}`,
            rows: errorRows,
            series: errorSeries,
            fileName: `error_${sanitizeFileName(selectedNumericField)}.svg`,
        });
    };

    const downloadRepresentativenessChart = () => {
        if (representativenessRows.length === 0) return;
        downloadChartAsSvg({
            title: "样本代表性 - 各方法与总体的偏差",
            rows: representativenessRows,
            series: representativenessSeries,
            fileName: "representativeness.svg",
            unit: "%",
        });
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            {networkNotice && (
                <Card
                    className={`rounded-2xl border shadow-sm ${syncConflictOpen
                        ? "border-amber-500/30 bg-amber-500/10"
                        : isOnline
                            ? "border-emerald-500/30 bg-emerald-500/10"
                            : "border-rose-500/30 bg-rose-500/10"
                        }`}
                >
                    <CardContent className="px-4 py-3">
                        <div className="flex items-center gap-2 text-sm">
                            {syncConflictOpen ? (
                                <AlertCircle className="h-4 w-4 text-amber-400" />
                            ) : isOnline ? (
                                <CheckCircle className="h-4 w-4 text-emerald-400" />
                            ) : (
                                <AlertCircle className="h-4 w-4 text-rose-400" />
                            )}
                            <span
                                className={syncConflictOpen
                                    ? "text-amber-300"
                                    : isOnline
                                        ? "text-emerald-300"
                                        : "text-rose-300"
                                }
                            >
                                {networkNotice}
                            </span>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <Card className="rounded-2xl border-slate-800 bg-slate-900/50 shadow-sm">
                        <CardHeader className="border-b border-slate-800 pb-4">
                            <CardTitle className="flex items-center gap-2 text-slate-100">
                                <BarChart3 className="w-5 h-5 text-indigo-500" />
                                图表分析
                            </CardTitle>
                            <CardDescription className="text-slate-400">基于阶段三真实抽样结果自动生成</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-6">
                            <Tabs defaultValue="mean">
                                <TabsList className="bg-slate-950 border border-slate-800 p-1 rounded-xl w-full flex h-auto">
                                    <TabsTrigger value="mean" className="flex-1 rounded-lg py-2 data-[state=active]:bg-slate-800 data-[state=active]:text-slate-50 text-slate-400">均值对比</TabsTrigger>
                                    <TabsTrigger value="dist" className="flex-1 rounded-lg py-2 data-[state=active]:bg-slate-800 data-[state=active]:text-slate-50 text-slate-400">分布对比</TabsTrigger>
                                    <TabsTrigger value="error" className="flex-1 rounded-lg py-2 data-[state=active]:bg-slate-800 data-[state=active]:text-slate-50 text-slate-400">误差分析</TabsTrigger>
                                    <TabsTrigger value="represent" className="flex-1 rounded-lg py-2 data-[state=active]:bg-slate-800 data-[state=active]:text-slate-50 text-slate-400">样本代表性</TabsTrigger>
                                </TabsList>

                                <TabsContent value="mean" className="mt-6 space-y-4">
                                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                        <div className="text-sm text-slate-400">比较各抽样方法在同一数值变量上的均值。</div>
                                        <div className="flex items-center gap-2">
                                            <Select value={selectedNumericField} onValueChange={setSelectedNumericField}>
                                                <SelectTrigger className="w-[220px] bg-slate-950 border-slate-800 text-slate-200">
                                                    <SelectValue placeholder="选择数值变量" />
                                                </SelectTrigger>
                                                <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                                                    {numericFields.map((field) => (
                                                        <SelectItem key={field} value={field}>{field}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Button variant="outline" size="icon" className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700" onClick={() => setZoomChart("mean")}>
                                                <Maximize2 className="w-4 h-4" />
                                            </Button>
                                            <Button variant="outline" size="icon" className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700" onClick={downloadMeanChart}>
                                                <Download className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                    <ChartBars
                                        rows={meanRows}
                                        series={meanSeries}
                                        emptyMessage="暂无可用于均值分析的数值字段"
                                    />
                                </TabsContent>

                                <TabsContent value="dist" className="mt-6 space-y-4">
                                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                        <div className="text-sm text-slate-400">比较各抽样方法在分类变量上的分布占比（含总体对照）。</div>
                                        <div className="flex items-center gap-2">
                                            <Select value={selectedCategoricalField} onValueChange={setSelectedCategoricalField}>
                                                <SelectTrigger className="w-[220px] bg-slate-950 border-slate-800 text-slate-200">
                                                    <SelectValue placeholder="选择分类变量" />
                                                </SelectTrigger>
                                                <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                                                    {categoricalFields.map((field) => (
                                                        <SelectItem key={field} value={field}>{field}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Button variant="outline" size="icon" className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700" onClick={() => setZoomChart("dist")}>
                                                <Maximize2 className="w-4 h-4" />
                                            </Button>
                                            <Button variant="outline" size="icon" className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700" onClick={downloadDistributionChart}>
                                                <Download className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                    <ChartBars
                                        rows={distributionRows}
                                        series={distributionSeries}
                                        unit="%"
                                        emptyMessage="暂无可用于分布分析的分类字段"
                                    />
                                </TabsContent>

                                <TabsContent value="error" className="mt-6 space-y-4">
                                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                        <div className="text-sm text-slate-400">比较各抽样方法在同一变量上的抽样标准误。</div>
                                        <div className="flex items-center gap-2">
                                            <Select value={selectedNumericField} onValueChange={setSelectedNumericField}>
                                                <SelectTrigger className="w-[220px] bg-slate-950 border-slate-800 text-slate-200">
                                                    <SelectValue placeholder="选择数值变量" />
                                                </SelectTrigger>
                                                <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                                                    {numericFields.map((field) => (
                                                        <SelectItem key={field} value={field}>{field}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Button variant="outline" size="icon" className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700" onClick={() => setZoomChart("error")}>
                                                <Maximize2 className="w-4 h-4" />
                                            </Button>
                                            <Button variant="outline" size="icon" className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700" onClick={downloadErrorChart}>
                                                <Download className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                    <ChartBars
                                        rows={errorRows}
                                        series={errorSeries}
                                        emptyMessage="暂无可用于误差分析的数值字段"
                                    />
                                </TabsContent>

                                <TabsContent value="represent" className="mt-6 space-y-4">
                                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                        <div className="text-sm text-slate-400">比较各抽样方法样本与总体关键指标的偏差程度（%）。</div>
                                        <div className="flex items-center gap-2">
                                            <Button variant="outline" size="icon" className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700" onClick={() => setZoomChart("represent")}>
                                                <Maximize2 className="w-4 h-4" />
                                            </Button>
                                            <Button variant="outline" size="icon" className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700" onClick={downloadRepresentativenessChart}>
                                                <Download className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                    <ChartBars
                                        rows={representativenessRows}
                                        series={representativenessSeries}
                                        unit="%"
                                        emptyMessage="暂无可用于代表性分析的数据"
                                    />
                                </TabsContent>
                            </Tabs>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card className="rounded-2xl border-slate-800 bg-slate-900/50 shadow-sm">
                        <CardHeader className="border-b border-slate-800 pb-4">
                            <CardTitle className="flex items-center gap-2 text-slate-100">
                                <Download className="w-5 h-5 text-teal-500" />
                                数据导出
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 pt-6">
                            <Button variant="outline" className="w-full justify-start border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100" onClick={() => handleExport("simple")}>
                                <FileText className="w-4 h-4 mr-2" />
                                简单随机抽样结果
                            </Button>
                            <Button variant="outline" className="w-full justify-start border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100" onClick={() => handleExport("systematic")}>
                                <FileText className="w-4 h-4 mr-2" />
                                系统抽样结果
                            </Button>
                            <Button variant="outline" className="w-full justify-start border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100" onClick={() => handleExport("stratified")}>
                                <FileText className="w-4 h-4 mr-2" />
                                分层抽样结果
                            </Button>
                            <div className="h-px bg-slate-800 my-2"></div>
                            <Button variant="default" className="w-full justify-start bg-teal-600 hover:bg-teal-700 text-white shadow-lg shadow-teal-500/20" onClick={() => handleExport("all")}>
                                <FileText className="w-4 h-4 mr-2" />
                                导出全部数据
                            </Button>
                        </CardContent>
                    </Card>

                    <Card className="rounded-2xl border-indigo-500/20 bg-indigo-500/5 shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-base text-indigo-300 flex items-center gap-2">
                                <Sparkles className="w-4 h-4" />
                                分析提示
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm text-indigo-200/70">
                            <p>• 先比较均值差异，判断三种方法估计结果是否一致。</p>
                            <p>• 再看分类分布，识别各方法在结构上的偏移。</p>
                            <p>• 最后结合标准误，说明方法稳定性和可靠性。</p>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <Card className="rounded-2xl border-slate-800 bg-slate-900/50 shadow-sm">
                <CardHeader className="border-b border-slate-800 pb-4">
                    <CardTitle className="flex items-center gap-2 text-slate-100">
                        <FileText className="w-5 h-5 text-indigo-500" />
                        撰写报告
                    </CardTitle>
                    <CardDescription className="text-slate-400">
                        请根据实验结果撰写分析报告（{minLength}-{maxLength}字）
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                    <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-xl text-sm text-slate-400">
                        <p className="font-semibold text-slate-300 mb-2">建议包含以下内容：</p>
                        <ul className="list-disc list-inside space-y-1.5 pl-2">
                            <li>抽样方法选择的理由</li>
                            <li>各方法执行结果的对比分析</li>
                            <li>抽样误差的分析</li>
                            <li>对调查结论可靠性的评估</li>
                            <li>改进建议（可选）</li>
                        </ul>
                    </div>

                    <div className="space-y-3">
                        <Label htmlFor="report" className="text-slate-300">报告内容</Label>
                        <div className="space-y-2">
                            <RichTextEditor
                                id="report"
                                placeholder="请在此撰写您的分析报告..."
                                value={reportContent}
                                onChange={setReportContent}
                                editorClassName="min-h-[400px]"
                            />
                            <div className="text-right text-xs">
                                <span className={reportTextLength < minLength || reportTextLength > maxLength ? "text-rose-400" : "text-emerald-400"}>
                                    {reportTextLength > maxLength
                                        ? `已超出 ${reportTextLength - maxLength} 字`
                                        : reportTextLength < minLength
                                            ? `还需 ${minLength - reportTextLength} 字`
                                            : "✓ 字数符合要求"}
                                </span>
                                <span className="text-slate-500 ml-2">{reportTextLength}/{maxLength}</span>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Navigation */}
            <div className="flex justify-between items-center pt-6 border-t border-slate-800/50">
                <Button variant="outline" onClick={onPrev} className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100">
                    上一阶段
                </Button>
                {lastSavedAt && (
                    <span className="text-xs text-slate-500">已自动保存于 {lastSavedAt}</span>
                )}
                <Button onClick={() => setConfirmSubmitOpen(true)} disabled={!isValidLength} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20">
                    <Send className="w-4 h-4 mr-2" />
                    完成并预览报告
                </Button>
            </div>

            <Dialog open={zoomChart !== null} onOpenChange={(open) => { if (!open) setZoomChart(null); }}>
                <DialogContent className="max-w-6xl bg-slate-900 border-slate-800 text-slate-200">
                    <DialogHeader>
                        <DialogTitle className="text-slate-100">
                            {zoomChart === "mean" && "均值对比（放大）"}
                            {zoomChart === "dist" && "分布对比（放大）"}
                            {zoomChart === "error" && "误差分析（放大）"}
                            {zoomChart === "represent" && "样本代表性（放大）"}
                        </DialogTitle>
                    </DialogHeader>
                    {zoomChart === "mean" && (
                        <ChartBars
                            rows={meanRows}
                            series={meanSeries}
                            emptyMessage="暂无可用于均值分析的数值字段"
                            heightClass="h-[65vh]"
                        />
                    )}
                    {zoomChart === "dist" && (
                        <ChartBars
                            rows={distributionRows}
                            series={distributionSeries}
                            unit="%"
                            emptyMessage="暂无可用于分布分析的分类字段"
                            heightClass="h-[65vh]"
                        />
                    )}
                    {zoomChart === "error" && (
                        <ChartBars
                            rows={errorRows}
                            series={errorSeries}
                            emptyMessage="暂无可用于误差分析的数值字段"
                            heightClass="h-[65vh]"
                        />
                    )}
                    {zoomChart === "represent" && (
                        <ChartBars
                            rows={representativenessRows}
                            series={representativenessSeries}
                            unit="%"
                            emptyMessage="暂无可用于代表性分析的数据"
                            heightClass="h-[65vh]"
                        />
                    )}
                </DialogContent>
            </Dialog>

            {/* Confirm Submit Dialog */}
            <AlertDialog open={confirmSubmitOpen} onOpenChange={setConfirmSubmitOpen}>
                <AlertDialogContent className="bg-slate-900 border-slate-800 text-slate-200">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-100">确认提交实验</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="text-sm text-slate-400">
                                您即将提交本次实验，包括：
                                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 mt-3 mb-3 space-y-1">
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                                        <span>问卷设计</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                                        <span>样本量规划</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                                        <span>抽样执行结果</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                                        <span>分析报告（{reportTextLength} 字）</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 text-amber-400 bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    <span>提交后将无法修改。确定提交吗？</span>
                                </div>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isSubmitting} className="bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-slate-100">取消</AlertDialogCancel>
                        <AlertDialogAction onClick={handleSubmit} disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    提交中...
                                </>
                            ) : (
                                "确认提交"
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={restoreDraftOpen} onOpenChange={setRestoreDraftOpen}>
                <AlertDialogContent className="bg-slate-900 border-slate-800 text-slate-200">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-100">恢复草稿</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-400">检测到本地草稿，是否恢复？</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel
                            className="bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                            onClick={() => {
                                if (draftKey) localStorage.removeItem(draftKey);
                                draftResolvedRef.current = true;
                                setRestoreDraftOpen(false);
                            }}
                        >
                            放弃草稿
                        </AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
                            onClick={() => {
                                if (pendingDraft !== null) {
                                    setReportContent(pendingDraft);
                                }
                                draftResolvedRef.current = true;
                                setRestoreDraftOpen(false);
                            }}
                        >
                            恢复草稿
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={syncConflictOpen} onOpenChange={setSyncConflictOpen}>
                <AlertDialogContent className="bg-slate-900 border-slate-800 text-slate-200">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-100">检测到草稿冲突</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-400 leading-relaxed">
                            本地草稿和服务器草稿都发生了变化。请选择要保留的版本。
                            <br />
                            <span className="text-slate-500">保留本地版本将覆盖服务器当前草稿。</span>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel
                            className="bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                            onClick={handleKeepServerDraft}
                        >
                            保留服务器版本
                        </AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
                            onClick={() => {
                                void handleKeepLocalDraft();
                            }}
                        >
                            保留本地版本
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

export default AnalysisReport;
