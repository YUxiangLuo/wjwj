import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { ArrowLeft, ArrowRight, Plus, Trash2, GripVertical, Check, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

const STEPS = [
    { id: 1, title: '欢迎语', description: '设置问卷标题和欢迎语' },
    { id: 2, title: '问题设计', description: '添加和编辑问卷问题' },
    { id: 3, title: '结束语', description: '设置问卷结束语' },
    { id: 4, title: '预览确认', description: '预览问卷并确认' },
]

const questionTypes = [
    { value: 'truefalse', label: '判断题' },
    { value: 'single', label: '单选题' },
    { value: 'multiple', label: '多选题' },
    { value: 'scale', label: '量表题' },
]

interface Question {
    id: number
    type: string
    content: string
    options: string[]
}

export function QuestionnaireDesignPage() {
    const navigate = useNavigate()
    const [currentStep, setCurrentStep] = useState(1)
    const [title, setTitle] = useState('')
    const [welcomeMessage, setWelcomeMessage] = useState('')
    const [closingMessage, setClosingMessage] = useState('')
    const [questions, setQuestions] = useState<Question[]>([])
    const [editingQuestion, setEditingQuestion] = useState<Question | null>(null)
    const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)

    const addQuestion = (type: string) => {
        const newQuestion: Question = {
            id: Date.now(),
            type,
            content: '',
            options: type === 'truefalse' ? ['正确', '错误'] : type === 'scale' ? ['1', '2', '3', '4', '5'] : ['选项A', '选项B'],
        }
        setQuestions([...questions, newQuestion])
        setEditingQuestion(newQuestion)
    }

    const updateQuestion = (id: number, updates: Partial<Question>) => {
        setQuestions(questions.map((q) => (q.id === id ? { ...q, ...updates } : q)))
        if (editingQuestion?.id === id) {
            setEditingQuestion({ ...editingQuestion, ...updates })
        }
    }

    const deleteQuestion = (id: number) => {
        setQuestions(questions.filter((q) => q.id !== id))
        if (editingQuestion?.id === id) setEditingQuestion(null)
    }

    const addOption = () => {
        if (editingQuestion) {
            updateQuestion(editingQuestion.id, { options: [...editingQuestion.options, `选项${String.fromCharCode(65 + editingQuestion.options.length)}`] })
        }
    }

    const getQualityScore = () => {
        let score = 0
        if (title.length >= 5) score += 20
        if (welcomeMessage.length >= 20) score += 15
        if (questions.length >= 5 && questions.length <= 30) score += 25
        if (new Set(questions.map((q) => q.type)).size >= 2) score += 20
        if (closingMessage.length >= 10) score += 10
        if (questions.every((q) => q.content.length > 0)) score += 10
        return score
    }

    const canProceed = () => {
        if (currentStep === 1) return title.length >= 3 && welcomeMessage.length >= 10
        if (currentStep === 2) return questions.length >= 3 && questions.every((q) => q.content.length > 0)
        if (currentStep === 3) return closingMessage.length >= 5
        return true
    }

    const handleConfirm = () => {
        toast.success('问卷设计已完成！', { description: '进入样本量规划阶段' })
        setConfirmDialogOpen(false)
        navigate('/experiment/1/stage2')
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" asChild>
                    <Link to="/topic/1"><ArrowLeft className="h-5 w-5" /></Link>
                </Button>
                <div>
                    <h1 className="text-2xl font-bold">阶段1：问卷设计</h1>
                    <p className="text-muted-foreground">步骤 {currentStep}/4: {STEPS[currentStep - 1].description}</p>
                </div>
            </div>

            {/* Progress */}
            <div className="flex items-center justify-between">
                {STEPS.map((step, index) => (
                    <div key={step.id} className="flex items-center">
                        <div className="flex flex-col items-center">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium ${currentStep > step.id ? 'bg-green-500 text-white' : currentStep === step.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                                {currentStep > step.id ? <Check className="h-5 w-5" /> : step.id}
                            </div>
                            <span className="text-xs mt-1">{step.title}</span>
                        </div>
                        {index < STEPS.length - 1 && <div className={`w-16 h-0.5 mx-2 ${currentStep > step.id ? 'bg-green-500' : 'bg-muted'}`} />}
                    </div>
                ))}
            </div>

            {/* Step 1: Welcome */}
            {currentStep === 1 && (
                <Card>
                    <CardHeader><CardTitle>问卷标题与欢迎语</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>问卷标题 *</Label>
                            <Input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 50))} placeholder="请输入问卷标题" />
                            <p className="text-xs text-muted-foreground">{title.length}/50</p>
                        </div>
                        <div className="space-y-2">
                            <Label>欢迎语 *</Label>
                            <textarea className="w-full min-h-[150px] p-3 rounded-md border bg-background resize-none" value={welcomeMessage} onChange={(e) => setWelcomeMessage(e.target.value.slice(0, 500))} placeholder="请输入问卷欢迎语，向受访者介绍调查目的..." />
                            <p className="text-xs text-muted-foreground">{welcomeMessage.length}/500</p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Step 2: Questions */}
            {currentStep === 2 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>我的问题 ({questions.length})</CardTitle>
                            <CardDescription>点击问题进行编辑，拖拽调整顺序</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-wrap gap-2">
                                {questionTypes.map((t) => (
                                    <Button key={t.value} variant="outline" size="sm" onClick={() => addQuestion(t.value)}>
                                        <Plus className="mr-1 h-3 w-3" />{t.label}
                                    </Button>
                                ))}
                            </div>
                            <div className="space-y-2 max-h-[400px] overflow-auto">
                                {questions.map((q, i) => (
                                    <div key={q.id} className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted/50 ${editingQuestion?.id === q.id ? 'ring-2 ring-primary' : ''}`} onClick={() => setEditingQuestion(q)}>
                                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-sm text-muted-foreground">{i + 1}.</span>
                                        <span className="flex-1 text-sm truncate">{q.content || '(未填写)'}</span>
                                        <Badge variant="secondary" className="text-xs">{questionTypes.find((t) => t.value === q.type)?.label}</Badge>
                                    </div>
                                ))}
                                {questions.length === 0 && <p className="text-center py-8 text-muted-foreground">点击上方按钮添加问题</p>}
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader><CardTitle>问题编辑</CardTitle></CardHeader>
                        <CardContent>
                            {editingQuestion ? (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <Badge>{questionTypes.find((t) => t.value === editingQuestion.type)?.label}</Badge>
                                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteQuestion(editingQuestion.id)}><Trash2 className="h-4 w-4" /></Button>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>问题内容 *</Label>
                                        <textarea className="w-full min-h-[80px] p-3 rounded-md border bg-background resize-none" value={editingQuestion.content} onChange={(e) => updateQuestion(editingQuestion.id, { content: e.target.value })} placeholder="请输入问题内容" />
                                    </div>
                                    {(editingQuestion.type === 'single' || editingQuestion.type === 'multiple') && (
                                        <div className="space-y-2">
                                            <Label>选项</Label>
                                            {editingQuestion.options.map((opt, i) => (
                                                <div key={i} className="flex items-center gap-2">
                                                    <Input value={opt} onChange={(e) => { const opts = [...editingQuestion.options]; opts[i] = e.target.value; updateQuestion(editingQuestion.id, { options: opts }) }} />
                                                    {editingQuestion.options.length > 2 && <Button variant="ghost" size="icon" onClick={() => updateQuestion(editingQuestion.id, { options: editingQuestion.options.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>}
                                                </div>
                                            ))}
                                            <Button variant="outline" size="sm" onClick={addOption}><Plus className="mr-1 h-3 w-3" />添加选项</Button>
                                        </div>
                                    )}
                                    {editingQuestion.type === 'scale' && (
                                        <div className="p-4 bg-muted rounded-lg">
                                            <p className="text-sm text-muted-foreground">量表题使用1-5分制：1表示非常不同意，5表示非常同意</p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <p className="text-center py-12 text-muted-foreground">请选择或添加一个问题进行编辑</p>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Step 3: Closing */}
            {currentStep === 3 && (
                <Card>
                    <CardHeader><CardTitle>结束语</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>结束语 *</Label>
                            <textarea className="w-full min-h-[150px] p-3 rounded-md border bg-background resize-none" value={closingMessage} onChange={(e) => setClosingMessage(e.target.value.slice(0, 500))} placeholder="请输入问卷结束语，感谢受访者的参与..." />
                            <p className="text-xs text-muted-foreground">{closingMessage.length}/500</p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Step 4: Preview */}
            {currentStep === 4 && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <Card className="lg:col-span-2">
                        <CardHeader><CardTitle>问卷预览</CardTitle></CardHeader>
                        <CardContent className="max-h-[500px] overflow-auto">
                            <div className="p-6 border rounded-lg space-y-6">
                                <div className="text-center">
                                    <h2 className="text-xl font-bold">{title}</h2>
                                    <p className="text-sm text-muted-foreground mt-2 whitespace-pre-line">{welcomeMessage}</p>
                                </div>
                                <hr />
                                {questions.map((q, i) => (
                                    <div key={q.id} className="space-y-2">
                                        <p className="font-medium">{i + 1}. {q.content}</p>
                                        {q.type === 'truefalse' && <div className="flex gap-4 text-sm"><label className="flex items-center gap-1"><Checkbox disabled />正确</label><label className="flex items-center gap-1"><Checkbox disabled />错误</label></div>}
                                        {(q.type === 'single' || q.type === 'multiple') && <div className="space-y-1">{q.options.map((opt, j) => <label key={j} className="flex items-center gap-2 text-sm"><Checkbox disabled />{opt}</label>)}</div>}
                                        {q.type === 'scale' && <div className="flex gap-2">{[1, 2, 3, 4, 5].map((n) => <div key={n} className="w-10 h-10 border rounded-lg flex items-center justify-center text-sm">{n}</div>)}</div>}
                                    </div>
                                ))}
                                <hr />
                                <p className="text-sm text-muted-foreground whitespace-pre-line">{closingMessage}</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader><CardTitle>质量检查</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <div className="text-center">
                                <div className="text-4xl font-bold text-primary">{getQualityScore()}</div>
                                <p className="text-sm text-muted-foreground">机器评分 (满分100)</p>
                            </div>
                            <div className="space-y-2 text-sm">
                                <div className="flex items-center gap-2">{questions.length >= 5 && questions.length <= 30 ? <Check className="h-4 w-4 text-green-500" /> : <AlertCircle className="h-4 w-4 text-yellow-500" />}问题数量: {questions.length} (建议5-30)</div>
                                <div className="flex items-center gap-2">{new Set(questions.map((q) => q.type)).size >= 2 ? <Check className="h-4 w-4 text-green-500" /> : <AlertCircle className="h-4 w-4 text-yellow-500" />}题型多样性: {new Set(questions.map((q) => q.type)).size} 种</div>
                                <div className="flex items-center gap-2">{welcomeMessage.length >= 20 ? <Check className="h-4 w-4 text-green-500" /> : <AlertCircle className="h-4 w-4 text-yellow-500" />}欢迎语完整</div>
                                <div className="flex items-center gap-2">{closingMessage.length >= 10 ? <Check className="h-4 w-4 text-green-500" /> : <AlertCircle className="h-4 w-4 text-yellow-500" />}结束语完整</div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between">
                <Button variant="outline" onClick={() => setCurrentStep((s) => s - 1)} disabled={currentStep === 1}><ArrowLeft className="mr-2 h-4 w-4" />上一步</Button>
                {currentStep < 4 ? (
                    <Button onClick={() => setCurrentStep((s) => s + 1)} disabled={!canProceed()}>下一步<ArrowRight className="ml-2 h-4 w-4" /></Button>
                ) : (
                    <Button onClick={() => setConfirmDialogOpen(true)}>确认并继续<ArrowRight className="ml-2 h-4 w-4" /></Button>
                )}
            </div>

            {/* Confirm Dialog */}
            <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>确认问卷设计</DialogTitle>
                        <DialogDescription>确认后问卷设计将被锁定。如需修改，需要返回此阶段，这将清除后续进度。</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmDialogOpen(false)}>返回修改</Button>
                        <Button onClick={handleConfirm}>确认并继续</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
