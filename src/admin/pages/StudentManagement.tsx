import { useEffect, useRef, useMemo, useState } from "react";
import { Eye, ChevronLeft, ChevronRight, Loader2, RotateCcw, Search, Users } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    classApi,
    studentApi,
    type Class,
    type Student,
    type StudentExperiment,
} from "../api-client";

const PAGE_SIZE = 20;

export function StudentManagement() {
    const location = useLocation();
    const navigate = useNavigate();
    const requestedClassId = useMemo(() => {
        const value = new URLSearchParams(location.search).get("classId");
        return value && /^[1-9]\d*$/.test(value) ? value : "all";
    }, [location.search]);
    const [students, setStudents] = useState<Student[]>([]);
    const [classes, setClasses] = useState<Class[]>([]);
    const [classId, setClassId] = useState(requestedClassId);
    const [search, setSearch] = useState("");
    const [appliedSearch, setAppliedSearch] = useState("");
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const requestIdRef = useRef(0);
    const experimentRequestRef = useRef(0);
    useEffect(() => () => { requestIdRef.current += 1; experimentRequestRef.current += 1; }, []);
    const [selected, setSelected] = useState<Student | null>(null);
    const [experiments, setExperiments] = useState<StudentExperiment[]>([]);
    const [experimentsLoading, setExperimentsLoading] = useState(false);
    const [experimentsError, setExperimentsError] = useState<string | null>(null);
    const [refreshVersion, setRefreshVersion] = useState(0);

    const load = async ({
        nextClassId = classId,
        nextSearch = appliedSearch,
        nextPage = page,
    }: {
        nextClassId?: string;
        nextSearch?: string;
        nextPage?: number;
    } = {}) => {
        const requestId = ++requestIdRef.current;
        setPage(nextPage);
        setLoading(true);
        setLoadError(null);
        const response = await studentApi.listPaged({
            classId: nextClassId,
            search: nextSearch || undefined,
            page: nextPage,
            pageSize: PAGE_SIZE,
        });
        if (requestId !== requestIdRef.current) return;
        if (response.success && response.data) {
            setStudents(response.data.items);
            setTotal(response.data.total);
            setPage(response.data.page);
        } else {
            setStudents([]);
            setTotal(0);
            setLoadError(response.error?.message ?? "学生列表加载失败");
        }
        setLoading(false);
    };

    useEffect(() => {
        void classApi.list().then((response) => {
            if (response.data) setClasses(response.data);
        });
    }, []);

    useEffect(() => {
        setClassId(requestedClassId);
    }, [requestedClassId]);

    useEffect(() => {
        void load({ nextClassId: classId, nextPage: 1 });
    }, [classId]);

    // Mutation callbacks only invalidate. This render supplies the current
    // filters/page, not the stale closure that started the mutation.
    useEffect(() => {
        if (refreshVersion > 0) void load();
    }, [refreshVersion]);

    const filtered = students;
    const selectedClassName = classes.find((item) => String(item.id) === classId)?.name;
    const hasFilters = classId !== "all" || Boolean(appliedSearch);

    const applySearch = () => {
        const nextSearch = search.trim();
        setAppliedSearch(nextSearch);
        void load({ nextSearch, nextPage: 1 });
    };

    const setClassFilter = (nextClassId: string) => {
        setClassId(nextClassId);
        const params = new URLSearchParams(location.search);
        if (nextClassId === "all") params.delete("classId");
        else params.set("classId", nextClassId);
        navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });
    };

    const clearFilters = () => {
        setSearch("");
        setAppliedSearch("");
        setClassFilter("all");
        void load({ nextClassId: "all", nextSearch: "", nextPage: 1 });
    };

    const openExperiments = async (item: Student) => {
        const requestId = ++experimentRequestRef.current;
        setSelected(item);
        setExperiments([]);
        setExperimentsLoading(true);
        setExperimentsError(null);
        const response = await studentApi.getExperiments(item.id);
        if (requestId !== experimentRequestRef.current) return;
        if (response.success && response.data) setExperiments(response.data);
        else setExperimentsError(response.error?.message ?? "实验记录加载失败");
        setExperimentsLoading(false);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>学生管理</CardTitle>
                <p className="text-label text-muted-foreground">查看学生实验进度，支持重置密码。</p>
            </CardHeader>
            <CardContent>
                <div className="mb-4 flex flex-wrap items-end gap-2">
                    <div className="min-w-56 flex-1 max-w-xs">
                        <Label htmlFor="admin-student-search" className="sr-only">搜索学号或姓名</Label>
                        <Input
                            id="admin-student-search"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            onKeyDown={(event) => event.key === "Enter" && applySearch()}
                            placeholder="搜索学号或姓名"
                        />
                    </div>
                    <Button variant="outline" onClick={applySearch}>
                        <Search className="h-4 w-4" />
                        搜索
                    </Button>
                    <Select value={classId} onValueChange={setClassFilter}>
                        <SelectTrigger aria-label="按班级筛选学生" className="w-44">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">全部班级</SelectItem>
                            {classes.map((item) => (
                                <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {hasFilters && (
                        <Button variant="ghost" onClick={clearFilters}>清除筛选</Button>
                    )}
                </div>

                {loadError && <div role="alert" className="mb-3 flex items-center gap-3 text-label text-destructive"><span>{loadError}</span><Button variant="outline" onClick={() => void load()}>重试加载</Button></div>}
                {loading ? (
                    <div className="grid place-items-center py-12" role="status" aria-label="正在加载学生列表">
                        <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin" />
                    </div>
                ) : loadError ? null : filtered.length === 0 ? (
                    <div className="grid place-items-center gap-3 rounded-surface border border-dashed border-border px-4 py-12 text-center">
                        <span className="rounded-control bg-muted p-3 text-muted-foreground">
                            <Users className="h-6 w-6" />
                        </span>
                        <div>
                            <p className="font-medium">
                                {selectedClassName && !appliedSearch
                                    ? `${selectedClassName}暂无学生`
                                    : hasFilters
                                        ? "没有符合当前条件的学生"
                                        : "暂无学生"}
                            </p>
                            <p className="mt-1 text-label text-muted-foreground">
                                {hasFilters
                                    ? "可调整搜索或班级条件后重试。"
                                    : "学生加入班级后会显示在这里。"}
                            </p>
                        </div>
                        {hasFilters && <Button variant="outline" onClick={clearFilters}>查看全部学生</Button>}
                    </div>
                ) : (
                    <Table aria-label="学生列表">
                        <TableHeader>
                            <TableRow>
                                <TableHead>学号</TableHead>
                                <TableHead>姓名</TableHead>
                                <TableHead>班级</TableHead>
                                <TableHead>实验进度</TableHead>
                                <TableHead className="text-right">操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filtered.map((item) => (
                                <TableRow key={item.id}>
                                    <TableCell className="font-mono">{item.studentId}</TableCell>
                                    <TableCell>{item.name}</TableCell>
                                    <TableCell>{item.className ?? "-"}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Progress
                                                aria-label={`${item.name}实验进度`}
                                                value={item.progress}
                                                className="h-1.5 w-24"
                                            />
                                            <span className="text-meta text-muted-foreground">{item.progress}%</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex justify-end gap-1">
                                            <Button variant="ghost" size="sm" onClick={() => void openExperiments(item)}>
                                                <Eye className="mr-1 h-4 w-4" />实验
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={async () => {
                                                    const response = await studentApi.resetPassword(item.id);
                                                    if (response.success) {
                                                        toast.success("密码已重置为学号");
                                                        setRefreshVersion(value => value + 1);
                                                    } else {
                                                        toast.error(response.error?.message);
                                                    }
                                                }}
                                            >
                                                <RotateCcw className="mr-1 h-4 w-4" />重置密码
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
                {!loading && total > 0 && (
                    <div className="flex items-center justify-between pt-2" data-testid="student-list-pagination">
                        <p className="text-label text-muted-foreground">
                            共 {total} 人，第 {page} / {Math.max(1, Math.ceil(total / PAGE_SIZE))} 页
                        </p>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page <= 1}
                                onClick={() => void load({ nextPage: page - 1 })}
                                aria-label="上一页"
                                data-testid="student-list-prev-page"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page >= Math.ceil(total / PAGE_SIZE)}
                                onClick={() => void load({ nextPage: page + 1 })}
                                aria-label="下一页"
                                data-testid="student-list-next-page"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>

            <Dialog open={selected !== null} onOpenChange={(open) => {
                if (!open) { experimentRequestRef.current += 1; setSelected(null); }
            }}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>{selected?.name} 的实验记录</DialogTitle>
                        <DialogDescription>查看该学生各项实验的阶段、进度、状态与成绩。</DialogDescription>
                    </DialogHeader>
                    <Table aria-label="该学生的实验记录">
                        <TableHeader>
                            <TableRow>
                                <TableHead>任务</TableHead>
                                <TableHead>阶段</TableHead>
                                <TableHead>状态</TableHead>
                                <TableHead>进度</TableHead>
                                <TableHead>成绩</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {experiments.map((item) => (
                                <TableRow key={item.id}>
                                    <TableCell>{item.taskName ?? "未命名任务"}</TableCell>
                                    <TableCell>第 {item.currentStage} 阶段</TableCell>
                                    <TableCell>{item.statusText}</TableCell>
                                    <TableCell>{item.progress}%</TableCell>
                                    <TableCell>{item.score ?? "-"}</TableCell>
                                </TableRow>
                            ))}
                            {!experiments.length && (
                                <TableRow>
                                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                                        {experimentsLoading ? "正在加载实验记录…" : experimentsError ?? "暂无实验记录"}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
