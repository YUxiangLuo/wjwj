import { useState, useEffect, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Search, Upload, UserPlus, RotateCcw, UserX, Trash2, Users, CheckCircle2, LockKeyhole, PauseCircle } from "lucide-react";
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
import { StatusBadge } from "@/components/StatusBadge";
import { getAccountState } from "@/lib/account-state";
import { isValidOptionalEmail } from "@/lib/email";

function renderAccountStatus(student: Student) {
    const state = getAccountState(student.status, student.lockedUntil);
    return (
        <StatusBadge intent={state === "normal" ? "success" : state === "locked" ? "warning" : "neutral"}>
            {state === "normal" ? "正常" : state === "locked" ? "已锁定" : "已禁用"}
        </StatusBadge>
    );
}

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

    async function loadData(showLoading = true) {
        if (showLoading) setLoading(true);
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
        if (showLoading) setLoading(false);
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
            void loadData(false);
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
            void loadData(false);
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
            if (type === "reset") toast.success("密码已重置为学号，下次登录必须修改");
            void loadData(false);
        } else {
            toast.error("操作失败: " + res?.error?.message);
        }
        setConfirmDialog({ open: false, type: null, student: null });
    }

    const filteredStudents = students.filter(s =>
        s.name.includes(searchQuery) || s.studentId.includes(searchQuery) || (s.email && s.email.includes(searchQuery))
    );

    const summary = useMemo(() => {
        const states = students.map((student) => getAccountState(student.status, student.lockedUntil));
        return {
            total: states.length,
            active: states.filter((state) => state === "normal").length,
            locked: states.filter((state) => state === "locked").length,
            disabled: states.filter((state) => state === "disabled").length,
        };
    }, [students]);

    if (loading) return <div className="p-12 text-center text-muted-foreground">加载中...</div>;
    if (!classInfo && !loading) return <div className="p-12 text-center text-muted-foreground">未找到班级</div>;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center gap-3">
                <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground hover:bg-muted">
                    <Link to="/class">
                        <ArrowLeft className="w-4 h-4 mr-1" />
                        返回
                    </Link>
                </Button>
                <span className="text-muted-foreground">/</span>
                <span className="text-sm text-muted-foreground">班级</span>
                <span className="text-sm font-medium text-foreground">{classInfo?.name}</span>
            </div>

            <div>
                <h2 className="text-lg font-semibold text-foreground">学生管理</h2>
                <p className="text-sm text-muted-foreground mt-1">维护班级学生名单与账号状态。</p>
            </div>

            <div className="grid grid-cols-4 gap-4">
                <Card className="transition-colors hover:border-input">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">学生总数</p>
                            <p className="text-2xl font-bold text-foreground mt-1">{summary.total}</p>
                        </div>
                        <IconTile intent="info">
                            <Users className="w-5 h-5" />
                        </IconTile>
                    </CardContent>
                </Card>
                <Card className="transition-colors hover:border-input">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">正常账号</p>
                            <p className="text-2xl font-bold text-foreground mt-1">{summary.active}</p>
                        </div>
                        <IconTile intent="success">
                            <CheckCircle2 className="w-5 h-5" />
                        </IconTile>
                    </CardContent>
                </Card>
                <Card className="transition-colors hover:border-input">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">已锁定</p>
                            <p className="text-2xl font-bold text-foreground mt-1">{summary.locked}</p>
                        </div>
                        <IconTile intent="warning">
                            <LockKeyhole className="w-5 h-5" />
                        </IconTile>
                    </CardContent>
                </Card>
                <Card className="transition-colors hover:border-input">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">已禁用</p>
                            <p className="text-2xl font-bold text-foreground mt-1">{summary.disabled}</p>
                        </div>
                        <IconTile intent="neutral">
                            <PauseCircle className="w-5 h-5" />
                        </IconTile>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <PageHeader as={CardHeader}>
                    <div>
                        <CardTitle className="text-base text-foreground">学生列表</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">共 {filteredStudents.length} 人</p>
                    </div>
                    <div className="flex gap-3 flex-row w-auto">
                        <div className="relative w-52">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                data-testid="teacher-student-search"
                                placeholder="搜索学生"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-ring"
                            />
                        </div>
                        <Button data-testid="teacher-student-import-open" variant="outline" onClick={() => setShowImportModal(true)} className="border-input bg-muted/30 text-foreground/90 hover:bg-muted hover:text-foreground">
                            <Upload className="w-4 h-4 mr-2" />
                            批量导入
                        </Button>
                        <Button data-testid="teacher-student-add-open" onClick={() => setShowAddModal(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                            <UserPlus className="w-4 h-4 mr-2" />
                            添加学生
                        </Button>
                    </div>
                </PageHeader>
                <CardContent className="pt-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-border hover:bg-card/50">
                                <TableHead className="text-muted-foreground">学号</TableHead>
                                <TableHead className="text-muted-foreground">姓名</TableHead>
                                <TableHead className="text-muted-foreground">邮箱</TableHead>
                                <TableHead className="text-muted-foreground">账号状态</TableHead>
                                <TableHead className="text-muted-foreground text-right">操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredStudents.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                                        <div className="flex flex-col items-center gap-2">
                                            <div className="w-12 h-12 rounded-full bg-card border border-border flex items-center justify-center">
                                                <Search className="w-5 h-5 text-muted-foreground" />
                                            </div>
                                            <p>暂无符合条件的数据</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : filteredStudents.map((student) => (
                                <TableRow data-testid={`teacher-student-row-${student.id}`} key={student.id} className="border-border hover:bg-muted/50 transition-colors">
                                    <TableCell className="font-mono text-primary">{student.studentId}</TableCell>
                                    <TableCell className="font-medium text-foreground">{student.name}</TableCell>
                                    <TableCell className="text-muted-foreground">{student.email || "-"}</TableCell>
                                    <TableCell>{renderAccountStatus(student)}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Button data-testid={`teacher-student-reset-${student.id}`} variant="ghost" size="sm" aria-label={`重置${student.name}的密码`} title="重置密码" onClick={() => handleResetPassword(student)} className="h-8 w-8 p-0 text-muted-foreground hover:text-primary hover:bg-primary/10">
                                                <RotateCcw className="w-4 h-4" />
                                            </Button>
                                            <Button data-testid={`teacher-student-toggle-${student.id}`} variant="ghost" size="sm" aria-label={`${student.status === 1 ? "禁用" : "启用"}学生${student.name}`} title={student.status === 1 ? "禁用" : "启用"} onClick={() => handleToggleStatus(student)} className={`h-8 w-8 p-0 ${student.status === 1 ? "text-success hover:text-success hover:bg-success/10" : "text-muted-foreground hover:text-foreground"}`}>
                                                <UserX className={`w-4 h-4 ${student.status === 0 ? "text-muted-foreground" : ""}`} />
                                            </Button>
                                            <Button data-testid={`teacher-student-delete-${student.id}`} variant="ghost" size="sm" aria-label={`删除学生${student.name}`} className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10" title="删除" onClick={() => handleDelete(student)}>
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
