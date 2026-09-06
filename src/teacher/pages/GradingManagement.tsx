import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ClipboardList, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
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
import { formatDateTimeDisplay } from "@/utils/format";
import { teacherApi, type GradingItem } from "../api-client";

const PAGE_SIZE = 20;

export function GradingManagement() {
    const navigate = useNavigate();
    const [items, setItems] = useState<GradingItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [status, setStatus] = useState("all");
    const [keyword, setKeyword] = useState("");
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const requestIdRef = useRef(0);
    useEffect(() => () => { requestIdRef.current += 1; }, []);

    const load = async (nextPage = 1) => {
        const requestId = ++requestIdRef.current;
        setPage(nextPage);
        setLoading(true);
        setLoadError(null);
        const response = await teacherApi.getGradingList({
            status: status === "all" ? undefined : status,
            keyword: keyword.trim() || undefined,
            page: nextPage,
            pageSize: PAGE_SIZE,
        });
        if (requestId !== requestIdRef.current) return;
        if (response.success && response.data) {
            setItems(response.data.items);
            setTotal(response.data.total);
            setPage(response.data.page);
        } else {
            setItems([]);
            setTotal(0);
            setLoadError(response.error?.message ?? "批改列表加载失败");
        }
        setLoading(false);
    };

    useEffect(() => {
        void load(1);
    }, [status]);

    const badge = (item: GradingItem) => {
        if (item.status === "submitted") return <StatusBadge intent="warning">待批改</StatusBadge>;
        if (item.status === "graded") return <StatusBadge intent="success">已批改 {item.score ?? 0} 分</StatusBadge>;
        return <StatusBadge intent="destructive">已驳回</StatusBadge>;
    };
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-subheading font-semibold">作业批改</h2>
                <p className="mt-1 text-label text-muted-foreground">评分直接写入学生当前实验；驳回后学生可修改并覆盖重交。</p>
            </div>
            <Card>
                <CardHeader className="flex gap-4 flex-row items-center justify-between">
                    <CardTitle className="text-body">批改列表（{total}）</CardTitle>
                    <div className="flex gap-2 w-auto flex-row">
                        <div className="relative w-auto">
                            <Label htmlFor="grading-search" className="sr-only">搜索学生或实验模板</Label>
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                id="grading-search"
                                className="pl-9 w-56"
                                value={keyword}
                                onChange={(event) => setKeyword(event.target.value)}
                                onKeyDown={(event) => event.key === "Enter" && void load(1)}
                                placeholder="搜索学生或实验模板"
                            />
                        </div>
                        <Button variant="outline" onClick={() => void load(1)}>搜索</Button>
                        <Select value={status} onValueChange={setStatus}>
                            <SelectTrigger aria-label="按批改状态筛选" className="w-32">
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
                </CardHeader>
                <CardContent className="space-y-3">
                    {loadError && <div role="alert" className="flex items-center gap-3 text-label text-destructive"><span>{loadError}</span><Button variant="outline" onClick={() => void load(page)}>重试加载</Button></div>}
                    {loading ? (
                        <p className="py-12 text-center text-label text-muted-foreground" role="status">加载中...</p>
                    ) : items.map((item) => (
                        <button
                            key={item.id}
                            className="flex w-full gap-3 rounded-surface border border-border p-4 text-left transition-colors hover:bg-muted flex-row items-center"
                            onClick={() => navigate(`/grading/${item.id}`)}
                        >
                            <Avatar>
                                <AvatarFallback className="bg-primary text-primary-foreground">
                                    {item.studentName.charAt(0)}
                                </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                                <div className="font-medium">
                                    {item.studentName}{" "}
                                    <span className="font-mono text-meta text-muted-foreground">{item.studentId}</span>
                                </div>
                                <p className="mt-1 text-label text-muted-foreground">{item.className} · {item.topic}</p>
                            </div>
                            <div className="text-right">
                                {badge(item)}
                                <p className="mt-2 text-meta text-muted-foreground">
                                    {formatDateTimeDisplay(item.submittedAt, "-")}
                                </p>
                            </div>
                        </button>
                    ))}
                    {!loading && !loadError && !items.length && (
                        <div className="grid place-items-center gap-2 py-12 text-muted-foreground">
                            <ClipboardList className="h-8 w-8" />
                            <p className="text-label">暂无记录</p>
                        </div>
                    )}
                    {pages > 1 && (
                        <div className="flex items-center justify-end gap-2 pt-3">
                            <IconButton
                                aria-label="上一页"
                                variant="outline"
                                disabled={loading || page <= 1}
                                onClick={() => void load(page - 1)}
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </IconButton>
                            <span className="text-label text-muted-foreground">{page} / {pages}</span>
                            <IconButton
                                aria-label="下一页"
                                variant="outline"
                                disabled={loading || page >= pages}
                                onClick={() => void load(page + 1)}
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
