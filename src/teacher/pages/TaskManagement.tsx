import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList, CalendarDays, CheckCircle2, AlertTriangle, Search } from "lucide-react";
import { teacherApi, type Task, type Topic, type TeacherClass } from "../api-client";

export function TaskManagement() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [showPublishModal, setShowPublishModal] = useState(false);
    const [showExtendModal, setShowExtendModal] = useState(false);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [extendDeadline, setExtendDeadline] = useState("");

    // Data for modal
    const [availableTopics, setAvailableTopics] = useState<Topic[]>([]);
    const [availableClasses, setAvailableClasses] = useState<TeacherClass[]>([]);

    // Form state
    const [selectedTopicId, setSelectedTopicId] = useState<string>("");
    const [selectedClassIds, setSelectedClassIds] = useState<number[]>([]);
    const [deadline, setDeadline] = useState("");
    const [classFilter, setClassFilter] = useState("all");
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        loadTasks();
    }, []);

    // Load form data when modal opens
    useEffect(() => {
        if (showPublishModal) {
            Promise.all([
                teacherApi.getTopics(),
                teacherApi.getClasses()
            ]).then(([topicsRes, classesRes]) => {
                if (topicsRes.success && topicsRes.data) setAvailableTopics(topicsRes.data);
                if (classesRes.success && classesRes.data) setAvailableClasses(classesRes.data);
            });
        }
    }, [showPublishModal]);

    async function loadTasks() {
        setLoading(true);
        const res = await teacherApi.getTasks();
        if (res.success && res.data) {
            setTasks(res.data);
        }
        setLoading(false);
    }

    async function handlePublish() {
        if (!selectedTopicId || selectedClassIds.length === 0) {
            alert("请选择课题和班级");
            return;
        }

        const res = await teacherApi.createTask({
            topicId: Number(selectedTopicId),
            classIds: selectedClassIds,
            deadline: deadline || undefined
        });

        if (res.success) {
            setShowPublishModal(false);
            loadTasks();
            // Reset form
            setSelectedTopicId("");
            setSelectedClassIds([]);
            setDeadline("");
        } else {
            alert("发布失败: " + res.error?.message);
        }
    }

    async function handleExtendDeadline() {
        if (!selectedTask || !extendDeadline) return;
        const res = await teacherApi.extendTaskDeadline(selectedTask.id, extendDeadline);
        if (res.success) {
            setShowExtendModal(false);
            setSelectedTask(null);
            setExtendDeadline("");
            loadTasks();
        } else {
            alert("延长失败: " + res.error?.message);
        }
    }

    const toggleClass = (id: number) => {
        setSelectedClassIds(prev =>
            prev.includes(id) ? prev.filter(cid => cid !== id) : [...prev, id]
        );
    };

    const summary = useMemo(() => {
        const total = tasks.length;
        const pendingTotal = tasks.reduce((sum, task) => sum + (task.pending ?? 0), 0);
        const completedTotal = tasks.reduce((sum, task) => sum + task.completed, 0);
        const totalSubmissions = tasks.reduce((sum, task) => sum + task.total, 0);
        return { total, pendingTotal, completedTotal, totalSubmissions };
    }, [tasks]);

    const filteredTasks = useMemo(() => {
        const keyword = searchTerm.trim().toLowerCase();
        return tasks.filter((task) => {
            const matchesClass = classFilter === "all" || task.className === classFilter;
            const matchesKeyword = !keyword || task.topic.toLowerCase().includes(keyword);
            return matchesClass && matchesKeyword;
        });
    }, [tasks, classFilter, searchTerm]);

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold text-slate-900">任务管理</h2>
                <p className="text-sm text-slate-500 mt-1">管理发布任务与批改进度。</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <Card className="border-slate-200 shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500">任务总数</p>
                            <p className="text-2xl font-semibold text-slate-900">{loading ? "-" : summary.total}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                            <ClipboardList className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-200 shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500">待批改</p>
                            <p className="text-2xl font-semibold text-slate-900">{loading ? "-" : summary.pendingTotal}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center">
                            <AlertTriangle className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-200 shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500">已完成</p>
                            <p className="text-2xl font-semibold text-slate-900">{loading ? "-" : summary.completedTotal}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                            <CheckCircle2 className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-200 shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500">总提交数</p>
                            <p className="text-2xl font-semibold text-slate-900">{loading ? "-" : summary.totalSubmissions}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
                            <CalendarDays className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-slate-200 shadow-sm">
                <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <CardTitle className="text-base">任务列表</CardTitle>
                        <p className="text-xs text-slate-500 mt-1">共 {filteredTasks.length} 条</p>
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                        <div className="relative sm:w-56">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <Input
                                placeholder="搜索课题"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                        <Select value={classFilter} onValueChange={setClassFilter}>
                            <SelectTrigger className="sm:w-40">
                                <SelectValue placeholder="全部班级" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部班级</SelectItem>
                                {Array.from(new Set(tasks.map((task) => task.className))).map((name) => (
                                    <SelectItem key={name} value={name}>{name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button onClick={() => setShowPublishModal(true)}>+ 发布任务</Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? <div className="text-center py-6 text-slate-500">加载中...</div> : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>课题</TableHead>
                                    <TableHead>班级</TableHead>
                                    <TableHead>发布时间</TableHead>
                                    <TableHead>截止时间</TableHead>
                                    <TableHead>完成进度</TableHead>
                                    <TableHead>待批改</TableHead>
                                    <TableHead>操作</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredTasks.map((task) => (
                                    <TableRow key={task.id}>
                                        <TableCell className="font-medium text-slate-900">{task.topic}</TableCell>
                                        <TableCell>{task.className}</TableCell>
                                        <TableCell className="text-slate-500">{task.publishedAt ? new Date(task.publishedAt).toLocaleDateString() : "-"}</TableCell>
                                        <TableCell className="text-slate-500">{task.deadline ? new Date(task.deadline).toLocaleDateString() : "无"}</TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Progress value={task.total > 0 ? (task.completed / task.total) * 100 : 0} className="w-20 h-2" />
                                                <span className="text-xs text-slate-500">{task.completed}/{task.total}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
                                                {task.pending ?? 0}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-2">
                                                <Button variant="ghost" size="sm" className="text-blue-600">查看进度</Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => {
                                                        setSelectedTask(task);
                                                        setExtendDeadline("");
                                                        setShowExtendModal(true);
                                                    }}
                                                >
                                                    延长时间
                                                </Button>
                                                <Button variant="ghost" size="sm" className="text-rose-600">进入批改</Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {filteredTasks.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-10 text-slate-500">
                                            暂无任务
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <Dialog open={showPublishModal} onOpenChange={setShowPublishModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>发布任务</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>选择课题</Label>
                            <Select onValueChange={setSelectedTopicId} value={selectedTopicId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="请选择课题" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableTopics.map(t => (
                                        <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>选择班级</Label>
                            <div className="space-y-2 border p-3 rounded-md max-h-40 overflow-y-auto">
                                {availableClasses.length === 0 ? <div className="text-sm text-muted-foreground">无班级</div> : availableClasses.map((cls) => (
                                    <label key={cls.id} className="flex items-center gap-2 text-sm cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="rounded border-input"
                                            checked={selectedClassIds.includes(cls.id)}
                                            onChange={() => toggleClass(cls.id)}
                                        />
                                        {cls.name}
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="deadline">截止时间（可选）</Label>
                            <Input
                                id="deadline"
                                type="datetime-local"
                                value={deadline}
                                onChange={e => setDeadline(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowPublishModal(false)}>取消</Button>
                        <Button onClick={handlePublish}>确认发布</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showExtendModal} onOpenChange={setShowExtendModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>延长截止时间</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="text-sm text-muted-foreground">
                            {selectedTask ? `${selectedTask.topic} · ${selectedTask.className}` : ""}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="extendDeadline">新截止时间</Label>
                            <Input
                                id="extendDeadline"
                                type="datetime-local"
                                value={extendDeadline}
                                onChange={e => setExtendDeadline(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowExtendModal(false)}>取消</Button>
                        <Button onClick={handleExtendDeadline}>确认延长</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
