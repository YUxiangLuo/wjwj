import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Calculator } from "lucide-react";
import { useExperiment } from "../ExperimentLayout";

interface SamplePlanningProps {
    onNext: () => void;
    onPrev: () => void;
}

export function SamplePlanning({ onNext, onPrev }: SamplePlanningProps) {
    const { populationSize } = useExperiment();
    const [confidenceLevel, setConfidenceLevel] = useState("95");
    const [marginOfError, setMarginOfError] = useState([5]);
    const [finalSampleSize, setFinalSampleSize] = useState(384);

    const N = populationSize; // Total population (from topic)

    // Z values for confidence levels
    const zValues: Record<string, number> = {
        "90": 1.645,
        "95": 1.96,
        "99": 2.576,
    };

    // Calculate recommended sample size
    const calculateSampleSize = () => {
        const z = zValues[confidenceLevel] ?? 1.96;
        const e = (marginOfError[0] ?? 5) / 100;
        const p = 0.5; // Maximum variability

        const n0 = (z * z * p * (1 - p)) / (e * e);
        const n = n0 / (1 + (n0 - 1) / N);
        return Math.ceil(n);
    };

    const recommendedSize = calculateSampleSize();
    const minSize = 30;
    const maxSize = Math.floor(N * 0.5);

    const isValidSize = finalSampleSize >= minSize && finalSampleSize <= maxSize;

    return (
        <div className="space-y-6">
            {/* Population info */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Calculator className="w-5 h-5" />
                        总体信息
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-lg">
                        本次调查的总体规模为 <span className="font-bold text-blue-600">N = {N.toLocaleString()}</span> 人
                    </p>
                </CardContent>
            </Card>

            {/* Parameters */}
            <Card>
                <CardHeader>
                    <CardTitle>参数设置</CardTitle>
                    <CardDescription>调整置信水平和允许误差来计算建议样本量</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label>置信水平</Label>
                            <Select value={confidenceLevel} onValueChange={setConfidenceLevel}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="90">90%</SelectItem>
                                    <SelectItem value="95">95%</SelectItem>
                                    <SelectItem value="99">99%</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                Z = {zValues[confidenceLevel]}
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label>允许误差: {marginOfError[0]}%</Label>
                            <Slider
                                value={marginOfError}
                                onValueChange={setMarginOfError}
                                min={1}
                                max={10}
                                step={1}
                            />
                            <p className="text-xs text-muted-foreground">
                                范围: 1% - 10%
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Calculation result */}
            <Card>
                <CardHeader>
                    <CardTitle>计算结果</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="p-4 bg-blue-50 rounded-lg">
                        <p className="text-sm text-blue-700 mb-2">样本量计算公式：</p>
                        <p className="font-mono text-sm">n = n₀ / (1 + (n₀ - 1) / N)</p>
                        <p className="font-mono text-sm">其中 n₀ = Z² × p × (1-p) / E²</p>
                    </div>

                    <div className="text-center py-4">
                        <p className="text-muted-foreground">建议样本量</p>
                        <p className="text-4xl font-bold text-blue-600">{recommendedSize}</p>
                    </div>
                </CardContent>
            </Card>

            {/* Final decision */}
            <Card>
                <CardHeader>
                    <CardTitle>最终样本量</CardTitle>
                    <CardDescription>您可以根据实际情况调整最终样本量</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="finalSize">最终样本量</Label>
                        <Input
                            id="finalSize"
                            type="number"
                            value={finalSampleSize}
                            onChange={(e) => setFinalSampleSize(parseInt(e.target.value) || 0)}
                            min={minSize}
                            max={maxSize}
                        />
                        <p className="text-xs text-muted-foreground">
                            有效范围: {minSize} - {maxSize.toLocaleString()}（总体的50%）
                        </p>
                    </div>

                    {!isValidSize && (
                        <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                            样本量超出有效范围，请调整
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Navigation */}
            <div className="flex justify-between">
                <Button variant="outline" onClick={onPrev}>
                    上一阶段
                </Button>
                <Button onClick={onNext} disabled={!isValidSize}>
                    确认并进入下一阶段
                </Button>
            </div>
        </div>
    );
}

export default SamplePlanning;
