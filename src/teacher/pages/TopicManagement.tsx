import { useState, useEffect } from "react";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { teacherApi, type Topic } from "../api-client";

export function TopicManagement() {
    const [topics, setTopics] = useState<Topic[]>([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [loading, setLoading] = useState(true);

    // Form state
    const [editingTopicId, setEditingTopicId] = useState<number | null>(null);
    const [newTopicName, setNewTopicName] = useState("");
    const [newTopicDesc, setNewTopicDesc] = useState("");

    // Confirmation State
    const [confirmDialog, setConfirmDialog] = useState<{
        open: boolean;
        type: "delete" | "publish" | null;
        topic: Topic | null;
    }>({ open: false, type: null, topic: null });

    useEffect(() => {
        loadTopics();
    }, []);

    async function loadTopics() {
        setLoading(true);
        const res = await teacherApi.getTopics();
        if (res.success && res.data) {
            setTopics(res.data);
        }
        setLoading(false);
    }

    async function handleSubmitTopic() {
        if (!newTopicName.trim()) return;

        let res;
        if (editingTopicId) {
            // Update
            res = await teacherApi.updateTopic(editingTopicId, {
                name: newTopicName,
                description: newTopicDesc
            });
        } else {
            // Create
            res = await teacherApi.createTopic({
                name: newTopicName,
                description: newTopicDesc
            });
        }

        if (res.success) {
            setShowCreateModal(false);
            setNewTopicName("");
            setNewTopicDesc("");
            setEditingTopicId(null);
            loadTopics();
        } else {
            alert((editingTopicId ? "更新" : "创建") + "失败: " + (res.error?.message || "未知错误"));
        }
    }

    function openCreateModal() {
        setEditingTopicId(null);
        setNewTopicName("");
        setNewTopicDesc("");
        setShowCreateModal(true);
    }

    function openEditModal(topic: Topic) {
        setEditingTopicId(topic.id);
        setNewTopicName(topic.name);
        setNewTopicDesc(topic.description || "");
        setShowCreateModal(true);
    }

    async function executeConfirmAction() {
        const { type, topic } = confirmDialog;
        if (!topic || !type) return;

        let res;
        if (type === "delete") {
            res = await teacherApi.deleteTopic(topic.id);
        } else if (type === "publish") {
            res = await teacherApi.updateTopic(topic.id, { status: 1 });
        }

        if (res?.success) {
            loadTopics();
        } else {
            alert("操作失败");
        }
        setConfirmDialog({ open: false, type: null, topic: null });
    }

    return (
        <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">课题列表</CardTitle>
                <div className="flex gap-3">
                    <Select defaultValue="all">
                        <SelectTrigger className="w-28">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">全部状态</SelectItem>
                            <SelectItem value="draft">草稿</SelectItem>
                            <SelectItem value="published">已发布</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button onClick={openCreateModal}>+ 创建课题</Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {loading ? <div className="text-center py-4">加载中...</div> : topics.map((topic) => (
                    <div key={topic.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                        <div className="flex justify-between items-start mb-3">
                            <div className="flex items-center gap-3">
                                <BookOpen className="w-5 h-5 text-primary" />
                                <div>
                                    <h4 className="font-medium text-foreground">{topic.name}</h4>
                                    <div className="text-xs text-muted-foreground mt-1">创建于 {new Date(topic.createdAt).toLocaleDateString()}</div>
                                </div>
                            </div>
                            {topic.status === 1 ? (
                                <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">已发布</Badge>
                            ) : (
                                <Badge variant="secondary">草稿</Badge>
                            )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                            <span>数据行数：{topic.dataRows > 0 ? topic.dataRows.toLocaleString() : "未上传"}</span>
                            {/* Attachments not yet in API, hidden or mock */}
                            {/* <span>附件：{topic.attachments}个</span> */}
                        </div>
                        <div className="flex gap-2">
                            {topic.status === 0 ? (
                                <>
                                    <Button variant="ghost" size="sm" className="text-primary" onClick={() => openEditModal(topic)}>编辑</Button>
                                    <Button variant="ghost" size="sm" className="text-emerald-600" onClick={() => setConfirmDialog({ open: true, type: "publish", topic })}>发布</Button>
                                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmDialog({ open: true, type: "delete", topic })}>删除</Button>
                                </>
                            ) : (
                                <>
                                    <Button variant="ghost" size="sm" className="text-primary">查看</Button>
                                    <Button variant="ghost" size="sm" onClick={() => openEditModal(topic)}>编辑</Button>
                                    <Button variant="ghost" size="sm" className="text-blue-500">复制</Button>
                                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmDialog({ open: true, type: "delete", topic })}>删除</Button>
                                </>
                            )}
                        </div>
                    </div>
                ))}
            </CardContent>

            <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{editingTopicId ? "编辑课题" : "创建新课题"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="flex items-center gap-2 mb-6">
                            {/* Wizard steps visual only for now */}
                            {["基本信息", "上传数据", "字段映射", "辅助资料", "推荐题目", "评分权重"].map((step, idx) => (
                                <div key={step} className="flex items-center">
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${idx === 0 ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
                                        {idx + 1}
                                    </div>
                                    <span className={`text-xs ml-1 ${idx === 0 ? "text-primary font-medium" : "text-muted-foreground"}`}>{step}</span>
                                    {idx < 5 && <span className="mx-2 text-muted-foreground">→</span>}
                                </div>
                            ))}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="topicName">课题名称</Label>
                            <Input
                                id="topicName"
                                placeholder="请输入课题名称"
                                value={newTopicName}
                                onChange={e => setNewTopicName(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="topicDesc">背景描述</Label>
                            <Textarea
                                id="topicDesc"
                                placeholder="请输入课题背景描述"
                                className="min-h-32 resize-none"
                                value={newTopicDesc}
                                onChange={e => setNewTopicDesc(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowCreateModal(false)}>取消</Button>
                        <Button variant="outline">保存草稿</Button>
                        <Button onClick={handleSubmitTopic}>{editingTopicId ? "保存修改" : "下一步 (保存)"}</Button>
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
                            {confirmDialog.type === "delete" && "确认删除该课题吗？删除后无法恢复。"}
                            {confirmDialog.type === "publish" && "确认发布该课题吗？发布后学生将可见。"}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setConfirmDialog({ open: false, type: null, topic: null })}>
                            取消
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={executeConfirmAction} className={confirmDialog.type === "delete" ? "bg-destructive hover:bg-destructive/90" : ""}>
                            确认
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
}
