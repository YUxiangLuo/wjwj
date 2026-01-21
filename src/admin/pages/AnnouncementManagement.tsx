import { useState, useEffect, useMemo } from "react";
import { Plus, Pencil, Trash2, Send, Archive, Loader2, BarChart3, Users, Eye, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { announcementApi, type Announcement } from "../api-client";
import { toast } from "sonner";

export function AnnouncementManagement() {
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showStatsModal, setShowStatsModal] = useState(false);

    const [newAnnouncement, setNewAnnouncement] = useState({ title: "", content: "" });
    const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
    const [editForm, setEditForm] = useState({ title: "", content: "" });
    const [submitting, setSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft">("all");

    // Stats State
    const [currentStats, setCurrentStats] = useState<{ readCount: number; totalCount: number; readRate: number } | null>(null);
    const [statsLoading, setStatsLoading] = useState(false);

    useEffect(() => {
        loadAnnouncements();
    }, []);

    async function loadAnnouncements() {
        setLoading(true);
        try {
            const res = await announcementApi.list();
            if (res.success && res.data) {
                setAnnouncements(res.data);
            }
        } catch (error) {
            console.error("Failed to load announcements:", error);
        } finally {
            setLoading(false);
        }
    }

    async function handleAddAnnouncement(publish: boolean) {
        if (!newAnnouncement.title.trim()) return;

        setSubmitting(true);
        try {
            const res = await announcementApi.create({
                title: newAnnouncement.title.trim(),
                content: newAnnouncement.content.trim(),
                publish: publish,
            });

            if (res.success) {
                setNewAnnouncement({ title: "", content: "" });
                setShowAddModal(false);
                loadAnnouncements();
            } else {
                toast.error(res.error?.message ?? "创建失败");
            }
        } catch (error) {
            console.error("Failed to create announcement:", error);
            toast.error("创建失败");
        } finally {
            setSubmitting(false);
        }
    }

    function openEditModal(announcement: Announcement) {
        setEditingAnnouncement(announcement);
        setEditForm({ title: announcement.title, content: announcement.content });
        setShowEditModal(true);
    }

    async function handleEditAnnouncement() {
        if (!editingAnnouncement || !editForm.title.trim()) return;

        setSubmitting(true);
        try {
            const res = await announcementApi.update(editingAnnouncement.id, {
                title: editForm.title.trim(),
                content: editForm.content.trim(),
            });

            if (res.success) {
                setShowEditModal(false);
                setEditingAnnouncement(null);
                loadAnnouncements();
            } else {
                toast.error(res.error?.message ?? "更新失败");
            }
        } catch (error) {
            console.error("Failed to update announcement:", error);
            toast.error("更新失败");
        } finally {
            setSubmitting(false);
        }
    }

    async function handleTogglePublish(announcement: Announcement) {
        const isPublished = announcement.status === 1;
        const action = isPublished ? "撤回" : "发布";

        if (!confirm(`确定${action}公告「${announcement.title}」吗？`)) {
            return;
        }

        try {
            const res = isPublished
                ? await announcementApi.unpublish(announcement.id)
                : await announcementApi.publish(announcement.id);
            if (res.success) {
                loadAnnouncements();
            } else {
                toast.error(res.error?.message ?? `${action}失败`);
            }
        } catch (error) {
            console.error(`Failed to ${action} announcement:`, error);
            toast.error(`${action}失败`);
        }
    }

    async function handleDelete(announcement: Announcement) {
        if (!confirm(`确定删除公告「${announcement.title}」吗？`)) {
            return;
        }

        try {
            const res = await announcementApi.delete(announcement.id);
            if (res.success) {
                loadAnnouncements();
            } else {
                toast.error(res.error?.message ?? "删除失败");
            }
        } catch (error) {
            console.error("Failed to delete announcement:", error);
            toast.error("删除失败");
        }
    }

    async function handleViewStats(announcement: Announcement) {
        setShowStatsModal(true);
        setStatsLoading(true);
        setCurrentStats(null);
        try {
            const res = await announcementApi.getStats(announcement.id);
            if (res.success && res.data) {
                setCurrentStats(res.data);
            }
        } catch (error) {
            console.error("Failed to load stats:", error);
            toast.error("加载统计失败");
            setShowStatsModal(false);
        } finally {
            setStatsLoading(false);
        }
    }

    const formatDateTime = (dateStr: string) => {
        return new Date(dateStr).toLocaleString("zh-CN");
    };

    const summary = useMemo(() => {
        const total = announcements.length;
        const published = announcements.filter((item) => item.status === 1).length;
        const draft = total - published;
        const latestPublished = announcements
            .filter((item) => item.status === 1)
            .reduce<string | null>((latest, item) => {
                if (!latest) return item.createdAt;
                return new Date(item.createdAt).getTime() > new Date(latest).getTime() ? item.createdAt : latest;
            }, null);
        return { total, published, draft, latestPublished };
    }, [announcements]);

    const filteredAnnouncements = useMemo(() => {
        const keyword = searchTerm.trim().toLowerCase();
        return announcements.filter((announcement) => {
            const matchesKeyword =
                !keyword ||
                announcement.title.toLowerCase().includes(keyword) ||
                announcement.content.toLowerCase().includes(keyword);
            const matchesStatus =
                statusFilter === "all" ||
                (statusFilter === "published" ? announcement.status === 1 : announcement.status !== 1);
            return matchesKeyword && matchesStatus;
        });
    }, [announcements, searchTerm, statusFilter]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-slate-900">公告管理</h2>
                    <p className="text-sm text-slate-500 mt-1">统一发布系统通知，支持草稿与阅读统计。</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button onClick={() => setShowAddModal(true)}>
                        <Plus className="w-4 h-4" />
                        发布公告
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <Card className="border-slate-200 shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500">公告总数</p>
                            <p className="text-2xl font-semibold text-slate-900">{loading ? "-" : summary.total}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                            <Megaphone className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-200 shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500">已发布</p>
                            <p className="text-2xl font-semibold text-slate-900">{loading ? "-" : summary.published}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                            <Send className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-200 shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500">草稿</p>
                            <p className="text-2xl font-semibold text-slate-900">{loading ? "-" : summary.draft}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
                            <Archive className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-slate-200 shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500">最近发布</p>
                            <p className="text-sm font-medium text-slate-900">
                                {loading
                                    ? "-"
                                    : summary.latestPublished
                                      ? formatDateTime(summary.latestPublished)
                                      : "暂无"}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-slate-200 shadow-sm">
                <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <CardTitle className="text-base">公告列表</CardTitle>
                        <p className="text-xs text-slate-500 mt-1">共 {filteredAnnouncements.length} 条</p>
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                        <Input
                            placeholder="搜索标题或内容"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="sm:w-64"
                        />
                        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | "published" | "draft")}>
                            <SelectTrigger className="sm:w-36">
                                <SelectValue placeholder="状态筛选" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部状态</SelectItem>
                                <SelectItem value="published">已发布</SelectItem>
                                <SelectItem value="draft">草稿</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <>
                            {filteredAnnouncements.map((announcement) => (
                                <div key={announcement.id} className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-medium text-slate-900">{announcement.title}</h4>
                                            {announcement.status === 1 ? (
                                                <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">已发布</Badge>
                                            ) : (
                                                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">草稿</Badge>
                                            )}
                                        </div>
                                        <span className="text-xs text-slate-500">{formatDateTime(announcement.createdAt)}</span>
                                    </div>
                                    <p className="text-sm text-slate-600 mb-3 line-clamp-2">{announcement.content}</p>
                                    <div className="flex flex-wrap gap-2">
                                        <Button variant="ghost" size="sm" onClick={() => openEditModal(announcement)}>
                                            <Pencil className="w-3 h-3 mr-1" />
                                            编辑
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleTogglePublish(announcement)}
                                            className={announcement.status === 1 ? "text-orange-500 hover:text-orange-600" : "text-emerald-600 hover:text-emerald-700"}
                                        >
                                            {announcement.status === 1 ? (
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
                                            onClick={() => handleViewStats(announcement)}
                                            disabled={announcement.status !== 1}
                                        >
                                            <BarChart3 className="w-3 h-3 mr-1" />
                                            统计
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

                            {filteredAnnouncements.length === 0 && (
                                <div className="text-center py-12 text-slate-500">暂无符合条件的公告</div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            {/* 创建公告弹窗 */}
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
                        <Button variant="outline" onClick={() => setShowAddModal(false)} disabled={submitting}>
                            取消
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => handleAddAnnouncement(false)}
                            disabled={submitting || !newAnnouncement.title.trim()}
                        >
                            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            <Archive className="w-4 h-4" />
                            保存草稿
                        </Button>
                        <Button
                            onClick={() => handleAddAnnouncement(true)}
                            disabled={submitting || !newAnnouncement.title.trim()}
                        >
                            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            <Send className="w-4 h-4" />
                            立即发布
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 编辑公告弹窗 */}
            <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>编辑公告</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="editTitle">标题</Label>
                            <Input
                                id="editTitle"
                                placeholder="请输入公告标题"
                                value={editForm.title}
                                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="editContent">内容</Label>
                            <Textarea
                                id="editContent"
                                placeholder="请输入公告内容"
                                value={editForm.content}
                                onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                                className="min-h-32 resize-none"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowEditModal(false)} disabled={submitting}>
                            取消
                        </Button>
                        <Button
                            onClick={handleEditAnnouncement}
                            disabled={submitting || !editForm.title.trim()}
                        >
                            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            保存
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 统计弹窗 */}
            <Dialog open={showStatsModal} onOpenChange={setShowStatsModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>公告阅读统计</DialogTitle>
                    </DialogHeader>
                    <div className="py-6">
                        {statsLoading ? (
                            <div className="flex justify-center">
                                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                            </div>
                        ) : currentStats ? (
                            <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-muted p-4 rounded-lg flex flex-col items-center">
                                        <Users className="w-5 h-5 text-muted-foreground mb-2" />
                                        <span className="text-2xl font-bold">{currentStats.totalCount}</span>
                                        <span className="text-xs text-muted-foreground">总人数</span>
                                    </div>
                                    <div className="bg-muted p-4 rounded-lg flex flex-col items-center">
                                        <Eye className="w-5 h-5 text-muted-foreground mb-2" />
                                        <span className="text-2xl font-bold text-emerald-600">{currentStats.readCount}</span>
                                        <span className="text-xs text-muted-foreground">已阅读</span>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span>阅读率</span>
                                        <span className="font-bold">{currentStats.readRate}%</span>
                                    </div>
                                    <Progress value={currentStats.readRate} className="h-3" />
                                </div>
                            </div>
                        ) : (
                            <div className="text-center text-muted-foreground">暂无统计数据</div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button onClick={() => setShowStatsModal(false)}>关闭</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
