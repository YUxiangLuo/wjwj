import { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, RotateCcw, Loader2, Users, CheckCircle2, PauseCircle, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { assistantApi, teacherApi, type Assistant, type Teacher } from "../api-client";
import { toast } from "sonner";

export function AssistantManagement() {
    const [assistants, setAssistants] = useState<Assistant[]>([]);
    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [filterTeacher, setFilterTeacher] = useState("all");
    const [newAssistant, setNewAssistant] = useState({ account: "", name: "", teacherId: "" });
    const [submitting, setSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        loadInitialData();
    }, []);

    useEffect(() => {
        loadAssistants();
    }, [filterTeacher]);

    async function loadInitialData() {
        try {
            const teachersRes = await teacherApi.list();
            if (teachersRes.success && teachersRes.data) {
                const activeTeachers = teachersRes.data.filter(t => t.status === 1);
                setTeachers(activeTeachers);
                const firstTeacher = activeTeachers[0];
                if (firstTeacher) {
                    setNewAssistant(prev => ({ ...prev, teacherId: String(firstTeacher.id) }));
                }
            }
        } catch (error) {
            console.error("Failed to load teachers:", error);
        }

        loadAssistants();
    }

    async function loadAssistants() {
        setLoading(true);
        try {
            const res = await assistantApi.list(filterTeacher !== "all" ? filterTeacher : undefined);
            if (res.success && res.data) {
                setAssistants(res.data);
            }
        } catch (error) {
            console.error("Failed to load assistants:", error);
        } finally {
            setLoading(false);
        }
    }

    async function handleAddAssistant() {
        if (!newAssistant.account.trim() || !newAssistant.name.trim() || !newAssistant.teacherId) return;

        setSubmitting(true);
        try {
            const res = await assistantApi.create({
                account: newAssistant.account.trim(),
                name: newAssistant.name.trim(),
                teacherId: parseInt(newAssistant.teacherId),
            });

            if (res.success) {
                setNewAssistant({ account: "", name: "", teacherId: newAssistant.teacherId });
                setShowAddModal(false);
                loadAssistants();
            } else {
                toast.error(res.error?.message ?? "添加失败");
            }
        } catch (error) {
            console.error("Failed to create assistant:", error);
            toast.error("添加失败");
        } finally {
            setSubmitting(false);
        }
    }

    async function handleToggleStatus(assistant: Assistant) {
        const newStatus = assistant.status === 1 ? 0 : 1;
        const action = newStatus === 0 ? "停用" : "启用";

        if (!confirm(`确定${action}助教「${assistant.name}」吗？`)) {
            return;
        }

        try {
            const res = await assistantApi.updateStatus(assistant.id, newStatus);
            if (res.success) {
                loadAssistants();
            } else {
                toast.error(res.error?.message ?? `${action}失败`);
            }
        } catch (error) {
            console.error(`Failed to ${action} assistant:`, error);
            toast.error(`${action}失败`);
        }
    }

    async function handleResetPassword(assistant: Assistant) {
        if (!confirm(`确定重置助教「${assistant.name}」的密码吗？\n\n密码将重置为账号，下次登录需要修改密码。`)) {
            return;
        }

        try {
            const res = await assistantApi.resetPassword(assistant.id);
            if (res.success) {
                toast.success(`密码已重置为：${assistant.account}`);
            } else {
                toast.error(res.error?.message ?? "重置失败");
            }
        } catch (error) {
            console.error("Failed to reset password:", error);
            toast.error("重置失败");
        }
    }

    async function handleDelete(assistant: Assistant) {
        if (!confirm(`确定删除助教「${assistant.name}」吗？`)) {
            return;
        }

        try {
            const res = await assistantApi.delete(assistant.id);
            if (res.success) {
                loadAssistants();
            } else {
                toast.error(res.error?.message ?? "删除失败");
            }
        } catch (error) {
            console.error("Failed to delete assistant:", error);
            toast.error("删除失败");
        }
    }

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString("zh-CN");
    };

    const summary = useMemo(() => {
        const total = assistants.length;
        const active = assistants.filter((assistant) => assistant.status === 1).length;
        const disabled = total - active;
        const teacherCount = new Set(assistants.map((assistant) => assistant.teacherId)).size;
        return { total, active, disabled, teacherCount };
    }, [assistants]);

    const filteredAssistants = useMemo(() => {
        const keyword = searchTerm.trim().toLowerCase();
        if (!keyword) return assistants;
        return assistants.filter((assistant) =>
            assistant.account.toLowerCase().includes(keyword) ||
            assistant.name.toLowerCase().includes(keyword) ||
            assistant.teacherName.toLowerCase().includes(keyword)
        );
    }, [assistants, searchTerm]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-slate-900">助教管理</h2>
                    <p className="text-sm text-slate-500 mt-1">维护助教账号与所绑定教师信息。</p>
                </div>
                <Button onClick={() => setShowAddModal(true)}>
                    <Plus className="w-4 h-4" />
                    添加助教
                </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <Card className="border-slate-200 shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500">助教总数</p>
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
                            <p className="text-xs text-slate-500">关联教师</p>
                            <p className="text-2xl font-semibold text-slate-900">{loading ? "-" : summary.teacherCount}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center">
                            <UserRound className="w-5 h-5" />
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
                        <Input
                            placeholder="搜索账号 / 姓名 / 教师"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="sm:w-60"
                        />
                        <Select value={filterTeacher} onValueChange={setFilterTeacher}>
                            <SelectTrigger className="sm:w-40">
                                <SelectValue placeholder="全部教师" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部教师</SelectItem>
                                {teachers.map((t) => (
                                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                                ))}
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
                                    <TableHead>账号</TableHead>
                                    <TableHead>姓名</TableHead>
                                    <TableHead>所属教师</TableHead>
                                    <TableHead>状态</TableHead>
                                    <TableHead>创建时间</TableHead>
                                    <TableHead>操作</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredAssistants.map((assistant) => (
                                    <TableRow key={assistant.id}>
                                        <TableCell className="font-medium text-slate-900">{assistant.account}</TableCell>
                                        <TableCell>{assistant.name}</TableCell>
                                        <TableCell>{assistant.teacherName}</TableCell>
                                        <TableCell>
                                            {assistant.status === 1 ? (
                                                <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">正常</Badge>
                                            ) : (
                                                <Badge variant="destructive">已停用</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-slate-500">{formatDate(assistant.createdAt)}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-2">
                                                <Button variant="ghost" size="sm" onClick={() => handleResetPassword(assistant)}>
                                                    <RotateCcw className="w-3 h-3 mr-1" />
                                                    重置密码
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleToggleStatus(assistant)}
                                                    className={assistant.status === 1 ? "text-orange-500 hover:text-orange-600" : "text-emerald-600 hover:text-emerald-700"}
                                                >
                                                    {assistant.status === 1 ? "停用" : "启用"}
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleDelete(assistant)}
                                                    className="text-destructive hover:text-destructive"
                                                >
                                                    <Trash2 className="w-3 h-3 mr-1" />
                                                    删除
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {filteredAssistants.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-12 text-slate-500">
                                            暂无符合条件的数据
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
                        <DialogTitle>添加助教</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="account">账号</Label>
                            <Input
                                id="account"
                                placeholder="请输入账号"
                                value={newAssistant.account}
                                onChange={(e) => setNewAssistant({ ...newAssistant, account: e.target.value })}
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
                        <div className="space-y-2">
                            <Label>所属教师</Label>
                            <Select value={newAssistant.teacherId} onValueChange={(v) => setNewAssistant({ ...newAssistant, teacherId: v })}>
                                <SelectTrigger>
                                    <SelectValue placeholder="选择教师" />
                                </SelectTrigger>
                                <SelectContent>
                                    {teachers.map((t) => (
                                        <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <p className="text-xs text-muted-foreground">初始密码为账号</p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAddModal(false)} disabled={submitting}>
                            取消
                        </Button>
                        <Button
                            onClick={handleAddAssistant}
                            disabled={submitting || !newAssistant.account.trim() || !newAssistant.name.trim() || !newAssistant.teacherId}
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
