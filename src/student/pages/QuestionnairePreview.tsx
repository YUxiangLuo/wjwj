import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, CheckCircle, AlertCircle, Loader2, Eye, Clock, BarChart3, ListChecks, FileText, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RichTextContent } from "@/components/RichTextContent";
import { getRichTextPlainLength } from "@/utils/rich-text";
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
import { experimentApi, type ExperimentData, type Question, type QuestionType, type QuestionnaireData } from "../api-client";

type PreviewPhase = "filling" | "completed";

const questionTypeLabels: Record<QuestionType, string> = {
    boolean: "判断题",
    single: "单选题",
    multiple: "多选题",
    scale: "量表题",
};

function estimateCompletionMinutes(questions: Question[]): number {
    let seconds = 0;
    for (const q of questions) {
        switch (q.type) {
            case "boolean": seconds += 8; break;
            case "single": seconds += 12; break;
            case "multiple": seconds += 18; break;
            case "scale": seconds += 10; break;
        }
    }
    return Math.max(1, Math.round(seconds / 60));
}

function InteractiveQuestion({
    question,
    index,
    total,
    answer,
    onAnswer,
}: {
    question: Question;
    index: number;
    total: number;
    answer: string | string[] | number | undefined;
    onAnswer: (value: string | string[] | number) => void;
}) {
    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-300">
            {/* Question number & type */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-10 h-10 rounded-full bg-indigo-600 text-white font-bold text-lg shadow-lg shadow-indigo-500/30">
                        {index + 1}
                    </span>
                    <span className="text-sm text-neutral-400 font-medium">/ {total}</span>
                </div>
                <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200 text-xs font-medium px-2.5 py-0.5">
                    {questionTypeLabels[question.type]}
                </Badge>
            </div>

            {/* Question content */}
            <h3 className="text-xl font-semibold text-neutral-800 leading-relaxed">
                {question.content}
            </h3>

            {/* Boolean */}
            {question.type === "boolean" && (
                <div className="grid grid-cols-2 gap-3">
                    {["是", "否"].map((option) => {
                        const selected = answer === option;
                        return (
                            <button
                                key={option}
                                type="button"
                                onClick={() => onAnswer(option)}
                                className={`relative p-4 rounded-xl border-2 text-base font-medium transition-all duration-200 ${
                                    selected
                                        ? "border-indigo-500 bg-indigo-50 text-indigo-700 shadow-md shadow-indigo-500/10 scale-[1.02]"
                                        : "border-neutral-200 bg-white text-neutral-600 hover:border-indigo-300 hover:bg-indigo-50/50"
                                }`}
                            >
                                {selected && (
                                    <CheckCircle className="absolute top-3 right-3 w-5 h-5 text-indigo-500" />
                                )}
                                {option}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Single choice */}
            {question.type === "single" && (
                <div className="space-y-2.5">
                    {(question.options ?? []).map((option, i) => {
                        const selected = answer === option;
                        const letter = String.fromCharCode(65 + i);
                        return (
                            <button
                                key={option}
                                type="button"
                                onClick={() => onAnswer(option)}
                                className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all duration-200 ${
                                    selected
                                        ? "border-indigo-500 bg-indigo-50 shadow-md shadow-indigo-500/10 scale-[1.01]"
                                        : "border-neutral-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/30"
                                }`}
                            >
                                <span className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-colors ${
                                    selected
                                        ? "bg-indigo-500 text-white"
                                        : "bg-neutral-100 text-neutral-500"
                                }`}>
                                    {letter}
                                </span>
                                <span className={`text-sm font-medium ${selected ? "text-indigo-700" : "text-neutral-700"}`}>
                                    {option}
                                </span>
                                {selected && (
                                    <CheckCircle className="ml-auto w-5 h-5 text-indigo-500 flex-shrink-0" />
                                )}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Multiple choice */}
            {question.type === "multiple" && (
                <div className="space-y-2.5">
                    <p className="text-xs text-neutral-400 font-medium">
                        请选择 {question.minSelect ?? 1} ~ {question.maxSelect ?? question.options?.length ?? 10} 项
                    </p>
                    {(question.options ?? []).map((option, i) => {
                        const selectedArr = Array.isArray(answer) ? answer : [];
                        const isSelected = selectedArr.includes(option);
                        const maxSelect = question.maxSelect ?? question.options?.length ?? 10;
                        const atMax = !isSelected && selectedArr.length >= maxSelect;
                        const letter = String.fromCharCode(65 + i);

                        return (
                            <button
                                key={option}
                                type="button"
                                disabled={atMax}
                                onClick={() => {
                                    if (isSelected) {
                                        onAnswer(selectedArr.filter((v) => v !== option));
                                    } else {
                                        onAnswer([...selectedArr, option]);
                                    }
                                }}
                                className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all duration-200 ${
                                    atMax
                                        ? "border-neutral-100 bg-neutral-50 opacity-50 cursor-not-allowed"
                                        : isSelected
                                            ? "border-indigo-500 bg-indigo-50 shadow-md shadow-indigo-500/10 scale-[1.01]"
                                            : "border-neutral-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/30"
                                }`}
                            >
                                <span className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-colors ${
                                    isSelected
                                        ? "bg-indigo-500 text-white"
                                        : "bg-neutral-100 text-neutral-500"
                                }`}>
                                    {letter}
                                </span>
                                <span className={`text-sm font-medium ${isSelected ? "text-indigo-700" : "text-neutral-700"}`}>
                                    {option}
                                </span>
                                {isSelected && (
                                    <CheckCircle className="ml-auto w-5 h-5 text-indigo-500 flex-shrink-0" />
                                )}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Scale */}
            {question.type === "scale" && (() => {
                const min = question.scaleMin ?? 1;
                const max = question.scaleMax ?? 10;
                const currentValue = typeof answer === "number" ? answer : undefined;
                return (
                    <div className="space-y-4">
                        <div className="flex justify-between text-sm text-neutral-500">
                            <span>{question.scaleMinLabel || min}</span>
                            <span>{question.scaleMaxLabel || max}</span>
                        </div>
                        <div className="flex flex-wrap gap-2 justify-center">
                            {Array.from({ length: max - min + 1 }).map((_, i) => {
                                const value = min + i;
                                const selected = currentValue === value;
                                return (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => onAnswer(value)}
                                        className={`w-11 h-11 rounded-xl border-2 text-sm font-bold transition-all duration-200 ${
                                            selected
                                                ? "border-indigo-500 bg-indigo-500 text-white shadow-lg shadow-indigo-500/30 scale-110"
                                                : "border-neutral-200 bg-white text-neutral-600 hover:border-indigo-300 hover:bg-indigo-50"
                                        }`}
                                    >
                                        {value}
                                    </button>
                                );
                            })}
                        </div>
                        {currentValue !== undefined && (
                            <div className="text-center text-sm text-indigo-600 font-medium animate-in fade-in duration-200">
                                您选择了：{currentValue}
                            </div>
                        )}
                    </div>
                );
            })()}
        </div>
    );
}

export function QuestionnairePreview() {
    const { taskId } = useParams();
    const navigate = useNavigate();
    const [experiment, setExperiment] = useState<ExperimentData | null>(null);
    const [loading, setLoading] = useState(true);
    const [currentIndex, setCurrentIndex] = useState(-1); // -1 = welcome page
    const [answers, setAnswers] = useState<Record<string, string | string[] | number>>({});
    const [phase, setPhase] = useState<PreviewPhase>("filling");
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        async function load() {
            if (!taskId) return;
            setLoading(true);
            try {
                const res = await experimentApi.get(Number(taskId));
                if (res.success && res.data) {
                    setExperiment(res.data);
                }
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [taskId]);

    const questionnaire = experiment?.questionnaire as QuestionnaireData | null;
    const questions = questionnaire?.questions ?? [];
    const totalQuestions = questions.length;

    const answeredCount = useMemo(() => {
        return questions.filter((q) => {
            const a = answers[q.id];
            if (a === undefined || a === null) return false;
            if (Array.isArray(a)) return a.length > 0;
            if (typeof a === "number") return true;
            return String(a).trim().length > 0;
        }).length;
    }, [answers, questions]);

    const progressPercent = totalQuestions > 0
        ? Math.round(((currentIndex < 0 ? 0 : currentIndex + 1) / (totalQuestions + 1)) * 100) // +1 for ending page
        : 0;

    const handleAnswer = useCallback((questionId: string, value: string | string[] | number) => {
        setAnswers((prev) => ({ ...prev, [questionId]: value }));
    }, []);

    const handleNext = useCallback(() => {
        if (currentIndex < totalQuestions - 1) {
            setCurrentIndex((i) => i + 1);
        } else {
            // Show ending page, then completed phase
            setPhase("completed");
        }
    }, [currentIndex, totalQuestions]);

    const handlePrev = useCallback(() => {
        if (phase === "completed") {
            setPhase("filling");
            setCurrentIndex(totalQuestions - 1);
            return;
        }
        if (currentIndex > -1) {
            setCurrentIndex((i) => i - 1);
        }
    }, [currentIndex, phase, totalQuestions]);

    const handleConfirmAndProceed = useCallback(async () => {
        if (!taskId) return;
        setSaving(true);
        try {
            // Save current stage to 2 and mark questionnaire as previewed
            const res = await experimentApi.save(Number(taskId), { currentStage: 2 });
            if (res.success) {
                navigate(`/task/${taskId}/experiment`, { replace: true });
            }
        } finally {
            setSaving(false);
        }
    }, [taskId, navigate]);

    // Validation (same as QuestionnaireDesign)
    const welcomeTextLength = useMemo(() => getRichTextPlainLength(questionnaire?.welcomeText ?? ""), [questionnaire]);
    const endingTextLength = useMemo(() => getRichTextPlainLength(questionnaire?.endingText ?? ""), [questionnaire]);

    const invalidOptionQuestions = useMemo(() => {
        const invalid: number[] = [];
        questions.forEach((q, i) => {
            if (q.type !== "single" && q.type !== "multiple") return;
            const opts = (q.options ?? []).map((o) => String(o ?? "").trim()).filter((o) => o.length > 0);
            if (opts.length < 2) { invalid.push(i + 1); return; }
            if (q.type === "multiple") {
                const minSel = q.minSelect ?? 1;
                const maxSel = q.maxSelect ?? opts.length;
                if (minSel < 1 || maxSel < minSel || maxSel > opts.length) invalid.push(i + 1);
            }
        });
        return invalid;
    }, [questions]);

    const validation = useMemo(() => ({
        title: (questionnaire?.title ?? "").trim().length >= 1 && (questionnaire?.title ?? "").length <= 100,
        welcomeText: welcomeTextLength >= 20 && welcomeTextLength <= 1000,
        endingText: endingTextLength >= 20 && endingTextLength <= 1000,
        questionCount: questions.length >= 5 && questions.length <= 50,
        optionCount: invalidOptionQuestions.length === 0,
        questionTypes: new Set(questions.map((q) => q.type)).size >= 2,
    }), [questionnaire, welcomeTextLength, endingTextLength, questions, invalidOptionQuestions]);

    const canProceed = validation.title && validation.welcomeText && validation.endingText && validation.questionCount && validation.optionCount;

    const scoreItems = useMemo(() => {
        const items: Array<{ label: string; points: number; status: "pass" | "warning" | "fail"; message: string }> = [];
        items.push({ label: "标题完整性", points: validation.title ? 10 : 0, status: validation.title ? "pass" : "fail", message: validation.title ? "标题长度符合要求" : "标题需为1-100字" });
        items.push({ label: "欢迎语质量", points: validation.welcomeText ? (welcomeTextLength >= 80 ? 15 : 12) : 0, status: validation.welcomeText ? "pass" : "fail", message: validation.welcomeText ? "欢迎语字数符合要求" : "欢迎语需在20-1000字之间" });
        items.push({ label: "结束语质量", points: validation.endingText ? (endingTextLength >= 80 ? 15 : 12) : 0, status: validation.endingText ? "pass" : "fail", message: validation.endingText ? "结束语字数符合要求" : "结束语需在20-1000字之间" });
        items.push({ label: "题目数量", points: validation.questionCount ? 20 : 0, status: validation.questionCount ? "pass" : "fail", message: validation.questionCount ? "题目数量在5-50题范围内" : "题目数量需在5-50题" });
        items.push({ label: "选项配置", points: validation.optionCount ? 20 : 0, status: validation.optionCount ? "pass" : "fail", message: validation.optionCount ? "单选/多选题选项配置有效" : `Q${invalidOptionQuestions.slice(0, 5).join("、")} 配置无效` });
        const divScore = validation.questionCount ? (validation.questionTypes ? 20 : 12) : 0;
        items.push({ label: "题型多样性", points: divScore, status: validation.questionCount ? (validation.questionTypes ? "pass" : "warning") : "fail", message: validation.questionCount ? (validation.questionTypes ? "题型结构较均衡" : "建议至少包含2种题型") : "请先满足题目数量要求" });
        return items;
    }, [validation, welcomeTextLength, endingTextLength, invalidOptionQuestions]);

    const preliminaryScore = useMemo(() => {
        return Math.max(0, Math.min(100, Math.round(scoreItems.reduce((s, i) => s + i.points, 0))));
    }, [scoreItems]);

    const typeDistribution = useMemo(() => {
        const map: Record<string, number> = {};
        for (const q of questions) {
            map[q.type] = (map[q.type] ?? 0) + 1;
        }
        return map;
    }, [questions]);

    const estimatedMinutes = useMemo(() => estimateCompletionMinutes(questions), [questions]);

    const requiredFailCount = [validation.title, validation.welcomeText, validation.endingText, validation.questionCount, validation.optionCount].filter(Boolean).length;
    const requiredMissingCount = 5 - requiredFailCount;

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            </div>
        );
    }

    if (!questionnaire || questions.length === 0) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex flex-col items-center justify-center gap-4">
                <AlertCircle className="w-12 h-12 text-neutral-300" />
                <p className="text-neutral-500">问卷数据为空，请先返回设计问卷</p>
                <Link to={`/task/${taskId}/experiment`}>
                    <Button variant="outline">返回实验</Button>
                </Link>
            </div>
        );
    }

    // ============================================================
    // Phase: Completed — Stats + Validation + Confirm
    // ============================================================
    if (phase === "completed") {
        return (
            <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-slate-50">
                {/* Minimal top bar */}
                <div className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-neutral-200">
                    <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
                        <button onClick={handlePrev} className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-800 transition-colors">
                            <ChevronLeft className="w-4 h-4" />
                            返回问卷
                        </button>
                        <div className="flex items-center gap-2 text-sm font-medium text-indigo-600">
                            <Eye className="w-4 h-4" />
                            预览完成
                        </div>
                    </div>
                </div>

                <div className="max-w-3xl mx-auto px-4 py-10 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500" data-testid="student-questionnaire-preview-completed">
                    {/* Hero completion card */}
                    <div className="text-center space-y-4">
                        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 shadow-xl shadow-indigo-500/30">
                            <CheckCircle className="w-10 h-10 text-white" />
                        </div>
                        <h2 className="text-3xl font-bold text-neutral-800">问卷预览完成</h2>
                        <p className="text-neutral-500 max-w-md mx-auto">
                            你已完整体验了问卷填写流程。以下是问卷的结构分析与质量评估。
                        </p>
                    </div>

                    {/* Stats summary */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white rounded-2xl border border-neutral-200 p-5 text-center shadow-sm">
                            <div className="text-3xl font-bold text-indigo-600">{totalQuestions}</div>
                            <div className="text-xs text-neutral-500 mt-1 font-medium">总题数</div>
                        </div>
                        <div className="bg-white rounded-2xl border border-neutral-200 p-5 text-center shadow-sm">
                            <div className="text-3xl font-bold text-purple-600">{Object.keys(typeDistribution).length}</div>
                            <div className="text-xs text-neutral-500 mt-1 font-medium">题型种类</div>
                        </div>
                        <div className="bg-white rounded-2xl border border-neutral-200 p-5 text-center shadow-sm">
                            <div className="text-3xl font-bold text-teal-600">~{estimatedMinutes}min</div>
                            <div className="text-xs text-neutral-500 mt-1 font-medium">预估填写时长</div>
                        </div>
                        <div className="bg-white rounded-2xl border border-neutral-200 p-5 text-center shadow-sm">
                            <div className="text-3xl font-bold text-amber-600">{answeredCount}/{totalQuestions}</div>
                            <div className="text-xs text-neutral-500 mt-1 font-medium">试填完成</div>
                        </div>
                    </div>

                    {/* Type distribution */}
                    <Card className="rounded-2xl border-neutral-200 shadow-sm">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base text-neutral-800 flex items-center gap-2">
                                <BarChart3 className="w-4 h-4 text-indigo-500" />
                                题型分布
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {(Object.entries(typeDistribution) as [QuestionType, number][]).map(([type, count]) => (
                                    <div key={type} className="flex items-center gap-3">
                                        <span className="w-20 text-sm text-neutral-600 font-medium">{questionTypeLabels[type]}</span>
                                        <div className="flex-1 h-8 bg-neutral-100 rounded-lg overflow-hidden relative">
                                            <div
                                                className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 rounded-lg transition-all duration-700 ease-out flex items-center justify-end pr-3"
                                                style={{ width: `${Math.max(20, (count / totalQuestions) * 100)}%` }}
                                            >
                                                <span className="text-xs font-bold text-white">{count}</span>
                                            </div>
                                        </div>
                                        <span className="text-xs text-neutral-400 w-10 text-right">{Math.round((count / totalQuestions) * 100)}%</span>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Validation checklist */}
                    <Card className="rounded-2xl border-neutral-200 shadow-sm">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base text-neutral-800 flex items-center gap-2">
                                <ListChecks className="w-4 h-4 text-indigo-500" />
                                校验清单
                            </CardTitle>
                            <CardDescription className="text-neutral-500">确认问卷信息完善后再进入下一阶段</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2.5">
                            {[
                                { key: "title", ok: validation.title, label: `问卷标题：${questionnaire.title ? "已填写" : "未填写"}` },
                                { key: "welcome", ok: validation.welcomeText, label: `欢迎语：${welcomeTextLength} 字${validation.welcomeText ? "" : " (20-1000字)"}` },
                                { key: "qcount", ok: validation.questionCount, label: `题目数量：${questions.length} 道${validation.questionCount ? "" : " (需要5-50道)"}` },
                                { key: "qtypes", ok: validation.questionTypes, label: `题型多样性：${new Set(questions.map((q) => q.type)).size} 种题型${validation.questionTypes ? "" : " (建议至少2种)"}`, isWarning: true },
                                { key: "opts", ok: validation.optionCount, label: `选项数量：${validation.optionCount ? "配置有效" : `Q${invalidOptionQuestions.slice(0, 5).join("、")} 需检查`}` },
                                { key: "ending", ok: validation.endingText, label: `结束语：${endingTextLength} 字${validation.endingText ? "" : " (20-1000字)"}` },
                            ].map((item) => (
                                <div
                                    key={item.key}
                                    className={`flex items-center gap-3 p-3 rounded-xl border ${
                                        item.ok
                                            ? "bg-emerald-50 border-emerald-200"
                                            : item.isWarning
                                                ? "bg-amber-50 border-amber-200"
                                                : "bg-rose-50 border-rose-200"
                                    }`}
                                >
                                    {item.ok ? (
                                        <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                                    ) : (
                                        <AlertCircle className={`w-4 h-4 flex-shrink-0 ${item.isWarning ? "text-amber-500" : "text-rose-500"}`} />
                                    )}
                                    <span className={`text-sm ${item.ok ? "text-emerald-700" : item.isWarning ? "text-amber-700" : "text-rose-700"}`}>
                                        {item.label}
                                    </span>
                                </div>
                            ))}
                            {requiredMissingCount === 0 ? (
                                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 font-medium">
                                    问卷结构完整，可进入下一阶段。
                                </div>
                            ) : (
                                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                                    仍有 {requiredMissingCount} 项必填检测未通过，需修复后才能继续。
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Score card */}
                    <Card className="rounded-2xl border-neutral-200 shadow-sm">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base text-neutral-800 flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-indigo-500" />
                                初步评分（机器评分）
                            </CardTitle>
                            <CardDescription className="text-neutral-500">供参考，满分100分</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 flex items-center justify-between">
                                <div>
                                    <div className="text-xs uppercase tracking-wider text-indigo-500 font-semibold">当前得分</div>
                                    <div className="text-4xl font-bold text-indigo-600">{preliminaryScore}</div>
                                </div>
                                <div className="text-sm text-indigo-500 font-medium">
                                    {preliminaryScore >= 90
                                        ? "问卷结构优秀"
                                        : preliminaryScore >= 75
                                            ? "问卷结构良好"
                                            : preliminaryScore >= 60
                                                ? "可继续优化"
                                                : "建议先完善基础项"}
                                </div>
                            </div>
                            <div className="space-y-2">
                                {scoreItems.map((item) => (
                                    <div key={item.label} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm text-neutral-700">{item.label}</span>
                                            <span className="text-xs font-mono text-neutral-500">{item.points} 分</span>
                                        </div>
                                        <div className={`text-xs mt-1 ${
                                            item.status === "pass" ? "text-emerald-600" : item.status === "warning" ? "text-amber-600" : "text-rose-600"
                                        }`}>
                                            {item.message}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Action buttons */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 pb-16 border-t border-neutral-200">
                        <Link to={`/task/${taskId}/experiment`}>
                            <Button variant="outline" className="gap-2 border-neutral-300 text-neutral-600 hover:bg-neutral-100">
                                <ArrowLeft className="w-4 h-4" />
                                返回修改问卷
                            </Button>
                        </Link>
                        <Button
                            onClick={() => setConfirmOpen(true)}
                            disabled={!canProceed || saving}
                            data-testid="student-questionnaire-preview-confirm"
                            className="h-12 px-8 text-base bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 gap-2"
                        >
                            {saving ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <CheckCircle className="w-5 h-5" />
                            )}
                            确认问卷，进入下一阶段
                        </Button>
                    </div>
                </div>

                <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                    <AlertDialogContent className="bg-white border-neutral-200 text-neutral-800" data-testid="student-questionnaire-preview-confirm-dialog">
                        <AlertDialogHeader>
                            <AlertDialogTitle className="text-neutral-900">确认完成问卷设计</AlertDialogTitle>
                            <AlertDialogDescription className="text-neutral-500 text-base leading-relaxed">
                                确认后问卷设计将被<strong className="text-indigo-600">锁定</strong>。如需修改，您需要返回本阶段重新设计，届时后续阶段的数据将被<strong className="text-rose-600">清空</strong>。
                                <br /><br />
                                确定继续吗？
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel className="border-neutral-300 text-neutral-600 hover:bg-neutral-100">取消</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={handleConfirmAndProceed}
                                disabled={saving}
                                data-testid="student-questionnaire-preview-proceed"
                                className="bg-indigo-600 hover:bg-indigo-500 text-white"
                            >
                                {saving ? "保存中..." : "确认完成"}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        );
    }

    // ============================================================
    // Phase: Filling — Immersive questionnaire experience
    // ============================================================
    const currentQuestion = currentIndex >= 0 ? questions[currentIndex] : null;
    const isWelcomePage = currentIndex === -1;
    const isLastQuestion = currentIndex === totalQuestions - 1;
    const currentAnswer = currentQuestion ? answers[currentQuestion.id] : undefined;
    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-indigo-50/30 relative">
            {/* Top bar */}
            <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-lg border-b border-neutral-200/80">
                <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
                    <Link to={`/task/${taskId}/experiment`} className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-800 transition-colors">
                        <ArrowLeft className="w-4 h-4" />
                        <span className="hidden sm:inline">退出预览</span>
                    </Link>
                    <div className="flex items-center gap-2 text-sm font-medium text-indigo-600">
                        <Eye className="w-4 h-4" />
                        问卷预览
                    </div>
                    <div className="text-xs text-neutral-400 font-mono">
                        {isWelcomePage ? "封面" : `${currentIndex + 1}/${totalQuestions}`}
                    </div>
                </div>
                {/* Global progress bar */}
                <div className="h-1 bg-neutral-100">
                    <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500 ease-out"
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>
            </div>

            {/* Main content */}
            <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12" data-testid="student-questionnaire-preview-page">
                <div className="bg-white rounded-3xl border border-neutral-200 shadow-xl shadow-neutral-200/50 overflow-hidden">
                    <div className="p-6 sm:p-10 min-h-[420px] flex flex-col">
                        {/* Welcome page */}
                        {isWelcomePage && (
                            <div className="flex-1 flex flex-col justify-center space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-500">
                                <div className="space-y-3">
                                    <h2 className="text-2xl sm:text-3xl font-bold text-neutral-800 leading-tight">
                                        {questionnaire.title || "未命名问卷"}
                                    </h2>
                                    <div className="flex items-center gap-4 text-xs text-neutral-400">
                                        <span className="flex items-center gap-1">
                                            <FileText className="w-3.5 h-3.5" />
                                            {totalQuestions} 题
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-3.5 h-3.5" />
                                            约 {estimatedMinutes} 分钟
                                        </span>
                                    </div>
                                </div>
                                <div className="border-t border-neutral-100 pt-5">
                                    <RichTextContent
                                        html={questionnaire.welcomeText ?? ""}
                                        className="text-sm text-neutral-600 leading-relaxed"
                                        emptyFallback="欢迎语将在这里展示"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Question page */}
                        {currentQuestion && (
                            <div className="flex-1 flex flex-col justify-center">
                                <InteractiveQuestion
                                    question={currentQuestion}
                                    index={currentIndex}
                                    total={totalQuestions}
                                    answer={answers[currentQuestion.id]}
                                    onAnswer={(value) => handleAnswer(currentQuestion.id, value)}
                                />
                            </div>
                        )}
                    </div>

                    {/* Bottom navigation */}
                    <div className="border-t border-neutral-100 bg-neutral-50/50 px-6 sm:px-10 py-4 flex items-center justify-between">
                        <Button
                            variant="ghost"
                            onClick={handlePrev}
                            disabled={isWelcomePage}
                            className="gap-1.5 text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100"
                        >
                            <ChevronLeft className="w-4 h-4" />
                            上一题
                        </Button>

                        {/* Question dot navigator */}
                        <div className="hidden sm:flex items-center gap-1 max-w-[300px] overflow-hidden">
                            {questions.map((q, i) => {
                                const hasAnswer = (() => {
                                    const a = answers[q.id];
                                    if (a === undefined || a === null) return false;
                                    if (Array.isArray(a)) return a.length > 0;
                                    if (typeof a === "number") return true;
                                    return String(a).trim().length > 0;
                                })();
                                return (
                                    <button
                                        key={q.id}
                                        type="button"
                                        onClick={() => setCurrentIndex(i)}
                                        className={`w-2 h-2 rounded-full transition-all duration-200 ${
                                            i === currentIndex
                                                ? "w-6 bg-indigo-500"
                                                : hasAnswer
                                                    ? "bg-indigo-300"
                                                    : "bg-neutral-300"
                                        }`}
                                    />
                                );
                            })}
                        </div>

                        <Button
                            onClick={handleNext}
                            className={`gap-1.5 ${
                                isLastQuestion
                                    ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                                    : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                            }`}
                        >
                            {isLastQuestion ? "完成预览" : "下一题"}
                            <ChevronRight className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Keyboard shortcut hint */}
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 text-xs text-neutral-400 bg-white/80 backdrop-blur border border-neutral-200 rounded-full px-4 py-2 shadow-sm hidden sm:flex items-center gap-3">
                <span>点击选项即可作答</span>
                <span className="text-neutral-300">|</span>
                <span>共 {totalQuestions} 题</span>
                <span className="text-neutral-300">|</span>
                <span>已填 {answeredCount} 题</span>
            </div>
        </div>
    );
}

export default QuestionnairePreview;
