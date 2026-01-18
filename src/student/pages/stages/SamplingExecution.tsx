import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Play, RefreshCw } from "lucide-react";
import { useExperiment } from "../ExperimentLayout";

interface SamplingExecutionProps {
    onNext: () => void;
    onPrev: () => void;
}

type SamplingMethod = "simple" | "systematic" | "stratified";

export function SamplingExecution({ onNext, onPrev }: SamplingExecutionProps) {
    const { populationSize, experiment } = useExperiment();
    const [completedMethods, setCompletedMethods] = useState<Set<SamplingMethod>>(new Set());
    const [kValue, setKValue] = useState(25);
    const [executed, setExecuted] = useState<Record<SamplingMethod, boolean>>({
        simple: false,
        systematic: false,
        stratified: false,
    });

    // Get sample size from experiment's sample plan, or default to 384
    const n = (experiment?.samplePlan as { finalSampleSize?: number })?.finalSampleSize ?? 384;
    const N = populationSize; // Population size from topic

    const handleExecute = (method: SamplingMethod) => {
        setExecuted(prev => ({ ...prev, [method]: true }));
        setCompletedMethods(prev => new Set([...prev, method]));
    };

    const allCompleted = completedMethods.size === 3;

    // Mock sample data
    const samplePreview = [
        { id: 1, age: 25, gender: "男", income: "5000-8000" },
        { id: 2, age: 32, gender: "女", income: "8000-12000" },
        { id: 3, age: 28, gender: "男", income: "3000-5000" },
        { id: 4, age: 45, gender: "女", income: "12000-20000" },
        { id: 5, age: 22, gender: "男", income: "3000以下" },
    ];

    return (
        <div className="space-y-6">
            {/* Info header */}
            <Card>
                <CardContent className="py-4">
                    <div className="flex justify-between items-center">
                        <div>
                            <span className="text-muted-foreground">目标样本量：</span>
                            <span className="font-bold text-lg ml-1">{n}</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground">总体规模：</span>
                            <span className="font-bold text-lg ml-1">{N.toLocaleString()}</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground">完成进度：</span>
                            <span className="font-bold text-lg ml-1">{completedMethods.size}/3</span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Sampling methods tabs */}
            <Tabs defaultValue="simple" className="space-y-4">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="simple" className="gap-2">
                        简单随机抽样
                        {completedMethods.has("simple") && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                    </TabsTrigger>
                    <TabsTrigger value="systematic" className="gap-2">
                        系统抽样
                        {completedMethods.has("systematic") && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                    </TabsTrigger>
                    <TabsTrigger value="stratified" className="gap-2">
                        分层抽样
                        {completedMethods.has("stratified") && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                    </TabsTrigger>
                </TabsList>

                {/* Simple Random Sampling */}
                <TabsContent value="simple">
                    <Card>
                        <CardHeader>
                            <CardTitle>简单随机抽样</CardTitle>
                            <CardDescription>
                                从 {N.toLocaleString()} 个总体中随机抽取 {n} 个样本，每个个体被抽中的概率相等。
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {!executed.simple ? (
                                <Button onClick={() => handleExecute("simple")}>
                                    <Play className="w-4 h-4 mr-2" />
                                    执行抽样
                                </Button>
                            ) : (
                                <>
                                    <div className="p-4 bg-emerald-50 rounded-lg">
                                        <p className="text-emerald-700">✓ 抽样完成，共抽取 {n} 个样本</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button variant="outline" size="sm">
                                            <RefreshCw className="w-4 h-4 mr-1" />
                                            重新抽样
                                        </Button>
                                    </div>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>ID</TableHead>
                                                <TableHead>年龄</TableHead>
                                                <TableHead>性别</TableHead>
                                                <TableHead>收入</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {samplePreview.map(row => (
                                                <TableRow key={row.id}>
                                                    <TableCell>{row.id}</TableCell>
                                                    <TableCell>{row.age}</TableCell>
                                                    <TableCell>{row.gender}</TableCell>
                                                    <TableCell>{row.income}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                    <p className="text-sm text-muted-foreground">显示前 5 条，共 {n} 条</p>
                                </>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Systematic Sampling */}
                <TabsContent value="systematic">
                    <Card>
                        <CardHeader>
                            <CardTitle>系统抽样</CardTitle>
                            <CardDescription>
                                按固定间隔 K 从总体中抽取样本。建议 K 值：{Math.round(N / n)}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="kValue">间隔 K 值</Label>
                                <Input
                                    id="kValue"
                                    type="number"
                                    value={kValue}
                                    onChange={(e) => setKValue(parseInt(e.target.value) || 1)}
                                    min={1}
                                    max={N}
                                />
                                <p className="text-sm text-muted-foreground">
                                    预计抽取数量：{Math.ceil(N / kValue)}
                                </p>
                            </div>

                            {!executed.systematic ? (
                                <Button onClick={() => handleExecute("systematic")}>
                                    <Play className="w-4 h-4 mr-2" />
                                    执行抽样
                                </Button>
                            ) : (
                                <div className="p-4 bg-emerald-50 rounded-lg">
                                    <p className="text-emerald-700">✓ 抽样完成，共抽取 {Math.ceil(N / kValue)} 个样本</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Stratified Sampling */}
                <TabsContent value="stratified">
                    <Card>
                        <CardHeader>
                            <CardTitle>分层抽样</CardTitle>
                            <CardDescription>
                                按分层变量将总体分层，然后从各层中抽取样本。
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label>选择分层变量</Label>
                                <div className="flex gap-2">
                                    <Badge variant="outline" className="cursor-pointer hover:bg-blue-50">年龄段</Badge>
                                    <Badge variant="outline" className="cursor-pointer hover:bg-blue-50">性别</Badge>
                                    <Badge variant="outline" className="cursor-pointer hover:bg-blue-50">收入水平</Badge>
                                </div>
                            </div>

                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>层</TableHead>
                                        <TableHead>人数</TableHead>
                                        <TableHead>占比</TableHead>
                                        <TableHead>样本数</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    <TableRow>
                                        <TableCell>18-30岁</TableCell>
                                        <TableCell>3500</TableCell>
                                        <TableCell>35%</TableCell>
                                        <TableCell>134</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell>31-45岁</TableCell>
                                        <TableCell>4000</TableCell>
                                        <TableCell>40%</TableCell>
                                        <TableCell>154</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell>46岁以上</TableCell>
                                        <TableCell>2500</TableCell>
                                        <TableCell>25%</TableCell>
                                        <TableCell>96</TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>

                            {!executed.stratified ? (
                                <Button onClick={() => handleExecute("stratified")}>
                                    <Play className="w-4 h-4 mr-2" />
                                    执行抽样
                                </Button>
                            ) : (
                                <div className="p-4 bg-emerald-50 rounded-lg">
                                    <p className="text-emerald-700">✓ 分层抽样完成，共抽取 {n} 个样本</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Navigation */}
            <div className="flex justify-between">
                <Button variant="outline" onClick={onPrev}>
                    上一阶段
                </Button>
                <Button onClick={onNext} disabled={!allCompleted}>
                    {allCompleted ? "完成本阶段" : `请完成所有抽样方法 (${completedMethods.size}/3)`}
                </Button>
            </div>
        </div>
    );
}

export default SamplingExecution;
