import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { ArrowLeft, ArrowRight, Download, ZoomIn, ZoomOut, FileText, Save, XCircle, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import { mockSubmissions } from '@/data/mock'

export function GradingDetailPage() {
    const { submissionId } = useParams()
    const navigate = useNavigate()
    const submission = mockSubmissions.find((s) => s.id === Number(submissionId)) || mockSubmissions[0]

    const [activeTab, setActiveTab] = useState('questionnaire')
    const [zoom, setZoom] = useState(100)
    const [questionnaireScore, setQuestionnaireScore] = useState(submission.questionnaireScore?.toString() || '')
    const [processScore, setProcessScore] = useState(submission.processScore?.toString() || '')
    const [reportScore, setReportScore] = useState(submission.reportScore?.toString() || '')
    const [comment, setComment] = useState(submission.comment || '')
    const [rejectOpen, setRejectOpen] = useState(false)
    const [rejectReason, setRejectReason] = useState('')

    const weights = { questionnaire: 30, process: 40, report: 30 }
    const machineScore = submission.machineScore || 85

    const calculateTotal = () => {
        const q = Number(questionnaireScore) || 0
        const p = Number(processScore) || 0
        const r = Number(reportScore) || 0
        return ((q * weights.questionnaire + p * weights.process + r * weights.report) / 100).toFixed(1)
    }

    const handleSaveDraft = () => toast.success('草稿已保存', { description: '学生将看到"待批改"状态' })

    const handleApprove = () => {
        if (!questionnaireScore || !processScore || !reportScore) { toast.error('请填写所有评分'); return }
        toast.success('批改完成', { description: `总分: ${calculateTotal()}` })
        navigate('/grading')
    }

    const handleReject = () => {
        if (!rejectReason.trim()) { toast.error('请填写驳回原因'); return }
        toast.success('作业已驳回')
        setRejectOpen(false)
        navigate('/grading')
    }

    const handleNext = () => {
        handleSaveDraft()
        const pending = mockSubmissions.filter((s) => s.status === 1)
        const idx = pending.findIndex((s) => s.id === Number(submissionId))
        const next = pending[idx + 1] || pending[0]
        if (next && next.id !== Number(submissionId)) navigate(`/grading/${next.id}`)
        else toast.info('没有更多待批改的作业')
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" asChild><Link to="/grading"><ArrowLeft className="h-5 w-5" /></Link></Button>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold tracking-tight">作业批改</h1>
                    <p className="text-muted-foreground">{submission.studentName} ({submission.studentId}) - {submission.topicName}</p>
                </div>
                <Badge variant="secondary">{submission.className}</Badge>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="lg:h-[calc(100vh-200px)]">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <Tabs value={activeTab} onValueChange={setActiveTab}><TabsList><TabsTrigger value="questionnaire">问卷</TabsTrigger><TabsTrigger value="report">报告</TabsTrigger></TabsList></Tabs>
                            <div className="flex items-center gap-2">
                                <Button variant="outline" size="icon" onClick={() => setZoom((z) => Math.max(50, z - 10))}><ZoomOut className="h-4 w-4" /></Button>
                                <span className="text-sm w-12 text-center">{zoom}%</span>
                                <Button variant="outline" size="icon" onClick={() => setZoom((z) => Math.min(200, z + 10))}><ZoomIn className="h-4 w-4" /></Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="flex-1">
                        <Tabs value={activeTab}>
                            <TabsContent value="questionnaire" className="mt-0">
                                <div className="bg-muted rounded-lg flex items-center justify-center" style={{ minHeight: '400px', transform: `scale(${zoom / 100})`, transformOrigin: 'top left' }}>
                                    <div className="text-center p-8"><FileText className="h-16 w-16 mx-auto text-muted-foreground mb-4" /><p className="text-lg font-medium">问卷 PDF 预览</p><p className="text-xs text-muted-foreground mt-1">第 1 页，共 3 页</p></div>
                                </div>
                            </TabsContent>
                            <TabsContent value="report" className="mt-0">
                                <div className="bg-muted rounded-lg flex items-center justify-center" style={{ minHeight: '400px', transform: `scale(${zoom / 100})`, transformOrigin: 'top left' }}>
                                    <div className="text-center p-8"><FileText className="h-16 w-16 mx-auto text-muted-foreground mb-4" /><p className="text-lg font-medium">实验报告 PDF 预览</p><p className="text-xs text-muted-foreground mt-1">第 1 页，共 5 页</p></div>
                                </div>
                            </TabsContent>
                        </Tabs>
                        <div className="mt-4 flex justify-center"><Button variant="outline" size="sm"><Download className="mr-2 h-4 w-4" />下载 PDF</Button></div>
                    </CardContent>
                </Card>

                <Card className="lg:h-[calc(100vh-200px)] overflow-auto">
                    <CardHeader><CardTitle>评分面板</CardTitle></CardHeader>
                    <CardContent className="space-y-6">
                        <div className="p-4 bg-muted rounded-lg">
                            <div className="grid grid-cols-2 gap-2 text-sm">
                                <div><span className="text-muted-foreground">学生姓名：</span><span className="font-medium">{submission.studentName}</span></div>
                                <div><span className="text-muted-foreground">学号：</span><span className="font-medium">{submission.studentId}</span></div>
                                <div><span className="text-muted-foreground">提交时间：</span><span>{submission.submittedAt}</span></div>
                                <div><span className="text-muted-foreground">机器评分：</span><span className="font-medium text-primary">{machineScore}</span></div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2"><div className="flex justify-between items-center"><Label>问卷设计 ({weights.questionnaire}%)</Label><span className="text-xs text-muted-foreground">机器评分参考: {machineScore}</span></div><Input type="number" min="0" max="100" placeholder="0-100" value={questionnaireScore} onChange={(e) => setQuestionnaireScore(e.target.value)} /></div>
                            <div className="space-y-2"><Label>实验过程 ({weights.process}%)</Label><Input type="number" min="0" max="100" placeholder="0-100" value={processScore} onChange={(e) => setProcessScore(e.target.value)} /></div>
                            <div className="space-y-2"><Label>报告撰写 ({weights.report}%)</Label><Input type="number" min="0" max="100" placeholder="0-100" value={reportScore} onChange={(e) => setReportScore(e.target.value)} /></div>
                        </div>

                        <div className="p-4 bg-primary/10 rounded-lg">
                            <div className="text-sm text-muted-foreground mb-1">计算公式</div>
                            <div className="text-sm font-mono">{questionnaireScore || '?'} × {weights.questionnaire}% + {processScore || '?'} × {weights.process}% + {reportScore || '?'} × {weights.report}%</div>
                            <div className="mt-2 text-2xl font-bold text-primary">总分: {calculateTotal()} 分</div>
                        </div>

                        <div className="space-y-2"><Label>评语</Label><textarea className="w-full min-h-[100px] p-3 rounded-md border bg-background resize-none" placeholder="请输入评语..." value={comment} onChange={(e) => setComment(e.target.value)} /></div>

                        <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                                <Button variant="outline" onClick={handleSaveDraft}><Save className="mr-2 h-4 w-4" />保存草稿</Button>
                                <Button variant="destructive" onClick={() => setRejectOpen(true)}><XCircle className="mr-2 h-4 w-4" />驳回</Button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <Button onClick={handleApprove}><CheckCircle className="mr-2 h-4 w-4" />通过</Button>
                                <Button variant="secondary" onClick={handleNext}>下一个<ArrowRight className="ml-2 h-4 w-4" /></Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>驳回作业</DialogTitle><DialogDescription>请输入驳回原因，供学生改进</DialogDescription></DialogHeader>
                    <div className="py-4"><Label>驳回原因 *</Label><textarea className="w-full min-h-[120px] p-3 mt-2 rounded-md border bg-background resize-none" placeholder="请说明驳回原因..." value={rejectReason} onChange={(e) => setRejectReason(e.target.value.slice(0, 500))} /><p className="text-xs text-muted-foreground mt-1">{rejectReason.length}/500</p></div>
                    <DialogFooter><Button variant="outline" onClick={() => setRejectOpen(false)}>取消</Button><Button variant="destructive" onClick={handleReject}>确认驳回</Button></DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
