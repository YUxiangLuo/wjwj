import { RequestError } from "@/components/RequestError";
import { requireApiData, useAsyncLoad } from "@/hooks/useAsyncLoad";
import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Search, Upload, UserPlus, RotateCcw, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StudentAddDialog } from "../components/StudentAddDialog";
import { StudentConfirmDialog } from "../components/StudentConfirmDialog";
import { StudentImportDialog } from "../components/StudentImportDialog";
import { teacherApi, type Student, type TeacherClass } from "../api-client";
import { toast } from "sonner";
import { IconTile } from "@/components/IconTile";
import { PageHeader } from "@/components/PageHeader";
import { isValidOptionalEmail } from "@/lib/email";
import { rowsToCsv } from "@/lib/csv";
import { describeCascadeImpact } from "@/lib/deletion-impact-copy";

const PAGE_SIZE = 20;

export function StudentManagement() {
    const { classId } = useParams();
    const [classInfo, setClassInfo] = useState<TeacherClass | null>(null);
    const [students, setStudents] = useState<Student[]>([]);
    const { loading, error: loadError, run, cancel } = useAsyncLoad("班级学生加载失败");
    const [showAddModal, setShowAddModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [appliedSearch, setAppliedSearch] = useState("");
    const [page, setPage] = useState(1);
    const [totalStudents, setTotalStudents] = useState(0);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<{ successCount: number; skippedCount?: number; failureCount: number; errors: Array<{ row: number; reason: string }>; skipped?: Array<{ row: number; reason: string }> } | null>(null);

    // Add Form State
    const [newStudent, setNewStudent] = useState({ id: "", name: "", email: "" });
    const [submitting, setSubmitting] = useState(false);
    const [deleteImpact, setDeleteImpact] = useState<{
        loading: boolean;
        requiresConfirmation: boolean;
        summary: string | null;
    } | null>(null);

    // Confirmation State
    const [confirmDialog, setConfirmDialog] = useState<{
        open: boolean;
        type: "delete" | "reset" | null;
        student: Student | null;
    }>({ open: false, type: null, student: null });

    useEffect(() => {
        setClassInfo(null);
        if (Number.isInteger(Number(classId)) && Number(classId) > 0) void loadData();
        return cancel;
    }, [classId]);

    async function loadData(_showLoading = true, overrides?: { search?: string; page?: number }) {
        return run(async () => {
            const nextSearch = overrides?.search ?? appliedSearch;
            const nextPage = overrides?.page ?? page;
            const [resClasses, resStudents] = await Promise.all([
                teacherApi.getClasses(),
                teacherApi.getStudents(Number(classId), { search: nextSearch || undefined, page: nextPage, pageSize: PAGE_SIZE }),
            ]);
            return {
                classes: requireApiData(resClasses, "班级加载失败"),
                students: requireApiData(resStudents, "学生列表加载失败"),
            };
        }, (data) => {
            setClassInfo(data.classes.find(cls => cls.id === Number(classId)) ?? null);
            const payload = data.students;
            if (Array.isArray(payload)) {
                setStudents(payload);
                setTotalStudents(payload.length);
            } else {
                setStudents(payload.items);
                setTotalStudents(payload.total);
            }
        });
    }

    async function handleAddStudent() {
        const studentId = newStudent.id.trim();
        const name = newStudent.name.trim();
        if (!classId) {
            toast.error("班级不存在，请返回班级列表后重试");
            return;
        }
        if (!studentId || !name) {
            toast.error("请填写学号和姓名");
            return;
        }
        if (!isValidOptionalEmail(newStudent.email)) {
            toast.error("请输入有效的邮箱地址");
            return;
        }
        setSubmitting(true);
        const res = await teacherApi.addStudent(Number(classId), {
            studentId,
            name,
            email: newStudent.email.trim()
        });
        setSubmitting(false);

        if (res.success) {
            setShowAddModal(false);
            setNewStudent({ id: "", name: "", email: "" });
            toast.success("学生已创建，登录密码与学号相同");
            void loadData(false);
        } else {
            toast.error("添加失败: " + res.error?.message);
        }
    }

    const handleDownloadTemplate = () => {
        const content = `\uFEFF${rowsToCsv([["studentId", "name", "email"], ["20240001", "张三", "zhangsan@example.com"]])}\n`;
        const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "students-template.csv";
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    };

    function handleDownloadImportErrors() {
        if (!importResult?.errors.length) return;
        const csv = rowsToCsv([["行号", "原因"], ...importResult.errors.map((item) => [item.row, item.reason])]);
        const blob = new Blob([`\uFEFF${csv}\n`], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `import-errors-${Date.now()}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    const handleImport = async () => {
        if (!classId || !importFile) return;
        setImporting(true);
        setImportResult(null);
        const res = await teacherApi.importStudents(Number(classId), importFile);
        setImporting(false);

        if (res.success && res.data) {
            setImportResult(res.data);
            const parts = [`新建 ${res.data.successCount} 条`];
            if (res.data.skippedCount) parts.push(`已存在跳过 ${res.data.skippedCount} 条`);
            if (res.data.failureCount) parts.push(`失败 ${res.data.failureCount} 条`);
            toast.success(`导入完成：${parts.join("，")}`);
            void loadData(false);
        } else {
            toast.error("导入失败: " + res.error?.message);
        }
    };

    function handleResetPassword(student: Student) {
        setConfirmDialog({ open: true, type: "reset", student });
    }

    async function handleDelete(student: Student) {
        setConfirmDialog({ open: true, type: "delete", student });
        setDeleteImpact({ loading: true, requiresConfirmation: false, summary: null });
        const res = await teacherApi.getStudentDeletionImpact(student.id);
        if (res.success && res.data) {
            setDeleteImpact({
                loading: false,
                requiresConfirmation: res.data.requiresConfirmation,
                summary: describeCascadeImpact(res.data.impact, "student"),
            });
        } else {
            // Unknown impact: let the server decide and report on confirm.
            setDeleteImpact({ loading: false, requiresConfirmation: false, summary: null });
        }
    }

    async function executeConfirmAction() {
        const { type, student } = confirmDialog;
        if (!student || !type) return;

        let res;
        switch (type) {
            case "reset":
                res = await teacherApi.updateStudent(student.id, { action: "reset_password" });
                break;
            case "delete":
                res = await teacherApi.deleteStudent(student.id, {
                    confirm: deleteImpact?.requiresConfirmation === true,
                });
                break;
        }

        if (res?.success) {
            if (type === "reset") toast.success("密码已重置为学号");
            setConfirmDialog({ open: false, type: null, student: null });
            setDeleteImpact(null);
            void loadData(false);
            return;
        }
        if (type === "delete" && res?.error?.code === "SUBMISSIONS_EXIST") {
            // Keep the dialog open so the next click is an explicit confirmation.
            setDeleteImpact({
                loading: false,
                requiresConfirmation: true,
                summary: res.error.message,
            });
            return;
        }
        toast.error("操作失败: " + res?.error?.message);
        setConfirmDialog({ open: false, type: null, student: null });
        setDeleteImpact(null);
    }

    // Search and paging run on the server so a 500-row roster stays responsive.
    const filteredStudents = students;
    const totalPages = Math.max(1, Math.ceil(totalStudents / PAGE_SIZE));

    if (!Number.isInteger(Number(classId)) || Number(classId) <= 0) return <p>无效的班级编号</p>;
    if (!classInfo && loadError) return <RequestError message={loadError} onRetry={() => void loadData()} backTo="/class" backLabel="返回班级列表" />;
    if (loading && !classInfo) return <div role="status" aria-live="polite" className="p-12 text-center text-muted-foreground">加载中...</div>;
    if (!classInfo && !loading) return <div className="p-12 text-center text-muted-foreground">未找到班级</div>;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {loadError && <RequestError message={loadError} onRetry={() => void loadData()} retrying={loading} backTo="/class" backLabel="返回班级列表" />}
            <div className="flex items-center gap-3">
                <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground hover:bg-muted">
                    <Link to="/class">
                        <ArrowLeft className="w-4 h-4 mr-1" />
                        返回
                    </Link>
                </Button>
                <span className="text-muted-foreground">/</span>
                <span className="text-label text-muted-foreground">班级</span>
                <span className="text-label font-medium text-foreground">{classInfo?.name}</span>
            </div>

            <div>
                <h2 className="text-subheading font-semibold text-foreground">学生管理</h2>
                <p className="text-label text-muted-foreground mt-1">维护班级学生名单。</p>
            </div>

            <div className="grid grid-cols-3 gap-4">
                <Card>
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-meta text-muted-foreground font-medium uppercase tracking-wider">学生总数</p>
                            <p className="text-page-title font-bold text-foreground mt-1">{totalStudents}</p>
                        </div>
                        <IconTile intent="info">
                            <Users className="w-5 h-5" />
                        </IconTile>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <PageHeader as={CardHeader}>
                    <div>
                        <CardTitle className="text-body text-foreground">学生列表</CardTitle>
                        <p className="text-meta text-muted-foreground mt-1">
                            {loading || loadError ? "共 - 人" : `共 ${totalStudents} 人${appliedSearch ? `（筛选：${appliedSearch}）` : ""}`}
                        </p>
                    </div>
                    <div className="flex gap-3 flex-row w-auto">
                        <div className="relative w-52">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                data-testid="teacher-student-search"
                                aria-label="搜索学生"
                                placeholder="搜索学号、姓名或邮箱"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key !== "Enter") return;
                                    const next = searchQuery.trim();
                                    setAppliedSearch(next);
                                    setPage(1);
                                    void loadData(true, { search: next, page: 1 });
                                }}
                                className="pl-9 bg-card border-input text-foreground placeholder:text-muted-foreground focus:border-ring"
                            />
                        </div>
                        <Button data-testid="teacher-student-import-open" variant="outline" onClick={() => setShowImportModal(true)} className="border-input bg-muted text-foreground hover:bg-muted hover:text-foreground">
                            <Upload className="w-4 h-4 mr-2" />
                            批量导入
                        </Button>
                        <Button data-testid="teacher-student-add-open" onClick={() => setShowAddModal(true)} className="bg-primary hover:bg-primary-hover text-primary-foreground">
                            <UserPlus className="w-4 h-4 mr-2" />
                            添加学生
                        </Button>
                    </div>
                </PageHeader>
                <CardContent className="pt-0">
                    <Table aria-label="学生列表">
                        <TableHeader>
                            <TableRow className="border-border">
                                <TableHead className="text-muted-foreground">学号</TableHead>
                                <TableHead className="text-muted-foreground">姓名</TableHead>
                                <TableHead className="text-muted-foreground">邮箱</TableHead>
                                <TableHead className="text-muted-foreground text-right">操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredStudents.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                                        <div className="flex flex-col items-center gap-2">
                                            <div className="w-12 h-12 rounded-control bg-card border border-border flex items-center justify-center">
                                                <Search className="w-5 h-5 text-muted-foreground" />
                                            </div>
                                            <p>暂无符合条件的数据</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : filteredStudents.map((student) => (
                                <TableRow data-testid={`teacher-student-row-${student.id}`} key={student.id} className="border-border hover:bg-muted transition-none">
                                    <TableCell className="font-mono text-primary">{student.studentId}</TableCell>
                                    <TableCell className="font-medium text-foreground">{student.name}</TableCell>
                                    <TableCell className="text-muted-foreground">{student.email || "-"}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Button data-testid={`teacher-student-reset-${student.id}`} variant="ghost" size="sm" aria-label={`重置${student.name}的密码`} title="重置密码" onClick={() => handleResetPassword(student)} className="h-8 w-8 p-0 text-muted-foreground hover:text-primary hover:bg-primary-muted">
                                                <RotateCcw className="w-4 h-4" />
                                            </Button>
                                            <Button data-testid={`teacher-student-delete-${student.id}`} variant="ghost" size="sm" aria-label={`删除学生${student.name}`} className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive-muted" title="删除" onClick={() => handleDelete(student)}>
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    {!loading && !loadError && totalStudents > 0 && (
                        <div className="flex items-center justify-between pt-4" data-testid="teacher-student-pagination">
                            <p className="text-label text-muted-foreground">
                                共 {totalStudents} 人，第 {page} / {totalPages} 页
                            </p>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={page <= 1}
                                    aria-label="上一页"
                                    data-testid="teacher-student-prev-page"
                                    onClick={() => { const next = page - 1; setPage(next); void loadData(false, { page: next }); }}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={page >= totalPages}
                                    aria-label="下一页"
                                    data-testid="teacher-student-next-page"
                                    onClick={() => { const next = page + 1; setPage(next); void loadData(false, { page: next }); }}
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <StudentAddDialog
                open={showAddModal}
                onOpenChange={setShowAddModal}
                form={newStudent}
                onFormChange={setNewStudent}
                submitting={submitting}
                onSubmit={handleAddStudent}
            />

            <StudentImportDialog
                open={showImportModal}
                onOpenChange={setShowImportModal}
                importFile={importFile}
                onImportFileChange={(file) => {
                    setImportFile(file);
                    // A new file makes the previous run's report meaningless.
                    setImportResult(null);
                }}
                importing={importing}
                importResult={importResult}
                onDownloadTemplate={handleDownloadTemplate}
                onDownloadErrors={handleDownloadImportErrors}
                onImport={handleImport}
            />

            <StudentConfirmDialog
                state={confirmDialog}
                onOpenChange={(open) => {
                    if (open) return;
                    setConfirmDialog((prev) => ({ ...prev, open: false }));
                    setDeleteImpact(null);
                }}
                onCancel={() => {
                    setConfirmDialog({ open: false, type: null, student: null });
                    setDeleteImpact(null);
                }}
                onConfirm={executeConfirmAction}
                impactSummary={deleteImpact?.summary ?? null}
                impactPending={deleteImpact?.loading ?? false}
            />
        </div>
    );
}
