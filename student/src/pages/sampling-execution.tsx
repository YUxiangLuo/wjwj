import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, ArrowRight, Check, RefreshCw, Eye } from 'lucide-react'
import { toast } from 'sonner'

const mockSampleData = [
    { id: '00123', gender: '男', age: 32, income: 8500, education: '本科' },
    { id: '00456', gender: '女', age: 28, income: 6200, education: '硕士' },
    { id: '00789', gender: '男', age: 45, income: 12000, education: '高中' },
    { id: '01012', gender: '女', age: 35, income: 9800, education: '本科' },
    { id: '01345', gender: '男', age: 26, income: 5500, education: '本科' },
]

const stratificationVars = [
    { value: 'gender', label: '性别', strata: [{ name: '男', pop: 6000, pct: 60 }, { name: '女', pop: 4000, pct: 40 }] },
    { value: 'education', label: '学历', strata: [{ name: '高中及以下', pop: 3000, pct: 30 }, { name: '本科', pop: 5000, pct: 50 }, { name: '硕士及以上', pop: 2000, pct: 20 }] },
]

export function SamplingExecutionPage() {
    const sampleSize = 400
    const [completedMethods, setCompletedMethods] = useState<string[]>([])
    const [currentSamples, setCurrentSamples] = useState<typeof mockSampleData>([])
    const [stratVar, setStratVar] = useState('gender')
    const [stratAllocation, setStratAllocation] = useState<Record<string, number>>({})

    const selectedStratVar = stratificationVars.find((v) => v.value === stratVar)
    const totalAllocation = Object.values(stratAllocation).reduce((a, b) => a + b, 0)

    const executeSimpleRandom = () => {
        setCurrentSamples(mockSampleData)
        if (!completedMethods.includes('simple')) setCompletedMethods([...completedMethods, 'simple'])
        toast.success('简单随机抽样完成', { description: `已抽取 ${sampleSize} 个样本` })
    }

    const executeSystematic = () => {
        setCurrentSamples(mockSampleData)
        if (!completedMethods.includes('systematic')) setCompletedMethods([...completedMethods, 'systematic'])
        toast.success('系统抽样完成', { description: `已抽取 ${sampleSize} 个样本` })
    }

    const executeStratified = () => {
        if (totalAllocation !== sampleSize) {
            toast.error('分配总数必须等于样本量')
            return
        }
        setCurrentSamples(mockSampleData)
        if (!completedMethods.includes('stratified')) setCompletedMethods([...completedMethods, 'stratified'])
        toast.success('分层抽样完成', { description: `已抽取 ${sampleSize} 个样本` })
    }

    const autoAllocate = (type: 'proportional' | 'equal') => {
        if (!selectedStratVar) return
        const allocation: Record<string, number> = {}
        if (type === 'proportional') {
            selectedStratVar.strata.forEach((s) => { allocation[s.name] = Math.round(sampleSize * s.pct / 100) })
        } else {
            const each = Math.floor(sampleSize / selectedStratVar.strata.length)
            selectedStratVar.strata.forEach((s) => { allocation[s.name] = each })
        }
        setStratAllocation(allocation)
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" asChild><Link to="/topic/1"><ArrowLeft className="h-5 w-5" /></Link></Button>
                <div>
                    <h1 className="text-2xl font-bold">阶段3：抽样执行</h1>
                    <p className="text-muted-foreground">目标样本量: n = {sampleSize} | 总体: N = 10,000</p>
                </div>
            </div>

            <Tabs defaultValue="simple" className="space-y-4">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="simple" className="gap-2">简单随机{completedMethods.includes('simple') && <Check className="h-4 w-4 text-green-500" />}</TabsTrigger>
                    <TabsTrigger value="systematic" className="gap-2">系统抽样{completedMethods.includes('systematic') && <Check className="h-4 w-4 text-green-500" />}</TabsTrigger>
                    <TabsTrigger value="stratified" className="gap-2">分层抽样{completedMethods.includes('stratified') && <Check className="h-4 w-4 text-green-500" />}</TabsTrigger>
                </TabsList>

                <TabsContent value="simple">
                    <Card>
                        <CardHeader><CardTitle>简单随机抽样</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-sm text-muted-foreground">从总体中随机抽取指定数量的样本，每个个体被选中的概率相等。</p>
                            <Button onClick={executeSimpleRandom}><RefreshCw className="mr-2 h-4 w-4" />执行简单随机抽样</Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="systematic">
                    <Card>
                        <CardHeader><CardTitle>系统抽样</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-sm text-muted-foreground">按照固定间隔从总体中抽取样本（间隔 k = N/n = {Math.floor(10000 / sampleSize)}）。</p>
                            <Button onClick={executeSystematic}><RefreshCw className="mr-2 h-4 w-4" />执行系统抽样</Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="stratified">
                    <Card>
                        <CardHeader><CardTitle>分层抽样</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-sm text-muted-foreground">将总体按特征分层，在各层内分别抽样。</p>
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label>分层变量</Label>
                                    <Select value={stratVar} onValueChange={setStratVar}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {stratificationVars.map((v) => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                {selectedStratVar && (
                                    <div className="border rounded-lg overflow-hidden">
                                        <Table>
                                            <TableHeader>
                                                <TableRow><TableHead>层</TableHead><TableHead>总体</TableHead><TableHead>比例</TableHead><TableHead>分配样本</TableHead></TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {selectedStratVar.strata.map((s) => (
                                                    <TableRow key={s.name}>
                                                        <TableCell>{s.name}</TableCell>
                                                        <TableCell>{s.pop.toLocaleString()}</TableCell>
                                                        <TableCell>{s.pct}%</TableCell>
                                                        <TableCell><Input type="number" className="w-20" value={stratAllocation[s.name] ?? ''} onChange={(e) => setStratAllocation({ ...stratAllocation, [s.name]: Number(e.target.value) })} /></TableCell>
                                                    </TableRow>
                                                ))}
                                                <TableRow><TableCell colSpan={3} className="text-right font-medium">合计</TableCell><TableCell><Badge variant={totalAllocation === sampleSize ? 'default' : 'destructive'}>{totalAllocation}/{sampleSize}</Badge></TableCell></TableRow>
                                            </TableBody>
                                        </Table>
                                    </div>
                                )}
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={() => autoAllocate('proportional')}>按比例分配</Button>
                                    <Button variant="outline" size="sm" onClick={() => autoAllocate('equal')}>等量分配</Button>
                                </div>
                                <Button onClick={executeStratified} disabled={totalAllocation !== sampleSize}><RefreshCw className="mr-2 h-4 w-4" />执行分层抽样</Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Sample Preview */}
            {currentSamples.length > 0 && (
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between"><CardTitle>样本预览 (前5条)</CardTitle><Button variant="ghost" size="sm"><Eye className="mr-1 h-4 w-4" />查看全部</Button></CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader><TableRow><TableHead>ID</TableHead><TableHead>性别</TableHead><TableHead>年龄</TableHead><TableHead>收入</TableHead><TableHead>学历</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {currentSamples.map((s) => <TableRow key={s.id}><TableCell>{s.id}</TableCell><TableCell>{s.gender}</TableCell><TableCell>{s.age}</TableCell><TableCell>¥{s.income.toLocaleString()}</TableCell><TableCell>{s.education}</TableCell></TableRow>)}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            {/* Progress & Navigation */}
            <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">进度: {completedMethods.length}/3 种方法完成</p>
                <div className="flex gap-2">
                    <Button variant="outline" asChild><Link to="/experiment/1/stage2"><ArrowLeft className="mr-2 h-4 w-4" />上一阶段</Link></Button>
                    <Button disabled={completedMethods.length < 3}>完成阶段<ArrowRight className="ml-2 h-4 w-4" /></Button>
                </div>
            </div>
        </div>
    )
}
