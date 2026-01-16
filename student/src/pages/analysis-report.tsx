import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, ArrowRight, Download } from 'lucide-react'
import { toast } from 'sonner'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const chartData = [
    { name: '总体', income: 7800, age: 35 },
    { name: '简单随机', income: 7950, age: 34.5 },
    { name: '系统抽样', income: 7700, age: 35.2 },
    { name: '分层抽样', income: 7820, age: 34.8 },
]

const errorData = [
    { variable: '收入均值', population: 7800, simpleRandom: 7950, systematic: 7700, stratified: 7820 },
    { variable: '年龄均值', population: 35.0, simpleRandom: 34.5, systematic: 35.2, stratified: 34.8 },
]

export function AnalysisReportPage() {
    const navigate = useNavigate()
    const [selectedVar, setSelectedVar] = useState('income')
    const [report, setReport] = useState('')

    const handleSubmit = () => {
        if (report.length < 100) {
            toast.error('报告内容至少需要100字')
            return
        }
        toast.success('报告完成！', { description: '正在生成预览...' })
        navigate('/experiment/1/preview')
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" asChild><Link to="/topic/1"><ArrowLeft className="h-5 w-5" /></Link></Button>
                <div>
                    <h1 className="text-2xl font-bold">阶段4：分析报告</h1>
                    <p className="text-muted-foreground">分析抽样结果并撰写报告</p>
                </div>
            </div>

            {/* Chart Selection */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>数据对比图</CardTitle>
                    <Select value={selectedVar} onValueChange={setSelectedVar}>
                        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="income">收入</SelectItem>
                            <SelectItem value="age">年龄</SelectItem>
                        </SelectContent>
                    </Select>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey={selectedVar} fill="#3b82f6" name={selectedVar === 'income' ? '收入 (元)' : '年龄 (岁)'} />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* Error Summary */}
            <Card>
                <CardHeader><CardTitle>误差汇总表</CardTitle></CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>变量</TableHead>
                                <TableHead>总体</TableHead>
                                <TableHead>简单随机</TableHead>
                                <TableHead>系统抽样</TableHead>
                                <TableHead>分层抽样</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {errorData.map((row) => (
                                <TableRow key={row.variable}>
                                    <TableCell className="font-medium">{row.variable}</TableCell>
                                    <TableCell>{row.population}</TableCell>
                                    <TableCell>
                                        {row.simpleRandom}
                                        <span className="text-xs text-muted-foreground ml-1">({(Math.abs(row.simpleRandom - row.population) / row.population * 100).toFixed(1)}%)</span>
                                    </TableCell>
                                    <TableCell>
                                        {row.systematic}
                                        <span className="text-xs text-muted-foreground ml-1">({(Math.abs(row.systematic - row.population) / row.population * 100).toFixed(1)}%)</span>
                                    </TableCell>
                                    <TableCell>
                                        {row.stratified}
                                        <span className="text-xs text-muted-foreground ml-1">({(Math.abs(row.stratified - row.population) / row.population * 100).toFixed(1)}%)</span>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Export Data */}
            <Card>
                <CardHeader><CardTitle>导出数据</CardTitle></CardHeader>
                <CardContent className="flex gap-2">
                    <Button variant="outline" size="sm"><Download className="mr-1 h-4 w-4" />简单随机 CSV</Button>
                    <Button variant="outline" size="sm"><Download className="mr-1 h-4 w-4" />系统抽样 CSV</Button>
                    <Button variant="outline" size="sm"><Download className="mr-1 h-4 w-4" />分层抽样 CSV</Button>
                </CardContent>
            </Card>

            {/* Report Writing */}
            <Card>
                <CardHeader><CardTitle>分析报告</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label>根据上述图表，分析和比较三种抽样方法的结果 *</Label>
                        <textarea
                            className="w-full min-h-[200px] p-3 rounded-md border bg-background resize-none"
                            value={report}
                            onChange={(e) => setReport(e.target.value.slice(0, 2000))}
                            placeholder="基于我的分析，分层抽样提供了最接近总体参数的估计值..."
                        />
                        <p className="text-xs text-muted-foreground">{report.length}/2000 字符 (最少100字)</p>
                    </div>
                </CardContent>
            </Card>

            {/* Navigation */}
            <div className="flex justify-between">
                <Button variant="outline" asChild><Link to="/experiment/1/stage3"><ArrowLeft className="mr-2 h-4 w-4" />上一阶段</Link></Button>
                <Button onClick={handleSubmit} disabled={report.length < 100}>完成并预览<ArrowRight className="ml-2 h-4 w-4" /></Button>
            </div>
        </div>
    )
}
