import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChevronRight, Plus, GripVertical, Trash2, Edit2, CheckCircle, AlertCircle, Copy } from "lucide-react";
import { useExperiment } from "../ExperimentLayout";
import { QuestionEditor } from "../../components/QuestionEditor";
import type { Question, QuestionType, QuestionnaireData } from "../../api-client";

interface QuestionnaireDesignProps {
    onNext: () => void;
}

const questionTypeLabels: Record<QuestionType, string> = {
    boolean: "判断题",
    single: "单选题",
    multiple: "多选题",
    scale: "量表",
};

const questionTypeColors: Record<QuestionType, string> = {
    boolean: "bg-purple-100 text-purple-700",
    single: "bg-blue-100 text-blue-700",
    multiple: "bg-green-100 text-green-700",
    scale: "bg-amber-100 text-amber-700",
};

function generateId(): string {
    return `q_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function QuestionnaireDesign({ onNext }: QuestionnaireDesignProps) {
    const { experiment, saveExperiment } = useExperiment();

    // Initialize from experiment data
    const initialData = experiment?.questionnaire as QuestionnaireData | null;

    const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
    const [title, setTitle] = useState(initialData?.title ?? "");
    const [welcomeText, setWelcomeText] = useState(initialData?.welcomeText ?? "");
    const [endingText, setEndingText] = useState(initialData?.endingText ?? "");
    const [questions, setQuestions] = useState<Question[]>(initialData?.questions ?? []);

    // Editor state
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingQuestion, setEditingQuestion] = useState<Question | undefined>();
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [questionToDelete, setQuestionToDelete] = useState<string | null>(null);
    const [confirmNextOpen, setConfirmNextOpen] = useState(false);

    // Auto-save when data changes (debounced)
    const saveData = useCallback(async () => {
        const questionnaireData: QuestionnaireData = {
            title,
            welcomeText,
            endingText,
            questions,
        };
        await saveExperiment({ questionnaire: questionnaireData });
    }, [title, welcomeText, endingText, questions, saveExperiment]);

    // Save on data change with debounce
    useEffect(() => {
        const timer = setTimeout(() => {
            if (title || welcomeText || endingText || questions.length > 0) {
                saveData();
            }
        }, 2000); // 2 second debounce

        return () => clearTimeout(timer);
    }, [title, welcomeText, endingText, questions, saveData]);

    const steps = [
        { num: 1, title: "欢迎语设置" },
        { num: 2, title: "题目设计" },
        { num: 3, title: "结束语设置" },
        { num: 4, title: "预览确认" },
    ];

    // Question management
    const handleAddQuestion = () => {
        setEditingQuestion(undefined);
        setEditorOpen(true);
    };

    const handleEditQuestion = (question: Question) => {
        setEditingQuestion(question);
        setEditorOpen(true);
    };

    const handleSaveQuestion = (question: Question) => {
        if (editingQuestion) {
            // Update existing
            setQuestions(questions.map((q) => (q.id === question.id ? question : q)));
        } else {
            // Add new
            setQuestions([...questions, question]);
        }
    };

    const handleDeleteQuestion = (id: string) => {
        setQuestionToDelete(id);
        setDeleteConfirmOpen(true);
    };

    const confirmDelete = () => {
        if (questionToDelete) {
            setQuestions(questions.filter((q) => q.id !== questionToDelete));
            setQuestionToDelete(null);
        }
        setDeleteConfirmOpen(false);
    };

    const handleDuplicateQuestion = (question: Question) => {
        const duplicate: Question = {
            ...question,
            id: generateId(),
            content: question.content + " (复制)",
        };
        const index = questions.findIndex((q) => q.id === question.id);
        const newQuestions = [...questions];
        newQuestions.splice(index + 1, 0, duplicate);
        setQuestions(newQuestions);
    };

    // Validation
    const validation = {
        title: title.trim().length >= 1 && title.length <= 100,
        welcomeText: welcomeText.trim().length >= 20,
        endingText: endingText.trim().length >= 20,
        questionCount: questions.length >= 5 && questions.length <= 50,
        questionTypes: new Set(questions.map((q) => q.type)).size >= 2,
    };

    const canProceed = validation.title && validation.welcomeText && validation.endingText && validation.questionCount;

    const handleConfirmComplete = async () => {
        // Save final data
        await saveData();
        // Move to next stage
        await saveExperiment({ currentStage: 2 });
        onNext();
    };

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
                                <Label htmlFor="welcome">欢迎语 *（至少20字）</Label>
                                <Textarea
                                    id="welcome"
                                    placeholder="请输入欢迎语，说明调查目的、预计用时等"
                                    value={welcomeText}
                                    onChange={(e) => setWelcomeText(e.target.value)}
                                    rows={6}
                                    maxLength={1000}
                                />
                                <div className="flex justify-between text-xs">
                                    <span className={welcomeText.length < 20 ? "text-red-500" : "text-muted-foreground"}>
                                        {welcomeText.length < 20 ? `还需 ${20 - welcomeText.length} 字` : "✓ 符合要求"}
                                    </span>
                                    <span className="text-muted-foreground">{welcomeText.length}/1000</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                );

            case 2:
                return (
                    <div className="space-y-6">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div>
                                    <CardTitle>题目列表</CardTitle>
                                    <CardDescription>
                                        已添加 {questions.length} 道题目（最少5题，最多50题）
                                    </CardDescription>
                                </div>
                                <Button onClick={handleAddQuestion} disabled={questions.length >= 50}>
                                    <Plus className="w-4 h-4 mr-1" />
                                    添加题目
                                </Button>
                            </CardHeader>
                            <CardContent>
                                {questions.length === 0 ? (
                                    <div className="text-center py-12 text-muted-foreground">
                                        <p>暂无题目，点击「添加题目」开始设计问卷</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {questions.map((q, index) => (
                                            <div
                                                key={q.id}
                                                className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors group"
                                            >
                                                <GripVertical className="w-4 h-4 text-slate-400 cursor-grab" />
                                                <span className="text-sm font-medium w-8">Q{index + 1}</span>
                                                <span className={`text-xs px-2 py-0.5 rounded ${questionTypeColors[q.type]}`}>
                                                    {questionTypeLabels[q.type]}
                                                </span>
                                                <span className="flex-1 text-sm truncate">{q.content}</span>
                                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8"
                                                        onClick={() => handleDuplicateQuestion(q)}
                                                    >
                                                        <Copy className="w-4 h-4 text-slate-400" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8"
                                                        onClick={() => handleEditQuestion(q)}
                                                    >
                                                        <Edit2 className="w-4 h-4 text-slate-400" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8"
                                                        onClick={() => handleDeleteQuestion(q.id)}
                                                    >
                                                        <Trash2 className="w-4 h-4 text-red-400" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Validation hints */}
                        {questions.length < 5 && (
                            <div className="p-3 bg-amber-50 text-amber-700 rounded-lg text-sm flex items-center gap-2">
                                <AlertCircle className="w-4 h-4" />
                                还需添加 {5 - questions.length} 道题目才能继续
                            </div>
                        )}
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
                                <Label htmlFor="ending">结束语 *（至少20字）</Label>
                                <Textarea
                                    id="ending"
                                    placeholder="请输入结束语，如致谢词等"
                                    value={endingText}
                                    onChange={(e) => setEndingText(e.target.value)}
                                    rows={6}
                                    maxLength={1000}
                                />
                                <div className="flex justify-between text-xs">
                                    <span className={endingText.length < 20 ? "text-red-500" : "text-muted-foreground"}>
                                        {endingText.length < 20 ? `还需 ${20 - endingText.length} 字` : "✓ 符合要求"}
                                    </span>
                                    <span className="text-muted-foreground">{endingText.length}/1000</span>
                                </div>
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
                            {/* Validation checklist */}
                            <div className="space-y-2">
                                <div className={`flex items-center gap-2 p-3 rounded-lg ${validation.title ? "bg-emerald-50" : "bg-red-50"}`}>
                                    {validation.title ? (
                                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                                    ) : (
                                        <AlertCircle className="w-4 h-4 text-red-500" />
                                    )}
                                    <span className="text-sm">问卷标题：{title || "(未填写)"}</span>
                                </div>
                                <div className={`flex items-center gap-2 p-3 rounded-lg ${validation.welcomeText ? "bg-emerald-50" : "bg-red-50"}`}>
                                    {validation.welcomeText ? (
                                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                                    ) : (
                                        <AlertCircle className="w-4 h-4 text-red-500" />
                                    )}
                                    <span className="text-sm">欢迎语：{welcomeText.length} 字 {validation.welcomeText ? "" : "(至少20字)"}</span>
                                </div>
                                <div className={`flex items-center gap-2 p-3 rounded-lg ${validation.questionCount ? "bg-emerald-50" : "bg-red-50"}`}>
                                    {validation.questionCount ? (
                                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                                    ) : (
                                        <AlertCircle className="w-4 h-4 text-red-500" />
                                    )}
                                    <span className="text-sm">题目数量：{questions.length} 道 {validation.questionCount ? "" : "(需要5-50道)"}</span>
                                </div>
                                <div className={`flex items-center gap-2 p-3 rounded-lg ${validation.questionTypes ? "bg-emerald-50" : "bg-amber-50"}`}>
                                    {validation.questionTypes ? (
                                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                                    ) : (
                                        <AlertCircle className="w-4 h-4 text-amber-500" />
                                    )}
                                    <span className="text-sm">
                                        题型多样性：{new Set(questions.map((q) => q.type)).size} 种题型
                                        {validation.questionTypes ? "" : " (建议至少2种)"}
                                    </span>
                                </div>
                                <div className={`flex items-center gap-2 p-3 rounded-lg ${validation.endingText ? "bg-emerald-50" : "bg-red-50"}`}>
                                    {validation.endingText ? (
                                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                                    ) : (
                                        <AlertCircle className="w-4 h-4 text-red-500" />
                                    )}
                                    <span className="text-sm">结束语：{endingText.length} 字 {validation.endingText ? "" : "(至少20字)"}</span>
                                </div>
                            </div>

                            {/* Quick preview */}
                            <div className="p-4 bg-slate-50 rounded-lg space-y-3">
                                <p className="text-sm font-medium">题目预览</p>
                                {questions.slice(0, 5).map((q, index) => (
                                    <div key={q.id} className="text-sm text-muted-foreground">
                                        Q{index + 1}. [{questionTypeLabels[q.type]}] {q.content}
                                    </div>
                                ))}
                                {questions.length > 5 && (
                                    <p className="text-sm text-muted-foreground">... 还有 {questions.length - 5} 道题目</p>
                                )}
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
                    <Button onClick={() => setConfirmNextOpen(true)} disabled={!canProceed}>
                        确认完成，进入下一阶段
                    </Button>
                )}
            </div>

            {/* Question Editor Dialog */}
            <QuestionEditor
                open={editorOpen}
                onOpenChange={setEditorOpen}
                question={editingQuestion}
                onSave={handleSaveQuestion}
            />

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>确认删除</AlertDialogTitle>
                        <AlertDialogDescription>
                            确定要删除这道题目吗？此操作无法撤销。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete}>删除</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Confirm Next Stage Dialog */}
            <AlertDialog open={confirmNextOpen} onOpenChange={setConfirmNextOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>确认完成问卷设计</AlertDialogTitle>
                        <AlertDialogDescription>
                            确认后问卷设计将被锁定。如需修改，您需要返回本阶段重新设计，届时后续阶段的数据将被清空。
                            <br /><br />
                            确定继续吗？
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmComplete}>确认完成</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

export default QuestionnaireDesign;
