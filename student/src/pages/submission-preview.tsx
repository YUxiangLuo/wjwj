import { Link, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, FileText, Send, Check } from 'lucide-react'
import { toast } from 'sonner'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { useState } from 'react'

const mockSubmissionData = {
    questionnaire: {
        title: '消费者购买行为调查',
        welcomeMessage: '亲爱的受访者，感谢您参与本次调查。本问卷旨在了解消费者的购买行为和偏好...',
        questions: [
            { id: 1, type: '单选题', content: '您的性别？', options: ['男', '女'] },
            { id: 2, type: '单选题', content: '您的年龄？', options: ['18-25', '26-35', '36-45', '46+'] },
            { id: 3, type: '单选题', content: '您的月收入水平？', options: ['<3000', '3000-6000', '6000-10000', '>10000'] },
            { id: 4, type: '多选题', content: '您常用的购物方式？', options: ['线下商店', '电商平台', '社交电商', '直播购物'] },
            { id: 5, type: '量表题', content: '您对价格的敏感程度？', options: ['1-5'] },
        ],
        closingMessage: '感谢您的参与！您的回答对我们的研究非常重要。',
        score: 85,
    },
    report: {
        sampleSize: 400,
        methods: ['简单随机抽样', '系统抽样', '分层抽样'],
        analysis: '基于我的分析，分层抽样提供了最接近总体参数的估计值。在收入变量上，分层抽样的误差仅为0.3%，远低于简单随机抽样的1.9%和系统抽样的1.3%。这是因为分层抽样确保了各层的代表性...',
        conclusion: '综上所述，在本次调查中，分层抽样方法最为有效。建议在类似的人口统计调查中优先使用分层抽样方法。',
    },
}

export function SubmissionPreviewPage() {
    const navigate = useNavigate()
    const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)

    const handleSubmit = () => {
        toast.success('提交成功！', { description: '您的作业已提交，请等待批改' })
        setConfirmDialogOpen(false)
        navigate('/')
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" asChild>
                    <Link to="/experiment/1/stage4"><ArrowLeft className="h-5 w-5" /></Link>
                </Button>
                <div>
                    <h1 className="text-2xl font-bold">提交预览</h1>
                    <p className="text-muted-foreground">确认您的问卷和报告后提交</p>
                </div>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="questionnaire" className="space-y-4">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="questionnaire"><FileText className="mr-2 h-4 w-4" />问卷预览</TabsTrigger>
                    <TabsTrigger value="report"><FileText className="mr-2 h-4 w-4" />报告预览</TabsTrigger>
                </TabsList>

                <TabsContent value="questionnaire">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle>{mockSubmissionData.questionnaire.title}</CardTitle>
                                <Badge className="bg-green-100 text-green-700">机器评分: {mockSubmissionData.questionnaire.score}分</Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="p-4 bg-blue-50 rounded-lg">
                                <p className="text-sm font-medium text-blue-800">欢迎语</p>
                                <p className="text-sm text-blue-700 mt-1">{mockSubmissionData.questionnaire.welcomeMessage}</p>
                            </div>

                            <div className="space-y-4">
                                {mockSubmissionData.questionnaire.questions.map((q, i) => (
                                    <div key={q.id} className="p-4 border rounded-lg">
                                        <div className="flex items-start justify-between">
                                            <p className="font-medium">{i + 1}. {q.content}</p>
                                            <Badge variant="secondary">{q.type}</Badge>
                                        </div>
                                        <div className="mt-2 text-sm text-muted-foreground">
                                            选项: {q.options.join(' / ')}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="p-4 bg-gray-50 rounded-lg">
                                <p className="text-sm font-medium">结束语</p>
                                <p className="text-sm text-muted-foreground mt-1">{mockSubmissionData.questionnaire.closingMessage}</p>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="report">
                    <Card>
                        <CardHeader>
                            <CardTitle>实验报告</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-muted rounded-lg">
                                    <p className="text-sm text-muted-foreground">样本量</p>
                                    <p className="text-2xl font-bold">{mockSubmissionData.report.sampleSize}</p>
                                </div>
                                <div className="p-4 bg-muted rounded-lg">
                                    <p className="text-sm text-muted-foreground">抽样方法</p>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {mockSubmissionData.report.methods.map((m) => (
                                            <Badge key={m} variant="secondary" className="text-xs">{m}</Badge>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <p className="font-medium mb-2">分析内容</p>
                                    <p className="text-sm text-muted-foreground leading-relaxed">{mockSubmissionData.report.analysis}</p>
                                </div>
                                <div>
                                    <p className="font-medium mb-2">结论</p>
                                    <p className="text-sm text-muted-foreground leading-relaxed">{mockSubmissionData.report.conclusion}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Submit Button */}
            <div className="flex justify-between">
                <Button variant="outline" asChild>
                    <Link to="/experiment/1/stage4"><ArrowLeft className="mr-2 h-4 w-4" />返回修改</Link>
                </Button>
                <Button onClick={() => setConfirmDialogOpen(true)}>
                    <Send className="mr-2 h-4 w-4" />确认提交
                </Button>
            </div>

            {/* Confirm Dialog */}
            <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>确认提交</DialogTitle>
                        <DialogDescription>提交后将无法修改，您确定要提交吗？</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" />问卷包含 {mockSubmissionData.questionnaire.questions.length} 道问题</div>
                        <div className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" />样本量 {mockSubmissionData.report.sampleSize}</div>
                        <div className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" />完成 3 种抽样方法</div>
                        <div className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" />分析报告已填写</div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmDialogOpen(false)}>取消</Button>
                        <Button onClick={handleSubmit}><Send className="mr-2 h-4 w-4" />确认提交</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
