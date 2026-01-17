import { useState } from "react";
import { Plus, Search, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

const mockTeachers = [
    { id: 1, employeeId: "T001", name: "张三", status: 1, classCount: 3, lastLogin: "2024-03-15 10:30", createdAt: "2023-09-01" },
    { id: 2, employeeId: "T002", name: "李四", status: 1, classCount: 2, lastLogin: "2024-03-14 14:20", createdAt: "2023-09-01" },
    { id: 3, employeeId: "T003", name: "王五", status: 0, classCount: 0, lastLogin: "2024-01-10 09:00", createdAt: "2023-09-15" },
    { id: 4, employeeId: "T004", name: "赵六", status: 1, classCount: 3, lastLogin: "2024-03-15 08:45", createdAt: "2024-01-01" },
];

interface Teacher {
    id: number;
    employeeId: string;
    name: string;
    status: number;
    classCount: number;
    lastLogin: string;
    createdAt: string;
}

export function TeacherManagement() {
    const [teachers, setTeachers] = useState<Teacher[]>(mockTeachers);
    const [showAddModal, setShowAddModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [newTeacher, setNewTeacher] = useState({ employeeId: "", name: "" });

    const filteredTeachers = teachers.filter(
        (t) => t.employeeId.toLowerCase().includes(searchTerm.toLowerCase()) || t.name.includes(searchTerm)
    );

    const handleAddTeacher = () => {
        if (!newTeacher.employeeId.trim() || !newTeacher.name.trim()) return;
        const teacher: Teacher = {
            id: Date.now(),
            employeeId: newTeacher.employeeId,
            name: newTeacher.name,
            status: 1,
            classCount: 0,
            lastLogin: "-",
            createdAt: new Date().toISOString().split("T")[0] ?? "",
        };
        setTeachers([...teachers, teacher]);
        setNewTeacher({ employeeId: "", name: "" });
        setShowAddModal(false);
    };

    const handleToggleStatus = (id: number) => {
        setTeachers(teachers.map((t) => (t.id === id ? { ...t, status: t.status === 1 ? 0 : 1 } : t)));
    };

    const handleResetPassword = (teacher: Teacher) => {
        if (confirm(`确定重置教师「${teacher.name}」的密码吗？\n\n密码将重置为工号，下次登录需要修改密码。`)) {
            alert(`密码已重置为：${teacher.employeeId}`);
        }
    };

    return (
        <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">教师列表</CardTitle>
                <div className="flex gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="搜索工号或姓名..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9 w-52"
                        />
                    </div>
                    <Button onClick={() => setShowAddModal(true)}>
                        <Plus className="w-4 h-4" />
                        添加教师
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>工号</TableHead>
                            <TableHead>姓名</TableHead>
                            <TableHead>状态</TableHead>
                            <TableHead>班级数</TableHead>
                            <TableHead>最后登录</TableHead>
                            <TableHead>创建时间</TableHead>
                            <TableHead>操作</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredTeachers.map((teacher) => (
                            <TableRow key={teacher.id}>
                                <TableCell className="font-medium">{teacher.employeeId}</TableCell>
                                <TableCell>{teacher.name}</TableCell>
                                <TableCell>
                                    {teacher.status === 1 ? (
                                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">正常</Badge>
                                    ) : (
                                        <Badge variant="destructive">已停用</Badge>
                                    )}
                                </TableCell>
                                <TableCell>{teacher.classCount}</TableCell>
                                <TableCell className="text-muted-foreground">{teacher.lastLogin}</TableCell>
                                <TableCell className="text-muted-foreground">{teacher.createdAt}</TableCell>
                                <TableCell>
                                    <div className="flex gap-2">
                                        <Button variant="ghost" size="sm" onClick={() => handleResetPassword(teacher)}>
                                            <RotateCcw className="w-3 h-3 mr-1" />
                                            重置密码
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleToggleStatus(teacher.id)}
                                            className={teacher.status === 1 ? "text-orange-500 hover:text-orange-600" : "text-emerald-600 hover:text-emerald-700"}
                                        >
                                            {teacher.status === 1 ? "停用" : "启用"}
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>

                {filteredTeachers.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">暂无数据</div>
                )}
            </CardContent>

            <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>添加教师</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="employeeId">工号</Label>
                            <Input
                                id="employeeId"
                                placeholder="请输入工号"
                                value={newTeacher.employeeId}
                                onChange={(e) => setNewTeacher({ ...newTeacher, employeeId: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="name">姓名</Label>
                            <Input
                                id="name"
                                placeholder="请输入姓名"
                                value={newTeacher.name}
                                onChange={(e) => setNewTeacher({ ...newTeacher, name: e.target.value })}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">初始密码为工号</p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAddModal(false)}>取消</Button>
                        <Button onClick={handleAddTeacher}>确认添加</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
