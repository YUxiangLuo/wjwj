import { useState, useEffect, useMemo } from "react";
import { UserPlus, Users, CheckCircle2, PauseCircle, Trash2, KeyRound, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SearchInput } from "@/components/ui/search-input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
                <h2 className="text-lg font-semibold text-foreground">助教管理</h2>
                <p className="text-sm text-muted-foreground mt-1">维护助教账号与负责班级。</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">助教总数</p>
                            <p className="text-2xl font-semibold text-foreground mt-1">{summary.total}</p>
                        </div>
                        <div className="w-10 h-10 bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
                            <Users className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">正常账号</p>
                            <p className="text-2xl font-semibold text-foreground mt-1">{summary.active}</p>
                        </div>
                        <div className="w-10 h-10 bg-success/10 text-success flex items-center justify-center border border-success/20">
                            <CheckCircle2 className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">已停用</p>
                            <p className="text-2xl font-semibold text-foreground mt-1">{summary.disabled}</p>
                        </div>
                        <div className="w-10 h-10 bg-warning/10 text-warning flex items-center justify-center border border-warning/20">
                            <PauseCircle className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">覆盖班级</p>
                            <p className="text-2xl font-semibold text-foreground mt-1">{summary.classCount}</p>
                        </div>
                        <div className="w-10 h-10 bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
                            <Users className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-border pb-4">
                    <div>
                        <CardTitle className="text-base text-foreground">助教列表</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">共 {filteredAssistants.length} 条数据</p>
                    </div>
                    <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
                        <SearchInput
                            className="sm:w-56"
                            data-testid="teacher-assistant-search"
                            placeholder="搜索姓名/工号/邮箱"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | "active" | "disabled")}>
                            <SelectTrigger data-testid="teacher-assistant-status-filter" className="sm:w-28">
                                <SelectValue placeholder="全部状态" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem value="all">全部状态</SelectItem>
                                    <SelectItem value="active">正常</SelectItem>
                                    <SelectItem value="disabled">已停用</SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <Button data-testid="teacher-assistant-add-open" onClick={() => setShowAddModal(true)}>
                            <UserPlus data-icon="inline-start" />
                            添加助教
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="pt-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-border hover:bg-muted/50">
                                <TableHead className="text-muted-foreground">姓名</TableHead>
                                <TableHead className="text-muted-foreground">工号</TableHead>
                                <TableHead className="text-muted-foreground">邮箱</TableHead>
                                <TableHead className="text-muted-foreground">负责班级</TableHead>
                                <TableHead className="text-muted-foreground">状态</TableHead>
                                <TableHead className="text-muted-foreground text-right">操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredAssistants.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                                        <div className="flex flex-col items-center gap-2">
                                            <div className="w-12 h-12 rounded-full bg-card border border-border flex items-center justify-center">
                                                <Users className="w-6 h-6 text-muted-foreground" />
                                            </div>
                                            <p>暂无符合条件的助教</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : filteredAssistants.map((ta) => (
                                <TableRow data-testid={`teacher-assistant-row-${ta.id}`} key={ta.id} className="border-border hover:bg-accent transition-colors">
                                    <TableCell className="font-medium text-foreground">{ta.name}</TableCell>
                                    <TableCell className="font-mono text-foreground">{ta.studentId}</TableCell>
                                    <TableCell className="text-muted-foreground">{ta.email || "-"}</TableCell>
                                    <TableCell>
                                        <div className="flex gap-1 flex-wrap">
                                            {ta.assignedClasses.map((cls) => (
                                                <Badge key={cls} variant="muted">{cls}</Badge>
                                            ))}
                                            {ta.assignedClasses.length === 0 && <span className="text-muted-foreground text-xs">-</span>}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {ta.status === 1 ? (
                                            <Badge variant="success">正常</Badge>
                                        ) : (
                                            <Badge variant="muted">已停用</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex flex-wrap justify-end gap-2">
                                            <Button data-testid={`teacher-assistant-assign-open-${ta.id}`} variant="ghost" size="xs" onClick={() => openAssignModal(ta)}>
                                                <UserCog data-icon="inline-start" />分配班级
                                            </Button>
                                            <Button
                                                data-testid={`teacher-assistant-reset-${ta.id}`}
                                                variant="ghost"
                                                size="xs"
                                                onClick={async () => {
                                                    const res = await teacherApi.updateAssistant(ta.id, { action: "reset_password" });
                                                    if (res.success) {
                                                        toast.success("密码已重置为助教账号");
                                                    } else {
                                                        toast.error("重置失败: " + res.error?.message);
                                                    }
                                                }}
                                            >
                                                <KeyRound data-icon="inline-start" />重置密码
                                            </Button>
                                            <Button
                                                data-testid={`teacher-assistant-toggle-${ta.id}`}
                                                variant={ta.status === 1 ? "warning" : "success"}
                                                size="xs"
                                                onClick={async () => {
                                                    const res = await teacherApi.updateAssistant(ta.id, { action: "toggle_status" });
                                                    if (res.success) {
                                                        loadData();
                                                    } else {
                                                        toast.error("操作失败: " + res.error?.message);
                                                    }
                                                }}
                                            >
                                                {ta.status === 1 ? <><PauseCircle data-icon="inline-start" />停用</> : <><CheckCircle2 data-icon="inline-start" />启用</>}
                                            </Button>
                                            <Button data-testid={`teacher-assistant-delete-${ta.id}`} variant="destructive" size="xs" onClick={() => setDeleteId(ta.id)}>
                                                <Trash2 data-icon="inline-start" />移除
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
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-foreground">确认移除助教</AlertDialogTitle>
                        <AlertDialogDescription className="text-muted-foreground">
                            此操作将移除该助教及其所有班级关联，无法撤销。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">确认移除</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
