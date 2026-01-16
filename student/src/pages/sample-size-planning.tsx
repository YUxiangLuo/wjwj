import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, ArrowRight, Info } from 'lucide-react'
import { toast } from 'sonner'

const confidenceLevels = [
    { value: 90, z: 1.645, label: '90%' },
    { value: 95, z: 1.96, label: '95%' },
    { value: 99, z: 2.576, label: '99%' },
]

export function SampleSizePlanningPage() {
    const populationSize = 10000
    const [confidenceLevel, setConfidenceLevel] = useState(95)
    const [marginOfError, setMarginOfError] = useState(5)
    const [finalSampleSize, setFinalSampleSize] = useState<number | null>(null)

    const z = confidenceLevels.find((c) => c.value === confidenceLevel)?.z || 1.96
    const p = 0.5
    const e = marginOfError / 100

    // Calculate sample size
    const rawN = (z * z * p * (1 - p)) / (e * e)
    const adjustedN = Math.ceil(rawN / (1 + (rawN - 1) / populationSize))
    const recommendedN = adjustedN

    const handleConfirm = () => {
        if (!finalSampleSize || finalSampleSize < 30 || finalSampleSize > 5000) {
            toast.error('样本量必须在30-5000之间')
            return
        }
        toast.success('样本量规划完成！', { description: '进入抽样执行阶段' })
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" asChild>
                    <Link to="/topic/1"><ArrowLeft className="h-5 w-5" /></Link>
                </Button>
                <div>
                    <h1 className="text-2xl font-bold">阶段2：样本量规划</h1>
                    <p className="text-muted-foreground">确定调查所需的样本数量</p>
                </div>
            </div>

            {/* Population Info */}
            <Card className="bg-blue-50 border-blue-200">
                <CardContent className="py-4">
                    <p className="text-sm"><strong>总体规模:</strong> N = {populationSize.toLocaleString()} 个样本</p>
                </CardContent>
            </Card>

            {/* Statistical Parameters */}
            <Card>
                <CardHeader><CardTitle>统计参数</CardTitle></CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-3">
                        <Label>置信水平</Label>
                        <div className="flex gap-4">
                            {confidenceLevels.map((level) => (
                                <label key={level.value} className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="confidence"
                                        checked={confidenceLevel === level.value}
                                        onChange={() => setConfidenceLevel(level.value)}
                                        className="w-4 h-4"
                                    />
                                    <span>{level.label} (Z={level.z})</span>
                                </label>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-3">
                        <Label>允许误差: {marginOfError}%</Label>
                        <input
                            type="range"
                            min={1}
                            max={10}
                            value={marginOfError}
                            onChange={(e) => setMarginOfError(Number(e.target.value))}
                            className="w-full h-2 bg-gray-200 rounded-lg cursor-pointer"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                            <span>1%</span>
                            <span>5%</span>
                            <span>10%</span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Calculation */}
            <Card>
                <CardHeader><CardTitle>计算过程</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <div className="p-4 bg-muted rounded-lg font-mono text-sm space-y-2">
                        <p>公式: n = (Z² × p × (1-p)) / E²</p>
                        <p className="text-muted-foreground">其中:</p>
                        <ul className="list-disc list-inside text-muted-foreground space-y-1">
                            <li>Z = {z} ({confidenceLevel}% 置信水平)</li>
                            <li>p = 0.5 (最大方差假设)</li>
                            <li>E = {(marginOfError / 100).toFixed(2)} ({marginOfError}% 允许误差)</li>
                        </ul>
                        <hr className="my-2" />
                        <p>n = ({z}² × 0.5 × 0.5) / {(marginOfError / 100).toFixed(2)}² = <strong>{Math.ceil(rawN)}</strong></p>
                        <p className="text-muted-foreground">有限总体校正后: <strong>{recommendedN}</strong></p>
                    </div>
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center">
                        <p className="text-sm text-green-800">建议样本量</p>
                        <p className="text-3xl font-bold text-green-700">n = {recommendedN}</p>
                    </div>
                </CardContent>
            </Card>

            {/* Final Decision */}
            <Card>
                <CardHeader><CardTitle>最终决定</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label>最终样本量</Label>
                        <Input
                            type="number"
                            value={finalSampleSize ?? ''}
                            onChange={(e) => setFinalSampleSize(Number(e.target.value) || null)}
                            placeholder={String(recommendedN)}
                            min={30}
                            max={5000}
                        />
                    </div>
                    <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                        <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <p>您可以根据实际情况调整样本量。建议范围: 30 - 5,000</p>
                    </div>
                </CardContent>
            </Card>

            {/* Navigation */}
            <div className="flex justify-between">
                <Button variant="outline" asChild>
                    <Link to="/experiment/1/stage1"><ArrowLeft className="mr-2 h-4 w-4" />上一阶段</Link>
                </Button>
                <Button onClick={handleConfirm} disabled={!finalSampleSize}>
                    确认并继续<ArrowRight className="ml-2 h-4 w-4" />
                </Button>
            </div>
        </div>
    )
}
