import { useParams, Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ArrowLeft, Calendar, FileText, Image, Video, Download, Eye, ArrowRight, Check } from 'lucide-react'

const mockTopicData = {
    id: 1,
    name: '消费者行为调查',
    deadline: '2024-03-31',
    daysRemaining: 16,
    populationSize: 10000,
    description: `本研究旨在了解城市消费者的购买行为和偏好。

您将设计一份问卷，确定适当的样本量，并执行三种不同的抽样方法，以分析哪种方法最能代表总体。

通过本实验，您将学习并实践：
1. 问卷设计的基本原则
2. 样本量计算的统计方法
3. 简单随机抽样、系统抽样和分层抽样的实施
4. 抽样结果的对比分析`,
    attachments: [
        { id: 1, name: 'research_background.pdf', size: '2.5 MB', type: 'pdf' },
        { id: 2, name: 'sample_demographics.png', size: '450 KB', type: 'image' },
        { id: 3, name: 'introduction_video.mp4', size: '125 MB', type: 'video' },
    ],
    currentStage: 2,
    status: 'in_progress',
}

const stages = [
    { id: 1, name: '问卷设计', shortName: '问卷' },
    { id: 2, name: '样本量规划', shortName: '样本量' },
    { id: 3, name: '抽样执行', shortName: '抽样' },
    { id: 4, name: '分析报告', shortName: '报告' },
]

export function TopicDetailPage() {
    const { taskId: _taskId } = useParams()
    const topic = mockTopicData

    const getFileIcon = (type: string) => {
        switch (type) {
            case 'pdf': return <FileText className="h-5 w-5 text-red-500" />
            case 'image': return <Image className="h-5 w-5 text-blue-500" />
            case 'video': return <Video className="h-5 w-5 text-purple-500" />
            default: return <FileText className="h-5 w-5" />
        }
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" asChild>
                    <Link to="/"><ArrowLeft className="h-5 w-5" /></Link>
                </Button>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold tracking-tight">{topic.name}</h1>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            截止: {topic.deadline}
                        </span>
                        <Badge variant="secondary">还剩 {topic.daysRemaining} 天</Badge>
                    </div>
                </div>
            </div>

            {/* Topic Info */}
            <Card>
                <CardHeader>
                    <CardTitle>课题背景</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="text-sm text-muted-foreground">
                        总体规模: <span className="font-medium text-foreground">{topic.populationSize.toLocaleString()}</span> 个样本
                    </div>
                    <div className="whitespace-pre-line text-sm leading-relaxed">{topic.description}</div>
                </CardContent>
            </Card>

            {/* Attachments */}
            <Card>
                <CardHeader>
                    <CardTitle>附件资料</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        {topic.attachments.map((file) => (
                            <div key={file.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                                <div className="flex items-center gap-3">
                                    {getFileIcon(file.type)}
                                    <div>
                                        <p className="text-sm font-medium">{file.name}</p>
                                        <p className="text-xs text-muted-foreground">{file.size}</p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    {file.type !== 'video' && (
                                        <Button variant="ghost" size="sm">
                                            <Eye className="h-4 w-4 mr-1" />
                                            预览
                                        </Button>
                                    )}
                                    <Button variant="ghost" size="sm">
                                        <Download className="h-4 w-4 mr-1" />
                                        下载
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Progress */}
            <Card>
                <CardHeader>
                    <CardTitle>实验进度</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Progress Bar */}
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">当前进度</span>
                            <span className="font-medium">{topic.currentStage}/4 阶段</span>
                        </div>
                        <Progress value={(topic.currentStage / 4) * 100} className="h-2" />
                    </div>

                    {/* Stage Steps */}
                    <div className="flex items-center justify-between">
                        {stages.map((stage, index) => (
                            <div key={stage.id} className="flex items-center">
                                <div className="flex flex-col items-center">
                                    <div
                                        className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium ${topic.currentStage > stage.id
                                            ? 'bg-green-500 text-white'
                                            : topic.currentStage === stage.id
                                                ? 'bg-primary text-primary-foreground'
                                                : 'bg-muted text-muted-foreground'
                                            }`}
                                    >
                                        {topic.currentStage > stage.id ? <Check className="h-5 w-5" /> : stage.id}
                                    </div>
                                    <span className="text-xs mt-2 text-center">{stage.shortName}</span>
                                </div>
                                {index < stages.length - 1 && (
                                    <div
                                        className={`w-12 h-0.5 mx-1 ${topic.currentStage > stage.id ? 'bg-green-500' : 'bg-muted'
                                            }`}
                                    />
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Action Button */}
                    <Button className="w-full" size="lg" asChild>
                        <Link to={`/experiment/1/stage${Math.max(1, topic.currentStage)}`}>
                            {topic.currentStage === 0 ? '开始实验' : '继续实验'}
                            <ArrowRight className="ml-2 h-5 w-5" />
                        </Link>
                    </Button>
                </CardContent>
            </Card>
        </div>
    )
}
