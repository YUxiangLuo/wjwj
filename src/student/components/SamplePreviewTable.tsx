import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const FIELD_LABELS: Record<string, string> = {
    "gender": "性别",
    "education": "学历",
    "age": "年龄段",
    "age_group": "年龄段",
    "income": "收入水平",
    "city": "城市",
    "city_tier": "城市等级",
    "monthly_expense": "月支出",
    "spending": "消费支出",
};

export function SamplePreviewTable({ data, total }: { data: unknown[]; total: number }) {
    const samples = (data as Array<Record<string, unknown>>) ?? [];
    const pageSize = 20;
    const [page, setPage] = useState(1);
    const [scrollTrackWidth, setScrollTrackWidth] = useState(0);
    const tableScrollRef = useRef<HTMLDivElement | null>(null);
    const horizontalScrollRef = useRef<HTMLDivElement | null>(null);
    const syncingRef = useRef<"table" | "track" | null>(null);

    useEffect(() => {
        setPage(1);
    }, [data]);

    useEffect(() => {
        const updateScrollTrackWidth = () => {
            setScrollTrackWidth(tableScrollRef.current?.scrollWidth ?? 0);
        };

        updateScrollTrackWidth();

        const tableEl = tableScrollRef.current;
        if (!tableEl || typeof ResizeObserver === "undefined") {
            window.addEventListener("resize", updateScrollTrackWidth);
            return () => window.removeEventListener("resize", updateScrollTrackWidth);
        }

        const observer = new ResizeObserver(updateScrollTrackWidth);
        observer.observe(tableEl);
        const table = tableEl.querySelector("table");
        if (table) observer.observe(table);
        window.addEventListener("resize", updateScrollTrackWidth);

        return () => {
            observer.disconnect();
            window.removeEventListener("resize", updateScrollTrackWidth);
        };
    }, [data, page]);

    const syncHorizontalScroll = useCallback((source: "table" | "track") => {
        const tableEl = tableScrollRef.current;
        const trackEl = horizontalScrollRef.current;
        if (!tableEl || !trackEl) return;

        if (source === "table") {
            trackEl.scrollLeft = tableEl.scrollLeft;
        } else {
            tableEl.scrollLeft = trackEl.scrollLeft;
        }
    }, []);

    const handleTableScroll = useCallback(() => {
        if (syncingRef.current === "track") {
            syncingRef.current = null;
            return;
        }
        syncingRef.current = "table";
        syncHorizontalScroll("table");
    }, [syncHorizontalScroll]);

    const handleTrackScroll = useCallback(() => {
        if (syncingRef.current === "table") {
            syncingRef.current = null;
            return;
        }
        syncingRef.current = "track";
        syncHorizontalScroll("track");
    }, [syncHorizontalScroll]);

    if (samples.length === 0) {
        return <div className="h-full flex items-center justify-center text-sm text-muted-foreground italic">暂无抽样数据</div>;
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
                role="region"
                tabIndex={0}
                aria-label={`抽样结果数据表，第 ${currentPage} 页，共 ${totalPages} 页`}
                className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-xl border border-border [scrollbar-gutter:stable]"
            >
                <div className="min-w-max pr-3 [&_[data-slot=table-container]]:w-max [&_[data-slot=table-container]]:overflow-visible">
                    <Table className="min-w-max">
                        <TableHeader className="sticky top-0 bg-background/50">
                            <TableRow className="border-border hover:bg-transparent">
                                {keys.map((key) => (
                                    <TableHead key={key} className="h-8 whitespace-nowrap text-xs text-muted-foreground">
                                        {FIELD_LABELS[key] || key}
                                    </TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((row, rowIndex) => (
                                <TableRow key={`${start + rowIndex}`} className="border-border hover:bg-muted/50">
                                    {keys.map((key) => (
                                        <TableCell key={`${start + rowIndex}-${key}`} className="py-2 text-xs text-foreground/90 whitespace-nowrap">
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
                <div
                    ref={horizontalScrollRef}
                    onScroll={handleTrackScroll}
                    role="region"
                    tabIndex={0}
                    aria-label="横向滚动抽样结果数据表"
                    className="mt-2 overflow-x-auto overflow-y-hidden"
                >
                    <div className="h-1" style={{ width: scrollTrackWidth }} />
                </div>
            )}
            <div className="mt-3 flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                    显示第 {start + 1}-{end} 条，共 {Math.max(total, samples.length)} 条
                </p>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs border-input bg-card text-foreground/90 hover:bg-muted"
                        onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                        disabled={currentPage <= 1}
                    >
                        上一页
                    </Button>
                    <span className="text-xs text-muted-foreground">{currentPage}/{totalPages}</span>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs border-input bg-card text-foreground/90 hover:bg-muted"
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
