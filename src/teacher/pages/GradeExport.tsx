import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Users, CheckCircle2, Layers, Search, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { teacherApi, type GradeExportPreviewItem, type TeacherClass, type Topic } from "../api-client";
import { toast } from "sonner";
import { formatLocalDateStamp } from "@/utils/format";
import { IconTile } from "@/components/IconTile";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { notifyAuthExpired } from "@/lib/auth-expired";

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
        const completedTasks = preview.filter((task) => task.total > 0 && task.graded === task.total).length;
        const totalSubmissions = preview.reduce((sum, task) => sum + task.total, 0);
        const totalGraded = preview.reduce((sum, task) => sum + task.graded, 0);
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
            notifyAuthExpired(res);

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
                <Card className="transition-colors hover:border-input">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">任务数量</p>
                            <p className="text-2xl font-semibold text-foreground mt-1">{loading ? "-" : summary.totalTasks}</p>
                        </div>
                        <IconTile intent="info">
                            <Layers className="w-5 h-5" />
                        </IconTile>
                    </CardContent>
                </Card>
                <Card className="transition-colors hover:border-input">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">已完成任务</p>
                            <p className="text-2xl font-semibold text-foreground mt-1">{loading ? "-" : summary.completedTasks}</p>
                        </div>
                        <IconTile intent="success">
                            <CheckCircle2 className="w-5 h-5" />
                        </IconTile>
                    </CardContent>
                </Card>
                <Card className="transition-colors hover:border-input">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">提交总数</p>
                            <p className="text-2xl font-semibold text-foreground mt-1">{loading ? "-" : summary.totalSubmissions}</p>
                        </div>
                        <IconTile intent="warning">
                            <Users className="w-5 h-5" />
                        </IconTile>
                    </CardContent>
                </Card>
                <Card className="transition-colors hover:border-input">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">已批改</p>
                            <p className="text-2xl font-semibold text-foreground mt-1">{loading ? "-" : summary.totalGraded}</p>
                        </div>
                        <IconTile intent="auxiliary">
                            <FileSpreadsheet className="w-5 h-5" />
                        </IconTile>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <PageHeader as={CardHeader}>
                    <div>
                        <CardTitle className="text-base text-foreground">导出列表</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">共 {preview.length} 条数据</p>
                    </div>
                    <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto flex-wrap">
                        <Select value={semesterFilter} onValueChange={(v) => { setSemesterFilter(v); setClassFilter("all"); }}>
                            <SelectTrigger data-testid="teacher-export-semester-filter" className="bg-background border-border text-foreground sm:w-40">
                                <SelectValue placeholder="全部学期" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border text-foreground">
                                <SelectItem value="all">全部学期</SelectItem>
                                {semesters.map((s) => (
                                    <SelectItem key={s} value={s}>{s}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={classFilter} onValueChange={setClassFilter}>
                            <SelectTrigger data-testid="teacher-export-class-filter" className="bg-background border-border text-foreground sm:w-40">
                                <SelectValue placeholder="全部班级" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border text-foreground">
                                <SelectItem value="all">全部班级</SelectItem>
                                {filteredClasses.map((cls) => (
                                    <SelectItem key={cls.id} value={cls.id.toString()}>{cls.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={topicFilter} onValueChange={setTopicFilter}>
                            <SelectTrigger data-testid="teacher-export-topic-filter" className="bg-background border-border text-foreground sm:w-40">
                                <SelectValue placeholder="全部课题" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border text-foreground">
                                <SelectItem value="all">全部课题</SelectItem>
                                {topics.map((t) => (
                                    <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button
                            data-testid="teacher-export-batch"
                            variant="outline"
                            disabled={selectedCount === 0 || exporting}
                            onClick={() => exportExcel()}
                            className="border-primary bg-primary/10 text-primary hover:bg-primary/90 hover:text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <FileSpreadsheet className="w-4 h-4 mr-2" />
                            批量导出 ({selectedCount})
                        </Button>
                    </div>
                </PageHeader>
                <CardContent className="pt-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-border hover:bg-card/50">
                                <TableHead className="w-12 text-center text-muted-foreground">
                                    <input
                                        data-testid="teacher-export-check-all"
                                        type="checkbox"
                                        className="rounded border-input bg-card text-primary focus:ring-ring/20 w-4 h-4 cursor-pointer"
                                        checked={selectedTaskIds.length > 0 && selectedTaskIds.length === preview.length}
                                        onChange={(e) => {
                                            if (e.target.checked) {
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
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">加载中...</TableCell>
                                </TableRow>
                            ) : preview.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                                        <div className="flex flex-col items-center gap-2">
                                            <div className="w-12 h-12 rounded-full bg-card border border-border flex items-center justify-center">
                                                <Search className="w-6 h-6 text-muted-foreground" />
                                            </div>
                                            <p>暂无符合条件的数据</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : preview.map((task) => (
                                <TableRow data-testid={`teacher-export-row-${task.taskId}`} key={task.taskId} className="border-border hover:bg-muted/50 transition-colors">
                                    <TableCell className="text-center">
                                        <input
                                            data-testid={`teacher-export-check-${task.taskId}`}
                                            type="checkbox"
                                            className="rounded border-input bg-card text-primary focus:ring-ring/20 w-4 h-4 cursor-pointer"
                                            checked={selectedTaskIds.includes(task.taskId)}
                                            onChange={() => toggleTask(task.taskId)}
                                        />
                                    </TableCell>
                                    <TableCell className="font-medium text-foreground">{task.topic}</TableCell>
                                    <TableCell className="text-foreground/90">{task.className}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Progress value={task.total > 0 ? (task.graded / task.total) * 100 : 0} className="w-20 h-1.5 bg-muted [&>div]:bg-success" />
                                            <span className="text-xs text-muted-foreground">{task.graded}/{task.total}</span>
                                            {task.graded === task.total && task.total > 0 && (
                                                <StatusBadge intent="success" className="text-[10px] h-5">已完成</StatusBadge>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-medium font-mono text-foreground">{task.avgScore ? task.avgScore.toFixed(1) : "-"}</TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            data-testid={`teacher-export-single-${task.taskId}`}
                                            variant="ghost"
                                            size="sm"
                                            disabled={exporting}
                                            className="h-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                                            onClick={() => exportExcel(task.taskId)}
                                        >
                                            <Download className="w-3.5 h-3.5 mr-1" />
                                            {exporting ? "导出中…" : "导出"}
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
