import { RequestError } from "@/components/RequestError";
import { requireApiData, useAsyncLoad } from "@/hooks/useAsyncLoad";
import { useEffect, useRef, useState } from "react";
import { Loader2, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { RichTextEditor } from "@/components/RichTextEditor";
import { StatusBadge } from "@/components/StatusBadge";
import { Button, IconButton } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { announcementApi, type Announcement } from "../api-client";

const emptyForm = {
    title: "",
    content: "",
    targetScope: "all" as "all" | "teacher" | "student",
};

export function AnnouncementManagement() {
    const [rows, setRows] = useState<Announcement[]>([]);
    const { loading, error: loadError, run } = useAsyncLoad("公告加载失败");
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Announcement | null>(null);
    const [form, setForm] = useState(emptyForm);
    const [submitting, setSubmitting] = useState(false);
    const pending = useRef(false);

    const load = async () => {
        return run(async () => requireApiData(await announcementApi.list(), "公告加载失败"), setRows);
    };

    useEffect(() => {
        void load();
    }, []);

    const save = async (publish: boolean) => {
        if (pending.current) return;
        pending.current = true;
        setSubmitting(true);
        try {
            const response = editing
                ? await announcementApi.update(editing.id, { ...form, status: publish ? 1 : 0 })
                : await announcementApi.create({ ...form, publish });
            if (!response.success) {
                toast.error(response.error?.message ?? "保存失败");
                return;
            }
            setOpen(false);
            setEditing(null);
            setForm(emptyForm);
            toast.success(publish ? "公告已发布" : "草稿已保存");
            void load();
        } finally {
            pending.current = false;
            setSubmitting(false);
        }
    };

    return (
        <Card>
            <CardHeader className="flex-row items-center justify-between">
                <div>
                    <CardTitle>公告管理</CardTitle>
                    <p className="mt-1 text-label text-muted-foreground">公告按管理员选择的对象直接展示，不记录已读状态。</p>
                </div>
                <Button onClick={() => {
                    setEditing(null);
                    setForm(emptyForm);
                    setOpen(true);
                }}>
                    <Plus className="mr-2 h-4 w-4" />新建公告
                </Button>
            </CardHeader>
            <CardContent>
                {loadError ? <RequestError message={loadError} onRetry={() => void load()} /> : loading ? (
                    <div className="grid place-items-center py-12" role="status" aria-label="正在加载公告">
                        <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin" />
                    </div>
                ) : (
                    <div className="space-y-3">
                        {rows.map((item) => (
                            <div key={item.id} className="flex gap-3 rounded-surface border border-border p-4 flex-row items-center">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <h2 className="truncate font-medium">{item.title}</h2>
                                        <StatusBadge intent={item.status === 1 ? "success" : "neutral"}>
                                            {item.status === 1 ? "已发布" : "草稿"}
                                        </StatusBadge>
                                    </div>
                                    <p className="mt-1 text-meta text-muted-foreground">
                                        对象：{{ all: "全部", teacher: "教师", student: "学生" }[item.targetScope]}
                                        {" · "}
                                        {formatDateTimeDisplay(item.createdAt, "-")}
                                    </p>
                                </div>
                                <div className="flex gap-1">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            setEditing(item);
                                            setForm({
                                                title: item.title,
                                                content: item.content,
                                                targetScope: item.targetScope,
                                            });
                                            setOpen(true);
                                        }}
                                    >
                                        <Pencil className="mr-1 h-4 w-4" />编辑
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={async () => {
                                            const response = item.status === 1
                                                ? await announcementApi.unpublish(item.id)
                                                : await announcementApi.publish(item.id);
                                            if (response.success) void load();
                                        }}
                                    >
                                        <Send className="mr-1 h-4 w-4" />
                                        {item.status === 1 ? "撤下" : "发布"}
                                    </Button>
                                    <IconButton
                                        aria-label={`删除公告：${item.title}`}
                                        title={`删除公告：${item.title}`}
                                        variant="ghost"
                                        size="icon-sm"
                                        className="text-destructive"
                                        onClick={async () => {
                                            if (!window.confirm("确定删除这条公告吗？")) return;
                                            const response = await announcementApi.delete(item.id);
                                            if (response.success) void load();
                                        }}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </IconButton>
                                </div>
                            </div>
                        ))}
                        {!rows.length && (
                            <p className="py-10 text-center text-label text-muted-foreground">暂无公告</p>
                        )}
                    </div>
                )}
            </CardContent>

            <Dialog
                open={open}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen && pending.current) return;
                    setOpen(nextOpen);
                }}
            >
                <DialogContent className="max-w-2xl" showCloseButton={!submitting}>
                    <DialogHeader>
                        <DialogTitle>{editing ? "编辑公告" : "新建公告"}</DialogTitle>
                        <DialogDescription>填写公告标题、展示对象和正文，可保存草稿或直接发布。</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="announcement-title">标题</Label>
                            <Input
                                id="announcement-title"
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
                                <SelectTrigger id="announcement-target" aria-label="公告展示对象">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">全部用户</SelectItem>
                                    <SelectItem value="teacher">仅教师</SelectItem>
                                    <SelectItem value="student">仅学生</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="announcement-content">内容</Label>
                            <RichTextEditor
                                id="announcement-content"
                                value={form.content}
                                onChange={(content) => setForm({ ...form, content })}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            disabled={submitting}
                            onClick={() => setOpen(false)}
                        >
                            取消
                        </Button>
                        <Button
                            variant="secondary"
                            disabled={submitting || !form.title.trim() || !form.content.trim()}
                            onClick={() => void save(false)}
                        >
                            保存草稿
                        </Button>
                        <Button
                            disabled={submitting || !form.title.trim() || !form.content.trim()}
                            onClick={() => void save(true)}
                        >
                            发布
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
