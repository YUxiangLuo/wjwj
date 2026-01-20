import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
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
            <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-base">成绩导出</CardTitle>
                    <div className="flex gap-3">
                        <Select value={classFilter} onValueChange={setClassFilter}>
                            <SelectTrigger className="w-36">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部班级</SelectItem>
                                {classes.map((cls) => (
                                    <SelectItem key={cls.id} value={cls.id.toString()}>{cls.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={topicFilter} onValueChange={setTopicFilter}>
                            <SelectTrigger className="w-36">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部课题</SelectItem>
                                {topics.map((t) => (
                                    <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
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
                                    <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">加载中...</TableCell>
                                </TableRow>
                            ) : preview.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">暂无数据</TableCell>
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
                                            <Button variant="ghost" size="sm" className="text-primary" onClick={() => exportExcel(task.taskId)}>
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

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">批量导出</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-muted-foreground">已选择 {selectedCount} 项</span>
                        <Button variant="outline" disabled={selectedCount === 0} onClick={() => exportExcel()}>
                            <FileSpreadsheet className="w-4 h-4" />
                            批量导出Excel
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
