import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Users, CheckCircle2, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { teacherApi, type GradeExportPreviewItem, type TeacherClass, type Topic } from "../api-client";

export function GradeExport() {
    const [classes, setClasses] = useState<TeacherClass[]>([]);
    const [topics, setTopics] = useState<Topic[]>([]);
    const [preview, setPreview] = useState<GradeExportPreviewItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [classFilter, setClassFilter] = useState<string>("all");
    const [topicFilter, setTopicFilter] = useState<string>("all");
    const [selectedTaskIds, setSelectedTaskIds] = useState<number[]>([]);

    useEffect(() => {
        loadFilters();
    }, []);

    useEffect(() => {
        loadPreview();
    }, [classFilter, topicFilter]);

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
        if (topicsRes.success && topicsRes.data) setTopics(topicsRes.data);
    }

    async function loadPreview() {
        setLoading(true);
        const res = await teacherApi.getGradeExportPreview({
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
        if (ids.length === 0) return;

        const search = new URLSearchParams();
        if (ids.length === 1) {
            search.set("taskId", String(ids[0]));
        } else {
            search.set("taskIds", ids.join(","));
        }

        const res = await fetch(`/api/teacher/grade-export/excel?${search.toString()}`, {
            credentials: "include",
        });

        if (!res.ok) {
            alert("导出失败");
            return;
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `grade-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold text-slate-900">成绩导出</h2>
                <p className="text-sm text-slate-500 mt-1">按任务导出成绩，支持单项与批量导出。</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <Card className="border-slate-200 shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500">任务数量</p>
                            <p className="text-2xl font-semibold text-slate-900">{loading ? "-" : summary.totalTasks}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                            <Layers className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-200 shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500">已完成任务</p>
                            <p className="text-2xl font-semibold text-slate-900">{loading ? "-" : summary.completedTasks}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                            <CheckCircle2 className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-200 shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500">提交总数</p>
                            <p className="text-2xl font-semibold text-slate-900">{loading ? "-" : summary.totalSubmissions}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
                            <Users className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-200 shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500">已批改</p>
                            <p className="text-2xl font-semibold text-slate-900">{loading ? "-" : summary.totalGraded}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center">
                            <FileSpreadsheet className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-slate-200 shadow-sm">
                <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <CardTitle className="text-base">导出列表</CardTitle>
                        <p className="text-xs text-slate-500 mt-1">共 {preview.length} 条</p>
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                        <Select value={classFilter} onValueChange={setClassFilter}>
                            <SelectTrigger className="sm:w-40">
                                <SelectValue placeholder="全部班级" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部班级</SelectItem>
                                {classes.map((cls) => (
                                    <SelectItem key={cls.id} value={cls.id.toString()}>{cls.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={topicFilter} onValueChange={setTopicFilter}>
                            <SelectTrigger className="sm:w-40">
                                <SelectValue placeholder="全部课题" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部课题</SelectItem>
                                {topics.map((t) => (
                                    <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button variant="outline" disabled={selectedCount === 0} onClick={() => exportExcel()}>
                            <FileSpreadsheet className="w-4 h-4" />
                            批量导出
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-8">
                                    <input
                                        type="checkbox"
                                        className="rounded border-input"
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
                                <TableHead>课题</TableHead>
                                <TableHead>班级</TableHead>
                                <TableHead>批改进度</TableHead>
                                <TableHead>平均分</TableHead>
                                <TableHead>操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-6 text-slate-500">加载中...</TableCell>
                                </TableRow>
                            ) : preview.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-6 text-slate-500">暂无数据</TableCell>
                                </TableRow>
                            ) : preview.map((task) => (
                                <TableRow key={task.taskId}>
                                    <TableCell>
                                        <input
                                            type="checkbox"
                                            className="rounded border-input"
                                            checked={selectedTaskIds.includes(task.taskId)}
                                            onChange={() => toggleTask(task.taskId)}
                                        />
                                    </TableCell>
                                    <TableCell className="font-medium">{task.topic}</TableCell>
                                    <TableCell>{task.className}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Progress value={task.total > 0 ? (task.graded / task.total) * 100 : 0} className="w-16 h-2" />
                                            <span className="text-xs text-muted-foreground">{task.graded}/{task.total}</span>
                                            {task.graded === task.total && (
                                                <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-xs">已完成</Badge>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-medium">{task.avgScore ? task.avgScore.toFixed(1) : "-"}</TableCell>
                                    <TableCell>
                                        <div className="flex gap-2">
                                            <Button variant="ghost" size="sm" className="text-blue-600" onClick={() => exportExcel(task.taskId)}>
                                                <FileSpreadsheet className="w-4 h-4 mr-1" />
                                                导出Excel
                                            </Button>
                                        </div>
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
