import { useState, useEffect, useMemo } from "react";
import { Search, RotateCcw, Loader2, ArrowRight, Users, CheckCircle2, PauseCircle, GraduationCap, Unlock } from "lucide-react";
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
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { IconTile } from "@/components/IconTile";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";

export function StudentManagement() {
    const location = useLocation();
    const { confirm, dialog } = useConfirmDialog();
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
                <PageHeader border={false}>
                    <div>
                        <h2 className="text-lg font-semibold text-foreground">学生管理</h2>
                        <p className="text-sm text-muted-foreground mt-1">查看学生档案、实验进度与班级调整。</p>
                    </div>
                    <Button data-testid="student-search-refresh" variant="outline" onClick={handleSearch} disabled={loading} className="border-input text-foreground/90 hover:text-foreground hover:bg-muted">
                        <Search className="w-4 h-4 mr-2" />
                        刷新结果
                    </Button>
                </PageHeader>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    <Card className="transition-colors hover:border-input">
                        <CardContent className="p-4 flex items-center justify-between">
                            <div>
                                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Students</p>
                                <p className="text-2xl font-bold text-foreground mt-1">{loading ? "-" : summary.total}</p>
                            </div>
                            <IconTile intent="info">
                                <Users className="w-5 h-5" />
                            </IconTile>
                        </CardContent>
                    </Card>
                    <Card className="transition-colors hover:border-input">
                        <CardContent className="p-4 flex items-center justify-between">
                            <div>
                                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Active</p>
                                <p className="text-2xl font-bold text-foreground mt-1">{loading ? "-" : summary.active}</p>
                            </div>
                            <IconTile intent="success">
                                <CheckCircle2 className="w-5 h-5" />
                            </IconTile>
                        </CardContent>
                    </Card>
                    <Card className="transition-colors hover:border-input">
                        <CardContent className="p-4 flex items-center justify-between">
                            <div>
                                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Disabled</p>
                                <p className="text-2xl font-bold text-foreground mt-1">{loading ? "-" : summary.disabled}</p>
                            </div>
                            <IconTile intent="warning">
                                <PauseCircle className="w-5 h-5" />
                            </IconTile>
                        </CardContent>
                    </Card>
                    <Card className="transition-colors hover:border-input">
                        <CardContent className="p-4 flex items-center justify-between">
                            <div>
                                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Avg Progress</p>
                                <p className="text-2xl font-bold text-foreground mt-1">{loading ? "-" : `${summary.avgProgress}%`}</p>
                            </div>
                            <IconTile intent="auxiliary">
                                <GraduationCap className="w-5 h-5" />
                            </IconTile>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <PageHeader as={CardHeader}>
                        <div>
                            <CardTitle className="text-base text-foreground">学生列表</CardTitle>
                            <p className="text-xs text-muted-foreground mt-1">共 {filteredStudents.length} 条数据</p>
                        </div>
                        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
                            <div className="relative sm:w-64">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    placeholder="搜索学号或姓名"
                                    data-testid="student-search-input"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                                    className="pl-9 bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-ring"
                                />
                            </div>
                            <Select value={filterClass} onValueChange={setFilterClass}>
                                <SelectTrigger data-testid="student-filter-class" className="bg-background border-border text-foreground sm:w-44">
                                    <SelectValue placeholder="全部班级" />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border text-foreground">
                                    <SelectItem value="all">全部班级</SelectItem>
                                    {classes.map((c) => (
                                        <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | "active" | "disabled")}>
                                <SelectTrigger data-testid="student-filter-status" className="bg-background border-border text-foreground sm:w-36">
                                    <SelectValue placeholder="状态筛选" />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border text-foreground">
                                    <SelectItem value="all">全部状态</SelectItem>
                                    <SelectItem value="active">正常</SelectItem>
                                    <SelectItem value="disabled">已停用</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </PageHeader>
                    <CardContent className="pt-0">
                        {loading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-border hover:bg-card/50">
                                        <TableHead className="text-muted-foreground">学号</TableHead>
                                        <TableHead className="text-muted-foreground">姓名</TableHead>
                                        <TableHead className="text-muted-foreground">班级</TableHead>
                                        <TableHead className="text-muted-foreground">状态</TableHead>
                                        <TableHead className="text-muted-foreground">实验进度</TableHead>
                                        <TableHead className="text-muted-foreground">最后活跃</TableHead>
                                        <TableHead className="text-muted-foreground text-right">操作</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredStudents.map((student) => (
                                        <TableRow key={student.id} data-testid={`student-row-${student.studentId}`} className="border-border hover:bg-muted/50 transition-colors">
                                            <TableCell className="font-mono text-primary">{student.studentId}</TableCell>
                                            <TableCell className="font-medium text-foreground">{student.name}</TableCell>
                                            <TableCell className="text-foreground/90">{student.className}</TableCell>
                                            <TableCell>
                                                {student.isLocked ? (
                                                    <StatusBadge intent="destructive">已锁定</StatusBadge>
                                                ) : student.status === 1 ? (
                                                    <StatusBadge intent="success">正常</StatusBadge>
                                                ) : (
                                                    <Badge variant="destructive" className="bg-muted-foreground/20 text-foreground/90 hover:bg-muted-foreground/20">已停用</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <Progress value={student.progress} className={`w-24 h-1.5 bg-muted ${getProgressColor(student.progress)}`} />
                                                    <span className="text-xs text-muted-foreground w-8">{student.progress}%</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground text-xs">{formatDateTime(student.lastActive)}</TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    {student.isLocked && (
                                                        <Button data-testid={`student-unlock-${student.studentId}`} variant="ghost" size="sm" onClick={() => handleUnlock(student)} className="h-8 text-warning hover:text-warning hover:bg-warning/10">
                                                            <Unlock className="w-3.5 h-3.5 mr-1" />
                                                            解锁
                                                        </Button>
                                                    )}
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        data-testid={`student-open-experiments-${student.studentId}`}
                                                        onClick={() => openExperimentsModal(student)}
                                                        className="h-8 text-muted-foreground hover:text-info hover:bg-info/10"
                                                    >
                                                        <Search className="w-3.5 h-3.5 mr-1" />
                                                        实验
                                                    </Button>
                                                    <Button data-testid={`student-reset-${student.studentId}`} variant="ghost" size="sm" onClick={() => handleResetPassword(student)} className="h-8 text-muted-foreground hover:text-primary hover:bg-primary/10">
                                                        <RotateCcw className="w-3.5 h-3.5 mr-1" />
                                                        重置
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        data-testid={`student-open-transfer-${student.studentId}`}
                                                        onClick={() => openTransferModal(student)}
                                                        className="h-8 text-muted-foreground hover:text-auxiliary hover:bg-auxiliary/10"
                                                    >
                                                        <ArrowRight className="w-3.5 h-3.5 mr-1" />
                                                        转班
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        data-testid={`student-toggle-status-${student.studentId}`}
                                                        onClick={() => handleToggleStatus(student)}
                                                        className={`h-8 ${student.status === 1 ? "text-destructive hover:text-destructive hover:bg-destructive/10" : "text-success hover:text-success hover:bg-success/10"}`}
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
                <DialogContent className="bg-card border-border text-foreground">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">学生转班</DialogTitle>
                        <DialogDescription className="text-muted-foreground">
                            将学生 <span className="text-primary font-mono">{transferStudent?.studentId}</span> <span className="text-foreground font-medium">{transferStudent?.name}</span> 从 <span className="text-warning">{transferStudent?.className}</span> 转至新班级。
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground/90">目标班级</label>
                            <Select value={targetClassId} onValueChange={setTargetClassId}>
                                <SelectTrigger data-testid="student-transfer-target-class" className="bg-background border-border text-foreground">
                                    <SelectValue placeholder="选择新班级" />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border text-foreground">
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
                            <label className="text-sm font-medium text-foreground/90">转班原因 (可选)</label>
                            <Input
                                data-testid="student-transfer-reason"
                                value={transferReason}
                                onChange={(e) => setTransferReason(e.target.value)}
                                placeholder="例如：行政调班"
                                className="bg-background border-border text-foreground placeholder:text-muted-foreground"
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
                        <Button variant="ghost" onClick={() => setTransferStudent(null)} className="text-muted-foreground hover:text-foreground hover:bg-muted">
                            取消
                        </Button>
                        <Button data-testid="student-transfer-submit" onClick={handleTransfer} disabled={!targetClassId} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                            确认转班
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!selectedStudentForExp} onOpenChange={(open) => !open && setSelectedStudentForExp(null)}>
                <DialogContent className="max-w-3xl bg-card border-border text-foreground">
                    <DialogHeader>
                        <DialogTitle className="text-foreground flex items-center gap-2">
                            实验记录
                            <span className="text-sm font-normal text-muted-foreground px-2 py-0.5 rounded-full bg-muted border border-input">
                                {selectedStudentForExp?.name} ({selectedStudentForExp?.studentId})
                            </span>
                        </DialogTitle>
                        <DialogDescription className="text-muted-foreground">
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
                                <TableRow className="border-border hover:bg-card/50">
                                    <TableHead className="text-muted-foreground">实验/任务名称</TableHead>
                                    <TableHead className="text-muted-foreground">当前阶段</TableHead>
                                    <TableHead className="text-muted-foreground">状态</TableHead>
                                    <TableHead className="text-muted-foreground">进度</TableHead>
                                    <TableHead className="text-muted-foreground">得分</TableHead>
                                    <TableHead className="text-muted-foreground">提交时间</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {experiments.map((exp) => (
                                    <TableRow key={exp.id} className="border-border hover:bg-muted/50">
                                        <TableCell className="text-foreground">{exp.taskName || "未命名任务"}</TableCell>
                                        <TableCell className="text-muted-foreground">第 {exp.currentStage} 阶段</TableCell>
                                        <TableCell>
                                            <Badge variant={exp.status >= 1 ? "default" : "secondary"} className={exp.status >= 1 ? "bg-success/10 text-success hover:bg-success/20" : "bg-muted text-muted-foreground"}>
                                                {exp.statusText}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Progress value={exp.progress} className={`w-16 h-1.5 bg-muted ${getProgressColor(exp.progress)}`} />
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
