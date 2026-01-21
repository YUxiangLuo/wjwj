import { useState, useEffect, useMemo } from "react";
import { Search, RotateCcw, Loader2, ArrowRight, Users, CheckCircle2, PauseCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { studentApi, classApi, type Student, type Class, type StudentExperiment } from "../api-client";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";

export function StudentManagement() {
    const location = useLocation();
    const [students, setStudents] = useState<Student[]>([]);
    const [classes, setClasses] = useState<Class[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterClass, setFilterClass] = useState("all");
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | "active" | "disabled">("all");

    // Transfer Modal State
    const [transferStudent, setTransferStudent] = useState<Student | null>(null);
    const [targetClassId, setTargetClassId] = useState<string>("");
    const [transferReason, setTransferReason] = useState("");

    // Experiment Modal State
    const [selectedStudentForExp, setSelectedStudentForExp] = useState<Student | null>(null);
    const [experiments, setExperiments] = useState<StudentExperiment[]>([]);
    const [loadingExperiments, setLoadingExperiments] = useState(false);

    useEffect(() => {
        loadInitialData();
    }, []);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const classId = params.get("classId");
        if (classId) {
            setFilterClass(classId);
        }
    }, [location.search]);

    useEffect(() => {
        loadStudents();
    }, [filterClass]);

    async function loadInitialData() {
        try {
            const classesRes = await classApi.list({});
            if (classesRes.success && classesRes.data) {
                setClasses(classesRes.data);
            }
        } catch (error) {
            console.error("Failed to load classes:", error);
        }

        loadStudents();
    }

    async function loadStudents() {
        setLoading(true);
        try {
            const res = await studentApi.list({
                classId: filterClass !== "all" ? filterClass : undefined,
                search: searchTerm || undefined,
            });
            if (res.success && res.data) {
                setStudents(res.data);
            }
        } catch (error) {
            console.error("Failed to load students:", error);
        } finally {
            setLoading(false);
        }
    }

    function handleSearch() {
        loadStudents();
    }

    async function handleResetPassword(student: Student) {
        if (!confirm(`确定重置学生「${student.name}」的密码吗？\n\n密码将重置为学号。`)) {
            return;
        }

        try {
            const res = await studentApi.resetPassword(student.id);
            if (res.success) {
                toast.success(`密码已重置为：${student.studentId}`);
            } else {
                toast.error(res.error?.message ?? "重置失败");
            }
        } catch (error) {
            console.error("Failed to reset password:", error);
            toast.error("重置失败");
        }
    }

    async function handleToggleStatus(student: Student) {
        const newStatus = student.status === 1 ? 0 : 1;
        const action = newStatus === 0 ? "停用" : "启用";

        if (!confirm(`确定${action}学生「${student.name}」吗？`)) {
            return;
        }

        try {
            const res = await studentApi.updateStatus(student.id, newStatus);
            if (res.success) {
                loadStudents();
            } else {
                toast.error(res.error?.message ?? `${action}失败`);
            }
        } catch (error) {
            console.error(`Failed to ${action} student:`, error);
            toast.error(`${action}失败`);
        }
    }

    function openTransferModal(student: Student) {
        setTransferStudent(student);
        setTargetClassId("");
        setTransferReason("");
    }

    async function openExperimentsModal(student: Student) {
        setSelectedStudentForExp(student);
        setExperiments([]);
        setLoadingExperiments(true);
        try {
            const res = await studentApi.getExperiments(student.id);
            if (res.success && res.data) {
                setExperiments(res.data);
            }
        } catch (error) {
            console.error("Failed to load experiments:", error);
        } finally {
            setLoadingExperiments(false);
        }
    }

    async function handleTransfer() {
        if (!transferStudent || !targetClassId) return;

        try {
            const res = await studentApi.transfer(transferStudent.id, {
                targetClassId: parseInt(targetClassId),
                reason: transferReason,
            });

            if (res.success) {
                setTransferStudent(null);
                loadStudents();
                toast.success("转班成功");
            } else {
                toast.error(res.error?.message ?? "转班失败");
            }
        } catch (error) {
            console.error("Failed to transfer student:", error);
            toast.error("转班失败");
        }
    }

    const getProgressColor = (progress: number) => {
        if (progress >= 80) return "[&>div]:bg-emerald-500";
        if (progress >= 50) return "[&>div]:bg-amber-500";
        return "[&>div]:bg-destructive";
    };

    const formatDateTime = (dateStr: string | null) => {
        if (!dateStr) return "-";
        return new Date(dateStr).toLocaleString("zh-CN");
    };

    const summary = useMemo(() => {
        const total = students.length;
        const active = students.filter((student) => student.status === 1).length;
        const disabled = total - active;
        const avgProgress = total === 0
            ? 0
            : Math.round(students.reduce((sum, student) => sum + (student.progress || 0), 0) / total);
        return { total, active, disabled, avgProgress };
    }, [students]);

    const filteredStudents = useMemo(() => {
        if (statusFilter === "all") return students;
        const active = statusFilter === "active";
        return students.filter((student) => (active ? student.status === 1 : student.status !== 1));
    }, [students, statusFilter]);

    return (
        <>
            <div className="space-y-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900">学生管理</h2>
                        <p className="text-sm text-slate-500 mt-1">查看学生档案、实验进度与班级调整。</p>
                    </div>
                    <Button variant="outline" onClick={handleSearch} disabled={loading}>
                        <Search className="w-4 h-4" />
                        刷新结果
                    </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    <Card className="border-slate-200 shadow-sm">
                        <CardContent className="p-4 flex items-center justify-between">
                            <div>
                                <p className="text-xs text-slate-500">学生总数</p>
                                <p className="text-2xl font-semibold text-slate-900">{loading ? "-" : summary.total}</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                                <Users className="w-5 h-5" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="border-slate-200 shadow-sm">
                        <CardContent className="p-4 flex items-center justify-between">
                            <div>
                                <p className="text-xs text-slate-500">正常账号</p>
                                <p className="text-2xl font-semibold text-slate-900">{loading ? "-" : summary.active}</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                <CheckCircle2 className="w-5 h-5" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="border-slate-200 shadow-sm">
                        <CardContent className="p-4 flex items-center justify-between">
                            <div>
                                <p className="text-xs text-slate-500">已停用</p>
                                <p className="text-2xl font-semibold text-slate-900">{loading ? "-" : summary.disabled}</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
                                <PauseCircle className="w-5 h-5" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="border-slate-200 shadow-sm">
                        <CardContent className="p-4 flex items-center justify-between">
                            <div>
                                <p className="text-xs text-slate-500">平均进度</p>
                                <p className="text-2xl font-semibold text-slate-900">{loading ? "-" : `${summary.avgProgress}%`}</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center">
                                <Search className="w-5 h-5" />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <Card className="border-slate-200 shadow-sm">
                    <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <CardTitle className="text-base">学生列表</CardTitle>
                            <p className="text-xs text-slate-500 mt-1">共 {filteredStudents.length} 条</p>
                        </div>
                        <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                            <div className="relative sm:w-64">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <Input
                                    placeholder="搜索学号或姓名"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                                    className="pl-9"
                                />
                            </div>
                            <Select value={filterClass} onValueChange={setFilterClass}>
                                <SelectTrigger className="sm:w-44">
                                    <SelectValue placeholder="全部班级" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">全部班级</SelectItem>
                                    {classes.map((c) => (
                                        <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | "active" | "disabled")}>
                                <SelectTrigger className="sm:w-36">
                                    <SelectValue placeholder="状态筛选" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">全部状态</SelectItem>
                                    <SelectItem value="active">正常</SelectItem>
                                    <SelectItem value="disabled">已停用</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>学号</TableHead>
                                        <TableHead>姓名</TableHead>
                                        <TableHead>班级</TableHead>
                                        <TableHead>状态</TableHead>
                                        <TableHead>实验进度</TableHead>
                                        <TableHead>最后活跃</TableHead>
                                        <TableHead>操作</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredStudents.map((student) => (
                                        <TableRow key={student.id}>
                                            <TableCell className="font-medium text-slate-900">{student.studentId}</TableCell>
                                            <TableCell>{student.name}</TableCell>
                                            <TableCell>{student.className}</TableCell>
                                            <TableCell>
                                                {student.status === 1 ? (
                                                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">正常</Badge>
                                                ) : (
                                                    <Badge variant="destructive">已停用</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Progress value={student.progress} className={`w-20 h-2 ${getProgressColor(student.progress)}`} />
                                                    <span className="text-xs text-slate-500">{student.progress}%</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-slate-500">{formatDateTime(student.lastActive)}</TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => openExperimentsModal(student)}
                                                    >
                                                        <Search className="w-3 h-3 mr-1" />
                                                        实验记录
                                                    </Button>
                                                    <Button variant="ghost" size="sm" onClick={() => handleResetPassword(student)}>
                                                        <RotateCcw className="w-3 h-3 mr-1" />
                                                        重置密码
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => openTransferModal(student)}
                                                    >
                                                        <ArrowRight className="w-3 h-3 mr-1" />
                                                        转班
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleToggleStatus(student)}
                                                        className={student.status === 1 ? "text-orange-500 hover:text-orange-600" : "text-emerald-600 hover:text-emerald-700"}
                                                    >
                                                        {student.status === 1 ? "停用" : "启用"}
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {filteredStudents.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center py-12 text-slate-500">
                                                暂无符合条件的数据
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Dialog open={!!transferStudent} onOpenChange={(open) => !open && setTransferStudent(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>学生转班</DialogTitle>
                        <DialogDescription>
                            将学生 [{transferStudent?.studentId} {transferStudent?.name}] 从 [{transferStudent?.className}] 转至新班级。
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">目标班级</label>
                            <Select value={targetClassId} onValueChange={setTargetClassId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="选择新班级" />
                                </SelectTrigger>
                                <SelectContent>
                                    {classes
                                        .filter((c) => c.id !== transferStudent?.classId)
                                        .map((c) => (
                                            <SelectItem key={c.id} value={String(c.id)}>
                                                {c.name}
                                            </SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">转班原因 (可选)</label>
                            <Input
                                value={transferReason}
                                onChange={(e) => setTransferReason(e.target.value)}
                                placeholder="例如：行政调班"
                            />
                        </div>
                        <div className="bg-amber-50 text-amber-800 p-3 rounded-md text-sm">
                            <p className="font-semibold mb-1">⚠️ 注意事项：</p>
                            <ul className="list-disc pl-4 space-y-1">
                                <li>学生在原班级的实验数据将被存档保留。</li>
                                <li>学生需要在新班级重新开始实验（如适用）。</li>
                            </ul>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setTransferStudent(null)}>
                            取消
                        </Button>
                        <Button onClick={handleTransfer} disabled={!targetClassId}>
                            确认转班
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <Dialog open={!!selectedStudentForExp} onOpenChange={(open) => !open && setSelectedStudentForExp(null)}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>实验记录 - {selectedStudentForExp?.name} ({selectedStudentForExp?.studentId})</DialogTitle>
                    </DialogHeader>

                    {loadingExperiments ? (
                        <div className="flex justify-center py-12">
                            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>实验/任务名称</TableHead>
                                    <TableHead>当前阶段</TableHead>
                                    <TableHead>状态</TableHead>
                                    <TableHead>进度</TableHead>
                                    <TableHead>得分</TableHead>
                                    <TableHead>提交时间</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {experiments.map((exp) => (
                                    <TableRow key={exp.id}>
                                        <TableCell>{exp.taskName || "未命名任务"}</TableCell>
                                        <TableCell>第 {exp.currentStage} 阶段</TableCell>
                                        <TableCell>
                                            <Badge variant={exp.status >= 1 ? "default" : "secondary"}>
                                                {exp.statusText}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Progress value={exp.progress} className={`w-16 h-2 ${getProgressColor(exp.progress)}`} />
                                                <span className="text-xs">{exp.progress}%</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>{exp.score !== null ? exp.score : "-"}</TableCell>
                                        <TableCell>{formatDateTime(exp.submitTime)}</TableCell>
                                    </TableRow>
                                ))}
                                {experiments.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                            暂无实验记录
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
