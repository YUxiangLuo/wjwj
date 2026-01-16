import { useState } from 'react'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Plus, FileText, Database, Paperclip, Eye, Pencil, Trash2, Send } from 'lucide-react'
import { Link } from 'react-router-dom'
import { mockTopics } from '@/data/mock'
import type { Topic } from '@/types'
import { toast } from 'sonner'

export function TopicsPage() {
    const [topics, setTopics] = useState<Topic[]>(mockTopics)
    const [filter, setFilter] = useState<string>('all')
    const [deleteOpen, setDeleteOpen] = useState(false)
    const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null)

    const filteredTopics = topics.filter((t) => {
        if (filter === 'all') return true
        if (filter === 'draft') return t.status === 0
        if (filter === 'published') return t.status === 1
        return true
    })

    const openDelete = (topic: Topic) => {
        setSelectedTopic(topic)
        setDeleteOpen(true)
    }

    const handleDelete = () => {
        if (!selectedTopic) return
        setTopics(topics.filter((t) => t.id !== selectedTopic.id))
        toast.success('删除成功', { description: `课题 ${selectedTopic.name} 已删除` })
        setDeleteOpen(false)
        setSelectedTopic(null)
    }

    const handlePublish = (topic: Topic) => {
        setTopics(topics.map((t) => (t.id === topic.id ? { ...t, status: 1 } : t)))
        toast.success('发布成功', { description: `课题 ${topic.name} 已发布` })
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">课题管理</h1>
                    <p className="text-muted-foreground">管理您创建的课题</p>
                </div>
                <Button asChild>
                    <Link to="/topics/create">
                        <Plus className="mr-2 h-4 w-4" />
                        创建课题
                    </Link>
                </Button>
            </div>

            {/* Delete Alert */}
            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>删除课题</AlertDialogTitle>
                        <AlertDialogDescription>
                            确定要删除课题 <span className="font-medium text-foreground">"{selectedTopic?.name}"</span> 吗？
                            此操作不可撤销。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                            删除
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Filter */}
            <div className="flex items-center gap-4">
                <Select value={filter} onValueChange={setFilter}>
                    <SelectTrigger className="w-40">
                        <SelectValue placeholder="筛选状态" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">全部</SelectItem>
                        <SelectItem value="draft">草稿</SelectItem>
                        <SelectItem value="published">已发布</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Topic Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredTopics.map((topic) => (
                    <Card key={topic.id}>
                        <CardHeader>
                            <div className="flex items-start justify-between">
                                <CardTitle className="flex items-center gap-2">
                                    <FileText className="h-5 w-5 text-primary" />
                                    <span className="line-clamp-1">{topic.name}</span>
                                </CardTitle>
                                {topic.status === 1 ? (
                                    <Badge className="bg-green-500">已发布</Badge>
                                ) : (
                                    <Badge variant="secondary">草稿</Badge>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <p className="text-sm text-muted-foreground line-clamp-2">
                                {topic.description}
                            </p>
                            <div className="flex items-center gap-4 text-sm">
                                <div className="flex items-center gap-1">
                                    <Database className="h-4 w-4 text-muted-foreground" />
                                    <span>
                                        {topic.dataRowCount > 0
                                            ? `${topic.dataRowCount.toLocaleString()} 行`
                                            : '未上传'}
                                    </span>
                                </div>
                                {topic.attachmentCount > 0 && (
                                    <div className="flex items-center gap-1">
                                        <Paperclip className="h-4 w-4 text-muted-foreground" />
                                        <span>{topic.attachmentCount} 个附件</span>
                                    </div>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                创建于 {topic.createdAt}
                            </p>
                        </CardContent>
                        <CardFooter className="flex gap-2">
                            {topic.status === 1 ? (
                                <>
                                    <Button variant="outline" size="sm" asChild>
                                        <Link to={`/topics/${topic.id}`}>
                                            <Eye className="mr-1 h-4 w-4" />
                                            查看
                                        </Link>
                                    </Button>
                                    <Button variant="outline" size="sm" asChild>
                                        <Link to={`/topics/${topic.id}/edit`}>
                                            <Pencil className="mr-1 h-4 w-4" />
                                            编辑
                                        </Link>
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <Button variant="outline" size="sm" asChild>
                                        <Link to={`/topics/${topic.id}/edit`}>
                                            <Pencil className="mr-1 h-4 w-4" />
                                            编辑
                                        </Link>
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handlePublish(topic)}
                                        disabled={topic.dataRowCount === 0}
                                    >
                                        <Send className="mr-1 h-4 w-4" />
                                        发布
                                    </Button>
                                </>
                            )}
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openDelete(topic)}
                            >
                                <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                        </CardFooter>
                    </Card>
                ))}
            </div>

            {filteredTopics.length === 0 && (
                <div className="text-center py-12">
                    <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium">暂无课题</h3>
                    <p className="text-muted-foreground">点击上方按钮创建您的第一个课题</p>
                </div>
            )}
        </div>
    )
}
