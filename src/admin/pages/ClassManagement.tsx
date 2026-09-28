import { RequestError } from "@/components/RequestError";
import { requireApiData, useAsyncLoad } from "@/hooks/useAsyncLoad";
import { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, Users, Pencil, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { classApi, semesterApi, teacherApi, type Class, type Semester, type Teacher } from "../api-client";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { LoadingStatus } from "@/components/LoadingStatus";

export function ClassManagement() {
    const navigate = useNavigate();
    const { confirm, dialog } = useConfirmDialog();
    const [classes, setClasses] = useState<Class[]>([]);
    const [semesters, setSemesters] = useState<Semester[]>([]);
    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const { loading, error: loadError, run } = useAsyncLoad("班级列表加载失败");
    const optionsLoad = useAsyncLoad("班级选项加载失败");
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [filterSemester, setFilterSemester] = useState("all");
    const [filterTeacher, setFilterTeacher] = useState("all");
    const [newClass, setNewClass] = useState({ name: "", semesterId: "", teacherId: "" });
    const [editingClass, setEditingClass] = useState<Class | null>(null);
    const [editForm, setEditForm] = useState({ name: "" });
    const [submitting, setSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        loadInitialData();
    }, []);

    useEffect(() => {
        loadClasses();
    }, [filterSemester, filterTeacher]);

    async function loadInitialData() {
        await optionsLoad.run(async () => {
            const [semestersRes, teachersRes] = await Promise.all([semesterApi.list(), teacherApi.list()]);
            return { semesters: requireApiData(semestersRes, "学期选项加载失败"), teachers: requireApiData(teachersRes, "教师选项加载失败") };
        }, ({ semesters, teachers }) => {
            setSemesters(semesters);
            setTeachers(teachers);
            const defaultSemester = semesters.find(semester => semester.isCurrent === 1) ?? semesters[0];
            setNewClass(previous => ({ ...previous, semesterId: previous.semesterId || String(defaultSemester?.id ?? ""), teacherId: previous.teacherId || String(teachers[0]?.id ?? "") }));
        });
    }

    async function loadClasses() {
        return run(async () => requireApiData(await classApi.list({ semesterId: filterSemester, teacherId: filterTeacher }), "班级列表加载失败"), setClasses);
    }

    async function handleAddClass() {
        if (!newClass.name.trim() || !newClass.semesterId || !newClass.teacherId) return;

        setSubmitting(true);
        try {
            const res = await classApi.create({
                name: newClass.name.trim(),
                semesterId: parseInt(newClass.semesterId),
                teacherId: parseInt(newClass.teacherId),
            });

            if (res.success) {
                setNewClass({ name: "", semesterId: newClass.semesterId, teacherId: newClass.teacherId });
                setShowAddModal(false);
                loadClasses();
            } else {
                toast.error(res.error?.message ?? "创建失败");
            }
        } finally {
            setSubmitting(false);
        }
    }

    function openEditModal(cls: Class) {
        setEditingClass(cls);
        setEditForm({ name: cls.name });
        setShowEditModal(true);
    }

    async function handleEditClass() {
        if (!editingClass || !editForm.name.trim()) return;

        setSubmitting(true);
        try {
            const res = await classApi.update(editingClass.id, { name: editForm.name.trim() });

            if (res.success) {
                setShowEditModal(false);
                setEditingClass(null);
                loadClasses();
            } else {
                toast.error(res.error?.message ?? "更新失败");
            }
        } finally {
            setSubmitting(false);
        }
    }

    function deleteBlockers(cls: Class) {
        if (cls.deleteBlockers) return cls.deleteBlockers;
        const fallback: string[] = [];
        if (cls.studentCount > 0) fallback.push(`${cls.studentCount} 名学生`);
        if ((cls.taskCount ?? 0) > 0) fallback.push(`${cls.taskCount} 个任务`);
        return fallback;
    }

    async function handleDelete(cls: Class) {
        // The list already knows why a class cannot be deleted; keep the server
        // check as the authority but never open a doomed confirmation.
        if (deleteBlockers(cls).length > 0) {
            toast.error(`该班级已有 ${deleteBlockers(cls).join("、")}，无法删除`);
            return;
        }

        const shouldDelete = await confirm({
            title: `删除班级「${cls.name}」`,
            description: "仅没有任何学生记录和历史任务的空班级可以删除。删除后无法恢复。",
            confirmLabel: "删除班级",
            tone: "destructive",
        });
        if (!shouldDelete) {
            return;
        }

        const res = await classApi.delete(cls.id);
        if (res.success) {
            loadClasses();
        } else {
            toast.error(res.error?.message ?? "删除失败");
        }
    }

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
    };

    const summary = useMemo(() => {
        const total = classes.length;
        const studentTotal = classes.reduce((sum, cls) => sum + cls.studentCount, 0);
        const currentSemesterName = semesters.find((s) => s.isCurrent)?.name ?? "暂无";
        const teacherCount = new Set(classes.map((cls) => cls.teacherId)).size;
        return { total, studentTotal, currentSemesterName, teacherCount };
    }, [classes, semesters]);

    const filteredClasses = useMemo(() => {
        const keyword = searchTerm.trim().toLowerCase();
        return classes.filter((cls) => {
            if (!keyword) return true;
            return (
                cls.name.toLowerCase().includes(keyword) ||
                (cls.semesterName?.toLowerCase() ?? "").includes(keyword) ||
                (cls.teacherName?.toLowerCase() ?? "").includes(keyword)
            );
        });
    }, [classes, searchTerm]);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {optionsLoad.error && <RequestError message={optionsLoad.error} onRetry={() => void loadInitialData()} />}
            <PageHeader border={false}>
                <div>
                    <p className="text-label text-muted-foreground">管理班级、授课教师与学生规模。</p>
                </div>
                <Button data-testid="class-create-open" onClick={() => setShowAddModal(true)} className="bg-primary hover:bg-primary-hover text-primary-foreground ">
                    <Plus className="w-4 h-4 mr-1" />
                    创建班级
                </Button>
            </PageHeader>

            <dl aria-label="班级概览" className="grid grid-cols-4 gap-5 border-b border-border pb-5">
                <div><dt className="text-meta text-muted-foreground">班级总数</dt><dd className="mt-1 text-subheading font-semibold tabular-nums">{loading || loadError ? "-" : summary.total}</dd></div>
                <div><dt className="text-meta text-muted-foreground">学生总数</dt><dd className="mt-1 text-subheading font-semibold tabular-nums">{loading || loadError ? "-" : summary.studentTotal}</dd></div>
                <div><dt className="text-meta text-muted-foreground">当前学期</dt><dd className="mt-1 text-label font-semibold break-words">{loading || loadError ? "-" : summary.currentSemesterName}</dd></div>
                <div><dt className="text-meta text-muted-foreground">授课教师</dt><dd className="mt-1 text-subheading font-semibold tabular-nums">{loading || loadError ? "-" : summary.teacherCount}</dd></div>
            </dl>

            <Card>
                <PageHeader as={CardHeader} className="flex-wrap">
                    <div>
                        <CardTitle className="text-section-title text-foreground">班级列表</CardTitle>
                        <p className="text-meta text-muted-foreground mt-1">共 {filteredClasses.length} 条数据</p>
                    </div>
                    <div className="flex flex-wrap gap-3 flex-row w-auto">
                        <Input
                            placeholder="搜索班级 / 学期 / 教师"
                            aria-label="搜索班级、学期或教师"
                            data-testid="class-search-input"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-card border-input text-foreground placeholder:text-muted-foreground w-64 focus:border-ring"
                        />
                        <Select value={filterSemester} onValueChange={setFilterSemester}>
                            <SelectTrigger aria-label="按学期筛选班级" data-testid="class-filter-semester" className="bg-card border-input text-foreground w-36">
                                <SelectValue placeholder="全部学期" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border text-foreground">
                                <SelectItem value="all">全部学期</SelectItem>
                                {semesters.map((s) => (
                                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={filterTeacher} onValueChange={setFilterTeacher}>
                            <SelectTrigger aria-label="按教师筛选班级" data-testid="class-filter-teacher" className="bg-card border-input text-foreground w-36">
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
                    {loadError ? <RequestError message={loadError} onRetry={() => void loadClasses()} /> : loading ? (
                        <LoadingStatus className="py-12" iconClassName="text-muted-foreground" label="正在加载班级列表" />
                    ) : (
                        <Table aria-label="班级列表">
                            <TableHeader>
                                <TableRow className="border-border">
                                    <TableHead className="text-muted-foreground">班级名称</TableHead>
                                    <TableHead className="text-muted-foreground">学期</TableHead>
                                    <TableHead className="text-muted-foreground">授课教师</TableHead>
                                    <TableHead className="text-muted-foreground">学生人数</TableHead>
                                    <TableHead className="text-muted-foreground">创建时间</TableHead>
                                    <TableHead className="text-muted-foreground text-right">操作</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredClasses.map((cls) => (
                                    <TableRow key={cls.id} data-testid={`class-row-${cls.id}`} className="border-border hover:bg-muted transition-none">
                                        <TableCell className="font-medium text-foreground">{cls.name}</TableCell>
                                        <TableCell>
                                            <StatusBadge intent="info">
                                                {cls.semesterName}
                                            </StatusBadge>
                                        </TableCell>
                                        <TableCell className="text-foreground">{cls.teacherName}</TableCell>
                                        <TableCell>
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-control text-meta font-medium bg-muted text-foreground">
                                                {cls.studentCount}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-meta">{formatDate(cls.createdAt)}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => navigate(`/student?classId=${cls.id}`)}
                                                    className="h-8 text-muted-foreground hover:text-success hover:bg-success-muted"
                                                >
                                                    <Users className="w-3.5 h-3.5 mr-1" />
                                                    学生
                                                </Button>
                                                <Button data-testid={`class-edit-open-${cls.id}`} variant="ghost" size="sm" onClick={() => openEditModal(cls)} className="h-8 text-muted-foreground hover:text-primary hover:bg-primary-muted">
                                                    <Pencil className="w-3.5 h-3.5 mr-1" />
                                                    编辑
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    data-testid={`class-delete-${cls.id}`}
                                                    onClick={() => handleDelete(cls)}
                                                    disabled={deleteBlockers(cls).length > 0}
                                                    title={deleteBlockers(cls).length > 0 ? `已有 ${deleteBlockers(cls).join("、")}，无法删除` : "删除班级"}
                                                    className="h-8 text-muted-foreground hover:text-destructive hover:bg-destructive-muted"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                                                    删除
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {filteredClasses.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-16 text-muted-foreground">
                                            <div className="flex flex-col items-center gap-2">
                                                <div className="w-12 h-12 rounded-control bg-card border border-border flex items-center justify-center">
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

            {/* 创建班级弹窗 */}
            <Dialog open={showAddModal} onOpenChange={(open) => { if (!submitting) setShowAddModal(open); }}>
                <DialogContent className="bg-card border-border text-foreground max-w-[425px]" showCloseButton={!submitting}>
                    <DialogHeader>
                        <DialogTitle className="text-foreground">创建班级</DialogTitle>
                        <DialogDescription className="text-muted-foreground">为指定学期和教师创建一个新的教学班级。</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="className" className="text-foreground">班级名称</Label>
                            <Input
                                id="className"
                                data-testid="class-create-name"
                                placeholder="请输入班级名称"
                                value={newClass.name}
                                maxLength={100}
                                onChange={(e) => setNewClass({ ...newClass, name: e.target.value })}
                                className="bg-card border-input text-foreground placeholder:text-muted-foreground focus:border-ring"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-foreground">所属学期</Label>
                            <Select value={newClass.semesterId} onValueChange={(v) => setNewClass({ ...newClass, semesterId: v })}>
                                <SelectTrigger aria-label="新建班级所属学期" data-testid="class-create-semester" className="bg-card border-input text-foreground">
                                    <SelectValue placeholder="选择学期" />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border text-foreground">
                                    {semesters.map((s) => (
                                        <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-foreground">授课教师</Label>
                            <Select value={newClass.teacherId} onValueChange={(v) => setNewClass({ ...newClass, teacherId: v })}>
                                <SelectTrigger aria-label="新建班级授课教师" data-testid="class-create-teacher" className="bg-card border-input text-foreground">
                                    <SelectValue placeholder="选择教师" />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border text-foreground">
                                    {teachers.map((t) => (
                                        <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setShowAddModal(false)} disabled={submitting} className="text-muted-foreground hover:text-foreground hover:bg-muted">
                            取消
                        </Button>
                        <Button
                            data-testid="class-create-submit"
                            onClick={handleAddClass}
                            disabled={submitting || !newClass.name.trim() || !newClass.semesterId || !newClass.teacherId}
                            className="bg-primary hover:bg-primary-hover text-primary-foreground"
                        >
                            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            确认创建
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 编辑班级弹窗 */}
            <Dialog open={showEditModal} onOpenChange={(open) => { if (!submitting) setShowEditModal(open); }}>
                <DialogContent className="bg-card border-border text-foreground max-w-[425px]" showCloseButton={!submitting}>
                    <DialogHeader>
                        <DialogTitle className="text-foreground">编辑班级</DialogTitle>
                        <DialogDescription className="text-muted-foreground">更新班级名称。学期与授课教师创建后不可变更。</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="editClassName" className="text-foreground">班级名称</Label>
                            <Input
                                id="editClassName"
                                data-testid="class-edit-name"
                                placeholder="请输入班级名称"
                                value={editForm.name}
                                maxLength={100}
                                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                className="bg-card border-input text-foreground placeholder:text-muted-foreground focus:border-ring"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-foreground">所属学期</Label>
                            <Input value={editingClass?.semesterName ?? ""} disabled className="bg-card border-input text-muted-foreground" />
                            <p className="text-meta text-muted-foreground">学期不可更改</p>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-foreground">授课教师</Label>
                            <Input value={editingClass?.teacherName ?? ""} disabled className="bg-card border-input text-muted-foreground" />
                            <p className="text-meta text-muted-foreground">授课教师不可更改</p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setShowEditModal(false)} disabled={submitting} className="text-muted-foreground hover:text-foreground hover:bg-muted">
                            取消
                        </Button>
                        <Button
                            data-testid="class-edit-submit"
                            onClick={handleEditClass}
                            disabled={submitting || !editForm.name.trim()}
                            className="bg-primary hover:bg-primary-hover text-primary-foreground"
                        >
                            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            保存
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {dialog}
        </div>
    );
}
