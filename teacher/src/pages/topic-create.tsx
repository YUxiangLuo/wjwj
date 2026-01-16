import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
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
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Progress } from '@/components/ui/progress'
import {
    ArrowLeft,
    ArrowRight,
    Upload,
    FileSpreadsheet,
    Plus,
    Trash2,
    CheckCircle,
    Save,
    Send,
} from 'lucide-react'
import { toast } from 'sonner'

const STEPS = [
    { id: 1, title: '基本信息', description: '填写课题名称和背景描述' },
    { id: 2, title: '上传数据', description: '上传总体数据Excel文件' },
    { id: 3, title: '字段映射', description: '配置字段类型' },
    { id: 4, title: '附件上传', description: '上传辅助资料（可选）' },
    { id: 5, title: '推荐题目', description: '添加推荐问卷题目（可选）' },
    { id: 6, title: '评分权重', description: '设置评分权重' },
]

interface FieldMapping {
    name: string
    included: boolean
    type: string
}

interface Question {
    id: number
    type: string
    content: string
    options: string[]
}

interface Attachment {
    id: number
    name: string
    size: string
}

const mockExcelColumns = ['ID', '姓名', '性别', '年龄', '收入', '职业', '教育程度']
const mockExcelRows = [
    ['001', '张三', '男', '28', '8000', '工程师', '本科'],
    ['002', '李四', '女', '32', '12000', '经理', '硕士'],
    ['003', '王五', '男', '25', '6000', '销售', '大专'],
]

