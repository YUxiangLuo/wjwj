import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FIELD_LABELS } from "./sampling-shared";

export function SamplePreviewTable({ data, total }: { data: unknown[]; total: number }) {
    const samples = (data as Array<Record<string, unknown>>) ?? [];
    const pageSize = 20;
    const [page, setPage] = useState(1);
    const [scrollTrackWidth, setScrollTrackWidth] = useState(0);
    const tableScrollRef = useRef<HTMLDivElement | null>(null);
    const horizontalScrollRef = useRef<HTMLDivElement | null>(null);
    const syncingRef = useRef<"table" | "track" | null>(null);

    useEffect(() => { setPage(1); }, [data]);

    useEffect(() => {
        const updateWidth = () => { setScrollTrackWidth(tableScrollRef.current?.scrollWidth ?? 0); };
        updateWidth();
        const el = tableScrollRef.current;
        if (!el || typeof ResizeObserver === "undefined") {
            window.addEventListener("resize", updateWidth);
            return () => window.removeEventListener("resize", updateWidth);
        }
        const observer = new ResizeObserver(updateWidth);
        observer.observe(el);
        const table = el.querySelector("table");
        if (table) observer.observe(table);
        window.addEventListener("resize", updateWidth);
        return () => { observer.disconnect(); window.removeEventListener("resize", updateWidth); };
    }, [data, page]);

    const syncScroll = useCallback((source: "table" | "track") => {
        const t = tableScrollRef.current;
        const h = horizontalScrollRef.current;
        if (!t || !h) return;
        if (source === "table") h.scrollLeft = t.scrollLeft;
        else t.scrollLeft = h.scrollLeft;
    }, []);

    const handleTableScroll = useCallback(() => {
        if (syncingRef.current === "track") { syncingRef.current = null; return; }
        syncingRef.current = "table";
        syncScroll("table");
    }, [syncScroll]);

    const handleTrackScroll = useCallback(() => {
        if (syncingRef.current === "table") { syncingRef.current = null; return; }
        syncingRef.current = "track";
        syncScroll("track");
    }, [syncScroll]);

    if (samples.length === 0) {
        return <div className="h-full flex items-center justify-center text-sm text-slate-500 italic">暂无抽样数据</div>;
    }

    const keys = Object.keys(samples[0] ?? {});
    const totalPages = Math.max(1, Math.ceil(samples.length / pageSize));
    const currentPage = Math.min(page, totalPages);
    const start = (currentPage - 1) * pageSize;
    const end = Math.min(start + pageSize, samples.length);
    const rows = samples.slice(start, end);

    return (
        <div className="flex h-full min-h-0 w-full flex-col">
            <div
                ref={tableScrollRef}
                onScroll={handleTableScroll}
                className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-xl border border-slate-200 dark:border-slate-800 [scrollbar-gutter:stable]"
            >
                <div className="min-w-max pr-3 [&_[data-slot=table-container]]:w-max [&_[data-slot=table-container]]:overflow-visible">
                    <Table className="min-w-max">
                        <TableHeader className="sticky top-0 bg-white/50 dark:bg-slate-950/50">
                            <TableRow className="border-slate-200 dark:border-slate-800 hover:bg-transparent">
                                {keys.map((key) => (
                                    <TableHead key={key} className="h-8 whitespace-nowrap text-xs text-slate-500">
                                        {FIELD_LABELS[key] || key}
                                    </TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((row, rowIndex) => (
                                <TableRow key={`${start + rowIndex}`} className="border-slate-200 dark:border-slate-800 hover:bg-slate-200/50 dark:hover:bg-slate-800/50">
                                    {keys.map((key) => (
                                        <TableCell key={`${start + rowIndex}-${key}`} className="py-2 text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                            {String(row[key] ?? "")}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>
            {scrollTrackWidth > 0 && (
                <div ref={horizontalScrollRef} onScroll={handleTrackScroll} className="mt-2 overflow-x-auto overflow-y-hidden">
                    <div className="h-1" style={{ width: scrollTrackWidth }} />
                </div>
            )}
            <div className="mt-3 flex items-center justify-between gap-2">
                <p className="text-xs text-slate-500">
                    显示第 {start + 1}-{end} 条，共 {Math.max(total, samples.length)} 条
                </p>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800"
                        onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                        disabled={currentPage <= 1}
                    >
                        上一页
                    </Button>
                    <span className="text-xs text-slate-500">{currentPage}/{totalPages}</span>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800"
                        onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                        disabled={currentPage >= totalPages}
                    >
                        下一页
                    </Button>
                </div>
            </div>
        </div>
    );
}
