import { useState, useEffect, useMemo } from "react";
import { Plus, Search, RotateCcw, Loader2, Unlock, Users, CheckCircle2, PauseCircle, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { teacherApi, type Teacher } from "../api-client";
import { toast } from "sonner";

export function TeacherManagement() {
    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [newTeacher, setNewTeacher] = useState({ employeeId: "", name: "" });
    const [submitting, setSubmitting] = useState(false);

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

        if (!confirm(`确定${action}教师「${teacher.name}」吗？`)) {
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
        if (!confirm(`确定解锁教师「${teacher.name}」吗？`)) {
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
        if (!confirm(`确定重置教师「${teacher.name}」的密码吗？\n\n密码将重置为工号，下次登录需要修改密码。`)) {
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

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return "-";
        return new Date(dateStr).toLocaleString("zh-CN");
    };

    const getStatusBadge = (teacher: Teacher) => {
        if (teacher.isLocked) {
            return <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">已锁定</Badge>;
        }
        if (teacher.status === 1) {
            return <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">正常</Badge>;
        }
        return <Badge variant="destructive">已停用</Badge>;
    };

    const summary = useMemo(() => {
        const total = teachers.length;
        const locked = teachers.filter((teacher) => teacher.isLocked).length;
        const active = teachers.filter((teacher) => teacher.status === 1 && !teacher.isLocked).length;
        const disabled = total - active - locked;
        return { total, active, disabled, locked };
    }, [teachers]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-slate-900">教师管理</h2>
                    <p className="text-sm text-slate-500 mt-1">管理教师账号、锁定状态与登录安全。</p>
                </div>
                <Button onClick={() => setShowAddModal(true)}>
                    <Plus className="w-4 h-4" />
                    添加教师
                </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <Card className="border-slate-200 shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500">教师总数</p>
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
                            <p className="text-xs text-slate-500">锁定账号</p>
                            <p className="text-2xl font-semibold text-slate-900">{loading ? "-" : summary.locked}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center">
                            <Lock className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-slate-200 shadow-sm">
                <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <CardTitle className="text-base">教师列表</CardTitle>
                        <p className="text-xs text-slate-500 mt-1">共 {teachers.length} 条</p>
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                        <div className="relative sm:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                                placeholder="搜索工号或姓名"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                                className="pl-9"
                            />
                        </div>
                        <Button variant="outline" onClick={handleSearch} disabled={loading}>
                            <Search className="w-4 h-4" />
                            搜索
                        </Button>
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
                                    <TableHead>工号</TableHead>
                                    <TableHead>姓名</TableHead>
                                    <TableHead>状态</TableHead>
                                    <TableHead>班级数</TableHead>
                                    <TableHead>最后登录</TableHead>
                                    <TableHead>创建时间</TableHead>
                                    <TableHead>操作</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {teachers.map((teacher) => (
                                    <TableRow key={teacher.id}>
                                        <TableCell className="font-medium text-slate-900">{teacher.employeeId}</TableCell>
                                        <TableCell>{teacher.name}</TableCell>
                                        <TableCell>{getStatusBadge(teacher)}</TableCell>
                                        <TableCell>{teacher.classCount}</TableCell>
                                        <TableCell className="text-slate-500">{formatDate(teacher.lastLogin)}</TableCell>
                                        <TableCell className="text-slate-500">{formatDate(teacher.createdAt)}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-2">
                                                {teacher.isLocked && (
                                                    <Button variant="ghost" size="sm" onClick={() => handleUnlock(teacher)}>
                                                        <Unlock className="w-3 h-3 mr-1" />
                                                        解锁
                                                    </Button>
                                                )}
                                                <Button variant="ghost" size="sm" onClick={() => handleResetPassword(teacher)}>
                                                    <RotateCcw className="w-3 h-3 mr-1" />
                                                    重置密码
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleToggleStatus(teacher)}
                                                    className={teacher.status === 1 ? "text-orange-500 hover:text-orange-600" : "text-emerald-600 hover:text-emerald-700"}
                                                >
                                                    {teacher.status === 1 ? "停用" : "启用"}
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {teachers.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-12 text-slate-500">
                                            暂无数据
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>添加教师</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="employeeId">工号</Label>
                            <Input
                                id="employeeId"
                                placeholder="请输入工号"
                                value={newTeacher.employeeId}
                                onChange={(e) => setNewTeacher({ ...newTeacher, employeeId: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="name">姓名</Label>
                            <Input
                                id="name"
                                placeholder="请输入姓名"
                                value={newTeacher.name}
                                onChange={(e) => setNewTeacher({ ...newTeacher, name: e.target.value })}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">初始密码为工号</p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAddModal(false)} disabled={submitting}>
                            取消
                        </Button>
                        <Button
                            onClick={handleAddTeacher}
                            disabled={submitting || !newTeacher.employeeId.trim() || !newTeacher.name.trim()}
                        >
                            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            确认添加
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