export function TopicCreatePage() {
    const navigate = useNavigate()
    const [currentStep, setCurrentStep] = useState(1)

    const [topicName, setTopicName] = useState('')
    const [description, setDescription] = useState('')
    const [uploadedFile, setUploadedFile] = useState<string | null>(null)
    const [rowCount, setRowCount] = useState(0)
    const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([])
    const [attachments, setAttachments] = useState<Attachment[]>([])
    const [questions, setQuestions] = useState<Question[]>([])
    const [questionDialogOpen, setQuestionDialogOpen] = useState(false)
    const [newQuestion, setNewQuestion] = useState({ type: '1', content: '', options: ['', ''] })
    const [questionnaireWeight, setQuestionnaireWeight] = useState(30)
    const [processWeight, setProcessWeight] = useState(40)
    const [reportWeight, setReportWeight] = useState(30)

    const totalWeight = questionnaireWeight + processWeight + reportWeight

    const handleFileUpload = () => {
        setUploadedFile('population_data.xlsx')
        setRowCount(10000)
        setFieldMappings(
            mockExcelColumns.map((col) => ({
                name: col,
                included: true,
                type: col === 'ID' ? 'identifier' : col === '性别' ? 'stratification' : col === '收入' || col === '年龄' ? 'numeric' : 'categorical',
            }))
        )
        toast.success('文件上传成功')
    }

    const handleAddAttachment = () => {
        setAttachments([...attachments, { id: attachments.length + 1, name: `附件${attachments.length + 1}.pdf`, size: '2.5 MB' }])
        toast.success('附件添加成功')
    }

    const handleAddQuestion = () => {
        setQuestions([...questions, { id: questions.length + 1, type: newQuestion.type, content: newQuestion.content, options: newQuestion.options.filter((o) => o.trim()) }])
        setNewQuestion({ type: '1', content: '', options: ['', ''] })
        setQuestionDialogOpen(false)
        toast.success('题目添加成功')
    }

    const getQuestionTypeName = (type: string) => ({ '1': '判断题', '2': '单选题', '3': '多选题', '4': '量表题' })[type] || type

    const canProceed = () => {
        if (currentStep === 1) return topicName.trim().length > 0 && description.trim().length > 0
        if (currentStep === 2) return uploadedFile !== null
        if (currentStep === 3) {
            const included = fieldMappings.filter((f) => f.included)
            return included.length >= 3 && included.some((f) => f.type === 'stratification') && included.some((f) => f.type === 'numeric')
        }
        if (currentStep === 6) return totalWeight === 100
        return true
    }

    const handleSave = (publish: boolean) => {
        toast.success(publish ? '课题已保存并发布' : '课题已保存为草稿')
        navigate('/topics')
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => navigate('/topics')}><ArrowLeft className="h-5 w-5" /></Button>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">创建课题</h1>
                    <p className="text-muted-foreground">填写课题信息并配置相关设置</p>
                </div>
            </div>

            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-4">
                        {STEPS.map((step, index) => (
                            <div key={step.id} className="flex items-center">
                                <div className="flex flex-col items-center">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium ${currentStep >= step.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                                        {currentStep > step.id ? <CheckCircle className="h-5 w-5" /> : step.id}
                                    </div>
                                    <span className="text-xs mt-1 text-center max-w-[80px]">{step.title}</span>
                                </div>
                                {index < STEPS.length - 1 && <div className={`w-16 h-0.5 mx-2 ${currentStep > step.id ? 'bg-primary' : 'bg-muted'}`} />}
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>{STEPS[currentStep - 1].title}</CardTitle>
                    <CardDescription>{STEPS[currentStep - 1].description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {currentStep === 1 && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="topicName">课题名称 *</Label>
                                <Input id="topicName" value={topicName} onChange={(e) => setTopicName(e.target.value.slice(0, 200))} placeholder="请输入课题名称" />
                                <p className="text-xs text-muted-foreground">{topicName.length}/200</p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="description">背景描述 *</Label>
                                <textarea id="description" className="w-full min-h-[200px] p-3 rounded-md border bg-background resize-none" value={description} onChange={(e) => setDescription(e.target.value.slice(0, 5000))} placeholder="请输入课题背景描述..." />
                                <p className="text-xs text-muted-foreground">{description.length}/5000</p>
                            </div>
                        </div>
                    )}

                    {currentStep === 2 && (
                        <div className="space-y-4">
                            {!uploadedFile ? (
                                <div className="border-2 border-dashed rounded-lg p-12 text-center cursor-pointer hover:border-primary transition-colors" onClick={handleFileUpload}>
                                    <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                                    <p className="text-lg font-medium">点击或拖拽上传 Excel 文件</p>
                                    <p className="text-sm text-muted-foreground mt-1">仅支持 .xlsx, .xls 格式，最大 100MB</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                                        <FileSpreadsheet className="h-10 w-10 text-green-600" />
                                        <div className="flex-1">
                                            <p className="font-medium">{uploadedFile}</p>
                                            <p className="text-sm text-muted-foreground">共 {rowCount.toLocaleString()} 行数据</p>
                                        </div>
                                        <Button variant="ghost" size="sm" onClick={() => { setUploadedFile(null); setRowCount(0); setFieldMappings([]) }}>重新上传</Button>
                                    </div>
                                    <div>
                                        <Label>数据预览</Label>
                                        <div className="mt-2 border rounded-lg overflow-auto max-h-[300px]">
                                            <Table>
                                                <TableHeader><TableRow>{mockExcelColumns.map((col) => <TableHead key={col}>{col}</TableHead>)}</TableRow></TableHeader>
                                                <TableBody>{mockExcelRows.map((row, i) => <TableRow key={i}>{row.map((cell, j) => <TableCell key={j}>{cell}</TableCell>)}</TableRow>)}</TableBody>
                                            </Table>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {currentStep === 3 && (
                        <div className="space-y-4">
                            <p className="text-sm text-muted-foreground">请为每个字段选择类型。至少需要选择3个字段，包含1个分层变量和1个数值变量。</p>
                            <Table>
                                <TableHeader><TableRow><TableHead className="w-12">包含</TableHead><TableHead>字段名</TableHead><TableHead>字段类型</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {fieldMappings.map((field, index) => (
                                        <TableRow key={field.name}>
                                            <TableCell><Checkbox checked={field.included} onCheckedChange={(checked) => { const u = [...fieldMappings]; u[index].included = !!checked; setFieldMappings(u) }} /></TableCell>
                                            <TableCell className="font-medium">{field.name}</TableCell>
                                            <TableCell>
                                                <Select value={field.type} onValueChange={(v) => { const u = [...fieldMappings]; u[index].type = v; setFieldMappings(u) }} disabled={!field.included}>
                                                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="stratification">分层变量</SelectItem>
                                                        <SelectItem value="numeric">数值变量</SelectItem>
                                                        <SelectItem value="categorical">分类变量</SelectItem>
                                                        <SelectItem value="identifier">标识符</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            <div className="flex gap-4 text-sm">
                                <Badge variant={fieldMappings.filter((f) => f.included).length >= 3 ? 'default' : 'secondary'}>已选 {fieldMappings.filter((f) => f.included).length} 个字段</Badge>
                                <Badge variant={fieldMappings.filter((f) => f.included && f.type === 'stratification').length > 0 ? 'default' : 'destructive'}>分层变量: {fieldMappings.filter((f) => f.included && f.type === 'stratification').length}</Badge>
                                <Badge variant={fieldMappings.filter((f) => f.included && f.type === 'numeric').length > 0 ? 'default' : 'destructive'}>数值变量: {fieldMappings.filter((f) => f.included && f.type === 'numeric').length}</Badge>
                            </div>
                        </div>
                    )}

                    {currentStep === 4 && (
                        <div className="space-y-4">
                            <div className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors" onClick={handleAddAttachment}>
                                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                                <p className="text-sm">点击添加附件（支持图片、视频、文档）</p>
                            </div>
                            {attachments.length > 0 && (
                                <div className="space-y-2">
                                    {attachments.map((a) => (
                                        <div key={a.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                                            <div className="flex items-center gap-3"><FileSpreadsheet className="h-5 w-5 text-muted-foreground" /><div><p className="text-sm font-medium">{a.name}</p><p className="text-xs text-muted-foreground">{a.size}</p></div></div>
                                            <Button variant="ghost" size="icon" onClick={() => setAttachments(attachments.filter((x) => x.id !== a.id))}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {currentStep === 5 && (
                        <div className="space-y-4">
                            <Dialog open={questionDialogOpen} onOpenChange={setQuestionDialogOpen}>
                                <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />添加推荐题目</Button></DialogTrigger>
                                <DialogContent>
                                    <DialogHeader><DialogTitle>添加推荐题目</DialogTitle><DialogDescription>学生可以参考这些题目设计问卷</DialogDescription></DialogHeader>
                                    <div className="space-y-4 py-4">
                                        <div className="space-y-2">
                                            <Label>题目类型</Label>
                                            <Select value={newQuestion.type} onValueChange={(v) => setNewQuestion({ ...newQuestion, type: v })}>
                                                <SelectTrigger><SelectValue /></SelectTrigger>
                                                <SelectContent><SelectItem value="1">判断题</SelectItem><SelectItem value="2">单选题</SelectItem><SelectItem value="3">多选题</SelectItem><SelectItem value="4">量表题</SelectItem></SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2"><Label>题目内容</Label><Input value={newQuestion.content} onChange={(e) => setNewQuestion({ ...newQuestion, content: e.target.value })} placeholder="请输入题目内容" /></div>
                                        {(newQuestion.type === '2' || newQuestion.type === '3') && (
                                            <div className="space-y-2">
                                                <Label>选项</Label>
                                                {newQuestion.options.map((opt, i) => <Input key={i} value={opt} onChange={(e) => { const o = [...newQuestion.options]; o[i] = e.target.value; setNewQuestion({ ...newQuestion, options: o }) }} placeholder={`选项 ${i + 1}`} />)}
                                                <Button variant="outline" size="sm" onClick={() => setNewQuestion({ ...newQuestion, options: [...newQuestion.options, ''] })}>添加选项</Button>
                                            </div>
                                        )}
                                    </div>
                                    <DialogFooter><Button variant="outline" onClick={() => setQuestionDialogOpen(false)}>取消</Button><Button onClick={handleAddQuestion} disabled={!newQuestion.content.trim()}>添加</Button></DialogFooter>
                                </DialogContent>
                            </Dialog>
                            {questions.length > 0 ? (
                                <div className="space-y-2">
                                    {questions.map((q, i) => (
                                        <div key={q.id} className="flex items-start justify-between p-4 border rounded-lg">
                                            <div><div className="flex items-center gap-2 mb-1"><span className="text-sm text-muted-foreground">#{i + 1}</span><Badge variant="secondary">{getQuestionTypeName(q.type)}</Badge></div><p className="font-medium">{q.content}</p>{q.options.length > 0 && <div className="mt-2 text-sm text-muted-foreground">选项: {q.options.join(', ')}</div>}</div>
                                            <Button variant="ghost" size="icon" onClick={() => setQuestions(questions.filter((x) => x.id !== q.id))}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                        </div>
                                    ))}
                                </div>
                            ) : <div className="text-center py-8 text-muted-foreground">暂无推荐题目，点击上方按钮添加</div>}
                        </div>
                    )}

                    {currentStep === 6 && (
                        <div className="space-y-6">
                            <div className="space-y-4">
                                <div className="space-y-2"><div className="flex justify-between"><Label>问卷设计权重</Label><span className="text-sm font-medium">{questionnaireWeight}%</span></div><input type="range" min="0" max="100" value={questionnaireWeight} onChange={(e) => setQuestionnaireWeight(Number(e.target.value))} className="w-full" /></div>
                                <div className="space-y-2"><div className="flex justify-between"><Label>实验过程权重</Label><span className="text-sm font-medium">{processWeight}%</span></div><input type="range" min="0" max="100" value={processWeight} onChange={(e) => setProcessWeight(Number(e.target.value))} className="w-full" /></div>
                                <div className="space-y-2"><div className="flex justify-between"><Label>报告撰写权重</Label><span className="text-sm font-medium">{reportWeight}%</span></div><input type="range" min="0" max="100" value={reportWeight} onChange={(e) => setReportWeight(Number(e.target.value))} className="w-full" /></div>
                            </div>
                            <div className="p-4 bg-muted rounded-lg">
                                <div className="flex justify-between items-center"><span className="font-medium">权重总计</span><span className={`text-lg font-bold ${totalWeight === 100 ? 'text-green-600' : 'text-destructive'}`}>{totalWeight}%</span></div>
                                <Progress value={totalWeight} className="mt-2" />
                                {totalWeight !== 100 && <p className="text-sm text-destructive mt-2">权重总和必须等于 100%</p>}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="flex justify-between">
                <Button variant="outline" onClick={() => setCurrentStep((s) => s - 1)} disabled={currentStep === 1}><ArrowLeft className="mr-2 h-4 w-4" />上一步</Button>
                <div className="flex gap-2">
                    {currentStep === 6 ? (
                        <>
                            <Button variant="outline" onClick={() => handleSave(false)}><Save className="mr-2 h-4 w-4" />保存为草稿</Button>
                            <Button onClick={() => handleSave(true)} disabled={!canProceed()}><Send className="mr-2 h-4 w-4" />保存并发布</Button>
                        </>
                    ) : (
                        <Button onClick={() => setCurrentStep((s) => s + 1)} disabled={!canProceed()}>下一步<ArrowRight className="ml-2 h-4 w-4" /></Button>
                    )}
                </div>
            </div>
        </div>
    )
}
