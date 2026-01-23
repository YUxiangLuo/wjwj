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
import { ClipboardList, CalendarDays, CheckCircle2, AlertTriangle, Search, Clock, Plus } from "lucide-react";
import { teacherApi, type Task, type Topic, type TeacherClass } from "../api-client";
import { Link } from "react-router-dom";

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
                if (topicsRes.success && topicsRes.data) setAvailableTopics(topicsRes.data.filter(t => t.status === 1)); // Only show published topics
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
        <div className="space-y-6 animate-in fade-in duration-500">
            <div>
                <h2 className="text-lg font-semibold text-slate-100">任务管理</h2>
                <p className="text-sm text-slate-400 mt-1">管理发布任务与批改进度。</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <Card className="border-slate-800 bg-slate-900 shadow-sm hover:border-slate-700 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">任务总数</p>
                            <p className="text-2xl font-bold text-slate-100 mt-1">{loading ? "-" : summary.total}</p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20">
                            <ClipboardList className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-800 bg-slate-900 shadow-sm hover:border-slate-700 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">待批改</p>
                            <p className="text-2xl font-bold text-slate-100 mt-1">{loading ? "-" : summary.pendingTotal}</p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center border border-rose-500/20">
                            <AlertTriangle className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-800 bg-slate-900 shadow-sm hover:border-slate-700 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">已完成</p>
                            <p className="text-2xl font-bold text-slate-100 mt-1">{loading ? "-" : summary.completedTotal}</p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
                            <CheckCircle2 className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-800 bg-slate-900 shadow-sm hover:border-slate-700 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">总提交数</p>
                            <p className="text-2xl font-bold text-slate-100 mt-1">{loading ? "-" : summary.totalSubmissions}</p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
                            <CalendarDays className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-slate-800 bg-slate-900 shadow-sm">
                <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-slate-800 pb-4">
                    <div>
                        <CardTitle className="text-base text-slate-100">任务列表</CardTitle>
                        <p className="text-xs text-slate-500 mt-1">共 {filteredTasks.length} 条数据</p>
                    </div>
                    <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
                        <div className="relative sm:w-56">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            <Input
                                placeholder="搜索课题"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600 focus:border-indigo-500/50"
                            />
                        </div>
                        <Select value={classFilter} onValueChange={setClassFilter}>
                            <SelectTrigger className="bg-slate-950 border-slate-800 text-slate-200 sm:w-40">
                                <SelectValue placeholder="全部班级" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                                <SelectItem value="all">全部班级</SelectItem>
                                {Array.from(new Set(tasks.map((task) => task.className))).map((name) => (
                                    <SelectItem key={name} value={name}>{name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button onClick={() => setShowPublishModal(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20">
                            <Plus className="w-4 h-4 mr-1" /> 发布任务
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="pt-0">
                    {loading ? <div className="text-center py-12 text-slate-500">加载中...</div> : (
                        <Table>
                            <TableHeader>
                                <TableRow className="border-slate-800 hover:bg-slate-900/50">
                                    <TableHead className="text-slate-400">课题</TableHead>
                                    <TableHead className="text-slate-400">班级</TableHead>
                                    <TableHead className="text-slate-400">发布时间</TableHead>
                                    <TableHead className="text-slate-400">截止时间</TableHead>
                                    <TableHead className="text-slate-400">完成进度</TableHead>
                                    <TableHead className="text-slate-400">待批改</TableHead>
                                    <TableHead className="text-slate-400 text-right">操作</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredTasks.map((task) => (
                                    <TableRow key={task.id} className="border-slate-800 hover:bg-slate-800/50 transition-colors">
                                        <TableCell className="font-medium text-slate-200">{task.topic}</TableCell>
                                        <TableCell className="text-slate-300">{task.className}</TableCell>
                                        <TableCell className="text-slate-500 text-xs">{task.publishedAt ? new Date(task.publishedAt).toLocaleDateString() : "-"}</TableCell>
                                        <TableCell className="text-slate-500 text-xs">{task.deadline ? new Date(task.deadline).toLocaleDateString() : "无"}</TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Progress value={task.total > 0 ? (task.completed / task.total) * 100 : 0} className="w-20 h-1.5 bg-slate-800 [&>div]:bg-emerald-500" />
                                                <span className="text-xs text-slate-500">{task.completed}/{task.total}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {task.pending && task.pending > 0 ? (
                                                <Badge variant="secondary" className="bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20">
                                                    {task.pending}
                                                </Badge>
                                            ) : (
                                                <span className="text-slate-600 text-xs">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => {
                                                        setSelectedTask(task);
                                                        setExtendDeadline("");
                                                        setShowExtendModal(true);
                                                    }}
                                                    className="h-8 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10"
                                                >
                                                    <Clock className="w-3.5 h-3.5 mr-1" />
                                                    延时
                                                </Button>
                                                <Button variant="ghost" size="sm" asChild className="h-8 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10">
                                                    <Link to="/grading">批改</Link>
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {filteredTasks.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-16 text-slate-500">
                                            <div className="flex flex-col items-center gap-2">
                                                <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center">
                                                    <Search className="w-5 h-5 text-slate-600" />
                                                </div>
                                                <p>暂无符合条件的数据</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <Dialog open={showPublishModal} onOpenChange={setShowPublishModal}>
                <DialogContent className="bg-slate-900 border-slate-800 text-slate-200 sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-slate-100">发布任务</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label className="text-slate-300">选择课题</Label>
                            <Select onValueChange={setSelectedTopicId} value={selectedTopicId}>
                                <SelectTrigger className="bg-slate-950 border-slate-800 text-slate-200">
                                    <SelectValue placeholder="请选择课题" />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                                    {availableTopics.length === 0 ? <SelectItem value="none" disabled>暂无已发布课题</SelectItem> :
                                        availableTopics.map(t => (
                                            <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                                        ))
                                    }
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-slate-300">选择班级</Label>
                            <div className="space-y-2 border border-slate-800 bg-slate-950 rounded-md p-3 max-h-40 overflow-y-auto">
                                {availableClasses.length === 0 ? <div className="text-sm text-slate-500">无班级</div> : availableClasses.map((cls) => (
                                    <label key={cls.id} className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer hover:bg-slate-900 p-1.5 rounded">
                                        <input
                                            type="checkbox"
                                            className="rounded border-slate-600 bg-slate-900 text-indigo-500 focus:ring-indigo-500/20"
                                            checked={selectedClassIds.includes(cls.id)}
                                            onChange={() => toggleClass(cls.id)}
                                        />
                                        {cls.name}
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="deadline" className="text-slate-300">截止时间（可选）</Label>
                            <Input
                                id="deadline"
                                type="datetime-local"
                                value={deadline}
                                onChange={e => setDeadline(e.target.value)}
                                className="bg-slate-950 border-slate-800 text-slate-200"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setShowPublishModal(false)} className="text-slate-400 hover:text-slate-200 hover:bg-slate-800">取消</Button>
                        <Button onClick={handlePublish} className="bg-indigo-600 hover:bg-indigo-700 text-white">确认发布</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showExtendModal} onOpenChange={setShowExtendModal}>
                <DialogContent className="bg-slate-900 border-slate-800 text-slate-200 sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-slate-100">延长截止时间</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="text-sm text-slate-500">
                            {selectedTask ? `${selectedTask.topic} · ${selectedTask.className}` : ""}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="extendDeadline" className="text-slate-300">新截止时间</Label>
                            <Input
                                id="extendDeadline"
                                type="datetime-local"
                                value={extendDeadline}
                                onChange={e => setExtendDeadline(e.target.value)}
                                className="bg-slate-950 border-slate-800 text-slate-200"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setShowExtendModal(false)} className="text-slate-400 hover:text-slate-200 hover:bg-slate-800">取消</Button>
                        <Button onClick={handleExtendDeadline} className="bg-indigo-600 hover:bg-indigo-700 text-white">确认延长</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
