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
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, MoreHorizontal, Eye, EyeOff, BarChart2, Trash2 } from 'lucide-react'
import { mockAnnouncements } from '@/data/mock'
import type { Announcement } from '@/types'

export function AnnouncementsPage() {
    const [announcements, setAnnouncements] = useState<Announcement[]>(mockAnnouncements)
    const [addOpen, setAddOpen] = useState(false)
    const [newAnnouncement, setNewAnnouncement] = useState({ title: '', content: '' })

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
    }

    const toggleStatus = (id: number) => {
        setAnnouncements(
            announcements.map((a) =>
                a.id === id ? { ...a, status: a.status === 1 ? 0 : 1 } : a
            )
        )
    }

    const handleDelete = (id: number) => {
        setAnnouncements(announcements.filter((a) => a.id !== id))
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
                                                <DropdownMenuItem>
                                                    <BarChart2 className="mr-2 h-4 w-4" />
                                                    查看统计
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => toggleStatus(announcement.id)}>
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
                                                    onClick={() => handleDelete(announcement.id)}
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
