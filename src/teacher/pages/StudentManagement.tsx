import { useState, useEffect, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Search, Upload, UserPlus, RotateCcw, UserX, Trash2, Users, CheckCircle2, PauseCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchInput } from "@/components/ui/search-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StudentAddDialog } from "../components/StudentAddDialog";
import { StudentConfirmDialog } from "../components/StudentConfirmDialog";
import { StudentImportDialog } from "../components/StudentImportDialog";
import { teacherApi, type Student, type TeacherClass } from "../api-client";
import { toast } from "sonner";

export function StudentManagement() {
    const { classId } = useParams();
    const [classInfo, setClassInfo] = useState<TeacherClass | null>(null);
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState<{ successCount: number; failureCount: number; errors: Array<{ row: number; reason: string }> } | null>(null);

    // Add Form State
    const [newStudent, setNewStudent] = useState({ id: "", name: "", email: "" });
    const [submitting, setSubmitting] = useState(false);

    // Confirmation State
    const [confirmDialog, setConfirmDialog] = useState<{
        open: boolean;
        type: "delete" | "reset" | "toggle" | null;
        student: Student | null;
    }>({ open: false, type: null, student: null });

    useEffect(() => {
        if (!classId) return;
        loadData();
    }, [classId]);

    async function loadData() {
        setLoading(true);
        const id = Number(classId);

        const [resClasses, resStudents] = await Promise.all([
            teacherApi.getClasses(),
            teacherApi.getStudents(id)
        ]);

        if (resClasses.success && resClasses.data) {
            const cls = resClasses.data.find(c => c.id === id);
            if (cls) setClassInfo(cls);
        }

        if (resStudents.success && resStudents.data) {
            setStudents(resStudents.data);
        }
        setLoading(false);
    }

    async function handleAddStudent() {
        if (!classId || !newStudent.id || !newStudent.name) return;
        setSubmitting(true);
        const res = await teacherApi.addStudent(Number(classId), {
            studentId: newStudent.id,
            name: newStudent.name,
            email: newStudent.email
        });
        setSubmitting(false);

        if (res.success) {
            setShowAddModal(false);
            setNewStudent({ id: "", name: "", email: "" });
            loadData();
        } else {
            toast.error("添加失败: " + res.error?.message);
        }
    }

    const handleDownloadTemplate = () => {
        const headers = ["studentId", "name", "email"];
        const sample = ["20240001", "张三", "zhangsan@example.com"];
        const content = `\uFEFF${headers.join(",")}\n${sample.join(",")}\n`;
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

    const handleImport = async () => {
        if (!classId || !importFile) return;
        setImporting(true);
        setImportResult(null);
        const res = await teacherApi.importStudents(Number(classId), importFile);
        setImporting(false);

        if (res.success && res.data) {
            setImportResult(res.data);
            loadData();
        } else {
            toast.error("导入失败: " + res.error?.message);
        }
    };

    function handleToggleStatus(student: Student) {
        setConfirmDialog({ open: true, type: "toggle", student });
    }

    function handleResetPassword(student: Student) {
        setConfirmDialog({ open: true, type: "reset", student });
    }

    function handleDelete(student: Student) {
        setConfirmDialog({ open: true, type: "delete", student });
    }

    async function executeConfirmAction() {
        const { type, student } = confirmDialog;
        if (!student || !type) return;

        let res;
        switch (type) {
            case "toggle":
                res = await teacherApi.updateStudent(student.id, { action: "toggle_status" });
                break;
            case "reset":
                res = await teacherApi.updateStudent(student.id, { action: "reset_password" });
                break;
            case "delete":
                res = await teacherApi.deleteStudent(student.id);
                break;
        }

        if (res?.success) {
            if (type === "reset") toast.success("密码已重置为学号");
            loadData();
        } else {
            toast.error("操作失败: " + res?.error?.message);
        }
        setConfirmDialog({ open: false, type: null, student: null });
    }

    const filteredStudents = students.filter(s =>
        s.name.includes(searchQuery) || s.studentId.includes(searchQuery) || (s.email && s.email.includes(searchQuery))
    );

    const summary = useMemo(() => {
        const total = students.length;
        const active = students.filter((student) => student.status === 1).length;
        const disabled = total - active;
        return { total, active, disabled };
    }, [students]);

    if (loading) return <div className="p-12 text-center text-muted-foreground">加载中...</div>;
    if (!classInfo && !loading) return <div className="p-12 text-center text-muted-foreground">未找到班级</div>;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center gap-3">
                <Link to="/class">
                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground hover:bg-accent">
                        <ArrowLeft className="w-4 h-4 mr-1" />
                        返回
                    </Button>
                </Link>
                <span className="text-muted-foreground">/</span>
                <span className="text-sm text-muted-foreground">班级</span>
                <span className="text-sm font-medium text-foreground">{classInfo?.name}</span>
            </div>

            <div>
                <h2 className="text-lg font-semibold text-foreground">学生管理</h2>
                <p className="text-sm text-muted-foreground mt-1">维护班级学生名单与账号状态。</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="border-border bg-card hover:border-border transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">学生总数</p>
                            <p className="text-2xl font-bold text-foreground mt-1">{summary.total}</p>
                        </div>
                        <div className="w-10 h-10 bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
                            <Users className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-border bg-card hover:border-border transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">正常账号</p>
                            <p className="text-2xl font-bold text-foreground mt-1">{summary.active}</p>
                        </div>
                        <div className="w-10 h-10 bg-emerald-500/10 text-emerald-600 flex items-center justify-center border border-emerald-500/20">
                            <CheckCircle2 className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-border bg-card hover:border-border transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">已禁用</p>
                            <p className="text-2xl font-bold text-foreground mt-1">{summary.disabled}</p>
                        </div>
                        <div className="w-10 h-10 bg-amber-500/10 text-amber-600 flex items-center justify-center border border-amber-500/20">
                            <PauseCircle className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-border bg-card">
                <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-border pb-4">
                    <div>
                        <CardTitle className="text-base text-foreground">学生列表</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">共 {filteredStudents.length} 人</p>
                    </div>
                    <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
                        <SearchInput
                            className="sm:w-52"
                            data-testid="teacher-student-search"
                            placeholder="搜索学生"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        <Button data-testid="teacher-student-import-open" variant="outline" onClick={() => setShowImportModal(true)}>
                            <Upload className="w-4 h-4 mr-2" />
                            批量导入
                        </Button>
                        <Button data-testid="teacher-student-add-open" onClick={() => setShowAddModal(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                            <UserPlus className="w-4 h-4 mr-2" />
                            添加学生
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="pt-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-border hover:bg-muted/50">
                                <TableHead className="text-muted-foreground">学号</TableHead>
                                <TableHead className="text-muted-foreground">姓名</TableHead>
                                <TableHead className="text-muted-foreground">邮箱</TableHead>
                                <TableHead className="text-muted-foreground">账号状态</TableHead>
                                <TableHead className="text-muted-foreground">首次登录</TableHead>
                                <TableHead className="text-muted-foreground">最后登录</TableHead>
                                <TableHead className="text-muted-foreground text-right">操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredStudents.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                                        <div className="flex flex-col items-center gap-2">
                                            <div className="w-12 h-12 rounded-full bg-card border border-border flex items-center justify-center">
                                                <Search className="w-5 h-5 text-muted-foreground" />
                                            </div>
                                            <p>暂无符合条件的数据</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : filteredStudents.map((student) => (
                                <TableRow data-testid={`teacher-student-row-${student.id}`} key={student.id} className="border-border hover:bg-accent transition-colors">
                                    <TableCell className="font-mono text-primary">{student.studentId}</TableCell>
                                    <TableCell className="font-medium text-foreground">{student.name}</TableCell>
                                    <TableCell className="text-muted-foreground">{student.email || "-"}</TableCell>
                                    <TableCell>
                                        {student.status === 1 ? (
                                            <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20">正常</Badge>
                                        ) : (
                                            <Badge variant="destructive" className="bg-muted text-muted-foreground hover:bg-accent">已禁用</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {student.isFirstLogin === 1 ? (
                                            <Badge variant="outline" className="text-amber-600 border-amber-500/30 bg-amber-500/10">是</Badge>
                                        ) : (
                                            <span className="text-muted-foreground text-xs">否</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-xs">{student.lastLogin ? new Date(student.lastLogin).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : "-"}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Button data-testid={`teacher-student-reset-${student.id}`} variant="ghost" size="sm" title="重置密码" onClick={() => handleResetPassword(student)} className="h-8 w-8 p-0 text-muted-foreground hover:text-primary hover:bg-primary/10">
                                                <RotateCcw className="w-4 h-4" />
                                            </Button>
                                            <Button data-testid={`teacher-student-toggle-${student.id}`} variant="ghost" size="sm" title={student.status === 1 ? "禁用" : "启用"} onClick={() => handleToggleStatus(student)} className={`h-8 w-8 p-0 ${student.status === 1 ? "text-emerald-600 hover:text-emerald-500 hover:bg-emerald-500/10" : "text-muted-foreground hover:text-foreground"}`}>
                                                <UserX className={`w-4 h-4 ${student.status === 0 ? "text-muted-foreground" : ""}`} />
                                            </Button>
                                            <Button data-testid={`teacher-student-delete-${student.id}`} variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10" title="删除" onClick={() => handleDelete(student)}>
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
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
                onImportFileChange={setImportFile}
                importing={importing}
                importResult={importResult}
                onDownloadTemplate={handleDownloadTemplate}
                onImport={handleImport}
            />

            <StudentConfirmDialog
                state={confirmDialog}
                onOpenChange={(open) => !open && setConfirmDialog((prev) => ({ ...prev, open: false }))}
                onCancel={() => setConfirmDialog({ open: false, type: null, student: null })}
                onConfirm={executeConfirmAction}
            />
        </div>
    );
}
