import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Users, CheckCircle2, Layers, Search, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { teacherApi, type GradeExportPreviewItem, type TeacherClass, type Topic } from "../api-client";
import { toast } from "sonner";
import { formatLocalDateStamp } from "@/utils/format";
import { mobileTableActionCellClass, mobileTableCellClass, mobileTableLabelClass } from "./responsive-table";

const toNumber = (value: number | string | null | undefined) => {
    const numberValue = Number(value ?? 0);
    return Number.isFinite(numberValue) ? numberValue : 0;
};

export function GradeExport() {
    const [classes, setClasses] = useState<TeacherClass[]>([]);
    const [topics, setTopics] = useState<Topic[]>([]);
    const [preview, setPreview] = useState<GradeExportPreviewItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [semesterFilter, setSemesterFilter] = useState<string>("all");
    const [classFilter, setClassFilter] = useState<string>("all");
    const [topicFilter, setTopicFilter] = useState<string>("all");
    const [selectedTaskIds, setSelectedTaskIds] = useState<number[]>([]);
    const [exporting, setExporting] = useState(false);

    useEffect(() => {
        loadFilters();
    }, []);

    useEffect(() => {
        loadPreview();
    }, [semesterFilter, classFilter, topicFilter]);

    const semesters = useMemo(() => {
        const values = classes.map((c) => c.semester).filter(Boolean) as string[];
        return Array.from(new Set(values)).sort();
    }, [classes]);

    const filteredClasses = useMemo(() => {
        if (semesterFilter === "all") return classes;
        return classes.filter((c) => c.semester === semesterFilter);
    }, [classes, semesterFilter]);

    const selectedCount = selectedTaskIds.length;

    const summary = useMemo(() => {
        const totalTasks = preview.length;
        const completedTasks = preview.filter((task) => {
            const total = toNumber(task.total);
            return total > 0 && toNumber(task.graded) === total;
        }).length;
        const totalSubmissions = preview.reduce((sum, task) => sum + toNumber(task.total), 0);
        const totalGraded = preview.reduce((sum, task) => sum + toNumber(task.graded), 0);
        return { totalTasks, completedTasks, totalSubmissions, totalGraded };
    }, [preview]);

    async function loadFilters() {
        const [classesRes, topicsRes] = await Promise.all([
            teacherApi.getClasses(),
            teacherApi.getTopics()
        ]);
        if (classesRes.success && classesRes.data) setClasses(classesRes.data);
        if (topicsRes.success && topicsRes.data) {
            setTopics(topicsRes.data.filter((topic) => topic.status === 1));
        }
    }

    async function loadPreview() {
        setLoading(true);
        const res = await teacherApi.getGradeExportPreview({
            semester: semesterFilter,
            classId: classFilter,
            topicId: topicFilter,
        });
        if (res.success && res.data) {
            setPreview(res.data);
        } else {
            setPreview([]);
        }
        setLoading(false);
        setSelectedTaskIds([]);
    }

    const previewMap = useMemo(() => new Map(preview.map(p => [p.taskId, p])), [preview]);

    function toggleTask(taskId: number) {
        setSelectedTaskIds(prev => prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]);
    }

    async function exportExcel(taskId?: number) {
        const ids = taskId ? [taskId] : selectedTaskIds;
        if (ids.length === 0 || exporting) return;

        const search = new URLSearchParams();
        if (semesterFilter !== "all") {
            search.set("semester", semesterFilter);
        }
        if (classFilter !== "all") {
            search.set("classId", classFilter);
        }
        if (topicFilter !== "all") {
            search.set("topicId", topicFilter);
        }
        if (ids.length === 1) {
            search.set("taskId", String(ids[0]));
        } else {
            search.set("taskIds", ids.join(","));
        }

        setExporting(true);
        try {
            const res = await fetch(`/api/teacher/grade-export/excel?${search.toString()}`, {
                credentials: "include",
            });

            if (!res.ok) {
                toast.error("导出失败");
                return;
            }

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            try {
                const link = document.createElement("a");
                link.href = url;
                link.download = `grade-export-${formatLocalDateStamp()}.xlsx`;
                document.body.appendChild(link);
                link.click();
                link.remove();
            } finally {
                URL.revokeObjectURL(url);
            }
        } catch {
            toast.error("导出失败");
        } finally {
            setExporting(false);
        }
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div>
                <h2 className="text-lg font-semibold text-foreground">成绩导出</h2>
                <p className="text-sm text-muted-foreground mt-1">按任务导出成绩，支持单项与批量导出。</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">任务数量</p>
                            <p className="text-2xl font-semibold text-foreground mt-1">{loading ? "-" : summary.totalTasks}</p>
                        </div>
                        <div className="app-stat-icon app-stat-icon-primary">
                            <Layers className="size-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">已完成任务</p>
                            <p className="text-2xl font-semibold text-foreground mt-1">{loading ? "-" : summary.completedTasks}</p>
                        </div>
                        <div className="app-stat-icon app-stat-icon-success">
                            <CheckCircle2 className="size-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">提交总数</p>
                            <p className="text-2xl font-semibold text-foreground mt-1">{loading ? "-" : summary.totalSubmissions}</p>
                        </div>
                        <div className="app-stat-icon app-stat-icon-warning">
                            <Users className="size-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">已批改</p>
                            <p className="text-2xl font-semibold text-foreground mt-1">{loading ? "-" : summary.totalGraded}</p>
                        </div>
                        <div className="app-stat-icon app-stat-icon-primary">
                            <FileSpreadsheet className="size-5" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-border pb-4">
                    <div>
                        <CardTitle className="text-base text-foreground">导出列表</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">共 {preview.length} 条数据</p>
                    </div>
                    <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto flex-wrap">
                        <Select value={semesterFilter} onValueChange={(v) => { setSemesterFilter(v); setClassFilter("all"); }}>
                            <SelectTrigger data-testid="teacher-export-semester-filter" className="sm:w-40">
                                <SelectValue placeholder="全部学期" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem value="all">全部学期</SelectItem>
                                    {semesters.map((s) => (
                                        <SelectItem key={s} value={s}>{s}</SelectItem>
                                    ))}
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <Select value={classFilter} onValueChange={setClassFilter}>
                            <SelectTrigger data-testid="teacher-export-class-filter" className="sm:w-40">
                                <SelectValue placeholder="全部班级" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem value="all">全部班级</SelectItem>
                                    {filteredClasses.map((cls) => (
                                        <SelectItem key={cls.id} value={cls.id.toString()}>{cls.name}</SelectItem>
                                    ))}
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <Select value={topicFilter} onValueChange={setTopicFilter}>
                            <SelectTrigger data-testid="teacher-export-topic-filter" className="sm:w-40">
                                <SelectValue placeholder="全部课题" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem value="all">全部课题</SelectItem>
                                    {topics.map((t) => (
                                        <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                                    ))}
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <Button
                            data-testid="teacher-export-batch"
                            variant="default"
                            disabled={selectedCount === 0 || exporting}
                            onClick={() => exportExcel()}
                        >
                            <FileSpreadsheet data-icon="inline-start" />
                            批量导出 ({selectedCount})
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="px-0 pt-0">
                    <Table className="md:table">
                        <TableHeader className="hidden md:table-header-group">
                            <TableRow className="border-border hover:bg-muted/50">
                                <TableHead className="w-12 text-center text-muted-foreground">
                                    <Checkbox
                                        data-testid="teacher-export-check-all"
                                        checked={selectedTaskIds.length > 0 && selectedTaskIds.length === preview.length}
                                        onCheckedChange={(checked) => {
                                            if (checked === true) {
                                                setSelectedTaskIds(preview.map(p => p.taskId));
                                            } else {
                                                setSelectedTaskIds([]);
                                            }
                                        }}
                                    />
                                </TableHead>
                                <TableHead className="text-muted-foreground">课题</TableHead>
                                <TableHead className="text-muted-foreground">班级</TableHead>
                                <TableHead className="text-muted-foreground">批改进度</TableHead>
                                <TableHead className="text-muted-foreground">平均分</TableHead>
                                <TableHead className="text-muted-foreground text-right">操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody className="block divide-y divide-border md:table-row-group md:divide-y-0">
                            {loading ? (
                                <TableRow className="block md:table-row">
                                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">加载中...</TableCell>
                                </TableRow>
                            ) : preview.length === 0 ? (
                                <TableRow className="block md:table-row">
                                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                                        <Empty className="py-0">
                                            <EmptyHeader>
                                                <EmptyMedia variant="icon">
                                                    <Search />
                                                </EmptyMedia>
                                                <EmptyTitle>暂无符合条件的数据</EmptyTitle>
                                            </EmptyHeader>
                                        </Empty>
                                    </TableCell>
                                </TableRow>
                            ) : preview.map((task) => {
                                const gradedCount = toNumber(task.graded);
                                const totalCount = toNumber(task.total);
                                const avgScore = toNumber(task.avgScore);

                                return (
                                    <TableRow data-testid={`teacher-export-row-${task.taskId}`} key={task.taskId} className="block border-b-0 py-3 hover:bg-muted/30 md:table-row md:border-b md:py-0">
                                        <TableCell className={`${mobileTableCellClass} md:text-center`}>
                                            <span className={mobileTableLabelClass}>选择</span>
                                            <Checkbox
                                                data-testid={`teacher-export-check-${task.taskId}`}
                                                checked={selectedTaskIds.includes(task.taskId)}
                                                onCheckedChange={() => toggleTask(task.taskId)}
                                            />
                                        </TableCell>
                                        <TableCell className={`${mobileTableCellClass} font-medium text-foreground`}>
                                            <span className={mobileTableLabelClass}>课题</span>
                                            <span className="min-w-0 break-words">{task.topic}</span>
                                        </TableCell>
                                        <TableCell className={mobileTableCellClass}>
                                            <span className={mobileTableLabelClass}>班级</span>
                                            <span className="min-w-0 break-words text-foreground">{task.className}</span>
                                        </TableCell>
                                        <TableCell className={mobileTableCellClass}>
                                            <span className={mobileTableLabelClass}>批改进度</span>
                                            <div className="flex min-w-36 items-center justify-end gap-2 md:justify-start">
                                                <Progress value={totalCount > 0 ? (gradedCount / totalCount) * 100 : 0} className="w-20 h-1.5 bg-muted [&>div]:bg-success" />
                                                <span className="text-xs text-muted-foreground">{gradedCount}/{totalCount}</span>
                                                {gradedCount === totalCount && totalCount > 0 && (
                                                    <Badge variant="success">已完成</Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className={`${mobileTableCellClass} font-medium font-mono text-foreground`}>
                                            <span className={mobileTableLabelClass}>平均分</span>
                                            <span>{avgScore > 0 ? avgScore.toFixed(1) : "-"}</span>
                                        </TableCell>
                                        <TableCell className={mobileTableActionCellClass}>
                                            <div className="mb-2 text-xs font-medium tracking-wider text-muted-foreground md:hidden">操作</div>
                                            <div className="grid grid-cols-1 gap-2 sm:flex sm:justify-end">
                                                <Button
                                                    data-testid={`teacher-export-single-${task.taskId}`}
                                                    variant="ghost"
                                                    size="xs"
                                                    disabled={exporting}
                                                    onClick={() => exportExcel(task.taskId)}
                                                >
                                                    <Download data-icon="inline-start" />
                                                    {exporting ? "导出中…" : "导出"}
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
