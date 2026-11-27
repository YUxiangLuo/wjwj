import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ClipboardList, Search } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button, IconButton } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { PageHeader } from "@/components/PageHeader";
import { formatDateTimeDisplay } from "@/utils/format";
import { teacherApi, type GradingItem } from "../api-client";

const PAGE_SIZE = 20;

function listQuery(status: string, keyword: string, page: number, taskId: string | null) {
    const query = new URLSearchParams();
    if (taskId !== null) query.set("taskId", taskId);
    if (status !== "pending") query.set("status", status);
    if (keyword.trim()) query.set("keyword", keyword.trim());
    if (page > 1) query.set("page", String(page));
    return query;
}

export function GradingManagement() {
    const navigate = useNavigate();
    const [items, setItems] = useState<GradingItem[]>([]);
    const [total, setTotal] = useState(0);
    const [searchParams, setSearchParams] = useSearchParams();
    const taskId = searchParams.get("taskId");
    const rawPage = Number(searchParams.get("page") ?? 1);
    const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
    const rawStatus = searchParams.get("status") ?? "pending";
    const status = ["pending", "graded", "rejected", "all"].includes(rawStatus) ? rawStatus : "pending";
    const appliedKeyword = searchParams.get("keyword")?.trim() ?? "";
    const [keyword, setKeyword] = useState(appliedKeyword);
    useEffect(() => { setKeyword(appliedKeyword); }, [appliedKeyword]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const requestIdRef = useRef(0);
    useEffect(() => () => { requestIdRef.current += 1; }, []);

    const load = useCallback(async () => {
        const requestId = ++requestIdRef.current;
        setLoading(true);
        setLoadError(null);
        const response = await teacherApi.getGradingList({
            taskId: taskId ?? undefined,
            status: status === "all" ? undefined : status,
            keyword: appliedKeyword || undefined,
            page,
            pageSize: PAGE_SIZE,
        });
        if (requestId !== requestIdRef.current) return;
        if (response.success && response.data) {
            const lastPage = Math.max(1, Math.ceil(response.data.total / PAGE_SIZE));
            if (page > lastPage) {
                setSearchParams(listQuery(status, appliedKeyword, lastPage, taskId), { replace: true });
                return;
            }
            setItems(response.data.items);
            setTotal(response.data.total);
        } else {
            setItems([]);
            setTotal(0);
            setLoadError(response.error?.message ?? "批改列表加载失败");
        }
        setLoading(false);
    }, [status, appliedKeyword, page, taskId, setSearchParams]);

    useEffect(() => { void load(); }, [load]);
    const applyFilters = (nextStatus = status) => {
        const query = listQuery(nextStatus, keyword, 1, taskId);
        if (query.toString() === searchParams.toString()) void load();
        else setSearchParams(query);
    };

    const badge = (item: GradingItem) => {
        if (item.status === "submitted") return <StatusBadge intent="warning">待批改</StatusBadge>;
        if (item.status === "graded") return <StatusBadge intent="success">已批改 {item.score ?? 0} 分</StatusBadge>;
        return <StatusBadge intent="destructive">已驳回</StatusBadge>;
    };
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
        <div className="space-y-4">
            <p className="text-label text-muted-foreground">评分直接写入学生当前实验；驳回后学生可修改并覆盖重交。</p>
            {taskId !== null && <div className="flex items-center justify-between gap-3 rounded-surface border border-border bg-muted px-4 py-2.5 text-label text-foreground">
                <span>当前仅显示任务 #{taskId} 的作业，搜索和连续批改均限于此任务。</span>
                <Button variant="outline" size="sm" className="bg-card" onClick={() => setSearchParams(listQuery(status, appliedKeyword, 1, null))}>查看全部任务</Button>
            </div>}
            <Card className="gap-0 overflow-hidden border-border bg-card py-0">
                <PageHeader as={CardHeader} className="flex-wrap border-b border-border px-5 py-4 [.border-b]:pb-4">
                    <div>
                        <CardTitle className="text-section-title font-medium text-foreground">批改列表</CardTitle>
                        <p className="mt-0.5 text-meta text-muted-foreground">共 {total} 条记录</p>
                    </div>
                    <div className="flex w-auto flex-row flex-wrap items-center gap-2.5">
                        <div className="relative w-auto">
                            <Label htmlFor="grading-search" className="sr-only">搜索学生或实验模板</Label>
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                id="grading-search"
                                className="w-56 pl-9"
                                value={keyword}
                                onChange={(event) => setKeyword(event.target.value)}
                                onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) applyFilters(); }}
                                placeholder="搜索学生或实验模板"
                            />
                        </div>
                        <Button variant="outline" onClick={() => applyFilters()}>搜索</Button>
                        <Select value={status} onValueChange={applyFilters}>
                            <SelectTrigger aria-label="按批改状态筛选" className="w-32 bg-card">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部状态</SelectItem>
                                <SelectItem value="pending">待批改</SelectItem>
                                <SelectItem value="graded">已批改</SelectItem>
                                <SelectItem value="rejected">已驳回</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </PageHeader>
                <CardContent className="p-0">
                    {loadError && (
                        <div role="alert" className="flex items-center justify-between gap-3 border-b border-destructive-border bg-destructive-muted px-5 py-3 text-label text-destructive">
                            <span>{loadError}</span>
                            <Button variant="outline" size="sm" className="bg-card" onClick={() => void load()}>重试加载</Button>
                        </div>
                    )}
                    {loading ? (
                        <p className="py-12 text-center text-label text-muted-foreground" role="status">加载中...</p>
                    ) : items.length > 0 ? (
                        <div className="divide-y divide-border">
                            {items.map((item) => {
                                const detailHref = `/grading/${item.id}${searchParams.size ? `?${searchParams}` : ""}`;
                                const isPending = item.status === "submitted";
                                return (
                                    <div
                                        key={item.id}
                                        className="flex cursor-pointer flex-row items-center gap-3.5 px-5 py-3.5 transition-none hover:bg-muted"
                                        onClick={() => navigate(detailHref)}
                                    >
                                        <Avatar className="h-9 w-9">
                                            <AvatarFallback className="bg-accent font-medium text-accent-foreground">
                                                {item.studentName.charAt(0)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0 flex-1">
                                            <div className="text-label font-medium text-foreground">
                                                {item.studentName}{" "}
                                                <span className="font-mono text-meta font-normal text-muted-foreground">{item.studentId}</span>
                                            </div>
                                            <p className="mt-0.5 truncate text-meta text-muted-foreground">{item.className} · {item.topic}</p>
                                        </div>
                                        <div className="shrink-0 text-right">
                                            {badge(item)}
                                            <p className="mt-1 text-meta tabular-nums text-muted-foreground">
                                                {formatDateTimeDisplay(item.submittedAt, "-")}
                                            </p>
                                        </div>
                                        <Button
                                            type="button"
                                            data-testid={`teacher-grading-item-${item.id}`}
                                            variant={isPending ? "secondary" : "outline"}
                                            size="sm"
                                            aria-label={`${isPending ? "批改作业" : "查看详情"}：${item.studentName}`}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                navigate(detailHref);
                                            }}
                                        >
                                            {isPending ? "批改作业" : "查看详情"}
                                        </Button>
                                    </div>
                                );
                            })}
                        </div>
                    ) : !loadError ? (
                        <div className="grid place-items-center gap-2 py-14 text-muted-foreground">
                            <ClipboardList className="h-7 w-7" />
                            <p className="text-label">{status === "pending" ? "当前没有待批改作业" : "暂无记录"}</p>
                            {appliedKeyword ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        setKeyword("");
                                        setSearchParams(listQuery(status, "", 1, taskId));
                                    }}
                                >
                                    清空搜索词
                                </Button>
                            ) : status === "pending" ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setSearchParams(listQuery("all", "", 1, taskId))}
                                >
                                    查看全部状态记录
                                </Button>
                            ) : null}
                        </div>
                    ) : null}
                    {pages > 1 && (
                        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
                            <IconButton
                                aria-label="上一页"
                                variant="outline"
                                disabled={loading || page <= 1}
                                onClick={() => setSearchParams(listQuery(status, appliedKeyword, page - 1, taskId))}
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </IconButton>
                            <span className="text-label tabular-nums text-muted-foreground">{page} / {pages}</span>
                            <IconButton
                                aria-label="下一页"
                                variant="outline"
                                disabled={loading || page >= pages}
                                onClick={() => setSearchParams(listQuery(status, appliedKeyword, page + 1, taskId))}
                            >
                                <ChevronRight className="h-4 w-4" />
                            </IconButton>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
