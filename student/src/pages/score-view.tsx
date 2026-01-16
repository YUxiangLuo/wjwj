import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ArrowLeft, Award, FileText, CheckCircle, MessageSquare } from 'lucide-react'

const mockScoreData = {
    topicName: '消费者行为调查',
    submittedAt: '2024-03-15 14:30',
    gradedAt: '2024-03-18 10:20',
    gradedBy: '张老师',
    scores: {
        questionnaire: { score: 85, weight: 30, weighted: 25.5 },
        process: { score: 90, weight: 40, weighted: 36 },
        report: { score: 88, weight: 30, weighted: 26.4 },
    },
    totalScore: 87.9,
    comment: '问卷设计较为完整，问题覆盖面广。抽样执行过程规范，三种方法都正确实施。报告分析较为深入，结论合理。建议可以增加更多的统计分析方法，如方差分析等。',
    status: 'graded',
}

export function ScoreViewPage() {
    const { scores, totalScore, comment } = mockScoreData

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" asChild>
                    <Link to="/"><ArrowLeft className="h-5 w-5" /></Link>
                </Button>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold">{mockScoreData.topicName}</h1>
                    <p className="text-muted-foreground">成绩查看</p>
                </div>
                <Badge className="bg-green-100 text-green-700 text-lg px-4 py-2">
                    <Award className="mr-2 h-5 w-5" />
                    {totalScore.toFixed(1)} 分
                </Badge>
            </div>

            {/* Status Card */}
            <Card className="bg-green-50 border-green-200">
                <CardContent className="py-4 flex items-center gap-4">
                    <CheckCircle className="h-8 w-8 text-green-600" />
                    <div>
                        <p className="font-medium text-green-800">批改完成</p>
                        <p className="text-sm text-green-700">
                            提交时间: {mockScoreData.submittedAt} | 批改时间: {mockScoreData.gradedAt} | 批改人: {mockScoreData.gradedBy}
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Score Breakdown */}
            <Card>
                <CardHeader>
                    <CardTitle>成绩明细</CardTitle>
                    <CardDescription>各项得分及权重</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Questionnaire */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium">问卷设计</span>
                                <Badge variant="secondary" className="text-xs">权重 {scores.questionnaire.weight}%</Badge>
                            </div>
                            <span className="font-bold">{scores.questionnaire.score} 分</span>
                        </div>
                        <Progress value={scores.questionnaire.score} className="h-2" />
                    </div>

                    {/* Process */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium">实验过程</span>
                                <Badge variant="secondary" className="text-xs">权重 {scores.process.weight}%</Badge>
                            </div>
                            <span className="font-bold">{scores.process.score} 分</span>
                        </div>
                        <Progress value={scores.process.score} className="h-2" />
                    </div>

                    {/* Report */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium">报告撰写</span>
                                <Badge variant="secondary" className="text-xs">权重 {scores.report.weight}%</Badge>
                            </div>
                            <span className="font-bold">{scores.report.score} 分</span>
                        </div>
                        <Progress value={scores.report.score} className="h-2" />
                    </div>

                    {/* Total Calculation */}
                    <div className="p-4 bg-muted rounded-lg">
                        <p className="text-sm text-muted-foreground">
                            总分计算: {scores.questionnaire.score} × {scores.questionnaire.weight}% + {scores.process.score} × {scores.process.weight}% + {scores.report.score} × {scores.report.weight}% = <span className="font-bold text-foreground">{totalScore.toFixed(1)}</span>
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Teacher Comment */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <MessageSquare className="h-5 w-5" />
                        教师评语
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm leading-relaxed">{comment}</p>
                </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex justify-between">
                <Button variant="outline" asChild>
                    <Link to="/"><ArrowLeft className="mr-2 h-4 w-4" />返回任务大厅</Link>
                </Button>
                <Button variant="outline">
                    <FileText className="mr-2 h-4 w-4" />查看提交内容
                </Button>
            </div>
        </div>
    )
}
