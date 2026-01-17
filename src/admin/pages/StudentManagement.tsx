import { useState, useEffect } from "react";
import { Search, RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { studentApi, classApi, type Student, type Class } from "../api-client";

export function StudentManagement() {
    const [students, setStudents] = useState<Student[]>([]);
    const [classes, setClasses] = useState<Class[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterClass, setFilterClass] = useState("all");
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        loadInitialData();
    }, []);

    useEffect(() => {
        loadStudents();
    }, [filterClass]);

    async function loadInitialData() {
        try {
            const classesRes = await classApi.list({});
            if (classesRes.success && classesRes.data) {
                setClasses(classesRes.data);
            }
        } catch (error) {
            console.error("Failed to load classes:", error);
        }

        loadStudents();
    }

    async function loadStudents() {
        setLoading(true);
        try {
            const res = await studentApi.list({
                classId: filterClass !== "all" ? filterClass : undefined,
                search: searchTerm || undefined,
            });
            if (res.success && res.data) {
                setStudents(res.data);
            }
        } catch (error) {
            console.error("Failed to load students:", error);
        } finally {
            setLoading(false);
        }
    }

    function handleSearch() {
        loadStudents();
    }

    async function handleResetPassword(student: Student) {
        if (!confirm(`确定重置学生「${student.name}」的密码吗？\n\n密码将重置为学号。`)) {
            return;
        }

        try {
            const res = await studentApi.resetPassword(student.id);
            if (res.success) {
                alert(`密码已重置为：${student.studentId}`);
            } else {
                alert(res.error?.message ?? "重置失败");
            }
        } catch (error) {
            console.error("Failed to reset password:", error);
            alert("重置失败");
        }
    }

    async function handleToggleStatus(student: Student) {
        const newStatus = student.status === 1 ? 0 : 1;
        const action = newStatus === 0 ? "停用" : "启用";

        if (!confirm(`确定${action}学生「${student.name}」吗？`)) {
            return;
        }

        try {
            const res = await studentApi.updateStatus(student.id, newStatus);
            if (res.success) {
                loadStudents();
            } else {
                alert(res.error?.message ?? `${action}失败`);
            }
        } catch (error) {
            console.error(`Failed to ${action} student:`, error);
            alert(`${action}失败`);
        }
    }

    const getProgressColor = (progress: number) => {
        if (progress >= 80) return "[&>div]:bg-emerald-500";
        if (progress >= 50) return "[&>div]:bg-amber-500";
        return "[&>div]:bg-destructive";
    };

    const formatDateTime = (dateStr: string | null) => {
        if (!dateStr) return "-";
        return new Date(dateStr).toLocaleString("zh-CN");
    };

    return (
        <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">学生列表</CardTitle>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="搜索学号或姓名..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                        className="pl-9 w-52"
                    />
                </div>
            </CardHeader>
            <CardContent>
                <div className="flex gap-3 mb-4">
                    <Select value={filterClass} onValueChange={setFilterClass}>
                        <SelectTrigger className="w-44">
                            <SelectValue placeholder="全部班级" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">全部班级</SelectItem>
                            {classes.map((c) => (
                                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>学号</TableHead>
                                <TableHead>姓名</TableHead>
                                <TableHead>班级</TableHead>
                                <TableHead>状态</TableHead>
                                <TableHead>实验进度</TableHead>
                                <TableHead>最后活跃</TableHead>
                                <TableHead>操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {students.map((student) => (
                                <TableRow key={student.id}>
                                    <TableCell className="font-medium">{student.studentId}</TableCell>
                                    <TableCell>{student.name}</TableCell>
                                    <TableCell>{student.className}</TableCell>
                                    <TableCell>
                                        {student.status === 1 ? (
                                            <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">正常</Badge>
                                        ) : (
                                            <Badge variant="destructive">已停用</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Progress value={student.progress} className={`w-20 h-2 ${getProgressColor(student.progress)}`} />
                                            <span className="text-xs text-muted-foreground">{student.progress}%</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">{formatDateTime(student.lastActive)}</TableCell>
                                    <TableCell>
                                        <div className="flex gap-2">
                                            <Button variant="ghost" size="sm" onClick={() => handleResetPassword(student)}>
                                                <RotateCcw className="w-3 h-3 mr-1" />
                                                重置密码
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleToggleStatus(student)}
                                                className={student.status === 1 ? "text-orange-500 hover:text-orange-600" : "text-emerald-600 hover:text-emerald-700"}
                                            >
                                                {student.status === 1 ? "停用" : "启用"}
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {students.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                                        暂无数据
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
}
