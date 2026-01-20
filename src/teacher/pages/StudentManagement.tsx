import { useState, useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Search, Upload, UserPlus, RotateCcw, UserX, Trash2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Badge } from "@/components/ui/badge";
import { teacherApi, type Student, type TeacherClass } from "../api-client";

export function StudentManagement() {
    const { classId } = useParams();
    const navigate = useNavigate();
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

        // Parallel fetch: class info (from list) and students
        // Note: Ideally we have getClassDetail, but getting all classes is fine for now
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
            loadData(); // refresh
        } else {
            alert("添加失败: " + res.error?.message);
        }
    }

    const handleDownloadTemplate = () => {
        const headers = ["studentId", "name", "email"];
        const sample = ["20240001", "张三", "zhangsan@example.com"];
        const content = `${headers.join(",")}\n${sample.join(",")}\n`;
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
            alert("导入失败: " + res.error?.message);
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
            if (type === "reset") alert("密码已重置为 123456"); // Keep alert for info? Or better, toast. For now alert is fine for success info.
            loadData();
        } else {
            alert("操作失败: " + res?.error?.message);
        }
        setConfirmDialog({ open: false, type: null, student: null });
    }

    const filteredStudents = students.filter(s =>
        s.name.includes(searchQuery) || s.studentId.includes(searchQuery) || (s.email && s.email.includes(searchQuery))
    );

    if (loading) return <div className="p-8 text-center">加载中...</div>;
    if (!classInfo && !loading) return <div className="p-8 text-center">未找到班级</div>;

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <Link to="/class">
                    <Button variant="ghost" size="sm">
                        <ArrowLeft className="w-4 h-4 mr-1" />
                        返回
                    </Button>
                </Link>
                <span className="text-muted-foreground">/</span>
                <span className="font-medium">{classInfo?.name}</span>
            </div>

            <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-base">学生列表（{filteredStudents.length}人）</CardTitle>
                    <div className="flex gap-3">
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="搜索学生..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 w-48"
                            />
                        </div>
                        <Button variant="outline" onClick={() => setShowImportModal(true)}>
                            <Upload className="w-4 h-4" />
                            批量导入
                        </Button>
                        <Button onClick={() => setShowAddModal(true)}>
                            <UserPlus className="w-4 h-4" />
                            添加学生
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>学号</TableHead>
                                <TableHead>姓名</TableHead>
                                <TableHead>邮箱</TableHead>
                                <TableHead>状态</TableHead>
                                <TableHead>最后登录</TableHead>
                                <TableHead>操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredStudents.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                                        暂无学生
                                    </TableCell>
                                </TableRow>
                            ) : filteredStudents.map((student) => (
                                <TableRow key={student.id}>
                                    <TableCell className="font-mono">{student.studentId}</TableCell>
                                    <TableCell className="font-medium">{student.name}</TableCell>
                                    <TableCell className="text-muted-foreground">{student.email || "-"}</TableCell>
                                    <TableCell>
                                        {student.status === 1 ? (
                                            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">正常</Badge>
                                        ) : (
                                            <Badge variant="secondary">已禁用</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">{student.lastLogin ? new Date(student.lastLogin).toLocaleString() : "-"}</TableCell>
                                    <TableCell>
                                        <div className="flex gap-1">
                                            <Button variant="ghost" size="sm" title="重置密码" onClick={() => handleResetPassword(student)}>
                                                <RotateCcw className="w-4 h-4" />
                                            </Button>
                                            <Button variant="ghost" size="sm" title={student.status === 1 ? "禁用" : "启用"} onClick={() => handleToggleStatus(student)}>
                                                <UserX className={`w-4 h-4 ${student.status === 0 ? "text-muted-foreground" : ""}`} />
                                            </Button>
                                            <Button variant="ghost" size="sm" className="text-destructive" title="删除" onClick={() => handleDelete(student)}>
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

            <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>添加学生</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="studentId">学号</Label>
                            <Input
                                id="studentId"
                                placeholder="请输入学号"
                                value={newStudent.id}
                                onChange={(e) => setNewStudent({ ...newStudent, id: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="studentName">姓名</Label>
                            <Input
                                id="studentName"
                                placeholder="请输入姓名"
                                value={newStudent.name}
                                onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="studentEmail">邮箱（可选）</Label>
                            <Input
                                id="studentEmail"
                                type="email"
                                placeholder="请输入邮箱"
                                value={newStudent.email}
                                onChange={(e) => setNewStudent({ ...newStudent, email: e.target.value })}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAddModal(false)}>取消</Button>
                        <Button onClick={handleAddStudent} disabled={submitting}>
                            {submitting ? "添加中..." : "确认添加"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showImportModal} onOpenChange={setShowImportModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>批量导入学生</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="border-2 border-dashed rounded-lg p-6 text-center">
                            <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                            <p className="text-sm text-muted-foreground mb-2">选择文件上传</p>
                            <p className="text-xs text-muted-foreground">支持 .xlsx, .xls, .csv 格式</p>
                            <Input
                                type="file"
                                accept=".xlsx,.xls,.csv"
                                className="mt-4"
                                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                            />
                            {importFile && (
                                <div className="text-xs text-muted-foreground mt-2">已选择：{importFile.name}</div>
                            )}
                        </div>
                        <Button variant="link" className="text-primary p-0 h-auto" onClick={handleDownloadTemplate}>
                            <Download className="w-4 h-4 mr-1" />
                            下载导入模板
                        </Button>
                        {importResult && (
                            <div className="text-sm text-muted-foreground space-y-2">
                                <div>成功导入：{importResult.successCount} 条</div>
                                <div>失败：{importResult.failureCount} 条</div>
                                {importResult.errors.length > 0 && (
                                    <div className="max-h-32 overflow-y-auto text-xs">
                                        {importResult.errors.map((err, idx) => (
                                            <div key={idx}>行 {err.row === -1 ? "-" : err.row}：{err.reason}</div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowImportModal(false)}>取消</Button>
                        <Button onClick={handleImport} disabled={importing || !importFile}>
                            {importing ? "导入中..." : "开始导入"}
                        </Button>
                    </DialogFooter>
                </DialogContent>

            </Dialog>

            <AlertDialog
                open={confirmDialog.open}
                onOpenChange={(open) => !open && setConfirmDialog(markdown => ({ ...markdown, open: false }))}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>确认操作</AlertDialogTitle>
                        <AlertDialogDescription>
                            {confirmDialog.type === "delete" && "确认删除该学生吗？此操作不可恢复。"}
                            {confirmDialog.type === "reset" && "确认重置该学生的密码为 123456 吗？"}
                            {confirmDialog.type === "toggle" && `确认${confirmDialog.student?.status === 1 ? "禁用" : "启用"}该学生账号吗？`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setConfirmDialog({ open: false, type: null, student: null })}>
                            取消
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={executeConfirmAction} className={confirmDialog.type === "delete" ? "bg-destructive hover:bg-destructive/90" : ""}>
                            确认
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div >
    );
}
