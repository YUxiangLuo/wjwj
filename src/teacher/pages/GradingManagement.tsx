import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { CheckCircle2, AlertTriangle, ClipboardList, Search, XCircle, Clock, UserCheck, FileEdit, ChevronLeft, ChevronRight } from "lucide-react";
import { teacherApi, type GradingItem, type GradingListParams } from "../api-client";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";

const PAGE_SIZE = 20;

export function GradingManagement() {
    const navigate = useNavigate();
    const [items, setItems] = useState<GradingItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState("all-status");
    const [filterClass, setFilterClass] = useState("all-class");
    const [filterTopic, setFilterTopic] = useState("all-topic");
    const [searchTerm, setSearchTerm] = useState("");
    const [debouncedKeyword, setDebouncedKeyword] = useState("");

    // 班级和课题选项从首次全量请求获取（无筛选）
    const [classOptions, setClassOptions] = useState<string[]>([]);
    const [topicOptions, setTopicOptions] = useState<string[]>([]);

    // 搜索框防抖
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedKeyword(searchTerm.trim()), 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // 初始化：加载筛选器选项
    useEffect(() => {
        // 用一个大 pageSize 请求获取所有班级/课题名称（只取名称去重）
        teacherApi.getGradingList({ pageSize: 500 }).then((res) => {
            if (res.success && res.data) {
                const data = res.data.items;
                setClassOptions(Array.from(new Set(data.map((d) => d.className).filter(Boolean))));
                setTopicOptions(Array.from(new Set(data.map((d) => d.topic).filter(Boolean))));
            }
        });
    }, []);

    const loadPage = useCallback(async (params: GradingListParams & { page: number }) => {
        setLoading(true);
        const res = await teacherApi.getGradingList({
            status: params.status,
            className: params.className,
            topicName: params.topicName,
            keyword: params.keyword,
            page: params.page,
            pageSize: PAGE_SIZE,
        });
        if (res.success && res.data) {
            setItems(res.data.items);
            setTotal(res.data.total);
            setPage(res.data.page);
        }
        setLoading(false);
    }, []);

    // 筛选条件变化 → 回第一页重新加载
    useEffect(() => {
        const effectiveStatus = filterStatus === "all-status" ? undefined : filterStatus;
        const effectiveClass = filterClass === "all-class" ? undefined : filterClass;
        const effectiveTopic = filterTopic === "all-topic" ? undefined : filterTopic;
        loadPage({
            status: effectiveStatus,
            className: effectiveClass,
            topicName: effectiveTopic,
            keyword: debouncedKeyword || undefined,
            page: 1,
        });
    }, [filterStatus, filterClass, filterTopic, debouncedKeyword, loadPage]);

    function goToPage(p: number) {
        const effectiveStatus = filterStatus === "all-status" ? undefined : filterStatus;
        const effectiveClass = filterClass === "all-class" ? undefined : filterClass;
        const effectiveTopic = filterTopic === "all-topic" ? undefined : filterTopic;
        loadPage({
            status: effectiveStatus,
            className: effectiveClass,
            topicName: effectiveTopic,
            keyword: debouncedKeyword || undefined,
            page: p,
        });
    }

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const getStatusBadge = (status: number, score?: number | null) => {
        switch (status) {
            case 0:
            case 1: return <StatusBadge intent="warning"><Clock className="w-3 h-3 mr-1" /> 待批改</StatusBadge>;
            case 2: return <StatusBadge intent="success"><CheckCircle2 className="w-3 h-3 mr-1" /> 已批改 ({score ?? 0}分)</StatusBadge>;
            case 3: return <StatusBadge intent="destructive"><XCircle className="w-3 h-3 mr-1" /> 已驳回</StatusBadge>;
            default: return <Badge variant="outline" className="text-muted-foreground border-input">未知状态</Badge>;
        }
    };

    const getGraderBadge = (item: GradingItem) => {
        if (item.status !== 2 && item.status !== 3) return null;
        if (!item.gradedByName) return null;

        const isTeacher = item.gradedByType === 2;
        return (
            <Badge
                variant="outline"
                className={`text-xs ${isTeacher ? 'text-info border-info/30 bg-info/10' : 'text-auxiliary border-auxiliary/30 bg-auxiliary/10'}`}
            >
                <UserCheck className="w-3 h-3 mr-1" />
                {isTeacher ? '教师' : '助教'}: {item.gradedByName}
            </Badge>
        );
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div>
                <h2 className="text-lg font-semibold text-foreground">作业批改</h2>
                <p className="text-sm text-muted-foreground mt-1">查看待批改列表并快速进入评分。</p>
            </div>

            <Card>
                <PageHeader as={CardHeader}>
                    <div>
                        <CardTitle className="text-base text-foreground">批改列表</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">共 {total} 条数据</p>
                    </div>
                    <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
                        <div className="relative sm:w-56">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                data-testid="teacher-grading-search"
                                placeholder="搜索学生/课题"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-ring"
                            />
                        </div>
                        <Select value={filterClass} onValueChange={setFilterClass}>
                            <SelectTrigger data-testid="teacher-grading-class-filter" className="bg-background border-border text-foreground sm:w-40">
                                <SelectValue placeholder="全部班级" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border text-foreground">
                                <SelectItem value="all-class">全部班级</SelectItem>
                                {classOptions.map((name) => (
                                    <SelectItem key={name} value={name}>{name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={filterTopic} onValueChange={setFilterTopic}>
                            <SelectTrigger data-testid="teacher-grading-topic-filter" className="bg-background border-border text-foreground sm:w-40">
                                <SelectValue placeholder="全部课题" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border text-foreground">
                                <SelectItem value="all-topic">全部课题</SelectItem>
                                {topicOptions.map((name) => (
                                    <SelectItem key={name} value={name}>{name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={filterStatus} onValueChange={setFilterStatus}>
                            <SelectTrigger data-testid="teacher-grading-status-filter" className="bg-background border-border text-foreground sm:w-28">
                                <SelectValue placeholder="全部状态" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border text-foreground">
                                <SelectItem value="all-status">全部状态</SelectItem>
                                <SelectItem value="pending">待批改</SelectItem>
                                <SelectItem value="graded">已批改</SelectItem>
                                <SelectItem value="rejected">被驳回</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </PageHeader>
                <CardContent className="space-y-3 pt-4">
                    {loading ? <div className="text-center py-12 text-muted-foreground">加载中...</div> : (
                        items.length === 0 ?
                            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                                <div className="w-12 h-12 rounded-full bg-card border border-border flex items-center justify-center mb-3">
                                    <ClipboardList className="w-6 h-6 text-muted-foreground" />
                                </div>
                                <p>暂无待批改作业</p>
                            </div>
                            :
                            items.map((sub) => (
                                <div data-testid={`teacher-grading-card-${sub.id}`} key={sub.id} className="border border-border rounded-lg p-5 bg-background hover:bg-card hover:border-input transition-all">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="flex items-center gap-4">
                                            <Avatar className="w-10 h-10 border border-input">
                                                <AvatarFallback className="bg-muted text-foreground/90">{sub.studentName?.[0] ?? "?"}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold text-foreground">{sub.studentName}</span>
                                                    <span className="text-xs font-mono text-muted-foreground">({sub.studentId})</span>
                                                </div>
                                                <div className="text-sm text-muted-foreground mt-1">{sub.className} · <span className="text-primary">{sub.topic}</span></div>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                            {getStatusBadge(sub.status, sub.score)}
                                            {getGraderBadge(sub)}
                                            <div className="text-xs text-muted-foreground mt-1">{sub.submittedAt ? new Date(sub.submittedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : "-"}</div>
                                        </div>
                                    </div>
                                    <div className="flex justify-end mt-4 pt-3 border-t border-border/50">
                                        {sub.status === 1 && (
                                            <Button data-testid={`teacher-grading-open-${sub.id}`} size="sm" onClick={() => navigate(`/grading/${sub.id}`)} className="bg-primary hover:bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                                                <FileEdit className="w-3.5 h-3.5 mr-2" />
                                                开始批改
                                            </Button>
                                        )}
                                        {sub.status === 0 && (
                                            <Button data-testid={`teacher-grading-open-${sub.id}`} size="sm" onClick={() => navigate(`/grading/${sub.id}`)} className="bg-muted-foreground/20 hover:bg-muted-foreground/20 text-foreground">
                                                <FileEdit className="w-3.5 h-3.5 mr-2" />
                                                继续批改
                                            </Button>
                                        )}
                                        {sub.status === 2 && (
                                            <Button data-testid={`teacher-grading-open-${sub.id}`} variant="ghost" size="sm" onClick={() => navigate(`/grading/${sub.id}`)} className="text-muted-foreground hover:text-foreground hover:bg-muted">
                                                查看详情
                                            </Button>
                                        )}
                                        {sub.status === 3 && (
                                            <Button data-testid={`teacher-grading-open-${sub.id}`} variant="ghost" size="sm" onClick={() => navigate(`/grading/${sub.id}`)} className="text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                                                查看原因
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))
                    )}

                    {/* 分页 */}
                    {!loading && total > PAGE_SIZE && (
                        <div className="flex items-center justify-between pt-4 border-t border-border">
                            <p className="text-xs text-muted-foreground">
                                第 {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, total)} 条，共 {total} 条
                            </p>
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={page <= 1}
                                    onClick={() => goToPage(page - 1)}
                                    className="h-8 w-8 p-0 border-border"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </Button>
                                {Array.from({ length: totalPages }, (_, i) => i + 1)
                                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                                    .reduce<(number | "ellipsis")[]>((acc, p, idx, arr) => {
                                        if (idx > 0 && p - (arr[idx - 1] ?? 0) > 1) acc.push("ellipsis");
                                        acc.push(p);
                                        return acc;
                                    }, [])
                                    .map((item, idx) =>
                                        item === "ellipsis" ? (
                                            <span key={`e-${idx}`} className="px-1 text-muted-foreground text-sm">…</span>
                                        ) : (
                                            <Button
                                                key={item}
                                                variant={item === page ? "default" : "outline"}
                                                size="sm"
                                                onClick={() => goToPage(item)}
                                                className={`h-8 w-8 p-0 text-xs ${
                                                    item === page
                                                        ? "bg-primary text-primary-foreground hover:bg-primary"
                                                        : "border-border text-muted-foreground"
                                                }`}
                                            >
                                                {item}
                                            </Button>
                                        )
                                    )}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={page >= totalPages}
                                    onClick={() => goToPage(page + 1)}
                                    className="h-8 w-8 p-0 border-border"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
