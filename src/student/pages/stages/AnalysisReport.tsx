import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Download, FileText, Send } from "lucide-react";

interface AnalysisReportProps {
    onPrev: () => void;
    onSubmit: () => void;
}

export function AnalysisReport({ onPrev, onSubmit }: AnalysisReportProps) {
    const [reportContent, setReportContent] = useState("");

    const minLength = 100;
    const maxLength = 5000;
    const isValidLength = reportContent.length >= minLength && reportContent.length <= maxLength;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Charts area */}
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <BarChart3 className="w-5 h-5" />
                                图表分析
                            </CardTitle>
                            <CardDescription>系统自动生成的统计图表</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Tabs defaultValue="mean">
                                <TabsList>
                                    <TabsTrigger value="mean">均值对比</TabsTrigger>
                                    <TabsTrigger value="dist">分布对比</TabsTrigger>
                                    <TabsTrigger value="error">误差分析</TabsTrigger>
                                </TabsList>

                                <TabsContent value="mean" className="mt-4">
                                    <div className="h-64 bg-slate-100 rounded-lg flex items-center justify-center">
                                        <div className="text-center text-muted-foreground">
                                            <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                            <p>均值对比柱状图</p>
                                            <p className="text-sm">（展示三种抽样方法的均值对比）</p>
                                        </div>
                                    </div>
                                </TabsContent>

                                <TabsContent value="dist" className="mt-4">
                                    <div className="h-64 bg-slate-100 rounded-lg flex items-center justify-center">
                                        <div className="text-center text-muted-foreground">
                                            <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                            <p>分布对比图</p>
                                            <p className="text-sm">（展示样本分布与总体分布对比）</p>
                                        </div>
                                    </div>
                                </TabsContent>

                                <TabsContent value="error" className="mt-4">
                                    <div className="h-64 bg-slate-100 rounded-lg flex items-center justify-center">
                                        <div className="text-center text-muted-foreground">
                                            <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                            <p>抽样误差分析图</p>
                                            <p className="text-sm">（展示三种方法的抽样标准误对比）</p>
                                        </div>
                                    </div>
                                </TabsContent>
                            </Tabs>
                        </CardContent>
                    </Card>
                </div>

                {/* Export area */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Download className="w-5 h-5" />
                                数据导出
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <Button variant="outline" className="w-full justify-start">
                                <FileText className="w-4 h-4 mr-2" />
                                简单随机抽样结果
                            </Button>
                            <Button variant="outline" className="w-full justify-start">
                                <FileText className="w-4 h-4 mr-2" />
                                系统抽样结果
                            </Button>
                            <Button variant="outline" className="w-full justify-start">
                                <FileText className="w-4 h-4 mr-2" />
                                分层抽样结果
                            </Button>
                            <Button variant="outline" className="w-full justify-start">
                                <FileText className="w-4 h-4 mr-2" />
                                导出全部数据
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Report writing area */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        撰写报告
                    </CardTitle>
                    <CardDescription>
                        请根据实验结果撰写分析报告（{minLength}-{maxLength}字）
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="p-4 bg-blue-50 rounded-lg text-sm text-blue-700">
                        <p className="font-medium mb-2">建议包含以下内容：</p>
                        <ol className="list-decimal list-inside space-y-1">
                            <li>抽样方法选择的理由</li>
                            <li>各方法执行结果的对比分析</li>
                            <li>抽样误差的分析</li>
                            <li>对调查结论可靠性的评估</li>
                            <li>改进建议（可选）</li>
                        </ol>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="report">报告内容</Label>
                        <Textarea
                            id="report"
                            placeholder="请在此撰写您的分析报告..."
                            value={reportContent}
                            onChange={(e) => setReportContent(e.target.value)}
                            rows={12}
                            maxLength={maxLength}
                        />
                        <div className="flex justify-between text-sm">
                            <span className={reportContent.length < minLength ? "text-red-500" : "text-muted-foreground"}>
                                {reportContent.length < minLength
                                    ? `还需 ${minLength - reportContent.length} 字`
                                    : "✓ 字数符合要求"}
                            </span>
                            <span className="text-muted-foreground">{reportContent.length}/{maxLength}</span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Navigation */}
            <div className="flex justify-between">
                <Button variant="outline" onClick={onPrev}>
                    上一阶段
                </Button>
                <Button onClick={onSubmit} disabled={!isValidLength}>
                    <Send className="w-4 h-4 mr-2" />
                    完成并预览提交
                </Button>
            </div>
        </div>
    );
}

export default AnalysisReport;
