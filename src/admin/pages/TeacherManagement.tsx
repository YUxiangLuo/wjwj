import { useState, useEffect } from "react";
import { Plus, Search, RotateCcw, Loader2, Unlock } from "lucide-react";
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

    return (
        <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">教师列表</CardTitle>
                <div className="flex gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="搜索工号或姓名..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                            className="pl-9 w-52"
                        />
                    </div>
                    <Button onClick={() => setShowAddModal(true)}>
                        <Plus className="w-4 h-4" />
                        添加教师
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
                                    <TableCell className="font-medium">{teacher.employeeId}</TableCell>
                                    <TableCell>{teacher.name}</TableCell>
                                    <TableCell>{getStatusBadge(teacher)}</TableCell>
                                    <TableCell>{teacher.classCount}</TableCell>
                                    <TableCell className="text-muted-foreground">{formatDate(teacher.lastLogin)}</TableCell>
                                    <TableCell className="text-muted-foreground">{formatDate(teacher.createdAt)}</TableCell>
                                    <TableCell>
                                        <div className="flex gap-2">
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
                                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                                        暂无数据
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                )}
            </CardContent>

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
        </Card>
    );
}
