import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const mockAssistants = [
    { id: 1, account: "A001", name: "小明", teacherId: "T001", teacherName: "张三", status: 1, createdAt: "2024-02-15" },
    { id: 2, account: "A002", name: "小红", teacherId: "T001", teacherName: "张三", status: 1, createdAt: "2024-02-15" },
    { id: 3, account: "A003", name: "小刚", teacherId: "T002", teacherName: "李四", status: 0, createdAt: "2024-02-20" },
];

const mockTeachers = [
    { id: "T001", name: "张三" },
    { id: "T002", name: "李四" },
    { id: "T004", name: "赵六" },
];

interface Assistant {
    id: number;
    account: string;
    name: string;
    teacherId: string;
    teacherName: string;
    status: number;
    createdAt: string;
}

export function AssistantManagement() {
    const [assistants, setAssistants] = useState<Assistant[]>(mockAssistants);
    const [showAddModal, setShowAddModal] = useState(false);
    const [filterTeacher, setFilterTeacher] = useState("all");
    const [newAssistant, setNewAssistant] = useState({ account: "", name: "", teacherId: mockTeachers[0]?.id ?? "" });

    const filteredAssistants = assistants.filter((a) => {
        if (filterTeacher !== "all" && a.teacherId !== filterTeacher) return false;
        return true;
    });

    const handleAddAssistant = () => {
        if (!newAssistant.account.trim() || !newAssistant.name.trim()) return;
        const teacher = mockTeachers.find(t => t.id === newAssistant.teacherId);
        const assistant: Assistant = {
            id: Date.now(),
            account: newAssistant.account,
            name: newAssistant.name,
            teacherId: newAssistant.teacherId,
            teacherName: teacher?.name ?? "",
            status: 1,
            createdAt: new Date().toISOString().split("T")[0] ?? "",
        };
        setAssistants([...assistants, assistant]);
        setNewAssistant({ account: "", name: "", teacherId: mockTeachers[0]?.id ?? "" });
        setShowAddModal(false);
    };

    const handleToggleStatus = (id: number) => {
        setAssistants(assistants.map((a) => (a.id === id ? { ...a, status: a.status === 1 ? 0 : 1 } : a)));
    };

    const handleDelete = (assistant: Assistant) => {
        if (confirm(`确定删除助教「${assistant.name}」吗？`)) {
            setAssistants(assistants.filter((a) => a.id !== assistant.id));
        }
    };

    return (
        <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">助教列表</CardTitle>
                <Button onClick={() => setShowAddModal(true)}>
                    <Plus className="w-4 h-4" />
                    添加助教
                </Button>
            </CardHeader>
            <CardContent>
                <div className="flex gap-3 mb-4">
                    <Select value={filterTeacher} onValueChange={setFilterTeacher}>
                        <SelectTrigger className="w-40">
                            <SelectValue placeholder="全部教师" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">全部教师</SelectItem>
                            {mockTeachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>

                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>账号</TableHead>
                            <TableHead>姓名</TableHead>
                            <TableHead>所属教师</TableHead>
                            <TableHead>状态</TableHead>
                            <TableHead>创建时间</TableHead>
                            <TableHead>操作</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredAssistants.map((assistant) => (
                            <TableRow key={assistant.id}>
                                <TableCell className="font-medium">{assistant.account}</TableCell>
                                <TableCell>{assistant.name}</TableCell>
                                <TableCell>{assistant.teacherName}</TableCell>
                                <TableCell>
                                    {assistant.status === 1 ? (
                                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">正常</Badge>
                                    ) : (
                                        <Badge variant="destructive">已停用</Badge>
                                    )}
                                </TableCell>
                                <TableCell className="text-muted-foreground">{assistant.createdAt}</TableCell>
                                <TableCell>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleToggleStatus(assistant.id)}
                                            className={assistant.status === 1 ? "text-orange-500 hover:text-orange-600" : "text-emerald-600 hover:text-emerald-700"}
                                        >
                                            {assistant.status === 1 ? "停用" : "启用"}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDelete(assistant)}
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

                {filteredAssistants.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">暂无数据</div>
                )}
            </CardContent>

            <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>添加助教</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="account">账号</Label>
                            <Input
                                id="account"
                                placeholder="请输入账号"
                                value={newAssistant.account}
                                onChange={(e) => setNewAssistant({ ...newAssistant, account: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="assistantName">姓名</Label>
                            <Input
                                id="assistantName"
                                placeholder="请输入姓名"
                                value={newAssistant.name}
                                onChange={(e) => setNewAssistant({ ...newAssistant, name: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>所属教师</Label>
                            <Select value={newAssistant.teacherId} onValueChange={(v) => setNewAssistant({ ...newAssistant, teacherId: v })}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {mockTeachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <p className="text-xs text-muted-foreground">初始密码为账号</p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAddModal(false)}>取消</Button>
                        <Button onClick={handleAddAssistant}>确认添加</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
