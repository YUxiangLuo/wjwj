import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, ChevronLeft, ChevronRight, RotateCcw, Search, Users } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { LoadingStatus } from "@/components/LoadingStatus";
import { PageHeader } from "@/components/PageHeader";
import { RequestError } from "@/components/RequestError";
import { StatusBadge, type StatusBadgeIntent } from "@/components/StatusBadge";
import { requireApiData, useAsyncLoad } from "@/hooks/useAsyncLoad";
import { formatDateTimeDisplay } from "@/utils/format";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
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

const experimentStatusIntent: Record<StudentExperiment["status"], StatusBadgeIntent> = {
    in_progress: "primary",
    submitted: "info",
    graded: "success",
    rejected: "destructive",
};

export function StudentManagement() {
    const location = useLocation();
    const navigate = useNavigate();
    const { confirm, dialog } = useConfirmDialog();
    const resetPending = useRef(false);
    const [resetting, setResetting] = useState(false);

    const resetPassword = async (student: Student) => {
        if (resetPending.current) return;
        resetPending.current = true;
        setResetting(true);
        try {
            if (!await confirm({
                title: "重置学生密码？",
                description: `将把 ${student.name}（${student.studentId}）的密码重置为学号，原密码将失效。`,
                confirmLabel: "确认重置",
                tone: "destructive",
            })) return;
            const response = await studentApi.resetPassword(student.id);
            if (response.success) toast.success("密码已重置为学号");
            else toast.error(response.error?.message ?? "重置失败，请重试");
        } catch {
            toast.error("重置失败，请重试");
        } finally {
            resetPending.current = false;
            setResetting(false);
        }
    };

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
    const { loading, error: loadError, run: runList } = useAsyncLoad("学生列表加载失败");
    const [selected, setSelected] = useState<Student | null>(null);
    const [experiments, setExperiments] = useState<StudentExperiment[]>([]);
    const { loading: experimentsLoading, error: experimentsError, run: runExperiments, cancel: cancelExperiments } = useAsyncLoad("实验记录加载失败");

    const load = async ({
        nextClassId = classId,
        nextSearch = appliedSearch,
        nextPage = page,
    }: {
        nextClassId?: string;
        nextSearch?: string;
        nextPage?: number;
    } = {}) => {
        setPage(nextPage);
        return runList(
            async () => {
                const [studentsResponse, classesResponse] = await Promise.all([
                    studentApi.listPaged({
                        classId: nextClassId,
                        search: nextSearch || undefined,
                        page: nextPage,
                        pageSize: PAGE_SIZE,
                    }),
                    classApi.list(),
                ]);
                return {
                    data: requireApiData(studentsResponse, "学生列表加载失败"),
                    classes: requireApiData(classesResponse, "班级选项加载失败"),
                };
            },
            ({ data, classes: nextClasses }) => {
                setClasses(nextClasses);
                setStudents(data.items);
                setTotal(data.total);
                setPage(data.page);
            },
        );
    };

    useEffect(() => {
        setClassId(requestedClassId);
    }, [requestedClassId]);

    useEffect(() => {
        void load({ nextClassId: classId, nextPage: 1 });
    }, [classId]);

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
        setSelected(item);
        setExperiments([]);
        await runExperiments(
            async () => requireApiData(await studentApi.getExperiments(item.id), "实验记录加载失败"),
            setExperiments,
        );
    };

    return (
        <div className="space-y-5">
            <PageHeader border={false}>
                <div>
                    <h2 className="text-subheading font-semibold text-foreground">学生管理</h2>
                    <p className="mt-1 text-label text-muted-foreground">
                        跨班级查看学生名册与五阶段实验进度，支持重置登录密码；班级学生导入与调班由授课教师在教师端维护。
                    </p>
                </div>
            </PageHeader>

            <Card>
                <PageHeader as={CardHeader} className="flex-wrap">
                    <div>
                        <CardTitle className="text-body text-foreground">学生名册</CardTitle>
                        <p className="mt-1 text-meta text-muted-foreground">
                            {loading || loadError
                                ? "共 - 名学生"
                                : selectedClassName
                                    ? `${selectedClassName} · 共 ${total} 名学生`
                                    : `全部班级 · 共 ${total} 名学生`}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="w-52">
                            <Label htmlFor="admin-student-search" className="sr-only">搜索学号或姓名</Label>
                            <Input
                                id="admin-student-search"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                onKeyDown={(event) => event.key === "Enter" && applySearch()}
                                placeholder="搜索学号或姓名"
                                className="border-input bg-card"
                            />
                        </div>
                        <Button variant="outline" onClick={applySearch}>
                            <Search className="h-4 w-4" aria-hidden="true" />
                            搜索
                        </Button>
                        <Select value={classId} onValueChange={setClassFilter}>
                            <SelectTrigger aria-label="按班级筛选学生" className="w-44 border-input bg-card">
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
                            <Button variant="ghost" size="sm" onClick={clearFilters}>清除筛选</Button>
                        )}
                    </div>
                </PageHeader>

                <CardContent className="pt-0">
                    {loadError && (
                        <div className="mb-3">
                            <RequestError message={loadError} onRetry={() => void load()} />
                        </div>
                    )}
                    {loading ? (
                        <LoadingStatus className="py-12" label="正在加载学生列表" />
                    ) : loadError ? null : filtered.length === 0 ? (
                        <div className="grid place-items-center gap-3 rounded-surface border border-dashed border-border px-4 py-12 text-center">
                            <span className="rounded-control bg-muted p-3 text-muted-foreground">
                                <Users className="h-6 w-6" aria-hidden="true" />
                            </span>
                            <div>
                                <p className="font-medium text-foreground">
                                    {selectedClassName && !appliedSearch
                                        ? `${selectedClassName}暂无学生`
                                        : hasFilters
                                            ? "没有符合当前条件的学生"
                                            : "暂无学生"}
                                </p>
                                <p className="mt-1 text-label text-muted-foreground">
                                    {hasFilters
                                        ? "请更改搜索关键词或切换班级筛选。"
                                        : "教师在班级内导入或添加学生后将显示在此处。"}
                                </p>
                            </div>
                            {hasFilters && <Button variant="outline" onClick={clearFilters}>查看全部学生</Button>}
                        </div>
                    ) : (
                        <Table aria-label="学生列表">
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="px-3">学号</TableHead>
                                    <TableHead className="px-3">姓名</TableHead>
                                    <TableHead className="px-3">班级</TableHead>
                                    <TableHead className="px-3">实验进度</TableHead>
                                    <TableHead className="px-3 text-right">操作</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filtered.map((item) => (
                                    <TableRow key={item.id} className="hover:bg-muted">
                                        <TableCell className="px-3 font-mono">{item.studentId}</TableCell>
                                        <TableCell className="px-3 font-medium text-foreground">{item.name}</TableCell>
                                        <TableCell className="px-3">{item.className ?? "-"}</TableCell>
                                        <TableCell className="px-3">
                                            <div className="flex items-center gap-2">
                                                <Progress
                                                    aria-label={`${item.name}实验进度`}
                                                    value={item.progress}
                                                    className="h-1.5 w-20"
                                                />
                                                <span aria-hidden="true" className="text-meta tabular-nums text-muted-foreground">{item.progress}%</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-3">
                                            <div className="flex justify-end gap-1">
                                                <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => void openExperiments(item)}>
                                                    <Eye className="mr-1 h-3.5 w-3.5" aria-hidden="true" />实验
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 px-2"
                                                    disabled={resetting}
                                                    onClick={() => void resetPassword(item)}
                                                >
                                                    <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />重置密码
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                    {!loading && !loadError && total > 0 && (
                        <div className="mt-3 flex items-center justify-between border-t border-border pt-3" data-testid="student-list-pagination">
                            <p className="text-meta tabular-nums text-muted-foreground">
                                共 {total} 人 · 第 {page} / {Math.max(1, Math.ceil(total / PAGE_SIZE))} 页
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

                {dialog}
                <Dialog open={selected !== null} onOpenChange={(open) => {
                    if (!open) { cancelExperiments(); setSelected(null); }
                }}>
                    <DialogContent className="max-w-3xl">
                        <DialogHeader>
                            <DialogTitle>{selected?.name} 的实验记录</DialogTitle>
                            <DialogDescription>
                                {selected
                                    ? `学号：${selected.studentId} · 班级：${selected.className ?? "未分班"} · 查看五阶段实验状态、进度与成绩`
                                    : "查看该学生各项实验的阶段、进度、状态与成绩。"}
                            </DialogDescription>
                        </DialogHeader>
                        <Table aria-label="该学生的实验记录">
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="px-3">任务</TableHead>
                                    <TableHead className="px-3">阶段</TableHead>
                                    <TableHead className="px-3">状态</TableHead>
                                    <TableHead className="px-3">进度</TableHead>
                                    <TableHead className="px-3">成绩</TableHead>
                                    <TableHead className="px-3">最后更新</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {experiments.map((item) => {
                                    const badgeIntent = experimentStatusIntent[item.status] ?? "neutral";
                                    return (
                                        <TableRow key={item.id}>
                                            <TableCell className="px-3 font-medium text-foreground">{item.taskName ?? "未命名任务"}</TableCell>
                                            <TableCell className="px-3 tabular-nums">第 {item.currentStage} / 5 阶段</TableCell>
                                            <TableCell className="px-3">
                                                <StatusBadge intent={badgeIntent}>{item.statusText ?? "进行中"}</StatusBadge>
                                            </TableCell>
                                            <TableCell className="px-3 tabular-nums">{item.progress}%</TableCell>
                                            <TableCell className="px-3 tabular-nums">{item.score ?? "-"}</TableCell>
                                            <TableCell className="px-3 text-meta tabular-nums text-muted-foreground">
                                                {formatDateTimeDisplay(item.lastUpdate, "-")}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                                {!experiments.length && (
                                    <TableRow>
                                        <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                                            {experimentsLoading ? "正在加载实验记录…" : experimentsError ?? "暂无实验记录"}
                                            {!experimentsLoading && experimentsError && selected && (
                                                <div className="mt-3">
                                                    <Button variant="outline" onClick={() => void openExperiments(selected)}>重试加载实验记录</Button>
                                                </div>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </DialogContent>
                </Dialog>
            </Card>
        </div>
    );
}
