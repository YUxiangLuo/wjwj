import { RequestError } from "@/components/RequestError";
import { LoadingStatus } from "@/components/LoadingStatus";
import { PageHeader } from "@/components/PageHeader";
import { RichTextContent } from "@/components/RichTextContent";
import { requireApiData, useAsyncLoad } from "@/hooks/useAsyncLoad";
import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, Pencil, Plus, Search, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { RichTextEditor } from "@/components/RichTextEditor";
import { StatusBadge } from "@/components/StatusBadge";
import { Button, IconButton } from "@/components/ui/button";
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { formatDateTimeDisplay } from "@/utils/format";
import { getRichTextPlainText } from "@/utils/rich-text";
import { announcementApi, type Announcement } from "../api-client";

const emptyForm = {
    title: "",
    content: "",
    targetScope: "all" as "all" | "teacher" | "student",
};

const targetScopeLabels: Record<Announcement["targetScope"], string> = {
    all: "对象：全部用户",
    teacher: "对象：仅教师",
    student: "对象：仅学生",
};

export function AnnouncementManagement() {
    const [rows, setRows] = useState<Announcement[]>([]);
    const { loading, error: loadError, run } = useAsyncLoad("公告加载失败");
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Announcement | null>(null);
    const [form, setForm] = useState(emptyForm);
    const [showPreview, setShowPreview] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [announcementToDelete, setAnnouncementToDelete] = useState<Announcement | null>(null);
    const [deletePending, setDeletePending] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft">("all");
    const [scopeFilter, setScopeFilter] = useState<"all_scopes" | Announcement["targetScope"]>("all_scopes");
    const pending = useRef(false);
    const createAnnouncementBtnRef = useRef<HTMLButtonElement>(null);
    const statusPending = useRef(new Set<number>());
    const [statusPendingIds, setStatusPendingIds] = useState(new Set<number>());

    const requestOpenChange = (nextOpen: boolean) => {
        if (!nextOpen && pending.current) return;
        const initial = editing ?? emptyForm;
        const dirty = form.title !== initial.title || form.content !== initial.content || form.targetScope !== initial.targetScope;
        if (!nextOpen && dirty && !window.confirm("关闭会丢弃公告未保存的修改。确定关闭吗？")) return;
        if (!nextOpen) {
            setShowPreview(false);
        }
        setOpen(nextOpen);
    };

    const load = async () => {
        return run(async () => requireApiData(await announcementApi.list(), "公告加载失败"), setRows);
    };

    useEffect(() => {
        void load();
    }, []);

    const save = async (publish: boolean) => {
        if (pending.current) return;
        if (!form.title.trim() || !getRichTextPlainText(form.content)) {
            toast.error("公告标题或内容无效");
            return;
        }
        pending.current = true;
        setSubmitting(true);
        try {
            const response = editing
                ? await announcementApi.update(editing.id, {
                    ...(form.title !== editing.title ? { title: form.title } : {}),
                    ...(form.content !== editing.content ? { content: form.content } : {}),
                    ...(form.targetScope !== editing.targetScope ? { targetScope: form.targetScope } : {}),
                    status: publish ? 1 : 0,
                })
                : await announcementApi.create({ ...form, publish });
            if (!response.success) {
                toast.error(response.error?.message ?? "保存失败");
                return;
            }
            setOpen(false);
            setEditing(null);
            setForm(emptyForm);
            setShowPreview(false);
            toast.success(publish ? "公告已发布" : "草稿已保存");
            void load();
        } catch {
            toast.error("保存失败，请重试");
        } finally {
            pending.current = false;
            setSubmitting(false);
        }
    };

    const changeStatus = async (item: Announcement) => {
        if (statusPending.current.has(item.id)) return;
        statusPending.current.add(item.id);
        setStatusPendingIds(new Set(statusPending.current));
        try {
            const response = item.status === 1
                ? await announcementApi.unpublish(item.id)
                : await announcementApi.publish(item.id);
            if (!response.success) {
                toast.error(response.error?.message ?? "公告状态修改失败，请重试");
                return;
            }
            toast.success(item.status === 1 ? "公告已撤下" : "公告已发布");
            await load();
        } catch {
            toast.error("公告状态修改失败，请重试");
        } finally {
            statusPending.current.delete(item.id);
            setStatusPendingIds(new Set(statusPending.current));
        }
    };

    const deleteAnnouncement = async () => {
        if (!announcementToDelete || deletePending) return;
        setDeletePending(true);
        try {
            const response = await announcementApi.delete(announcementToDelete.id);
            if (!response.success) {
                toast.error(response.error?.message ?? "删除失败");
                return;
            }
            setAnnouncementToDelete(null);
            toast.success("公告已删除");
            void load();
        } finally {
            setDeletePending(false);
        }
    };

    const summary = useMemo(() => {
        const total = rows.length;
        const published = rows.filter((item) => item.status === 1).length;
        return { total, published, draft: total - published };
    }, [rows]);

    const hasFilters = Boolean(searchTerm.trim()) || statusFilter !== "all" || scopeFilter !== "all_scopes";

    const clearFilters = () => {
        setSearchTerm("");
        setStatusFilter("all");
        setScopeFilter("all_scopes");
    };

    const filteredRows = useMemo(() => {
        const keyword = searchTerm.trim().toLowerCase();
        return rows.filter((item) => {
            if (statusFilter === "published" && item.status !== 1) return false;
            if (statusFilter === "draft" && item.status !== 0) return false;
            if (scopeFilter !== "all_scopes" && item.targetScope !== scopeFilter) return false;
            if (!keyword) return true;
            const plain = getRichTextPlainText(item.content).toLowerCase();
            return item.title.toLowerCase().includes(keyword) || plain.includes(keyword);
        });
    }, [rows, scopeFilter, searchTerm, statusFilter]);

    const hasValidBody = Boolean(getRichTextPlainText(form.content));

    return (
        <div className="space-y-4">
            <PageHeader border={false}>
                <div>
                    <h2 className="text-subheading font-medium text-foreground">公告管理</h2>
                    <p className="mt-0.5 text-label text-muted-foreground">面向全平台、教师端或学生端发布通知公告，公告向所选对象展示且不记录已读状态。</p>
                </div>
                <Button ref={createAnnouncementBtnRef} type="button" onClick={() => {
                    setEditing(null);
                    setForm(emptyForm);
                    setShowPreview(false);
                    setOpen(true);
                }}>
                    <Plus className="h-4 w-4" aria-hidden="true" />新建公告
                </Button>
            </PageHeader>

            <section
                aria-labelledby="announcement-list-heading"
                className="overflow-hidden rounded-surface border border-border bg-card"
            >
                <dl aria-label="公告概览" className="grid grid-cols-3 divide-x divide-border border-b border-border bg-muted px-4 py-2.5">
                    <div className="flex items-baseline justify-between gap-2 pr-3">
                        <dt className="text-meta text-muted-foreground">公告总数</dt>
                        <dd className="text-label font-medium tabular-nums text-foreground">{loading || loadError ? "-" : summary.total}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-2 px-3">
                        <dt className="text-meta text-muted-foreground">已发布</dt>
                        <dd className="text-label font-medium tabular-nums text-foreground">{loading || loadError ? "-" : summary.published}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-2 pl-3">
                        <dt className="text-meta text-muted-foreground">草稿</dt>
                        <dd className="text-label font-medium tabular-nums text-foreground">{loading || loadError ? "-" : summary.draft}</dd>
                    </div>
                </dl>

                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                    <div className="flex items-baseline gap-2.5">
                        <h3 id="announcement-list-heading" className="text-body font-medium text-foreground">公告列表</h3>
                        <span className="text-meta tabular-nums text-muted-foreground">
                            {loading || loadError ? "共 - 条公告" : `共 ${filteredRows.length} 条公告`}
                        </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Input
                            placeholder="搜索公告标题或正文..."
                            aria-label="搜索公告标题或正文"
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            className="w-52"
                        />
                        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
                            <SelectTrigger aria-label="按公告状态筛选" className="w-32">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部状态</SelectItem>
                                <SelectItem value="published">已发布</SelectItem>
                                <SelectItem value="draft">草稿</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={scopeFilter} onValueChange={(value) => setScopeFilter(value as typeof scopeFilter)}>
                            <SelectTrigger aria-label="按展示对象筛选" className="w-36">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all_scopes">全部对象</SelectItem>
                                <SelectItem value="all">全部用户</SelectItem>
                                <SelectItem value="teacher">仅教师</SelectItem>
                                <SelectItem value="student">仅学生</SelectItem>
                            </SelectContent>
                        </Select>
                        {hasFilters && (
                            <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                                清除筛选
                            </Button>
                        )}
                    </div>
                </div>

                {loadError ? (
                    <div className="p-4">
                        <RequestError message={loadError} onRetry={() => void load()} />
                    </div>
                ) : loading ? (
                    <LoadingStatus className="py-12" label="正在加载公告" />
                ) : filteredRows.length > 0 ? (
                    <div className="divide-y divide-border">
                        {filteredRows.map((item) => (
                            <article key={item.id} className="flex flex-row items-start justify-between gap-4 px-4 py-3.5 hover:bg-muted">
                                <div className="min-w-0 flex-1 space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h4 className="truncate text-body font-medium text-foreground">{item.title}</h4>
                                        <StatusBadge intent={item.status === 1 ? "success" : "neutral"}>
                                            {item.status === 1 ? "已发布" : "草稿"}
                                        </StatusBadge>
                                        <span className="text-meta text-muted-foreground">
                                            {targetScopeLabels[item.targetScope]}
                                        </span>
                                        <span aria-hidden="true" className="text-meta text-muted-foreground">·</span>
                                        <time className="text-meta tabular-nums text-muted-foreground">
                                            {formatDateTimeDisplay(item.createdAt, "-")}
                                        </time>
                                    </div>
                                    <RichTextContent html={item.content} className="line-clamp-2 text-label text-muted-foreground" />
                                </div>
                                <div className="flex shrink-0 items-center gap-1.5">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 px-2.5"
                                        onClick={() => {
                                            setEditing(item);
                                            setForm({
                                                title: item.title,
                                                content: item.content,
                                                targetScope: item.targetScope,
                                            });
                                            setShowPreview(false);
                                            setOpen(true);
                                        }}
                                    >
                                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />编辑
                                    </Button>
                                    <Button
                                        type="button"
                                        variant={item.status === 1 ? "ghost" : "secondary"}
                                        size="sm"
                                        className={item.status === 1 ? "h-8 px-2.5" : "h-8 px-3"}
                                        disabled={statusPendingIds.has(item.id)}
                                        onClick={() => void changeStatus(item)}
                                    >
                                        <Send className="h-3.5 w-3.5" aria-hidden="true" />
                                        {item.status === 1 ? "撤下" : "发布"}
                                    </Button>
                                    <IconButton
                                        type="button"
                                        aria-label={`删除公告：${item.title}`}
                                        title={`删除公告：${item.title}`}
                                        variant="ghost"
                                        size="icon-sm"
                                        className="text-destructive hover:bg-destructive-muted hover:text-destructive"
                                        onClick={() => setAnnouncementToDelete(item)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </IconButton>
                                </div>
                            </article>
                        ))}
                    </div>
                ) : hasFilters && rows.length > 0 ? (
                    <div className="flex flex-col items-center gap-2.5 py-12 text-center">
                        <div className="flex h-10 w-10 items-center justify-center rounded-surface bg-muted text-muted-foreground">
                            <Search className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <p className="text-label font-medium text-foreground">没有符合筛选条件的公告</p>
                        <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                            清除筛选
                        </Button>
                    </div>
                ) : (
                    <p className="py-12 text-center text-label text-muted-foreground">暂无公告</p>
                )}
            </section>

            <Dialog
                open={open}
                onOpenChange={requestOpenChange}
            >
                <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-2xl flex-col" showCloseButton={!submitting}>
                    <DialogHeader className="shrink-0">
                        <DialogTitle>{editing ? "编辑公告" : "新建公告"}</DialogTitle>
                        <DialogDescription>填写公告标题、展示对象和正文，可先预览展示效果再保存草稿或直接发布。</DialogDescription>
                    </DialogHeader>
                    <div className="min-h-0 min-w-0 space-y-4 overflow-y-auto py-1">
                        <div className="grid grid-cols-[1fr_11rem] gap-3">
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="announcement-title">标题</Label>
                                    <span className="text-meta tabular-nums text-muted-foreground">{form.title.length}/100</span>
                                </div>
                                <Input
                                    id="announcement-title"
                                    maxLength={100}
                                    placeholder="请输入公告标题"
                                    value={form.title}
                                    onChange={(event) => setForm({ ...form, title: event.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="announcement-target">展示对象</Label>
                                <Select
                                    value={form.targetScope}
                                    onValueChange={(value) => setForm({
                                        ...form,
                                        targetScope: value as typeof form.targetScope,
                                    })}
                                >
                                    <SelectTrigger id="announcement-target" aria-label="公告展示对象" className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">全部用户</SelectItem>
                                        <SelectItem value="teacher">仅教师</SelectItem>
                                        <SelectItem value="student">仅学生</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="announcement-content">内容</Label>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    aria-pressed={showPreview}
                                    onClick={() => setShowPreview((prev) => !prev)}
                                    className="h-8 px-2.5"
                                >
                                    {showPreview ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
                                    {showPreview ? "收起预览" : "展示效果预览"}
                                </Button>
                            </div>
                            <RichTextEditor
                                id="announcement-content"
                                value={form.content}
                                onChange={(content) => setForm({ ...form, content })}
                                editorClassName="[overflow-wrap:anywhere]"
                            />
                        </div>
                        {showPreview ? (
                            <div data-testid="announcement-live-preview" className="space-y-2 rounded-surface border border-border bg-muted p-4">
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-body font-medium text-foreground">
                                            {form.title.trim() || "（未填写标题）"}
                                        </span>
                                        <StatusBadge intent="neutral">
                                            {targetScopeLabels[form.targetScope]}
                                        </StatusBadge>
                                    </div>
                                    <span className="text-meta text-muted-foreground">门户展示预览</span>
                                </div>
                                {hasValidBody ? (
                                    <RichTextContent html={form.content} className="text-label text-foreground" />
                                ) : (
                                    <p className="text-label text-muted-foreground">（暂无正文内容）</p>
                                )}
                            </div>
                        ) : (
                            <p className="rounded-surface border border-border bg-muted px-3.5 py-2.5 text-meta text-muted-foreground">
                                已发布公告将立即展示在所选对象的门户首页，随时可在列表中撤下转为草稿。
                            </p>
                        )}
                    </div>
                    <DialogFooter className="shrink-0">
                        <Button
                            type="button"
                            variant="outline"
                            disabled={submitting}
                            onClick={() => requestOpenChange(false)}
                        >
                            取消
                        </Button>
                        <Button
                            type="button"
                            variant="secondary"
                            disabled={submitting || !form.title.trim() || !hasValidBody}
                            onClick={() => void save(false)}
                        >
                            保存草稿
                        </Button>
                        <Button
                            type="button"
                            disabled={submitting || !form.title.trim() || !hasValidBody}
                            onClick={() => void save(true)}
                        >
                            发布
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog
                open={announcementToDelete !== null}
                fallbackFocusRef={createAnnouncementBtnRef}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen && !deletePending) setAnnouncementToDelete(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>永久删除公告？</AlertDialogTitle>
                        <AlertDialogDescription>
                            {announcementToDelete
                                ? `将永久删除「${announcementToDelete.title}」（${announcementToDelete.status === 1 ? "已发布" : "草稿"}）。此操作不可恢复。`
                                : null}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel variant="outline" disabled={deletePending}>取消</AlertDialogCancel>
                        <Button type="button" variant="destructive" disabled={deletePending} onClick={() => void deleteAnnouncement()}>
                            {deletePending ? "删除中…" : "永久删除"}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
