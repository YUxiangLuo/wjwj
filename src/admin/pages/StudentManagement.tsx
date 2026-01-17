import { useState } from "react";
import { Search, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const mockStudents = [
    { id: 1, studentId: "2024001", name: "张明", className: "统计学2024-1班", status: 1, progress: 75, lastActive: "2024-03-15 14:30" },
    { id: 2, studentId: "2024002", name: "李华", className: "统计学2024-1班", status: 1, progress: 60, lastActive: "2024-03-15 10:20" },
    { id: 3, studentId: "2024003", name: "王芳", className: "统计学2024-2班", status: 1, progress: 90, lastActive: "2024-03-14 16:45" },
    { id: 4, studentId: "2024004", name: "刘强", className: "统计学2024-2班", status: 0, progress: 30, lastActive: "2024-02-28 09:10" },
];

const mockClasses = ["统计学2024-1班", "统计学2024-2班", "统计学2024-3班"];

interface Student {
    id: number;
    studentId: string;
    name: string;
    className: string;
    status: number;
    progress: number;
    lastActive: string;
}

export function StudentManagement() {
    const [students, setStudents] = useState<Student[]>(mockStudents);
    const [filterClass, setFilterClass] = useState("all");
    const [searchTerm, setSearchTerm] = useState("");

    const filteredStudents = students.filter((s) => {
        if (filterClass !== "all" && s.className !== filterClass) return false;
        if (searchTerm && !s.studentId.includes(searchTerm) && !s.name.includes(searchTerm)) return false;
        return true;
    });

    const handleResetPassword = (student: Student) => {
        if (confirm(`确定重置学生「${student.name}」的密码吗？\n\n密码将重置为学号。`)) {
            alert(`密码已重置为：${student.studentId}`);
        }
    };

    const handleToggleStatus = (id: number) => {
        setStudents(students.map((s) => (s.id === id ? { ...s, status: s.status === 1 ? 0 : 1 } : s)));
    };

    const getProgressColor = (progress: number) => {
        if (progress >= 80) return "[&>div]:bg-emerald-500";
        if (progress >= 50) return "[&>div]:bg-amber-500";
        return "[&>div]:bg-destructive";
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
                            {mockClasses.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>

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
                        {filteredStudents.map((student) => (
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
                                <TableCell className="text-muted-foreground">{student.lastActive}</TableCell>
                                <TableCell>
                                    <div className="flex gap-2">
                                        <Button variant="ghost" size="sm" onClick={() => handleResetPassword(student)}>
                                            <RotateCcw className="w-3 h-3 mr-1" />
                                            重置密码
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleToggleStatus(student.id)}
                                            className={student.status === 1 ? "text-orange-500 hover:text-orange-600" : "text-emerald-600 hover:text-emerald-700"}
                                        >
                                            {student.status === 1 ? "停用" : "启用"}
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>

                {filteredStudents.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">暂无数据</div>
                )}
            </CardContent>
        </Card>
    );
}
