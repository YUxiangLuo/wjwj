import { useState, useEffect, useMemo } from "react";
import { Plus, Pencil, Trash2, Send, Archive, Loader2, BarChart3, Users, Eye, Megaphone, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RichTextEditor } from "@/components/RichTextEditor";
import { RichTextContent } from "@/components/RichTextContent";
import { announcementApi, type Announcement } from "../api-client";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import { toast } from "sonner";

export function AnnouncementManagement() {
    const { confirm, dialog } = useConfirmDialog();
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showStatsModal, setShowStatsModal] = useState(false);

    const [newAnnouncement, setNewAnnouncement] = useState({ title: "", content: "", targetScope: "all" });
    const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
    const [editForm, setEditForm] = useState({ title: "", content: "" });
    const [submitting, setSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft">("all");

    const [currentStats, setCurrentStats] = useState<{
        readCount: number;
        totalCount: number;
        readRate: number;
        byRole: { role: string; readCount: number; totalCount: number }[];
    } | null>(null);
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
                targetScope: newAnnouncement.targetScope,
            });

            if (res.success) {
                setNewAnnouncement({ title: "", content: "", targetScope: "all" });
                setShowAddModal(false);
                loadAnnouncements();
                toast.success(publish ? "公告已发布" : "草稿已保存");
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
                toast.success("更新成功");
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

        const shouldProceed = await confirm({
            title: `${action}公告「${announcement.title}」`,
            description: isPublished
                ? "撤回后该公告将不再对目标用户可见，但草稿内容会保留。"
                : "发布后该公告将立即对目标范围内的用户可见。",
            confirmLabel: action,
            tone: isPublished ? "destructive" : "primary",
        });
        if (!shouldProceed) {
            return;
        }

        try {
            const res = isPublished
                ? await announcementApi.unpublish(announcement.id)
                : await announcementApi.publish(announcement.id);
            if (res.success) {
                loadAnnouncements();
                toast.success(`公告已${action}`);
            } else {
                toast.error(res.error?.message ?? `${action}失败`);
            }
        } catch (error) {
            console.error(`Failed to ${action} announcement:`, error);
            toast.error(`${action}失败`);
        }
    }

    async function handleDelete(announcement: Announcement) {
        const shouldDelete = await confirm({
            title: `删除公告「${announcement.title}」`,
            description: "删除后公告内容和阅读统计都将无法恢复。",
            confirmLabel: "删除公告",
            tone: "destructive",
        });
        if (!shouldDelete) {
            return;
        }

        try {
            const res = await announcementApi.delete(announcement.id);
            if (res.success) {
                loadAnnouncements();
                toast.success("删除成功");
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
        return new Date(dateStr).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
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

    const targetScopeLabels: Record<string, string> = {
        all: "全体用户",
        teacher: "仅教师",
        student: "仅学生",
        assistant: "仅助教",
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h2 className="text-lg font-semibold">公告管理</h2>
                    <p className="text-sm text-muted-foreground mt-1">统一发布系统通知，支持草稿与阅读统计。</p>
                </div>
                <Button data-testid="announcement-create-open" onClick={() => setShowAddModal(true)}>
                    <Plus className="w-4 h-4 mr-1" />
                    发布公告
                </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <Card className="hover:border-primary/30 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total</p>
                            <p className="text-2xl font-bold mt-1">{loading ? "-" : summary.total}</p>
                        </div>
                        <div className="w-10 h-10 bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
                            <Megaphone className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="hover:border-primary/30 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Published</p>
                            <p className="text-2xl font-bold mt-1">{loading ? "-" : summary.published}</p>
                        </div>
                        <div className="w-10 h-10 bg-emerald-500/10 text-emerald-600 flex items-center justify-center border border-emerald-500/20">
                            <Send className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="hover:border-primary/30 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Drafts</p>
                            <p className="text-2xl font-bold mt-1">{loading ? "-" : summary.draft}</p>
                        </div>
                        <div className="w-10 h-10 bg-amber-500/10 text-amber-600 flex items-center justify-center border border-amber-500/20">
                            <Archive className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
                <Card className="hover:border-primary/30 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Latest</p>
                            <p className="text-sm font-bold mt-2">
                                {loading
                                    ? "-"
                                    : summary.latestPublished
                                        ? formatDateTime(summary.latestPublished)
                                        : "暂无"}
                            </p>
                        </div>
                        <div className="w-10 h-10 bg-chart-4/10 text-chart-4 flex items-center justify-center border border-chart-4/20">
                            <Send className="w-5 h-5" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-border pb-4">
                    <div>
                        <CardTitle className="text-base">公告列表</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">共 {filteredAnnouncements.length} 条数据</p>
                    </div>
                    <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
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
                                <SelectGroup>
                                    <SelectItem value="all">全部状态</SelectItem>
                                    <SelectItem value="published">已发布</SelectItem>
                                    <SelectItem value="draft">草稿</SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <>
                            {filteredAnnouncements.map((announcement) => (
                                <div key={announcement.id} className="border border-border p-4 bg-card hover:bg-muted transition-colors">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-medium">{announcement.title}</h4>
                                            {announcement.status === 1 ? (
                                                <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20">已发布</Badge>
                                            ) : (
                                                <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">草稿</Badge>
                                            )}
                                            <Badge variant="outline">
                                                {targetScopeLabels[announcement.targetScope] ?? "全体用户"}
                                            </Badge>
                                        </div>
                                        <span className="text-xs text-muted-foreground">{formatDateTime(announcement.createdAt)}</span>
                                    </div>
                                    <div className="text-sm text-muted-foreground mb-4 line-clamp-2">
                                        <RichTextContent html={announcement.content} />
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <Button data-testid={`announcement-edit-open-${announcement.id}`} variant="ghost" size="sm" onClick={() => openEditModal(announcement)} className="h-8">
                                            <Pencil className="w-3.5 h-3.5 mr-1" />
                                            编辑
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            data-testid={`announcement-toggle-publish-${announcement.id}`}
                                            onClick={() => handleTogglePublish(announcement)}
                                            className={`h-8 ${announcement.status === 1 ? "text-amber-600 hover:text-amber-500 hover:bg-amber-500/10" : "text-emerald-600 hover:text-emerald-500 hover:bg-emerald-500/10"}`}
                                        >
                                            {announcement.status === 1 ? (
                                                <>
                                                    <Archive className="w-3.5 h-3.5 mr-1" />
                                                    撤回
                                                </>
                                            ) : (
                                                <>
                                                    <Send className="w-3.5 h-3.5 mr-1" />
                                                    发布
                                                </>
                                            )}
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            data-testid={`announcement-stats-${announcement.id}`}
                                            onClick={() => handleViewStats(announcement)}
                                            disabled={announcement.status !== 1}
                                            className="h-8"
                                        >
                                            <BarChart3 className="w-3.5 h-3.5 mr-1" />
                                            统计
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            data-testid={`announcement-delete-${announcement.id}`}
                                            onClick={() => handleDelete(announcement)}
                                            className="h-8 hover:text-destructive hover:bg-destructive/10"
                                        >
                                            <Trash2 className="w-3.5 h-3.5 mr-1" />
                                            删除
                                        </Button>
                                    </div>
                                </div>
                            ))}

                            {filteredAnnouncements.length === 0 && (
                                <div className="text-center py-12 text-muted-foreground flex flex-col items-center gap-2">
                                    <Search className="w-8 h-8 opacity-30" />
                                    <p>暂无符合条件的公告</p>
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>发布公告</DialogTitle>
                        <DialogDescription>创建公告草稿或立即发布给指定目标用户。</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="title">标题</Label>
                            <Input
                                id="title"
                                data-testid="announcement-create-title"
                                placeholder="请输入公告标题"
                                value={newAnnouncement.title}
                                onChange={(e) => setNewAnnouncement({ ...newAnnouncement, title: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="content">内容</Label>
                            <div data-testid="announcement-create-content">
                                <RichTextEditor
                                    id="content"
                                    placeholder="请输入公告内容"
                                    value={newAnnouncement.content}
                                    onChange={(value) => setNewAnnouncement({ ...newAnnouncement, content: value })}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>发布范围</Label>
                            <Select value={newAnnouncement.targetScope} onValueChange={(v) => setNewAnnouncement({ ...newAnnouncement, targetScope: v })}>
                                <SelectTrigger data-testid="announcement-create-target-scope">
                                    <SelectValue placeholder="选择发布范围" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectItem value="all">全体用户</SelectItem>
                                        <SelectItem value="teacher">仅教师</SelectItem>
                                        <SelectItem value="student">仅学生</SelectItem>
                                        <SelectItem value="assistant">仅助教</SelectItem>
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="ghost" onClick={() => setShowAddModal(false)} disabled={submitting}>
                            取消
                        </Button>
                        <Button
                            data-testid="announcement-create-draft"
                            variant="outline"
                            onClick={() => handleAddAnnouncement(false)}
                            disabled={submitting || !newAnnouncement.title.trim() || !newAnnouncement.content.trim()}
                        >
                            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            <Archive className="w-4 h-4 mr-1" />
                            保存草稿
                        </Button>
                        <Button
                            data-testid="announcement-create-publish"
                            onClick={() => handleAddAnnouncement(true)}
                            disabled={submitting || !newAnnouncement.title.trim() || !newAnnouncement.content.trim()}
                        >
                            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            <Send className="w-4 h-4 mr-1" />
                            立即发布
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>编辑公告</DialogTitle>
                        <DialogDescription>更新公告标题和正文内容，已发布状态保持不变。</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="editTitle">标题</Label>
                            <Input
                                id="editTitle"
                                data-testid="announcement-edit-title"
                                placeholder="请输入公告标题"
                                value={editForm.title}
                                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="editContent">内容</Label>
                            <div data-testid="announcement-edit-content">
                                <RichTextEditor
                                    id="editContent"
                                    placeholder="请输入公告内容"
                                    value={editForm.content}
                                    onChange={(value) => setEditForm({ ...editForm, content: value })}
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setShowEditModal(false)} disabled={submitting}>
                            取消
                        </Button>
                        <Button
                            data-testid="announcement-edit-submit"
                            onClick={handleEditAnnouncement}
                            disabled={submitting || !editForm.title.trim()}
                        >
                            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            保存
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showStatsModal} onOpenChange={setShowStatsModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>公告阅读统计</DialogTitle>
                        <DialogDescription>查看当前公告的阅读人数、阅读率和按角色分布。</DialogDescription>
                    </DialogHeader>
                    <div className="py-6">
                        {statsLoading ? (
                            <div className="flex justify-center">
                                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                            </div>
                        ) : currentStats ? (
                            <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-card p-4 flex flex-col items-center border border-border">
                                        <Users className="w-5 h-5 text-muted-foreground mb-2" />
                                        <span className="text-2xl font-bold">{currentStats.totalCount}</span>
                                        <span className="text-xs text-muted-foreground">总人数</span>
                                    </div>
                                    <div className="bg-card p-4 flex flex-col items-center border border-border">
                                        <Eye className="w-5 h-5 text-muted-foreground mb-2" />
                                        <span className="text-2xl font-bold text-emerald-600">{currentStats.readCount}</span>
                                        <span className="text-xs text-muted-foreground">已阅读</span>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">阅读率</span>
                                        <span className="font-bold">{currentStats.readRate}%</span>
                                    </div>
                                    <Progress value={currentStats.readRate} className="h-3 [&>div]:bg-emerald-500" />
                                </div>
                                {currentStats.byRole && currentStats.byRole.length > 0 && (
                                    <div className="space-y-3">
                                        <h4 className="text-sm font-medium text-muted-foreground border-b border-border pb-2">按角色分类</h4>
                                        {currentStats.byRole.map((role) => (
                                            <div key={role.role} className="flex items-center justify-between text-sm bg-card p-3 border border-border">
                                                <span>{role.role}</span>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-muted-foreground">{role.readCount} / {role.totalCount}</span>
                                                    <span className="text-xs text-muted-foreground font-mono w-12 text-right">
                                                        {role.totalCount > 0 ? Math.round((role.readCount / role.totalCount) * 100) : 0}%
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-center text-muted-foreground">暂无统计数据</div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" data-testid="announcement-stats-close" onClick={() => setShowStatsModal(false)}>关闭</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {dialog}
        </div>
    );
}
