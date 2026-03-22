import { useState, useEffect, useMemo } from "react";
import { UserPlus, Users, CheckCircle2, PauseCircle, Search, Trash2, KeyRound, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { AssistantAddDialog } from "../components/AssistantAddDialog";
import { AssistantAssignDialog } from "../components/AssistantAssignDialog";
import { teacherApi, type Assistant, type TeacherClass } from "../api-client";
import { toast } from "sonner";

export function AssistantManagement() {
    const [assistants, setAssistants] = useState<Assistant[]>([]);
    const [classes, setClasses] = useState<TeacherClass[]>([]);
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [selectedAssistant, setSelectedAssistant] = useState<Assistant | null>(null);
    const [deleteId, setDeleteId] = useState<number | null>(null);
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
        const name = newAssistant.name.trim();
        const studentId = newAssistant.studentId.trim();
        if (!name || !studentId) {
            toast.error("请输入工号和姓名");
            return;
        }

        const res = await teacherApi.createAssistant({ name, studentId });
        if (res.success) {
            setShowAddModal(false);
            setNewAssistant({ name: "", studentId: "" });
            loadData();
        } else {
            toast.error("添加失败: " + res.error?.message);
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
        } else {
            toast.error("分配失败: " + res.error?.message);
        }
    }

    async function handleDelete() {
        if (!deleteId) return;
        const res = await teacherApi.deleteAssistant(deleteId);
        if (res.success) {
            setDeleteId(null);
            loadData();
        } else {
            toast.error("删除失败");
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
        <div className="space-y-6 animate-in fade-in duration-500">
            <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">助教管理</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">维护助教账号与负责班级。</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <Card className="border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">助教总数</p>
                            <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mt-1">{summary.total}</p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-500/20">
                            <Users className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">正常账号</p>
                            <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mt-1">{summary.active}</p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center border border-emerald-500/20">
                            <CheckCircle2 className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">已停用</p>
                            <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mt-1">{summary.disabled}</p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center border border-amber-500/20">
                            <PauseCircle className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">覆盖班级</p>
                            <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mt-1">{summary.classCount}</p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-purple-500/10 text-purple-600 flex items-center justify-center border border-purple-500/20">
                            <Users className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shadow-sm">
                <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                    <div>
                        <CardTitle className="text-base text-slate-900 dark:text-slate-100">助教列表</CardTitle>
                        <p className="text-xs text-slate-500 mt-1">共 {filteredAssistants.length} 条数据</p>
                    </div>
                    <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
                        <div className="relative sm:w-56">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            <Input
                                data-testid="teacher-assistant-search"
                                placeholder="搜索姓名/工号/邮箱"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 placeholder:text-slate-500 focus:border-indigo-500/50"
                            />
                        </div>
                        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | "active" | "disabled")}>
                            <SelectTrigger data-testid="teacher-assistant-status-filter" className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 sm:w-28">
                                <SelectValue placeholder="全部状态" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                                <SelectItem value="all">全部状态</SelectItem>
                                <SelectItem value="active">正常</SelectItem>
                                <SelectItem value="disabled">已停用</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button data-testid="teacher-assistant-add-open" onClick={() => setShowAddModal(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20">
                            <UserPlus className="w-4 h-4 mr-2" />
                            添加助教
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="pt-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-slate-200 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                                <TableHead className="text-slate-600 dark:text-slate-400">姓名</TableHead>
                                <TableHead className="text-slate-600 dark:text-slate-400">工号</TableHead>
                                <TableHead className="text-slate-600 dark:text-slate-400">邮箱</TableHead>
                                <TableHead className="text-slate-600 dark:text-slate-400">负责班级</TableHead>
                                <TableHead className="text-slate-600 dark:text-slate-400">状态</TableHead>
                                <TableHead className="text-slate-600 dark:text-slate-400 text-right">操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredAssistants.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-12 text-slate-500">
                                        <div className="flex flex-col items-center gap-2">
                                            <div className="w-12 h-12 rounded-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center">
                                                <Users className="w-6 h-6 text-slate-500" />
                                            </div>
                                            <p>暂无符合条件的助教</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : filteredAssistants.map((ta) => (
                                <TableRow data-testid={`teacher-assistant-row-${ta.id}`} key={ta.id} className="border-slate-200 dark:border-slate-800 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 transition-colors">
                                    <TableCell className="font-medium text-slate-800 dark:text-slate-200">{ta.name}</TableCell>
                                    <TableCell className="font-mono text-slate-700 dark:text-slate-300">{ta.studentId}</TableCell>
                                    <TableCell className="text-slate-600 dark:text-slate-400">{ta.email || "-"}</TableCell>
                                    <TableCell>
                                        <div className="flex gap-1 flex-wrap">
                                            {ta.assignedClasses.map((cls) => (
                                                <Badge key={cls} variant="secondary" className="text-xs bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-300 dark:hover:bg-slate-700">{cls}</Badge>
                                            ))}
                                            {ta.assignedClasses.length === 0 && <span className="text-slate-500 text-xs">-</span>}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {ta.status === 1 ? (
                                            <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20">正常</Badge>
                                        ) : (
                                            <Badge variant="secondary" className="bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700">已停用</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex flex-wrap justify-end gap-2">
                                            <Button data-testid={`teacher-assistant-assign-open-${ta.id}`} variant="ghost" size="sm" className="h-8 text-slate-600 dark:text-slate-400 hover:text-indigo-500 hover:bg-indigo-500/10" onClick={() => openAssignModal(ta)}>
                                                <UserCog className="w-3.5 h-3.5 mr-1" />分配班级
                                            </Button>
                                            <Button
                                                data-testid={`teacher-assistant-reset-${ta.id}`}
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 text-slate-600 dark:text-slate-400 hover:text-blue-600 hover:bg-blue-500/10"
                                                onClick={async () => {
                                                    const res = await teacherApi.updateAssistant(ta.id, { action: "reset_password" });
                                                    if (res.success) {
                                                        toast.success("密码已重置为助教账号");
                                                    } else {
                                                        toast.error("重置失败: " + res.error?.message);
                                                    }
                                                }}
                                            >
                                                <KeyRound className="w-3.5 h-3.5 mr-1" />重置密码
                                            </Button>
                                            <Button
                                                data-testid={`teacher-assistant-toggle-${ta.id}`}
                                                variant="ghost"
                                                size="sm"
                                                className={`h-8 ${ta.status === 1 ? "text-slate-600 dark:text-slate-400 hover:text-amber-600 hover:bg-amber-500/10" : "text-slate-600 dark:text-slate-400 hover:text-emerald-600 hover:bg-emerald-500/10"}`}
                                                onClick={async () => {
                                                    const res = await teacherApi.updateAssistant(ta.id, { action: "toggle_status" });
                                                    if (res.success) {
                                                        loadData();
                                                    } else {
                                                        toast.error("操作失败: " + res.error?.message);
                                                    }
                                                }}
                                            >
                                                {ta.status === 1 ? <><PauseCircle className="w-3.5 h-3.5 mr-1" />停用</> : <><CheckCircle2 className="w-3.5 h-3.5 mr-1" />启用</>}
                                            </Button>
                                            <Button data-testid={`teacher-assistant-delete-${ta.id}`} variant="ghost" size="sm" className="h-8 text-slate-600 dark:text-slate-400 hover:text-rose-600 hover:bg-rose-500/10" onClick={() => setDeleteId(ta.id)}>
                                                <Trash2 className="w-3.5 h-3.5 mr-1" />移除
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <AssistantAssignDialog
                open={showAssignModal}
                onOpenChange={setShowAssignModal}
                assistant={selectedAssistant}
                classes={classes}
                selectedClassIds={selectedClassIds}
                onSelectedClassIdsChange={setSelectedClassIds}
                onSubmit={handleAssignClasses}
            />

            <AssistantAddDialog
                open={showAddModal}
                onOpenChange={setShowAddModal}
                form={newAssistant}
                onFormChange={setNewAssistant}
                onSubmit={handleAddAssistant}
            />

            <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
                <AlertDialogContent className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-900 dark:text-slate-100">确认移除助教</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-600 dark:text-slate-400">
                            此操作将移除该助教及其所有班级关联，无法撤销。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100">取消</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-rose-600 hover:bg-rose-700 text-white">确认移除</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
