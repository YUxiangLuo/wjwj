import { useState, useEffect, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Search, Upload, UserPlus, RotateCcw, UserX, Trash2, Download, Users, CheckCircle2, PauseCircle, Loader2 } from "lucide-react";
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
            if (type === "reset") toast.success("密码已重置为 123456");
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

    if (loading) return <div className="p-12 text-center text-slate-500">加载中...</div>;
    if (!classInfo && !loading) return <div className="p-12 text-center text-slate-500">未找到班级</div>;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center gap-3">
                <Link to="/class">
                    <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white hover:bg-slate-800">
                        <ArrowLeft className="w-4 h-4 mr-1" />
                        返回
                    </Button>
                </Link>
                <span className="text-slate-600">/</span>
                <span className="text-sm text-slate-500">班级</span>
                <span className="text-sm font-medium text-slate-200">{classInfo?.name}</span>
            </div>

            <div>
                <h2 className="text-lg font-semibold text-slate-100">学生管理</h2>
                <p className="text-sm text-slate-400 mt-1">维护班级学生名单与账号状态。</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="border-slate-800 bg-slate-900 shadow-sm hover:border-slate-700 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">学生总数</p>
                            <p className="text-2xl font-bold text-slate-100 mt-1">{summary.total}</p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20">
                            <Users className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-800 bg-slate-900 shadow-sm hover:border-slate-700 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">正常账号</p>
                            <p className="text-2xl font-bold text-slate-100 mt-1">{summary.active}</p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
                            <CheckCircle2 className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-800 bg-slate-900 shadow-sm hover:border-slate-700 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">已禁用</p>
                            <p className="text-2xl font-bold text-slate-100 mt-1">{summary.disabled}</p>
                        </div>
                        <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
                            <PauseCircle className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-slate-800 bg-slate-900 shadow-sm">
                <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-slate-800 pb-4">
                    <div>
                        <CardTitle className="text-base text-slate-100">学生列表</CardTitle>
                        <p className="text-xs text-slate-500 mt-1">共 {filteredStudents.length} 人</p>
                    </div>
                    <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
                        <div className="relative sm:w-52">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            <Input
                                placeholder="搜索学生"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600 focus:border-indigo-500/50"
                            />
                        </div>
                        <Button variant="outline" onClick={() => setShowImportModal(true)} className="border-slate-700 bg-slate-800/30 text-slate-300 hover:bg-slate-800 hover:text-white">
                            <Upload className="w-4 h-4 mr-2" />
                            批量导入
                        </Button>
                        <Button onClick={() => setShowAddModal(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                            <UserPlus className="w-4 h-4 mr-2" />
                            添加学生
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="pt-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-slate-800 hover:bg-slate-900/50">
                                <TableHead className="text-slate-400">学号</TableHead>
                                <TableHead className="text-slate-400">姓名</TableHead>
                                <TableHead className="text-slate-400">邮箱</TableHead>
                                <TableHead className="text-slate-400">状态</TableHead>
                                <TableHead className="text-slate-400">最后登录</TableHead>
                                <TableHead className="text-slate-400 text-right">操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredStudents.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-12 text-slate-500">
                                        <div className="flex flex-col items-center gap-2">
                                            <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center">
                                                <Search className="w-5 h-5 text-slate-600" />
                                            </div>
                                            <p>暂无符合条件的数据</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : filteredStudents.map((student) => (
                                <TableRow key={student.id} className="border-slate-800 hover:bg-slate-800/50 transition-colors">
                                    <TableCell className="font-mono text-indigo-300">{student.studentId}</TableCell>
                                    <TableCell className="font-medium text-slate-200">{student.name}</TableCell>
                                    <TableCell className="text-slate-400">{student.email || "-"}</TableCell>
                                    <TableCell>
                                        {student.status === 1 ? (
                                            <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20">正常</Badge>
                                        ) : (
                                            <Badge variant="destructive" className="bg-slate-700 text-slate-300 hover:bg-slate-600">已禁用</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-slate-500 text-xs">{student.lastLogin ? new Date(student.lastLogin).toLocaleString() : "-"}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <Button variant="ghost" size="sm" title="重置密码" onClick={() => handleResetPassword(student)} className="h-8 w-8 p-0 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10">
                                                <RotateCcw className="w-4 h-4" />
                                            </Button>
                                            <Button variant="ghost" size="sm" title={student.status === 1 ? "禁用" : "启用"} onClick={() => handleToggleStatus(student)} className={`h-8 w-8 p-0 ${student.status === 1 ? "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10" : "text-slate-400 hover:text-white"}`}>
                                                <UserX className={`w-4 h-4 ${student.status === 0 ? "text-slate-500" : ""}`} />
                                            </Button>
                                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10" title="删除" onClick={() => handleDelete(student)}>
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
                <DialogContent className="bg-slate-900 border-slate-800 text-slate-200 sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="text-slate-100">添加学生</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="studentId" className="text-slate-300">学号</Label>
                            <Input
                                id="studentId"
                                placeholder="请输入学号"
                                value={newStudent.id}
                                onChange={(e) => setNewStudent({ ...newStudent, id: e.target.value })}
                                className="bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600 focus:border-indigo-500/50"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="studentName" className="text-slate-300">姓名</Label>
                            <Input
                                id="studentName"
                                placeholder="请输入姓名"
                                value={newStudent.name}
                                onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })}
                                className="bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600 focus:border-indigo-500/50"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="studentEmail" className="text-slate-300">邮箱（可选）</Label>
                            <Input
                                id="studentEmail"
                                type="email"
                                placeholder="请输入邮箱"
                                value={newStudent.email}
                                onChange={(e) => setNewStudent({ ...newStudent, email: e.target.value })}
                                className="bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600 focus:border-indigo-500/50"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-200 hover:bg-slate-800">取消</Button>
                        <Button onClick={handleAddStudent} disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "确认添加"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showImportModal} onOpenChange={setShowImportModal}>
                <DialogContent className="bg-slate-900 border-slate-800 text-slate-200 sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle className="text-slate-100">批量导入学生</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="border-2 border-dashed border-slate-700 bg-slate-950/50 rounded-lg p-8 text-center hover:border-indigo-500/50 transition-colors">
                            <Upload className="w-12 h-12 mx-auto text-slate-600 mb-4" />
                            <p className="text-sm text-slate-400 mb-2">选择文件上传</p>
                            <p className="text-xs text-slate-600">支持 .xlsx, .xls, .csv 格式</p>
                            <Input
                                type="file"
                                accept=".xlsx,.xls,.csv"
                                className="mt-6 bg-slate-900/50 border-slate-700 text-slate-300 text-sm file:bg-slate-800 file:text-slate-300 file:border-0 file:rounded-md file:mr-4 file:px-3 file:py-1 cursor-pointer"
                                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                            />
                            {importFile && (
                                <div className="text-xs text-emerald-400 mt-3 font-mono">已选择：{importFile.name}</div>
                            )}
                        </div>
                        <Button variant="link" className="text-indigo-400 hover:text-indigo-300 p-0 h-auto" onClick={handleDownloadTemplate}>
                            <Download className="w-4 h-4 mr-1" />
                            下载导入模板
                        </Button>
                        {importResult && (
                            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-400 space-y-2">
                                <div className="flex gap-4">
                                    <span className="text-emerald-400">成功：{importResult.successCount} 条</span>
                                    <span className={importResult.failureCount > 0 ? "text-rose-400" : ""}>失败：{importResult.failureCount} 条</span>
                                </div>
                                {importResult.errors.length > 0 && (
                                    <div className="max-h-32 overflow-y-auto text-xs space-y-1 bg-slate-900 p-2 rounded border border-slate-800">
                                        {importResult.errors.map((err, idx) => (
                                            <div key={idx} className="text-rose-400">行 {err.row === -1 ? "-" : err.row}：{err.reason}</div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-slate-200 hover:bg-slate-800">取消</Button>
                        <Button onClick={handleImport} disabled={importing || !importFile} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : "开始导入"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog
                open={confirmDialog.open}
                onOpenChange={(open) => !open && setConfirmDialog(markdown => ({ ...markdown, open: false }))}
            >
                <AlertDialogContent className="bg-slate-900 border-slate-800 text-slate-200">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-100">确认操作</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-400">
                            {confirmDialog.type === "delete" && "确认删除该学生吗？此操作不可恢复。"}
                            {confirmDialog.type === "reset" && "确认重置该学生的密码为 123456 吗？"}
                            {confirmDialog.type === "toggle" && `确认${confirmDialog.student?.status === 1 ? "禁用" : "启用"}该学生账号吗？`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setConfirmDialog({ open: false, type: null, student: null })} className="bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white">
                            取消
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={executeConfirmAction} className={confirmDialog.type === "delete" ? "bg-rose-600 hover:bg-rose-700 text-white" : "bg-indigo-600 hover:bg-indigo-700 text-white"}>
                            确认
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
