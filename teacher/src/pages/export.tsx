import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Download, Eye } from 'lucide-react'
import { mockClasses, mockTopics, mockGradeRecords } from '@/data/mock'
import { toast } from 'sonner'

export function ExportPage() {
    const [selectedClass, setSelectedClass] = useState<string>('')
    const [selectedTopic, setSelectedTopic] = useState<string>('all')
    const [showPreview, setShowPreview] = useState(false)

    const filteredRecords = mockGradeRecords.filter((r) => {
        if (selectedTopic !== 'all' && r.topicName !== selectedTopic) return false
        return true
    })

    const handlePreview = () => {
        if (!selectedClass) {
            toast.error('请选择班级')
            return
        }
        setShowPreview(true)
    }

    const handleExport = () => {
        if (!selectedClass) {
            toast.error('请选择班级')
            return
        }
        toast.success('导出成功', { description: '成绩表已开始下载' })
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">成绩导出</h1>
                <p className="text-muted-foreground">导出学生成绩数据</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>筛选条件</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="grid gap-2">
                            <Label>选择班级（必选）</Label>
                            <Select value={selectedClass} onValueChange={setSelectedClass}>
                                <SelectTrigger>
                                    <SelectValue placeholder="请选择班级" />
                                </SelectTrigger>
                                <SelectContent>
                                    {mockClasses.map((cls) => (
                                        <SelectItem key={cls.id} value={cls.name}>
                                            {cls.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid gap-2">
                            <Label>选择课题（可选）</Label>
                            <Select value={selectedTopic} onValueChange={setSelectedTopic}>
                                <SelectTrigger>
                                    <SelectValue placeholder="所有课题" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">所有课题</SelectItem>
                                    {mockTopics.filter(t => t.status === 1).map((topic) => (
                                        <SelectItem key={topic.id} value={topic.name}>
                                            {topic.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-end gap-2">
                            <Button variant="outline" onClick={handlePreview}>
                                <Eye className="mr-2 h-4 w-4" />
                                预览数据
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {showPreview && (
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>成绩预览</CardTitle>
                        <Button onClick={handleExport}>
                            <Download className="mr-2 h-4 w-4" />
                            导出 Excel
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>学号</TableHead>
                                    <TableHead>姓名</TableHead>
                                    <TableHead>课题</TableHead>
                                    <TableHead className="text-center">问卷设计</TableHead>
                                    <TableHead className="text-center">实验过程</TableHead>
                                    <TableHead className="text-center">报告撰写</TableHead>
                                    <TableHead className="text-center">总分</TableHead>
                                    <TableHead>状态</TableHead>
                                    <TableHead>提交时间</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredRecords.map((record, index) => (
                                    <TableRow key={index}>
                                        <TableCell className="font-medium">{record.studentId}</TableCell>
                                        <TableCell>{record.studentName}</TableCell>
                                        <TableCell>{record.topicName}</TableCell>
                                        <TableCell className="text-center">{record.questionnaireScore}</TableCell>
                                        <TableCell className="text-center">{record.processScore}</TableCell>
                                        <TableCell className="text-center">{record.reportScore}</TableCell>
                                        <TableCell className="text-center font-medium">{record.totalScore}</TableCell>
                                        <TableCell>{record.status}</TableCell>
                                        <TableCell>{record.submittedAt}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        {filteredRecords.length === 0 && (
                            <div className="text-center py-8 text-muted-foreground">
                                暂无成绩数据
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
