import { useState } from "react";
import { Plus, Trash2, Users, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const mockClasses = [
    { id: 1, name: "统计学2024-1班", semester: "2024-Spring", teacher: "张三", studentCount: 45, createdAt: "2024-02-15" },
    { id: 2, name: "统计学2024-2班", semester: "2024-Spring", teacher: "张三", studentCount: 42, createdAt: "2024-02-15" },
    { id: 3, name: "统计学2024-3班", semester: "2024-Spring", teacher: "李四", studentCount: 48, createdAt: "2024-02-16" },
    { id: 4, name: "数据分析班", semester: "2024-Spring", teacher: "赵六", studentCount: 35, createdAt: "2024-03-01" },
];

const mockSemesters = ["2024-Spring", "2023-Fall", "2023-Spring"];
const mockTeachers = ["张三", "李四", "赵六"];

interface Class {
    id: number;
    name: string;
    semester: string;
    teacher: string;
    studentCount: number;
    createdAt: string;
}

export function ClassManagement() {
    const [classes, setClasses] = useState<Class[]>(mockClasses);
    const [showAddModal, setShowAddModal] = useState(false);
    const [filterSemester, setFilterSemester] = useState("all");
    const [filterTeacher, setFilterTeacher] = useState("all");
    const [newClass, setNewClass] = useState({ name: "", semester: mockSemesters[0] ?? "", teacher: mockTeachers[0] ?? "" });

    const filteredClasses = classes.filter((c) => {
        if (filterSemester !== "all" && c.semester !== filterSemester) return false;
        if (filterTeacher !== "all" && c.teacher !== filterTeacher) return false;
        return true;
    });

    const handleAddClass = () => {
        if (!newClass.name.trim()) return;
        const cls: Class = {
            id: Date.now(),
            name: newClass.name,
            semester: newClass.semester ?? "",
            teacher: newClass.teacher ?? "",
            studentCount: 0,
            createdAt: new Date().toISOString().split("T")[0] ?? "",
        };
        setClasses([...classes, cls]);
        setNewClass({ name: "", semester: mockSemesters[0] ?? "", teacher: mockTeachers[0] ?? "" });
        setShowAddModal(false);
    };

    const handleDelete = (cls: Class) => {
        const message = cls.studentCount > 0
            ? `确定删除班级「${cls.name}」吗？\n\n⚠️ 警告：该班级有 ${cls.studentCount} 名学生\n\n删除后：\n- 班级内的学生将无法继续实验\n- 历史实验数据和成绩将被保留`
            : `确定删除班级「${cls.name}」吗？`;
        if (confirm(message)) {
            setClasses(classes.filter((c) => c.id !== cls.id));
        }
    };

    return (
        <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">班级列表</CardTitle>
                <Button onClick={() => setShowAddModal(true)}>
                    <Plus className="w-4 h-4" />
                    创建班级
                </Button>
            </CardHeader>
            <CardContent>
                <div className="flex gap-3 mb-4">
                    <Select value={filterSemester} onValueChange={setFilterSemester}>
                        <SelectTrigger className="w-40">
                            <SelectValue placeholder="全部学期" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">全部学期</SelectItem>
                            {mockSemesters.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={filterTeacher} onValueChange={setFilterTeacher}>
                        <SelectTrigger className="w-40">
                            <SelectValue placeholder="全部教师" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">全部教师</SelectItem>
                            {mockTeachers.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>

                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>班级名称</TableHead>
                            <TableHead>学期</TableHead>
                            <TableHead>授课教师</TableHead>
                            <TableHead>学生人数</TableHead>
                            <TableHead>创建时间</TableHead>
                            <TableHead>操作</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredClasses.map((cls) => (
                            <TableRow key={cls.id}>
                                <TableCell className="font-medium">{cls.name}</TableCell>
                                <TableCell>
                                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">{cls.semester}</Badge>
                                </TableCell>
                                <TableCell>{cls.teacher}</TableCell>
                                <TableCell>{cls.studentCount}</TableCell>
                                <TableCell className="text-muted-foreground">{cls.createdAt}</TableCell>
                                <TableCell>
                                    <div className="flex gap-2">
                                        <Button variant="ghost" size="sm">
                                            <Users className="w-3 h-3 mr-1" />
                                            查看学生
                                        </Button>
                                        <Button variant="ghost" size="sm">
                                            <Pencil className="w-3 h-3 mr-1" />
                                            编辑
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDelete(cls)}
                                            className="text-destructive hover:text-destructive"
                                        >
                                            <Trash2 className="w-3 h-3 mr-1" />
                                            删除
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>

                {filteredClasses.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">暂无数据</div>
                )}
            </CardContent>

            <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>创建班级</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="className">班级名称</Label>
                            <Input
                                id="className"
                                placeholder="请输入班级名称"
                                value={newClass.name}
                                onChange={(e) => setNewClass({ ...newClass, name: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>所属学期</Label>
                            <Select value={newClass.semester} onValueChange={(v) => setNewClass({ ...newClass, semester: v })}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {mockSemesters.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>授课教师</Label>
                            <Select value={newClass.teacher} onValueChange={(v) => setNewClass({ ...newClass, teacher: v })}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {mockTeachers.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAddModal(false)}>取消</Button>
                        <Button onClick={handleAddClass}>确认创建</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
