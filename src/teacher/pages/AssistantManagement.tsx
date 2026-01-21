import { useState, useEffect, useMemo } from "react";
import { UserPlus, Users, CheckCircle2, PauseCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { teacherApi, type Assistant, type TeacherClass } from "../api-client";

export function AssistantManagement() {
    const [assistants, setAssistants] = useState<Assistant[]>([]);
    const [classes, setClasses] = useState<TeacherClass[]>([]);
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [selectedAssistant, setSelectedAssistant] = useState<Assistant | null>(null);
    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [showUnbindConfirm, setShowUnbindConfirm] = useState(false);
    const [pendingAssign, setPendingAssign] = useState<{ assistantId: number; classIds: number[] } | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | "active" | "disabled">("all");

    // Form states
    const [newAssistant, setNewAssistant] = useState({ name: "", studentId: "" });
    const [selectedClassIds, setSelectedClassIds] = useState<number[]>([]);

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        // Fetch assistants and classes
        const [resAst, resCls] = await Promise.all([
            teacherApi.getAssistants(),
            teacherApi.getClasses()
        ]);
        if (resAst.success && resAst.data) setAssistants(resAst.data);
        if (resCls.success && resCls.data) setClasses(resCls.data);
    }

    async function handleAddAssistant() {
        if (!newAssistant.name || !newAssistant.studentId) return;
        const res = await teacherApi.createAssistant(newAssistant);
        if (res.success) {
            setShowAddModal(false);
            setNewAssistant({ name: "", studentId: "" });
            loadData();
        } else {
            alert("添加失败: " + res.error?.message);
        }
    }

    function openAssignModal(ast: Assistant) {
        setSelectedAssistant(ast);
        setSelectedClassIds(ast.assignedClassIds || []);
        setShowAssignModal(true);
    }

    async function handleAssignClasses() {
        if (!selectedAssistant) return;
        const res = await teacherApi.assignClasses(selectedAssistant.id, selectedClassIds);
        if (res.success) {
            setShowAssignModal(false);
            loadData();
        } else if (res.error?.code === "HAS_DRAFTS") {
            setPendingAssign({ assistantId: selectedAssistant.id, classIds: selectedClassIds });
            setShowUnbindConfirm(true);
        } else {
            alert("分配失败: " + res.error?.message);
        }
    }

    async function handleDelete() {
        if (!deleteId) return;
        const res = await teacherApi.deleteAssistant(deleteId);
        if (res.success) {
            setDeleteId(null);
            loadData();
        } else {
            alert("删除失败");
        }
    }

    const summary = useMemo(() => {
        const total = assistants.length;
        const active = assistants.filter((ta) => ta.status === 1).length;
        const disabled = total - active;
        const classCount = new Set(assistants.flatMap((ta) => ta.assignedClasses)).size;
        return { total, active, disabled, classCount };
    }, [assistants]);

    const filteredAssistants = useMemo(() => {
        const keyword = searchTerm.trim().toLowerCase();
        return assistants.filter((ta) => {
            const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? ta.status === 1 : ta.status !== 1);
            const matchesKeyword = !keyword ||
                ta.name.toLowerCase().includes(keyword) ||
                ta.studentId.toLowerCase().includes(keyword) ||
                (ta.email?.toLowerCase().includes(keyword) ?? false);
            return matchesStatus && matchesKeyword;
        });
    }, [assistants, searchTerm, statusFilter]);

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold text-slate-900">助教管理</h2>
                <p className="text-sm text-slate-500 mt-1">维护助教账号与负责班级。</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <Card className="border-slate-200 shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500">助教总数</p>
                            <p className="text-2xl font-semibold text-slate-900">{summary.total}</p>
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
                            <p className="text-2xl font-semibold text-slate-900">{summary.active}</p>
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
                            <p className="text-2xl font-semibold text-slate-900">{summary.disabled}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
                            <PauseCircle className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-200 shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500">覆盖班级</p>
                            <p className="text-2xl font-semibold text-slate-900">{summary.classCount}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center">
                            <Users className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-slate-200 shadow-sm">
                <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <CardTitle className="text-base">助教列表</CardTitle>
                        <p className="text-xs text-slate-500 mt-1">共 {filteredAssistants.length} 条</p>
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                        <div className="relative sm:w-56">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <Input
                                placeholder="搜索姓名/工号/邮箱"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | "active" | "disabled")}>
                            <SelectTrigger className="sm:w-28">
                                <SelectValue placeholder="全部状态" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部状态</SelectItem>
                                <SelectItem value="active">正常</SelectItem>
                                <SelectItem value="disabled">已停用</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button onClick={() => setShowAddModal(true)}>
                            <UserPlus className="w-4 h-4" />
                            添加助教
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>姓名</TableHead>
                                <TableHead>工号</TableHead>
                                <TableHead>邮箱</TableHead>
                                <TableHead>负责班级</TableHead>
                                <TableHead>状态</TableHead>
                                <TableHead>操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredAssistants.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-6 text-slate-500">暂无助教</TableCell>
                                </TableRow>
                            ) : filteredAssistants.map((ta) => (
                                <TableRow key={ta.id}>
                                    <TableCell className="font-medium text-slate-900">{ta.name}</TableCell>
                                    <TableCell className="font-mono text-slate-900">{ta.studentId}</TableCell>
                                    <TableCell className="text-slate-500">{ta.email || "-"}</TableCell>
                                    <TableCell>
                                        <div className="flex gap-1 flex-wrap">
                                            {ta.assignedClasses.map((cls) => (
                                                <Badge key={cls} variant="secondary" className="text-xs">{cls}</Badge>
                                            ))}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {ta.status === 1 ? (
                                            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">正常</Badge>
                                        ) : (
                                            <Badge variant="secondary">已停用</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap gap-2">
                                            <Button variant="ghost" size="sm" className="text-blue-600" onClick={() => openAssignModal(ta)}>
                                                分配班级
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={async () => {
                                                    const res = await teacherApi.updateAssistant(ta.id, { action: "reset_password" });
                                                    if (res.success) {
                                                        alert("密码已重置为助教账号");
                                                    } else {
                                                        alert("重置失败: " + res.error?.message);
                                                    }
                                                }}
                                            >
                                                重置密码
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={async () => {
                                                    const res = await teacherApi.updateAssistant(ta.id, { action: "toggle_status" });
                                                    if (res.success) {
                                                        loadData();
                                                    } else {
                                                        alert("操作失败: " + res.error?.message);
                                                    }
                                                }}
                                            >
                                                {ta.status === 1 ? "停用" : "启用"}
                                            </Button>
                                            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteId(ta.id)}>
                                                移除
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Dialog open={showAssignModal} onOpenChange={setShowAssignModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>分配班级 - {selectedAssistant?.name}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-3">
                            {classes.map((cls) => (
                                <label key={cls.id} className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                                    <input
                                        type="checkbox"
                                        className="rounded border-input"
                                        checked={selectedClassIds.includes(cls.id)}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setSelectedClassIds([...selectedClassIds, cls.id]);
                                            } else {
                                                setSelectedClassIds(selectedClassIds.filter(id => id !== cls.id));
                                            }
                                        }}
                                    />
                                    <div>
                                        <div className="font-medium">{cls.name}</div>
                                        <div className="text-xs text-muted-foreground">{cls.studentCount}人 · {cls.semester}</div>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAssignModal(false)}>取消</Button>
                        <Button onClick={handleAssignClasses}>确认分配</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>添加助教</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="assistantStudentId">工号</Label>
                            <Input
                                id="assistantStudentId"
                                placeholder="请输入工号"
                                value={newAssistant.studentId}
                                onChange={(e) => setNewAssistant({ ...newAssistant, studentId: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="assistantName">姓名</Label>
                            <Input
                                id="assistantName"
                                placeholder="请输入姓名"
                                value={newAssistant.name}
                                onChange={(e) => setNewAssistant({ ...newAssistant, name: e.target.value })}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAddModal(false)}>取消</Button>
                        <Button onClick={handleAddAssistant}>确认添加</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>确认移除助教</AlertDialogTitle>
                        <AlertDialogDescription>
                            此操作将移除该助教及其所有班级关联，无法撤销。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">确认移除</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={showUnbindConfirm} onOpenChange={(open) => !open && setShowUnbindConfirm(false)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>解绑确认</AlertDialogTitle>
                        <AlertDialogDescription>
                            该助教在被移除的班级存在批改草稿，解绑后草稿将保留但无法继续批改。确定解绑吗？
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setShowUnbindConfirm(false)}>取消</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={async () => {
                                if (!pendingAssign) return;
                                const res = await teacherApi.assignClasses(pendingAssign.assistantId, pendingAssign.classIds, true);
                                if (res.success) {
                                    setShowUnbindConfirm(false);
                                    setPendingAssign(null);
                                    setShowAssignModal(false);
                                    loadData();
                                } else {
                                    alert("操作失败: " + res.error?.message);
                                }
                            }}
                        >
                            确认解绑
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
