import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const FIELD_LABELS: Record<string, string> = {
    gender: "性别", education: "学历", age: "年龄段", age_group: "年龄段", income: "收入水平",
    city: "城市", city_tier: "城市等级", monthly_expense: "月支出", spending: "消费支出",
};

export function SamplePreviewTable({ data, total, priorityField }: { data: unknown[]; total: number; priorityField?: string }) {
    const samples = data as Array<Record<string, unknown>>;
    const pageSize = 20;
    const [page, setPage] = useState(1);
    useEffect(() => { setPage(1); }, [data]);

    if (samples.length === 0) return <p className="flex h-full items-center justify-center text-label text-muted-foreground">暂无入样记录。</p>;
    const originalKeys = Object.keys(samples[0] ?? {});
    const keys = priorityField && originalKeys.includes(priorityField) ? [priorityField, ...originalKeys.filter(key => key !== priorityField)] : originalKeys;
    const totalPages = Math.max(1, Math.ceil(samples.length / pageSize));
    const currentPage = Math.min(page, totalPages);
    const start = (currentPage - 1) * pageSize;
    const end = Math.min(start + pageSize, samples.length);

    return <div className="flex h-full min-h-0 min-w-0 flex-col gap-3">
        <div role="region" tabIndex={0} aria-label={`抽样结果数据表，第 ${currentPage} 页，共 ${totalPages} 页，可横向和纵向滚动`}
            className="min-h-0 min-w-0 flex-1 overflow-auto rounded-surface border border-border outline-none focus-visible:ring-2 focus-visible:ring-ring [&_[data-slot=table-container]]:overflow-visible">
            <Table className="min-w-max">
                <TableHeader className="sticky top-0 z-10 bg-muted">
                    <TableRow className="border-border">{keys.map(key => <TableHead key={key} scope="col" className={`whitespace-nowrap px-4 py-3 text-meta ${key === priorityField ? "bg-primary-muted text-primary" : "text-muted-foreground"}`}>
                        {FIELD_LABELS[key] || key}{key === priorityField && " · 研究指标"}
                    </TableHead>)}</TableRow>
                </TableHeader>
                <TableBody>{samples.slice(start, end).map((row, rowIndex) => <TableRow key={start + rowIndex} className="border-border hover:bg-muted">{keys.map(key => <TableCell key={key} className="whitespace-nowrap px-4 py-2.5 text-meta tabular-nums text-foreground">{String(row[key] ?? "")}</TableCell>)}</TableRow>)}</TableBody>
            </Table>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
            <p className="text-meta text-muted-foreground">{total > samples.length ? `显示第 ${start + 1}–${end} 条 · 可预览 ${samples.length} 条，共入样 ${total} 条；完整数据可导出` : `显示第 ${start + 1}–${end} 条，共 ${Math.max(total, samples.length)} 条`}</p>
            <div className="flex shrink-0 items-center gap-3">
                <Button variant="outline" size="sm" onClick={() => setPage(value => Math.max(1, value - 1))} disabled={currentPage <= 1}>上一页</Button>
                <span className="text-meta tabular-nums text-muted-foreground" aria-live="polite">{currentPage} / {totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setPage(value => Math.min(totalPages, value + 1))} disabled={currentPage >= totalPages}>下一页</Button>
            </div>
        </div>
    </div>;
}
