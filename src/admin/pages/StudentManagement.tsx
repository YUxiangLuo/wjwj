import { useState, useEffect, useMemo } from "react";
import { Search, RotateCcw, Loader2, ArrowRight, Users, CheckCircle2, PauseCircle, GraduationCap, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { studentApi, classApi, type Student, type Class, type StudentExperiment } from "../api-client";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";

export function StudentManagement() {
    const location = useLocation();
    const { confirm, dialog } = useConfirmDialog();
    const [students, setStudents] = useState<Student[]>([]);
    const [classes, setClasses] = useState<Class[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterClass, setFilterClass] = useState("all");
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | "active" | "disabled">("all");

    const [transferStudent, setTransferStudent] = useState<Student | null>(null);
    const [targetClassId, setTargetClassId] = useState<string>("");
    const [transferReason, setTransferReason] = useState("");

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
        const shouldReset = await confirm({
            title: `重置学生「${student.name}」的密码`,
            description: "密码将重置为学号。",
            confirmLabel: "重置密码",
        });
        if (!shouldReset) {
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

    async function handleUnlock(student: Student) {
        const shouldUnlock = await confirm({
            title: `解锁学生「${student.name}」`,
            description: "解锁后该学生可立即重新尝试登录。",
            confirmLabel: "解锁学生",
        });
        if (!shouldUnlock) {
            return;
        }

        try {
            const res = await studentApi.unlock(student.id);
            if (res.success) {
                loadStudents();
            } else {
                toast.error(res.error?.message ?? "解锁失败");
            }
        } catch (error) {
            console.error("Failed to unlock student:", error);
            toast.error("解锁失败");
        }
    }

    async function handleToggleStatus(student: Student) {
        const newStatus = student.status === 1 ? 0 : 1;
        const action = newStatus === 0 ? "停用" : "启用";

        const shouldProceed = await confirm({
            title: `${action}学生「${student.name}」`,
            description: newStatus === 0
                ? "停用后该学生将无法登录系统和继续实验。"
                : "启用后该学生将恢复登录和实验权限。",
            confirmLabel: action,
            tone: newStatus === 0 ? "destructive" : "primary",
        });
        if (!shouldProceed) {
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
        if (progress >= 80) return "[&>div]:bg-success";
        if (progress >= 50) return "[&>div]:bg-warning";
        return "[&>div]:bg-destructive";
    };

    const formatDateTime = (dateStr: string | null) => {
        if (!dateStr) return "-";
        return new Date(dateStr).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
    };

    const summary = useMemo(() => {
        const total = students.length;
        const locked = students.filter((student) => student.isLocked).length;
        const active = students.filter((student) => student.status === 1 && !student.isLocked).length;
        const disabled = total - active - locked;
        const avgProgress = total === 0
            ? 0
            : Math.round(students.reduce((sum, student) => sum + (student.progress || 0), 0) / total);
        return { total, active, disabled, locked, avgProgress };
    }, [students]);

    const filteredStudents = useMemo(() => {
        if (statusFilter === "all") return students;
        const active = statusFilter === "active";
        return students.filter((student) => (active ? student.status === 1 : student.status !== 1));
    }, [students, statusFilter]);

    return (
        <>
            <div className="space-y-6 animate-in fade-in duration-500">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold">学生管理</h2>
                        <p className="text-sm text-muted-foreground mt-1">查看学生档案、实验进度与班级调整。</p>
                    </div>
                    <Button data-testid="student-search-refresh" variant="outline" onClick={handleSearch} disabled={loading}>
                        <Search data-icon="inline-start" />
                        刷新结果
                    </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    <Card className="hover:border-primary/30 transition-colors">
                        <CardContent className="p-4 flex items-center justify-between">
                            <div>
                                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Students</p>
                                <p className="text-2xl font-bold mt-1">{loading ? "-" : summary.total}</p>
                            </div>
                            <div className="w-10 h-10 bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
                                <Users className="w-5 h-5" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="hover:border-primary/30 transition-colors">
                        <CardContent className="p-4 flex items-center justify-between">
                            <div>
                                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Active</p>
                                <p className="text-2xl font-bold mt-1">{loading ? "-" : summary.active}</p>
                            </div>
                            <div className="w-10 h-10 bg-success/10 text-success flex items-center justify-center border border-success/20">
                                <CheckCircle2 className="w-5 h-5" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="hover:border-primary/30 transition-colors">
                        <CardContent className="p-4 flex items-center justify-between">
                            <div>
                                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Disabled</p>
                                <p className="text-2xl font-bold mt-1">{loading ? "-" : summary.disabled}</p>
                            </div>
                            <div className="w-10 h-10 bg-warning/10 text-warning flex items-center justify-center border border-warning/20">
                                <PauseCircle className="w-5 h-5" />
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="hover:border-primary/30 transition-colors">
                        <CardContent className="p-4 flex items-center justify-between">
                            <div>
                                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Avg Progress</p>
                                <p className="text-2xl font-bold mt-1">{loading ? "-" : `${summary.avgProgress}%`}</p>
                            </div>
                            <div className="w-10 h-10 bg-chart-4/10 text-chart-4 flex items-center justify-center border border-chart-4/20">
                                <GraduationCap className="w-5 h-5" />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-border pb-4">
                        <div>
                            <CardTitle className="text-base">学生列表</CardTitle>
                            <p className="text-xs text-muted-foreground mt-1">共 {filteredStudents.length} 条数据</p>
                        </div>
                        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
                            <SearchInput
                                className="sm:w-64"
                                placeholder="搜索学号或姓名"
                                data-testid="student-search-input"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                            />
                            <Select value={filterClass} onValueChange={setFilterClass}>
                                <SelectTrigger data-testid="student-filter-class" className="sm:w-44">
                                    <SelectValue placeholder="全部班级" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectItem value="all">全部班级</SelectItem>
                                        {classes.map((c) => (
                                            <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                                        ))}
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | "active" | "disabled")}>
                                <SelectTrigger data-testid="student-filter-status" className="sm:w-36">
                                    <SelectValue placeholder="状态筛选" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectItem value="all">全部状态</SelectItem>
                                        <SelectItem value="active">正常</SelectItem>
                                        <SelectItem value="disabled">已停用</SelectItem>
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0">
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
                                        <TableHead className="text-right">操作</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredStudents.map((student) => (
                                        <TableRow key={student.id} data-testid={`student-row-${student.studentId}`}>
                                            <TableCell className="font-mono text-primary">{student.studentId}</TableCell>
                                            <TableCell className="font-medium">{student.name}</TableCell>
                                            <TableCell>{student.className}</TableCell>
                                            <TableCell>
                                                {student.isLocked ? (
                                                    <Badge variant="destructive">已锁定</Badge>
                                                ) : student.status === 1 ? (
                                                    <Badge variant="success">正常</Badge>
                                                ) : (
                                                    <Badge variant="secondary">已停用</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <Progress value={student.progress} className={`w-24 h-1.5 ${getProgressColor(student.progress)}`} />
                                                    <span className="text-xs text-muted-foreground w-8">{student.progress}%</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground text-xs">{formatDateTime(student.lastActive)}</TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    {student.isLocked && (
                                                        <Button data-testid={`student-unlock-${student.studentId}`} variant="warning" size="xs" onClick={() => handleUnlock(student)}>
                                                            <Unlock data-icon="inline-start" />
                                                            解锁
                                                        </Button>
                                                    )}
                                                    <Button
                                                        variant="ghost"
                                                        size="xs"
                                                        data-testid={`student-open-experiments-${student.studentId}`}
                                                        onClick={() => openExperimentsModal(student)}
                                                    >
                                                        <Search data-icon="inline-start" />
                                                        实验
                                                    </Button>
                                                    <Button data-testid={`student-reset-${student.studentId}`} variant="ghost" size="xs" onClick={() => handleResetPassword(student)}>
                                                        <RotateCcw data-icon="inline-start" />
                                                        重置
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="xs"
                                                        data-testid={`student-open-transfer-${student.studentId}`}
                                                        onClick={() => openTransferModal(student)}
                                                    >
                                                        <ArrowRight data-icon="inline-start" />
                                                        转班
                                                    </Button>
                                                    <Button
                                                        variant={student.status === 1 ? "destructive" : "success"}
                                                        size="xs"
                                                        data-testid={`student-toggle-status-${student.studentId}`}
                                                        onClick={() => handleToggleStatus(student)}
                                                    >
                                                        {student.status === 1 ? "停用" : "启用"}
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {filteredStudents.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center py-16 text-muted-foreground">
                                                <div className="flex flex-col items-center gap-2">
                                                    <div className="w-12 h-12 rounded-full bg-card border border-border flex items-center justify-center">
                                                        <Search className="w-5 h-5 text-muted-foreground" />
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
            </div>

            <Dialog open={!!transferStudent} onOpenChange={(open) => !open && setTransferStudent(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>学生转班</DialogTitle>
                        <DialogDescription>
                            将学生 <span className="text-primary font-mono">{transferStudent?.studentId}</span> <span className="font-medium text-foreground">{transferStudent?.name}</span> 从 <span className="text-warning">{transferStudent?.className}</span> 转至新班级。
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>目标班级</Label>
                            <Select value={targetClassId} onValueChange={setTargetClassId}>
                                <SelectTrigger data-testid="student-transfer-target-class">
                                    <SelectValue placeholder="选择新班级" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        {classes
                                            .filter((c) => c.id !== transferStudent?.classId)
                                            .map((c) => (
                                                <SelectItem key={c.id} value={String(c.id)}>
                                                    {c.name}
                                                </SelectItem>
                                            ))}
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="student-transfer-reason">转班原因 (可选)</Label>
                            <Input
                                id="student-transfer-reason"
                                data-testid="student-transfer-reason"
                                value={transferReason}
                                onChange={(e) => setTransferReason(e.target.value)}
                                placeholder="例如：行政调班"
                            />
                        </div>
                        <div className="bg-warning/10 text-warning p-3 rounded-md text-sm border border-warning/20">
                            <p className="font-semibold mb-1 flex items-center gap-1.5"><PauseCircle className="w-3.5 h-3.5" /> 注意事项：</p>
                            <ul className="list-disc pl-4 space-y-1 opacity-90">
                                <li>学生在原班级的实验数据将被存档保留。</li>
                                <li>学生需要在新班级重新开始实验（如适用）。</li>
                            </ul>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setTransferStudent(null)}>
                            取消
                        </Button>
                        <Button data-testid="student-transfer-submit" onClick={handleTransfer} disabled={!targetClassId}>
                            确认转班
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!selectedStudentForExp} onOpenChange={(open) => !open && setSelectedStudentForExp(null)}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            实验记录
                            <Badge variant="muted">
                                {selectedStudentForExp?.name} ({selectedStudentForExp?.studentId})
                            </Badge>
                        </DialogTitle>
                        <DialogDescription>
                            查看该学生在各个实验任务中的阶段进度、提交状态和成绩记录。
                        </DialogDescription>
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
                                        <TableCell className="text-muted-foreground">第 {exp.currentStage} 阶段</TableCell>
                                        <TableCell>
                                            <Badge variant={exp.status >= 1 ? "success" : "secondary"}>
                                                {exp.statusText}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Progress value={exp.progress} className={`w-16 h-1.5 ${getProgressColor(exp.progress)}`} />
                                                <span className="text-xs text-muted-foreground">{exp.progress}%</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-mono text-primary">{exp.score !== null ? exp.score : "-"}</TableCell>
                                        <TableCell className="text-muted-foreground text-xs">{formatDateTime(exp.submitTime)}</TableCell>
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
            {dialog}
        </>
    );
}
