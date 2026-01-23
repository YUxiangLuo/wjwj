import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Users, CheckCircle2, Layers, Search, Download } from "lucide-react";
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
        <div className="space-y-6 animate-in fade-in duration-500">
            <div>
                <h2 className="text-lg font-semibold text-slate-100">成绩导出</h2>
                <p className="text-sm text-slate-400 mt-1">按任务导出成绩，支持单项与批量导出。</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <Card className="border-slate-800 bg-slate-900 shadow-sm hover:border-slate-700 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">任务数量</p>
                            <p className="text-2xl font-semibold text-slate-100 mt-1">{loading ? "-" : summary.totalTasks}</p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20">
                            <Layers className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-800 bg-slate-900 shadow-sm hover:border-slate-700 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">已完成任务</p>
                            <p className="text-2xl font-semibold text-slate-100 mt-1">{loading ? "-" : summary.completedTasks}</p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
                            <CheckCircle2 className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-800 bg-slate-900 shadow-sm hover:border-slate-700 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">提交总数</p>
                            <p className="text-2xl font-semibold text-slate-100 mt-1">{loading ? "-" : summary.totalSubmissions}</p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
                            <Users className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-800 bg-slate-900 shadow-sm hover:border-slate-700 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">已批改</p>
                            <p className="text-2xl font-semibold text-slate-100 mt-1">{loading ? "-" : summary.totalGraded}</p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center border border-purple-500/20">
                            <FileSpreadsheet className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-slate-800 bg-slate-900 shadow-sm">
                <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-slate-800 pb-4">
                    <div>
                        <CardTitle className="text-base text-slate-100">导出列表</CardTitle>
                        <p className="text-xs text-slate-500 mt-1">共 {preview.length} 条数据</p>
                    </div>
                    <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
                        <Select value={classFilter} onValueChange={setClassFilter}>
                            <SelectTrigger className="bg-slate-950 border-slate-800 text-slate-200 sm:w-40">
                                <SelectValue placeholder="全部班级" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                                <SelectItem value="all">全部班级</SelectItem>
                                {classes.map((cls) => (
                                    <SelectItem key={cls.id} value={cls.id.toString()}>{cls.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={topicFilter} onValueChange={setTopicFilter}>
                            <SelectTrigger className="bg-slate-950 border-slate-800 text-slate-200 sm:w-40">
                                <SelectValue placeholder="全部课题" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                                <SelectItem value="all">全部课题</SelectItem>
                                {topics.map((t) => (
                                    <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button
                            variant="outline"
                            disabled={selectedCount === 0}
                            onClick={() => exportExcel()}
                            className="border-indigo-600 bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <FileSpreadsheet className="w-4 h-4 mr-2" />
                            批量导出 ({selectedCount})
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="pt-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-slate-800 hover:bg-slate-900/50">
                                <TableHead className="w-12 text-center text-slate-400">
                                    <input
                                        type="checkbox"
                                        className="rounded border-slate-600 bg-slate-900 text-indigo-500 focus:ring-indigo-500/20 w-4 h-4 cursor-pointer"
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
                                <TableHead className="text-slate-400">课题</TableHead>
                                <TableHead className="text-slate-400">班级</TableHead>
                                <TableHead className="text-slate-400">批改进度</TableHead>
                                <TableHead className="text-slate-400">平均分</TableHead>
                                <TableHead className="text-slate-400 text-right">操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-12 text-slate-500">加载中...</TableCell>
                                </TableRow>
                            ) : preview.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-12 text-slate-500">
                                        <div className="flex flex-col items-center gap-2">
                                            <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center">
                                                <Search className="w-6 h-6 text-slate-600" />
                                            </div>
                                            <p>暂无符合条件的数据</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : preview.map((task) => (
                                <TableRow key={task.taskId} className="border-slate-800 hover:bg-slate-800/50 transition-colors">
                                    <TableCell className="text-center">
                                        <input
                                            type="checkbox"
                                            className="rounded border-slate-600 bg-slate-900 text-indigo-500 focus:ring-indigo-500/20 w-4 h-4 cursor-pointer"
                                            checked={selectedTaskIds.includes(task.taskId)}
                                            onChange={() => toggleTask(task.taskId)}
                                        />
                                    </TableCell>
                                    <TableCell className="font-medium text-slate-200">{task.topic}</TableCell>
                                    <TableCell className="text-slate-300">{task.className}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Progress value={task.total > 0 ? (task.graded / task.total) * 100 : 0} className="w-20 h-1.5 bg-slate-800 [&>div]:bg-emerald-500" />
                                            <span className="text-xs text-slate-500">{task.graded}/{task.total}</span>
                                            {task.graded === task.total && task.total > 0 && (
                                                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20 text-[10px] h-5">已完成</Badge>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-medium font-mono text-slate-200">{task.avgScore ? task.avgScore.toFixed(1) : "-"}</TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10"
                                            onClick={() => exportExcel(task.taskId)}
                                        >
                                            <Download className="w-3.5 h-3.5 mr-1" />
                                            导出
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
