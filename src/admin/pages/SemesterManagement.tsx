import { useState } from "react";
import { Plus, Trash2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

const mockSemesters = [
    { id: 1, name: "2024-Spring", isCurrent: true, classCount: 8, createdAt: "2024-02-01" },
    { id: 2, name: "2023-Fall", isCurrent: false, classCount: 6, createdAt: "2023-09-01" },
    { id: 3, name: "2023-Spring", isCurrent: false, classCount: 5, createdAt: "2023-02-01" },
];

interface Semester {
    id: number;
    name: string;
    isCurrent: boolean;
    classCount: number;
    createdAt: string;
}

export function SemesterManagement() {
    const [semesters, setSemesters] = useState<Semester[]>(mockSemesters);
    const [showAddModal, setShowAddModal] = useState(false);
    const [newSemesterName, setNewSemesterName] = useState("");
    const [setAsCurrent, setSetAsCurrent] = useState(false);

    const handleAddSemester = () => {
        if (!newSemesterName.trim()) return;
        const newSemester: Semester = {
            id: Date.now(),
            name: newSemesterName,
            isCurrent: setAsCurrent,
            classCount: 0,
            createdAt: new Date().toISOString().split("T")[0] ?? "",
        };
        if (setAsCurrent) {
            setSemesters(semesters.map(s => ({ ...s, isCurrent: false })).concat(newSemester));
        } else {
            setSemesters([...semesters, newSemester]);
        }
        setNewSemesterName("");
        setSetAsCurrent(false);
        setShowAddModal(false);
    };

    const handleSetCurrent = (id: number) => {
        setSemesters(semesters.map(s => ({ ...s, isCurrent: s.id === id })));
    };

    const handleDelete = (id: number) => {
        const semester = semesters.find(s => s.id === id);
        if (semester?.classCount && semester.classCount > 0) {
            alert("该学期下有班级，无法删除");
            return;
        }
        if (confirm(`确定删除学期「${semester?.name}」吗？`)) {
            setSemesters(semesters.filter(s => s.id !== id));
        }
    };

    return (
        <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">学期列表</CardTitle>
                <Button onClick={() => setShowAddModal(true)}>
                    <Plus className="w-4 h-4" />
                    创建学期
                </Button>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>学期名称</TableHead>
                            <TableHead>状态</TableHead>
                            <TableHead>班级数量</TableHead>
                            <TableHead>创建时间</TableHead>
                            <TableHead>操作</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {semesters.map((semester) => (
                            <TableRow key={semester.id}>
                                <TableCell className="font-medium">{semester.name}</TableCell>
                                <TableCell>
                                    {semester.isCurrent ? (
                                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">当前学期</Badge>
                                    ) : (
                                        <Badge variant="secondary">历史学期</Badge>
                                    )}
                                </TableCell>
                                <TableCell>{semester.classCount}</TableCell>
                                <TableCell className="text-muted-foreground">{semester.createdAt}</TableCell>
                                <TableCell>
                                    <div className="flex gap-2">
                                        {!semester.isCurrent && (
                                            <Button variant="ghost" size="sm" onClick={() => handleSetCurrent(semester.id)}>
                                                <Star className="w-3 h-3 mr-1" />
                                                设为当前
                                            </Button>
                                        )}
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDelete(semester.id)}
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
            </CardContent>

            <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>创建学期</DialogTitle>
                        <DialogDescription>创建一个新的学期用于组织班级和教学任务</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="semesterName">学期名称</Label>
                            <Input
                                id="semesterName"
                                placeholder="例如：2024-Fall"
                                value={newSemesterName}
                                onChange={(e) => setNewSemesterName(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">格式：YYYY-Spring 或 YYYY-Fall</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <Switch
                                id="setAsCurrent"
                                checked={setAsCurrent}
                                onCheckedChange={setSetAsCurrent}
                            />
                            <Label htmlFor="setAsCurrent" className="cursor-pointer">设为当前学期</Label>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAddModal(false)}>取消</Button>
                        <Button onClick={handleAddSemester}>确认创建</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
