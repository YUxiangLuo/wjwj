import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronRight, Plus, GripVertical, Trash2 } from "lucide-react";

interface QuestionnaireDesignProps {
    onNext: () => void;
}

export function QuestionnaireDesign({ onNext }: QuestionnaireDesignProps) {
    const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
    const [title, setTitle] = useState("");
    const [welcomeText, setWelcomeText] = useState("");
    const [endingText, setEndingText] = useState("");
    const [questions, setQuestions] = useState<Array<{ id: number; type: string; content: string }>>([
        { id: 1, type: "single", content: "您的年龄段是？" },
        { id: 2, type: "single", content: "您的月收入水平是？" },
        { id: 3, type: "multiple", content: "您通常通过哪些渠道购物？" },
    ]);

    const steps = [
        { num: 1, title: "欢迎语设置" },
        { num: 2, title: "题目设计" },
        { num: 3, title: "结束语设置" },
        { num: 4, title: "预览确认" },
    ];

    const renderStep = () => {
        switch (step) {
            case 1:
                return (
                    <Card>
                        <CardHeader>
                            <CardTitle>欢迎语设置</CardTitle>
                            <CardDescription>设置问卷的标题和欢迎语，让受访者了解调查目的</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="title">问卷标题 *</Label>
                                <Input
                                    id="title"
                                    placeholder="请输入问卷标题"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    maxLength={100}
                                />
                                <p className="text-xs text-muted-foreground text-right">{title.length}/100</p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="welcome">欢迎语 *</Label>
                                <Textarea
                                    id="welcome"
                                    placeholder="请输入欢迎语，说明调查目的、预计用时等"
                                    value={welcomeText}
                                    onChange={(e) => setWelcomeText(e.target.value)}
                                    rows={6}
                                    maxLength={1000}
                                />
                                <p className="text-xs text-muted-foreground text-right">{welcomeText.length}/1000</p>
                            </div>
                        </CardContent>
                    </Card>
                );

            case 2:
                return (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Question list */}
                        <div className="lg:col-span-2">
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between">
                                    <div>
                                        <CardTitle>题目列表</CardTitle>
                                        <CardDescription>已添加 {questions.length} 道题目（最少5题，最多50题）</CardDescription>
                                    </div>
                                    <Button size="sm">
                                        <Plus className="w-4 h-4 mr-1" />
                                        添加题目
                                    </Button>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-2">
                                        {questions.map((q, index) => (
                                            <div key={q.id} className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
                                                <GripVertical className="w-4 h-4 text-slate-400 cursor-grab" />
                                                <span className="text-sm font-medium w-8">Q{index + 1}</span>
                                                <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                                                    {q.type === "single" ? "单选" : q.type === "multiple" ? "多选" : q.type}
                                                </span>
                                                <span className="flex-1 text-sm truncate">{q.content}</span>
                                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                                    <Trash2 className="w-4 h-4 text-slate-400" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Recommended questions */}
                        <div>
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">推荐题目</CardTitle>
                                    <CardDescription>教师提供的参考题目</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-2 text-sm text-muted-foreground">
                                        <p>暂无推荐题目</p>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                );

            case 3:
                return (
                    <Card>
                        <CardHeader>
                            <CardTitle>结束语设置</CardTitle>
                            <CardDescription>设置问卷的结束语，感谢受访者参与</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="ending">结束语 *</Label>
                                <Textarea
                                    id="ending"
                                    placeholder="请输入结束语，如致谢词等"
                                    value={endingText}
                                    onChange={(e) => setEndingText(e.target.value)}
                                    rows={6}
                                    maxLength={1000}
                                />
                                <p className="text-xs text-muted-foreground text-right">{endingText.length}/1000</p>
                            </div>
                        </CardContent>
                    </Card>
                );

            case 4:
                return (
                    <Card>
                        <CardHeader>
                            <CardTitle>预览确认</CardTitle>
                            <CardDescription>检查问卷内容，确认后将锁定问卷设计</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="p-4 bg-slate-50 rounded-lg space-y-4">
                                <div>
                                    <p className="text-sm text-muted-foreground">问卷标题</p>
                                    <p className="font-medium">{title || "(未填写)"}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">题目数量</p>
                                    <p className="font-medium">{questions.length} 道</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${questions.length >= 5 ? "bg-emerald-500" : "bg-red-500"}`} />
                                    <span className="text-sm">{questions.length >= 5 ? "题目数量符合要求" : "题目数量不足5道"}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                );
        }
    };

    return (
        <div className="space-y-6">
            {/* Step indicator */}
            <div className="flex items-center justify-center gap-2">
                {steps.map((s, index) => (
                    <div key={s.num} className="flex items-center">
                        <button
                            onClick={() => setStep(s.num as 1 | 2 | 3 | 4)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${step === s.num
                                    ? "bg-blue-500 text-white"
                                    : step > s.num
                                        ? "bg-emerald-100 text-emerald-700"
                                        : "bg-slate-100 text-slate-500"
                                }`}
                        >
                            {s.title}
                        </button>
                        {index < steps.length - 1 && (
                            <ChevronRight className="w-5 h-5 mx-1 text-slate-300" />
                        )}
                    </div>
                ))}
            </div>

            {/* Step content */}
            {renderStep()}

            {/* Navigation */}
            <div className="flex justify-between">
                <Button
                    variant="outline"
                    onClick={() => step > 1 && setStep((step - 1) as 1 | 2 | 3 | 4)}
                    disabled={step === 1}
                >
                    上一步
                </Button>
                {step < 4 ? (
                    <Button onClick={() => setStep((step + 1) as 1 | 2 | 3 | 4)}>
                        下一步
                    </Button>
                ) : (
                    <Button onClick={onNext}>
                        确认完成，进入下一阶段
                    </Button>
                )}
            </div>
        </div>
    );
}

export default QuestionnaireDesign;
