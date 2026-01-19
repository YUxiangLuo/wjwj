import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { teacherApi, type Task, type Topic, type TeacherClass } from "../api-client";

export function TaskManagement() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [showPublishModal, setShowPublishModal] = useState(false);

    // Data for modal
    const [availableTopics, setAvailableTopics] = useState<Topic[]>([]);
    const [availableClasses, setAvailableClasses] = useState<TeacherClass[]>([]);

    // Form state
    const [selectedTopicId, setSelectedTopicId] = useState<string>("");
    const [selectedClassIds, setSelectedClassIds] = useState<number[]>([]);
    const [deadline, setDeadline] = useState("");

    useEffect(() => {
        loadTasks();
    }, []);

    // Load form data when modal opens
    useEffect(() => {
        if (showPublishModal) {
            Promise.all([
                teacherApi.getTopics(),
                teacherApi.getClasses()
            ]).then(([topicsRes, classesRes]) => {
                if (topicsRes.success && topicsRes.data) setAvailableTopics(topicsRes.data);
                if (classesRes.success && classesRes.data) setAvailableClasses(classesRes.data);
            });
        }
    }, [showPublishModal]);

    async function loadTasks() {
        setLoading(true);
        const res = await teacherApi.getTasks();
        if (res.success && res.data) {
            setTasks(res.data);
        }
        setLoading(false);
    }

    async function handlePublish() {
        if (!selectedTopicId || selectedClassIds.length === 0) {
            alert("请选择课题和班级");
            return;
        }

        const res = await teacherApi.createTask({
            topicId: Number(selectedTopicId),
            classIds: selectedClassIds,
            deadline: deadline || undefined
        });

        if (res.success) {
            setShowPublishModal(false);
            loadTasks();
            // Reset form
            setSelectedTopicId("");
            setSelectedClassIds([]);
            setDeadline("");
        } else {
            alert("发布失败: " + res.error?.message);
        }
    }

    const toggleClass = (id: number) => {
        setSelectedClassIds(prev =>
            prev.includes(id) ? prev.filter(cid => cid !== id) : [...prev, id]
        );
    };

    return (
        <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">任务列表</CardTitle>
                <Button onClick={() => setShowPublishModal(true)}>+ 发布任务</Button>
            </CardHeader>
            <CardContent>
                {loading ? <div>加载中...</div> : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>课题</TableHead>
                                <TableHead>班级</TableHead>
                                <TableHead>发布时间</TableHead>
                                <TableHead>截止时间</TableHead>
                                <TableHead>完成进度</TableHead>
                                <TableHead>待批改</TableHead>
                                <TableHead>操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {tasks.map((task) => (
                                <TableRow key={task.id}>
                                    <TableCell className="font-medium">{task.topic}</TableCell>
                                    <TableCell>{task.className}</TableCell>
                                    <TableCell className="text-muted-foreground">{task.publishedAt ? new Date(task.publishedAt).toLocaleDateString() : "-"}</TableCell>
                                    <TableCell className="text-muted-foreground">{task.deadline ? new Date(task.deadline).toLocaleDateString() : "无"}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Progress value={task.total > 0 ? (task.completed / task.total) * 100 : 0} className="w-16 h-2" />
                                            <span className="text-xs text-muted-foreground">{task.completed}/{task.total}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {/* Mock pending count for now as API doesn't return it yet in list view efficiently */}
                                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
                                            0
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex gap-2">
                                            <Button variant="ghost" size="sm" className="text-primary">查看进度</Button>
                                            <Button variant="ghost" size="sm">延长时间</Button>
                                            <Button variant="ghost" size="sm" className="text-destructive">进入批改</Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>

            <Dialog open={showPublishModal} onOpenChange={setShowPublishModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>发布任务</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>选择课题</Label>
                            <Select onValueChange={setSelectedTopicId} value={selectedTopicId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="请选择课题" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableTopics.map(t => (
                                        <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>选择班级</Label>
                            <div className="space-y-2 border p-3 rounded-md max-h-40 overflow-y-auto">
                                {availableClasses.length === 0 ? <div className="text-sm text-muted-foreground">无班级</div> : availableClasses.map((cls) => (
                                    <label key={cls.id} className="flex items-center gap-2 text-sm cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="rounded border-input"
                                            checked={selectedClassIds.includes(cls.id)}
                                            onChange={() => toggleClass(cls.id)}
                                        />
                                        {cls.name}
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="deadline">截止时间（可选）</Label>
                            <Input
                                id="deadline"
                                type="datetime-local"
                                value={deadline}
                                onChange={e => setDeadline(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowPublishModal(false)}>取消</Button>
                        <Button onClick={handlePublish}>确认发布</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
