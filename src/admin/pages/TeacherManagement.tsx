import { useState, useEffect, useMemo } from "react";
import { Plus, Search, RotateCcw, Loader2, Unlock, Users, CheckCircle2, PauseCircle, Lock, GraduationCap, Pencil, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { teacherApi, classApi, type Teacher, type Class } from "../api-client";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { toast } from "sonner";
import { IconTile } from "@/components/IconTile";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";

export function TeacherManagement() {
    const { confirm, dialog } = useConfirmDialog();
    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [newTeacher, setNewTeacher] = useState({ employeeId: "", name: "" });
    const [submitting, setSubmitting] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
    const [editName, setEditName] = useState("");
    const [showClassesModal, setShowClassesModal] = useState(false);
    const [classesTeacher, setClassesTeacher] = useState<Teacher | null>(null);
    const [teacherClasses, setTeacherClasses] = useState<Class[]>([]);
    const [classesLoading, setClassesLoading] = useState(false);

    useEffect(() => {
        loadTeachers();
    }, []);

    async function loadTeachers(search?: string) {
        setLoading(true);
        try {
            const res = await teacherApi.list(search);
            if (res.success && res.data) {
                setTeachers(res.data);
            }
        } catch (error) {
            console.error("Failed to load teachers:", error);
        } finally {
            setLoading(false);
        }
    }

    function handleSearch() {
        loadTeachers(searchTerm);
    }

    async function handleAddTeacher() {
        if (!newTeacher.employeeId.trim() || !newTeacher.name.trim()) return;

        setSubmitting(true);
        try {
            const res = await teacherApi.create({
                employeeId: newTeacher.employeeId.trim(),
                name: newTeacher.name.trim(),
            });

            if (res.success) {
                setNewTeacher({ employeeId: "", name: "" });
                setShowAddModal(false);
                loadTeachers(searchTerm);
            } else {
                toast.error(res.error?.message ?? "添加失败");
            }
        } catch (error) {
            console.error("Failed to create teacher:", error);
            toast.error("添加失败");
        } finally {
            setSubmitting(false);
        }
    }

    async function handleToggleStatus(teacher: Teacher) {
        const newStatus = teacher.status === 1 ? 0 : 1;
        const action = newStatus === 0 ? "停用" : "启用";

        const shouldProceed = await confirm({
            title: `${action}教师「${teacher.name}」`,
            description: newStatus === 0
                ? "停用后该教师将无法登录系统，也无法继续管理其负责的班级。"
                : "启用后该教师将恢复登录权限，并可继续管理其负责的班级。",
            confirmLabel: action,
            tone: newStatus === 0 ? "destructive" : "primary",
        });
        if (!shouldProceed) {
            return;
        }

        try {
            const res = await teacherApi.updateStatus(teacher.id, newStatus);
            if (res.success) {
                loadTeachers(searchTerm);
            } else {
                toast.error(res.error?.message ?? `${action}失败`);
            }
        } catch (error) {
            console.error(`Failed to ${action} teacher:`, error);
            toast.error(`${action}失败`);
        }
    }

    async function handleUnlock(teacher: Teacher) {
        const shouldUnlock = await confirm({
            title: `解锁教师「${teacher.name}」`,
            description: "解锁后该教师可立即重新尝试登录。",
            confirmLabel: "解锁教师",
        });
        if (!shouldUnlock) {
            return;
        }

        try {
            const res = await teacherApi.unlock(teacher.id);
            if (res.success) {
                loadTeachers(searchTerm);
            } else {
                toast.error(res.error?.message ?? "解锁失败");
            }
        } catch (error) {
            console.error("Failed to unlock teacher:", error);
            toast.error("解锁失败");
        }
    }

    async function handleResetPassword(teacher: Teacher) {
        const shouldReset = await confirm({
            title: `重置教师「${teacher.name}」的密码`,
            description: "密码将重置为工号，下次登录需要修改密码。",
            confirmLabel: "重置密码",
        });
        if (!shouldReset) {
            return;
        }

        try {
            const res = await teacherApi.resetPassword(teacher.id);
            if (res.success) {
                toast.success(`密码已重置为：${teacher.employeeId}`);
            } else {
                toast.error(res.error?.message ?? "重置失败");
            }
        } catch (error) {
            console.error("Failed to reset password:", error);
            toast.error("重置失败");
        }
    }

    function openEditModal(teacher: Teacher) {
        setEditingTeacher(teacher);
        setEditName(teacher.name);
        setShowEditModal(true);
    }

    async function handleViewClasses(teacher: Teacher) {
        setClassesTeacher(teacher);
        setTeacherClasses([]);
        setShowClassesModal(true);
        setClassesLoading(true);
        try {
            const res = await classApi.list({ teacherId: String(teacher.id) });
            if (res.success && res.data) {
                setTeacherClasses(res.data);
            }
        } catch (error) {
            console.error("Failed to load teacher classes:", error);
            toast.error("加载班级列表失败");
        } finally {
            setClassesLoading(false);
        }
    }

    async function handleEditTeacher() {
        if (!editingTeacher || !editName.trim()) return;

        setSubmitting(true);
        try {
            const res = await teacherApi.update(editingTeacher.id, {
                name: editName.trim(),
            });

            if (res.success) {
                setShowEditModal(false);
                setEditingTeacher(null);
                setEditName("");
                loadTeachers(searchTerm);
            } else {
                toast.error(res.error?.message ?? "编辑失败");
            }
        } catch (error) {
            console.error("Failed to update teacher:", error);
            toast.error("编辑失败");
        } finally {
            setSubmitting(false);
        }
    }

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return "-";
        return new Date(dateStr).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
    };

    const getStatusBadge = (teacher: Teacher) => {
        if (teacher.isLocked) {
            return <StatusBadge intent="destructive">已锁定</StatusBadge>;
        }
        if (teacher.status === 1) {
            return <StatusBadge intent="success">正常</StatusBadge>;
        }
        return <Badge variant="destructive" className="bg-muted-foreground/20 text-foreground/90 hover:bg-muted-foreground/20">已停用</Badge>;
    };

    const summary = useMemo(() => {
        const total = teachers.length;
        const locked = teachers.filter((teacher) => teacher.isLocked).length;
        const active = teachers.filter((teacher) => teacher.status === 1 && !teacher.isLocked).length;
        const disabled = total - active - locked;
        return { total, active, disabled, locked };
    }, [teachers]);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <PageHeader border={false}>
                <div>
                    <h2 className="text-lg font-semibold text-foreground">教师管理</h2>
                    <p className="text-sm text-muted-foreground mt-1">管理教师账号、锁定状态与登录安全。</p>
                </div>
                <Button data-testid="teacher-create-open" onClick={() => setShowAddModal(true)} className="bg-primary hover:bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                    <Plus className="w-4 h-4 mr-1" />
                    添加教师
                </Button>
            </PageHeader>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <Card className="transition-colors hover:border-input">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total</p>
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
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Locked</p>
                            <p className="text-2xl font-bold text-foreground mt-1">{loading ? "-" : summary.locked}</p>
                        </div>
                        <IconTile intent="destructive">
                            <Lock className="w-5 h-5" />
                        </IconTile>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <PageHeader as={CardHeader}>
                    <div>
                        <CardTitle className="text-base text-foreground">教师列表</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">共 {teachers.length} 条数据</p>
                    </div>
                    <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
                        <div className="relative sm:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="搜索工号或姓名"
                                data-testid="teacher-search-input"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                                className="pl-9 bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-ring"
                            />
                        </div>
                        <Button data-testid="teacher-search-submit" variant="outline" onClick={handleSearch} disabled={loading} className="border-input text-foreground/90 hover:text-foreground hover:bg-muted">
                            <Search className="w-4 h-4 mr-2" />
                            搜索
                        </Button>
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
                                    <TableHead className="text-muted-foreground">工号</TableHead>
                                    <TableHead className="text-muted-foreground">姓名</TableHead>
                                    <TableHead className="text-muted-foreground">状态</TableHead>
                                    <TableHead className="text-muted-foreground">班级数</TableHead>
                                    <TableHead className="text-muted-foreground">最后登录</TableHead>
                                    <TableHead className="text-muted-foreground">创建时间</TableHead>
                                    <TableHead className="text-muted-foreground text-right">操作</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {teachers.map((teacher) => (
                                    <TableRow key={teacher.id} data-testid={`teacher-row-${teacher.employeeId}`} className="border-border hover:bg-muted/50 transition-colors">
                                        <TableCell className="font-mono text-primary">{teacher.employeeId}</TableCell>
                                        <TableCell className="font-medium text-foreground">{teacher.name}</TableCell>
                                        <TableCell>{getStatusBadge(teacher)}</TableCell>
                                        <TableCell className="text-foreground/90">
                                            <button
                                                data-testid={`teacher-view-classes-${teacher.employeeId}`}
                                                onClick={() => handleViewClasses(teacher)}
                                                className="flex items-center gap-1 hover:text-primary transition-colors cursor-pointer"
                                                title="查看关联班级"
                                            >
                                                <GraduationCap className="w-3.5 h-3.5 text-muted-foreground" />
                                                {teacher.classCount}
                                                <Eye className="w-3 h-3 text-muted-foreground ml-0.5" />
                                            </button>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-xs">{formatDate(teacher.lastLogin)}</TableCell>
                                        <TableCell className="text-muted-foreground text-xs">{formatDate(teacher.createdAt)}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {teacher.isLocked && (
                                                    <Button data-testid={`teacher-unlock-${teacher.employeeId}`} variant="ghost" size="sm" onClick={() => handleUnlock(teacher)} className="h-8 text-warning hover:text-warning hover:bg-warning/10">
                                                        <Unlock className="w-3.5 h-3.5 mr-1" />
                                                        解锁
                                                    </Button>
                                                )}
                                                    <Button data-testid={`teacher-edit-open-${teacher.employeeId}`} variant="ghost" size="sm" onClick={() => openEditModal(teacher)} className="h-8 text-muted-foreground hover:text-primary hover:bg-primary/10">
                                                        <Pencil className="w-3.5 h-3.5 mr-1" />
                                                        编辑
                                                    </Button>
                                                    <Button data-testid={`teacher-reset-${teacher.employeeId}`} variant="ghost" size="sm" onClick={() => handleResetPassword(teacher)} className="h-8 text-muted-foreground hover:text-primary hover:bg-primary/10">
                                                    <RotateCcw className="w-3.5 h-3.5 mr-1" />
                                                    重置
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                        size="sm"
                                                        data-testid={`teacher-toggle-status-${teacher.employeeId}`}
                                                        onClick={() => handleToggleStatus(teacher)}
                                                    className={`h-8 ${teacher.status === 1 ? "text-destructive hover:text-destructive hover:bg-destructive/10" : "text-success hover:text-success hover:bg-success/10"}`}
                                                >
                                                    {teacher.status === 1 ? "停用" : "启用"}
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {teachers.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-16 text-muted-foreground">
                                            <div className="flex flex-col items-center gap-2">
                                                <div className="w-12 h-12 rounded-full bg-card border border-border flex items-center justify-center">
                                                    <Search className="w-5 h-5 text-muted-foreground" />
                                                </div>
                                                <p>暂无数据</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
                <DialogContent className="bg-card border-border text-foreground sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">添加教师</DialogTitle>
                        <DialogDescription className="text-muted-foreground">创建教师账号，初始密码将设置为工号。</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="employeeId" className="text-foreground/90">工号</Label>
                            <Input
                                id="employeeId"
                                data-testid="teacher-create-employee-id"
                                placeholder="请输入工号"
                                value={newTeacher.employeeId}
                                onChange={(e) => setNewTeacher({ ...newTeacher, employeeId: e.target.value })}
                                className="bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-ring"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="name" className="text-foreground/90">姓名</Label>
                            <Input
                                id="name"
                                data-testid="teacher-create-name"
                                placeholder="请输入姓名"
                                value={newTeacher.name}
                                onChange={(e) => setNewTeacher({ ...newTeacher, name: e.target.value })}
                                className="bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-ring"
                            />
                        </div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <Lock className="w-3 h-3" /> 初始密码默认为工号
                        </p>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setShowAddModal(false)} disabled={submitting} className="text-muted-foreground hover:text-foreground hover:bg-muted">
                            取消
                        </Button>
                        <Button
                            data-testid="teacher-create-submit"
                            onClick={handleAddTeacher}
                            disabled={submitting || !newTeacher.employeeId.trim() || !newTeacher.name.trim()}
                            className="bg-primary hover:bg-primary text-primary-foreground"
                        >
                            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            确认添加
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
                <DialogContent className="bg-card border-border text-foreground sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">编辑教师</DialogTitle>
                        <DialogDescription className="text-muted-foreground">修改教师显示姓名，工号保持不变。</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="editEmployeeId" className="text-foreground/90">工号</Label>
                            <Input
                                id="editEmployeeId"
                                value={editingTeacher?.employeeId ?? ""}
                                disabled
                                className="bg-background border-border text-muted-foreground placeholder:text-muted-foreground"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="editName" className="text-foreground/90">姓名</Label>
                            <Input
                                id="editName"
                                placeholder="请输入姓名"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-ring"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setShowEditModal(false)} disabled={submitting} className="text-muted-foreground hover:text-foreground hover:bg-muted">
                            取消
                        </Button>
                        <Button
                            onClick={handleEditTeacher}
                            disabled={submitting || !editName.trim()}
                            className="bg-primary hover:bg-primary text-primary-foreground"
                        >
                            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            确认修改
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 查看关联班级弹窗 */}
            <Dialog open={showClassesModal} onOpenChange={setShowClassesModal}>
                <DialogContent className="bg-card border-border text-foreground sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">
                            教师「{classesTeacher?.name}」的关联班级
                        </DialogTitle>
                        <DialogDescription className="text-muted-foreground">查看该教师当前负责的班级及学生规模。</DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        {classesLoading ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : teacherClasses.length > 0 ? (
                            <Table>
                                <TableHeader>
                                    <TableRow className="border-border hover:bg-card/50">
                                        <TableHead className="text-muted-foreground">班级名称</TableHead>
                                        <TableHead className="text-muted-foreground">学期</TableHead>
                                        <TableHead className="text-muted-foreground">学生人数</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {teacherClasses.map((cls) => (
                                        <TableRow key={cls.id} className="border-border">
                                            <TableCell className="font-medium text-foreground">{cls.name}</TableCell>
                                            <TableCell className="text-muted-foreground">{cls.semesterName ?? "-"}</TableCell>
                                            <TableCell className="text-muted-foreground">{cls.studentCount}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : (
                            <div className="text-center py-8 text-muted-foreground">该教师暂无关联班级</div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button onClick={() => setShowClassesModal(false)} className="bg-muted text-foreground/90 hover:bg-muted">关闭</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {dialog}
        </div>
    );
}
