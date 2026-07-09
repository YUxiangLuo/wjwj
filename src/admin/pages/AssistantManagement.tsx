import { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, RotateCcw, Loader2, Users, CheckCircle2, PauseCircle, UserRound, Search, ShieldAlert, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { assistantApi, teacherApi, type Assistant, type Teacher } from "../api-client";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { toast } from "sonner";
import { IconTile } from "@/components/IconTile";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";

export function AssistantManagement() {
    const { confirm, dialog } = useConfirmDialog();
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

        const shouldProceed = await confirm({
            title: `${action}助教「${assistant.name}」`,
            description: newStatus === 0
                ? "停用后该助教将无法登录系统，也无法继续处理所属教师的班级事务。"
                : "启用后该助教将恢复登录权限，并可继续协助所属教师。",
            confirmLabel: action,
            tone: newStatus === 0 ? "destructive" : "primary",
        });
        if (!shouldProceed) {
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
        const shouldReset = await confirm({
            title: `重置助教「${assistant.name}」的密码`,
            description: "密码将重置为账号，下次登录需要修改密码。",
            confirmLabel: "重置密码",
        });
        if (!shouldReset) {
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

    async function handleUnlock(assistant: Assistant) {
        const shouldUnlock = await confirm({
            title: `解锁助教「${assistant.name}」`,
            description: "解锁后该助教可立即重新尝试登录。",
            confirmLabel: "解锁助教",
        });
        if (!shouldUnlock) {
            return;
        }

        try {
            const res = await assistantApi.unlock(assistant.id);
            if (res.success) {
                loadAssistants();
            } else {
                toast.error(res.error?.message ?? "解锁失败");
            }
        } catch (error) {
            console.error("Failed to unlock assistant:", error);
            toast.error("解锁失败");
        }
    }

    async function handleDelete(assistant: Assistant) {
        const shouldDelete = await confirm({
            title: `删除助教「${assistant.name}」`,
            description: "删除后该助教账号将无法恢复，请确认其职责已完成交接。",
            confirmLabel: "删除助教",
            tone: "destructive",
        });
        if (!shouldDelete) {
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

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return "-";
        return new Date(dateStr).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
    };

    const summary = useMemo(() => {
        const total = assistants.length;
        const locked = assistants.filter((assistant) => assistant.isLocked).length;
        const active = assistants.filter((assistant) => assistant.status === 1 && !assistant.isLocked).length;
        const disabled = total - active - locked;
        const teacherCount = new Set(assistants.map((assistant) => assistant.creatorTeacherId)).size;
        return { total, active, disabled, locked, teacherCount };
    }, [assistants]);

    const filteredAssistants = useMemo(() => {
        const keyword = searchTerm.trim().toLowerCase();
        if (!keyword) return assistants;
        return assistants.filter((assistant) =>
            assistant.account.toLowerCase().includes(keyword) ||
            assistant.name.toLowerCase().includes(keyword) ||
            (assistant.teacherName?.toLowerCase() ?? "").includes(keyword)
        );
    }, [assistants, searchTerm]);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <PageHeader border={false}>
                <div>
                    <h2 className="text-lg font-semibold text-foreground">助教管理</h2>
                    <p className="text-sm text-muted-foreground mt-1">维护助教账号与所绑定教师信息。</p>
                </div>
                <Button data-testid="assistant-create-open" onClick={() => setShowAddModal(true)} className="bg-primary hover:bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                    <Plus className="w-4 h-4 mr-1" />
                    添加助教
                </Button>
            </PageHeader>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
                <Card className="transition-colors hover:border-input">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Assistants</p>
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
                            <Unlock className="w-5 h-5" />
                        </IconTile>
                    </CardContent>
                </Card>
                <Card className="transition-colors hover:border-input">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Linked Teachers</p>
                            <p className="text-2xl font-bold text-foreground mt-1">{loading ? "-" : summary.teacherCount}</p>
                        </div>
                        <IconTile intent="auxiliary">
                            <UserRound className="w-5 h-5" />
                        </IconTile>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <PageHeader as={CardHeader}>
                    <div>
                        <CardTitle className="text-base text-foreground">助教列表</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">共 {filteredAssistants.length} 条数据</p>
                    </div>
                    <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
                            <Input
                                placeholder="搜索账号 / 姓名 / 教师"
                                data-testid="assistant-search-input"
                                value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-background border-border text-foreground placeholder:text-muted-foreground sm:w-64 focus:border-ring"
                        />
                        <Select value={filterTeacher} onValueChange={setFilterTeacher}>
                            <SelectTrigger className="bg-background border-border text-foreground sm:w-40">
                                <SelectValue placeholder="全部教师" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border text-foreground">
                                <SelectItem value="all">全部教师</SelectItem>
                                {teachers.map((t) => (
                                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                                ))}
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
                                    <TableHead className="text-muted-foreground">账号</TableHead>
                                    <TableHead className="text-muted-foreground">姓名</TableHead>
                                    <TableHead className="text-muted-foreground">所属教师</TableHead>
                                    <TableHead className="text-muted-foreground">状态</TableHead>
                                    <TableHead className="text-muted-foreground">绑定班级数</TableHead>
                                    <TableHead className="text-muted-foreground">最后登录</TableHead>
                                    <TableHead className="text-muted-foreground">创建时间</TableHead>
                                    <TableHead className="text-muted-foreground text-right">操作</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredAssistants.map((assistant) => (
                                    <TableRow key={assistant.id} data-testid={`assistant-row-${assistant.account}`} className="border-border hover:bg-muted/50 transition-colors">
                                        <TableCell className="font-mono text-primary">{assistant.account}</TableCell>
                                        <TableCell className="font-medium text-foreground">{assistant.name}</TableCell>
                                        <TableCell className="text-foreground/90">{assistant.teacherName}</TableCell>
                                        <TableCell>
                                            {assistant.isLocked ? (
                                                <StatusBadge intent="destructive">已锁定</StatusBadge>
                                            ) : assistant.status === 1 ? (
                                                <StatusBadge intent="success">正常</StatusBadge>
                                            ) : (
                                                <Badge variant="destructive" className="bg-muted-foreground/20 text-foreground/90 hover:bg-muted-foreground/20">已停用</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-foreground/90">{assistant.classCount}</TableCell>
                                        <TableCell className="text-muted-foreground text-xs">{formatDate(assistant.lastLogin)}</TableCell>
                                        <TableCell className="text-muted-foreground text-xs">{formatDate(assistant.createdAt)}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {assistant.isLocked && (
                                                    <Button data-testid={`assistant-unlock-${assistant.account}`} variant="ghost" size="sm" onClick={() => handleUnlock(assistant)} className="h-8 text-warning hover:text-warning hover:bg-warning/10">
                                                        <Unlock className="w-3.5 h-3.5 mr-1" />
                                                        解锁
                                                    </Button>
                                                )}
                                                <Button data-testid={`assistant-reset-${assistant.account}`} variant="ghost" size="sm" onClick={() => handleResetPassword(assistant)} className="h-8 text-muted-foreground hover:text-primary hover:bg-primary/10">
                                                    <RotateCcw className="w-3.5 h-3.5 mr-1" />
                                                    重置
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    data-testid={`assistant-toggle-status-${assistant.account}`}
                                                    onClick={() => handleToggleStatus(assistant)}
                                                    className={`h-8 ${assistant.status === 1 ? "text-destructive hover:text-destructive hover:bg-destructive/10" : "text-success hover:text-success hover:bg-success/10"}`}
                                                >
                                                    {assistant.status === 1 ? "停用" : "启用"}
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    data-testid={`assistant-delete-${assistant.account}`}
                                                    onClick={() => handleDelete(assistant)}
                                                    className="h-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                                                    删除
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {filteredAssistants.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center py-16 text-muted-foreground">
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

            <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
                <DialogContent className="bg-card border-border text-foreground sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">添加助教</DialogTitle>
                        <DialogDescription className="text-muted-foreground">创建助教账号并绑定到指定教师名下。</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="account" className="text-foreground/90">账号</Label>
                            <Input
                                id="account"
                                data-testid="assistant-create-account"
                                placeholder="请输入账号"
                                value={newAssistant.account}
                                onChange={(e) => setNewAssistant({ ...newAssistant, account: e.target.value })}
                                className="bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-ring"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="assistantName" className="text-foreground/90">姓名</Label>
                            <Input
                                id="assistantName"
                                data-testid="assistant-create-name"
                                placeholder="请输入姓名"
                                value={newAssistant.name}
                                onChange={(e) => setNewAssistant({ ...newAssistant, name: e.target.value })}
                                className="bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-ring"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-foreground/90">所属教师</Label>
                            <Select value={newAssistant.teacherId} onValueChange={(v) => setNewAssistant({ ...newAssistant, teacherId: v })}>
                                <SelectTrigger data-testid="assistant-create-teacher" className="bg-background border-border text-foreground">
                                    <SelectValue placeholder="选择教师" />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border text-foreground">
                                    {teachers.map((t) => (
                                        <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <ShieldAlert className="w-3 h-3" /> 初始密码默认为账号
                        </p>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setShowAddModal(false)} disabled={submitting} className="text-muted-foreground hover:text-foreground hover:bg-muted">
                            取消
                        </Button>
                        <Button
                            data-testid="assistant-create-submit"
                            onClick={handleAddAssistant}
                            disabled={submitting || !newAssistant.account.trim() || !newAssistant.name.trim() || !newAssistant.teacherId}
                            className="bg-primary hover:bg-primary text-primary-foreground"
                        >
                            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            确认添加
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {dialog}
        </div>
    );
}
