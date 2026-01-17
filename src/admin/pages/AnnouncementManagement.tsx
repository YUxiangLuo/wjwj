import { useState } from "react";
import { Plus, Pencil, Trash2, Send, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

const mockAnnouncements = [
    { id: 1, title: "系统维护通知：本周六凌晨2点进行例行维护", content: "为保障系统稳定运行，我们将于本周六凌晨2点进行例行维护...", isPublished: true, createdAt: "2024-03-15 10:00" },
    { id: 2, title: "新学期开始，请各位教师及时发布任务", content: "2024年春季学期已正式开始，请各位教师尽快完成班级设置...", isPublished: true, createdAt: "2024-03-01 09:00" },
    { id: 3, title: "欢迎使用抽样统计虚拟仿真系统V3.0", content: "系统已升级至V3.0版本，新增多项功能...", isPublished: true, createdAt: "2024-02-20 14:30" },
    { id: 4, title: "期末考试安排通知（草稿）", content: "本学期期末考试时间安排如下...", isPublished: false, createdAt: "2024-03-10 16:00" },
];

interface Announcement {
    id: number;
    title: string;
    content: string;
    isPublished: boolean;
    createdAt: string;
}

export function AnnouncementManagement() {
    const [announcements, setAnnouncements] = useState<Announcement[]>(mockAnnouncements);
    const [showAddModal, setShowAddModal] = useState(false);
    const [newAnnouncement, setNewAnnouncement] = useState({ title: "", content: "" });

    const handleAddAnnouncement = (publish: boolean) => {
        if (!newAnnouncement.title.trim()) return;
        const announcement: Announcement = {
            id: Date.now(),
            title: newAnnouncement.title,
            content: newAnnouncement.content,
            isPublished: publish,
            createdAt: new Date().toLocaleString("zh-CN"),
        };
        setAnnouncements([announcement, ...announcements]);
        setNewAnnouncement({ title: "", content: "" });
        setShowAddModal(false);
    };

    const handleTogglePublish = (id: number) => {
        setAnnouncements(announcements.map((a) => (a.id === id ? { ...a, isPublished: !a.isPublished } : a)));
    };

    const handleDelete = (announcement: Announcement) => {
        if (confirm(`确定删除公告「${announcement.title}」吗？`)) {
            setAnnouncements(announcements.filter((a) => a.id !== announcement.id));
        }
    };

    return (
        <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">公告列表</CardTitle>
                <Button onClick={() => setShowAddModal(true)}>
                    <Plus className="w-4 h-4" />
                    发布公告
                </Button>
            </CardHeader>
            <CardContent className="space-y-4">
                {announcements.map((announcement) => (
                    <div key={announcement.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2">
                                <h4 className="font-medium text-foreground">{announcement.title}</h4>
                                {announcement.isPublished ? (
                                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">已发布</Badge>
                                ) : (
                                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">草稿</Badge>
                                )}
                            </div>
                            <span className="text-xs text-muted-foreground">{announcement.createdAt}</span>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{announcement.content}</p>
                        <div className="flex gap-2">
                            <Button variant="ghost" size="sm">
                                <Pencil className="w-3 h-3 mr-1" />
                                编辑
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleTogglePublish(announcement.id)}
                                className={announcement.isPublished ? "text-orange-500 hover:text-orange-600" : "text-emerald-600 hover:text-emerald-700"}
                            >
                                {announcement.isPublished ? (
                                    <>
                                        <Archive className="w-3 h-3 mr-1" />
                                        撤回
                                    </>
                                ) : (
                                    <>
                                        <Send className="w-3 h-3 mr-1" />
                                        发布
                                    </>
                                )}
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(announcement)}
                                className="text-destructive hover:text-destructive"
                            >
                                <Trash2 className="w-3 h-3 mr-1" />
                                删除
                            </Button>
                        </div>
                    </div>
                ))}

                {announcements.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">暂无公告</div>
                )}
            </CardContent>

            <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>发布公告</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="title">标题</Label>
                            <Input
                                id="title"
                                placeholder="请输入公告标题"
                                value={newAnnouncement.title}
                                onChange={(e) => setNewAnnouncement({ ...newAnnouncement, title: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="content">内容</Label>
                            <Textarea
                                id="content"
                                placeholder="请输入公告内容"
                                value={newAnnouncement.content}
                                onChange={(e) => setNewAnnouncement({ ...newAnnouncement, content: e.target.value })}
                                className="min-h-32 resize-none"
                            />
                        </div>
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setShowAddModal(false)}>取消</Button>
                        <Button variant="outline" onClick={() => handleAddAnnouncement(false)}>
                            <Archive className="w-4 h-4" />
                            保存草稿
                        </Button>
                        <Button onClick={() => handleAddAnnouncement(true)}>
                            <Send className="w-4 h-4" />
                            立即发布
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
