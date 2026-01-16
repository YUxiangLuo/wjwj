import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, MoreHorizontal, Eye, EyeOff, BarChart2, Trash2, Pencil } from 'lucide-react'
import { mockAnnouncements } from '@/data/mock'
import type { Announcement } from '@/types'
import { toast } from 'sonner'

// Mock read statistics data
const mockReadStats = {
    admin: { read: 1, total: 1 },
    teacher: { read: 12, total: 15 },
    assistant: { read: 5, total: 8 },
    student: { read: 109, total: 226 },
}

export function AnnouncementsPage() {
    const [announcements, setAnnouncements] = useState<Announcement[]>(mockAnnouncements)
    const [addOpen, setAddOpen] = useState(false)
    const [editOpen, setEditOpen] = useState(false)
    const [statsOpen, setStatsOpen] = useState(false)
    const [deleteOpen, setDeleteOpen] = useState(false)
    const [newAnnouncement, setNewAnnouncement] = useState({ title: '', content: '' })
    const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null)
    const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null)

    const handleAdd = () => {
        if (!newAnnouncement.title.trim() || !newAnnouncement.content.trim()) return
        const newItem: Announcement = {
            id: announcements.length + 1,
            title: newAnnouncement.title,
            content: newAnnouncement.content,
            status: 1,
            readCount: 0,
            totalCount: 250,
            createdAt: new Date().toLocaleString('zh-CN'),
        }
        setAnnouncements([newItem, ...announcements])
        setNewAnnouncement({ title: '', content: '' })
        setAddOpen(false)
        toast.success('发布成功', { description: '公告已发布' })
    }

    const openEdit = (announcement: Announcement) => {
        setEditingAnnouncement({ ...announcement })
        setEditOpen(true)
    }

    const handleEdit = () => {
        if (!editingAnnouncement) return
        setAnnouncements(
            announcements.map((a) =>
                a.id === editingAnnouncement.id ? editingAnnouncement : a
            )
        )
        setEditOpen(false)
        setEditingAnnouncement(null)
        toast.success('修改成功', { description: '公告已更新' })
    }

    const openStats = (announcement: Announcement) => {
        setSelectedAnnouncement(announcement)
        setStatsOpen(true)
    }

    const openDelete = (announcement: Announcement) => {
        setSelectedAnnouncement(announcement)
        setDeleteOpen(true)
    }

    const toggleStatus = (announcement: Announcement) => {
        const newStatus = announcement.status === 1 ? 0 : 1
        setAnnouncements(
            announcements.map((a) =>
                a.id === announcement.id ? { ...a, status: newStatus } : a
            )
        )
        toast.success(
            newStatus === 1 ? '已上架' : '已下架',
            { description: `公告已${newStatus === 1 ? '上架' : '下架'}` }
        )
    }

    const handleDelete = () => {
        if (!selectedAnnouncement) return
        setAnnouncements(announcements.filter((a) => a.id !== selectedAnnouncement.id))
        toast.success('删除成功', { description: '公告已删除' })
        setDeleteOpen(false)
        setSelectedAnnouncement(null)
    }

    const renderProgressBar = (read: number, total: number) => {
        const percentage = total > 0 ? Math.round((read / total) * 100) : 0
        return (
            <div className="flex items-center gap-2">
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${percentage}%` }}
                    />
                </div>
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                    {read}/{total} ({percentage}%)
                </span>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">公告管理</h1>
                    <p className="text-muted-foreground">管理系统公告</p>
                </div>
                <Dialog open={addOpen} onOpenChange={setAddOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            发布公告
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-lg">
                        <DialogHeader>
                            <DialogTitle>发布新公告</DialogTitle>
                            <DialogDescription>公告将立即发布给所有用户</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="title">标题</Label>
                                <Input
                                    id="title"
                                    placeholder="输入公告标题"
                                    value={newAnnouncement.title}
                                    onChange={(e) =>
                                        setNewAnnouncement({ ...newAnnouncement, title: e.target.value })
                                    }
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="content">内容</Label>
                                <textarea
                                    id="content"
                                    className="min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    placeholder="输入公告内容..."
                                    value={newAnnouncement.content}
                                    onChange={(e) =>
                                        setNewAnnouncement({ ...newAnnouncement, content: e.target.value })
                                    }
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setAddOpen(false)}>
                                取消
                            </Button>
                            <Button onClick={handleAdd}>发布</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Edit Dialog */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>编辑公告</DialogTitle>
                        <DialogDescription>修改公告内容</DialogDescription>
                    </DialogHeader>
                    {editingAnnouncement && (
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="editTitle">标题</Label>
                                <Input
                                    id="editTitle"
                                    value={editingAnnouncement.title}
                                    onChange={(e) =>
                                        setEditingAnnouncement({ ...editingAnnouncement, title: e.target.value })
                                    }
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="editContent">内容</Label>
                                <textarea
                                    id="editContent"
                                    className="min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    value={editingAnnouncement.content}
                                    onChange={(e) =>
                                        setEditingAnnouncement({ ...editingAnnouncement, content: e.target.value })
                                    }
                                />
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditOpen(false)}>
                            取消
                        </Button>
                        <Button onClick={handleEdit}>保存</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Stats Dialog */}
            <Dialog open={statsOpen} onOpenChange={setStatsOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>阅读统计</DialogTitle>
                        <DialogDescription>{selectedAnnouncement?.title}</DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="text-center mb-6">
                            <div className="text-3xl font-bold">
                                {selectedAnnouncement?.readCount} / {selectedAnnouncement?.totalCount}
                            </div>
                            <p className="text-sm text-muted-foreground">
                                总阅读率 {selectedAnnouncement ? Math.round((selectedAnnouncement.readCount / selectedAnnouncement.totalCount) * 100) : 0}%
                            </p>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <div className="flex justify-between text-sm mb-1">
                                    <span>管理员</span>
                                    <span className="text-muted-foreground">{mockReadStats.admin.read}/{mockReadStats.admin.total}</span>
                                </div>
                                {renderProgressBar(mockReadStats.admin.read, mockReadStats.admin.total)}
                            </div>
                            <div>
                                <div className="flex justify-between text-sm mb-1">
                                    <span>教师</span>
                                    <span className="text-muted-foreground">{mockReadStats.teacher.read}/{mockReadStats.teacher.total}</span>
                                </div>
                                {renderProgressBar(mockReadStats.teacher.read, mockReadStats.teacher.total)}
                            </div>
                            <div>
                                <div className="flex justify-between text-sm mb-1">
                                    <span>助教</span>
                                    <span className="text-muted-foreground">{mockReadStats.assistant.read}/{mockReadStats.assistant.total}</span>
                                </div>
                                {renderProgressBar(mockReadStats.assistant.read, mockReadStats.assistant.total)}
                            </div>
                            <div>
                                <div className="flex justify-between text-sm mb-1">
                                    <span>学生</span>
                                    <span className="text-muted-foreground">{mockReadStats.student.read}/{mockReadStats.student.total}</span>
                                </div>
                                {renderProgressBar(mockReadStats.student.read, mockReadStats.student.total)}
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setStatsOpen(false)}>关闭</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Alert */}
            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>删除公告</AlertDialogTitle>
                        <AlertDialogDescription>
                            确定要删除公告 <span className="font-medium text-foreground">"{selectedAnnouncement?.title}"</span> 吗？
                            此操作不可撤销。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive hover:bg-destructive/90"
                        >
                            删除
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Card>
                <CardHeader>
                    <CardTitle>公告列表</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>标题</TableHead>
                                <TableHead>状态</TableHead>
                                <TableHead>发布时间</TableHead>
                                <TableHead>阅读统计</TableHead>
                                <TableHead className="text-right">操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {announcements.map((announcement) => (
                                <TableRow key={announcement.id}>
                                    <TableCell className="font-medium max-w-xs truncate">
                                        {announcement.title}
                                    </TableCell>
                                    <TableCell>
                                        {announcement.status === 1 ? (
                                            <Badge className="bg-green-500">已发布</Badge>
                                        ) : (
                                            <Badge variant="secondary">已下架</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell>{announcement.createdAt}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-primary"
                                                    style={{
                                                        width: `${(announcement.readCount / announcement.totalCount) * 100}%`,
                                                    }}
                                                />
                                            </div>
                                            <span className="text-sm text-muted-foreground">
                                                {announcement.readCount}/{announcement.totalCount} (
                                                {Math.round((announcement.readCount / announcement.totalCount) * 100)}%)
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => openEdit(announcement)}>
                                                    <Pencil className="mr-2 h-4 w-4" />
                                                    编辑
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => openStats(announcement)}>
                                                    <BarChart2 className="mr-2 h-4 w-4" />
                                                    查看统计
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => toggleStatus(announcement)}>
                                                    {announcement.status === 1 ? (
                                                        <>
                                                            <EyeOff className="mr-2 h-4 w-4" />
                                                            下架
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Eye className="mr-2 h-4 w-4" />
                                                            上架
                                                        </>
                                                    )}
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    className="text-destructive"
                                                    onClick={() => openDelete(announcement)}
                                                >
                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                    删除
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
