import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, BarChart3, CheckCircle2, ChevronRight, Clock, FileText, Home, Loader2, Play, RefreshCw, Ruler } from "lucide-react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
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
import { experimentApi, tasksApi, type ExperimentData } from "../api-client";
import { TopicDeletedState } from "../components/TopicDeletedState";
import { getExperimentRouteRedirect } from "../experiment/page-access";
import { AnalysisReport } from "./stages/AnalysisReport";
import { QuestionnaireDesign } from "./stages/QuestionnaireDesign";
import { SamplePlanning } from "./stages/SamplePlanning";
import { SamplingExecution } from "./stages/SamplingExecution";

const stages = [
    { name: "问卷设计", description: "设计调查问卷并完成模拟填写", icon: FileText },
    { name: "样本量规划", description: "计算并确认最终调查样本量", icon: Ruler },
    { name: "抽样执行", description: "完成简单随机、系统、PPS 和分层抽样", icon: Play },
    { name: "分析与报告", description: "比较抽样结果并撰写实验报告", icon: BarChart3 },
] as const;

interface ExperimentContextValue {
    experiment: ExperimentData | null;
    populationSize: number;
    isSaving: boolean;
    completeStage: (stage: number, data: Record<string, unknown>) => Promise<boolean>;
}

const ExperimentContext = createContext<ExperimentContextValue | null>(null);

export function useExperiment() {
    const value = useContext(ExperimentContext);
    if (!value) throw new Error("useExperiment must be used within ExperimentLayout");
    return value;
}

export function ExperimentLayout() {
    const { taskId } = useParams();
    const navigate = useNavigate();
    const numericTaskId = Number(taskId);
    const [experiment, setExperiment] = useState<ExperimentData | null>(null);
    const [taskName, setTaskName] = useState("");
    const [deadline, setDeadline] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [accessDenied, setAccessDenied] = useState<"topic_deleted" | "task_revoked" | null>(null);
    const [redirect, setRedirect] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [versionConflict, setVersionConflict] = useState(false);
    const [editorRevision, setEditorRevision] = useState(0);
    const [reopenStage, setReopenStage] = useState<number | null>(null);

    useEffect(() => {
        if (!Number.isInteger(numericTaskId) || numericTaskId <= 0) { setNotFound(true); setLoading(false); return; }
        void Promise.all([experimentApi.get(numericTaskId), tasksApi.get(numericTaskId)]).then(([experimentResponse, taskResponse]) => {
            if (!taskResponse.success || !taskResponse.data) {
                const code = taskResponse.error?.code;
                if (code === "TOPIC_DELETED" || code === "TASK_REVOKED") setAccessDenied(code === "TASK_REVOKED" ? "task_revoked" : "topic_deleted");
                else setNotFound(true);
                return;
            }
            setTaskName(taskResponse.data.name);
            setDeadline(taskResponse.data.deadline);
            setRedirect(getExperimentRouteRedirect({ taskId: numericTaskId, publishedAt: taskResponse.data.publishedAt, deadline: taskResponse.data.deadline, status: taskResponse.data.status }));
            if (experimentResponse.success && experimentResponse.data) setExperiment(experimentResponse.data);
            else setNotFound(true);
        }).finally(() => setLoading(false));
    }, [numericTaskId]);

    const completeStage = useCallback(async (stage: number, data: Record<string, unknown>) => {
        if (!experiment) return false;
        if (versionConflict) {
            setSaveError("检测到其他页面已更新。请先复制需要保留的内容，再加载最新版本。");
            return false;
        }
        setIsSaving(true); setSaveError(null);
        const response = await experimentApi.completeStage(numericTaskId, stage, experiment.version, data);
        setIsSaving(false);
        if (response.success && response.data) {
            setExperiment(response.data);
            setVersionConflict(false);
            return true;
        }
        setSaveError(response.error?.message ?? "阶段保存失败，请重试");
        if (response.error?.code === "VERSION_CONFLICT") {
            setVersionConflict(true);
            setSaveError("检测到其他页面已更新。当前草稿尚未覆盖服务器数据；请先复制需要保留的内容，再加载最新版本。");
        }
        return false;
    }, [experiment, numericTaskId, versionConflict]);

    const loadLatestVersion = async () => {
        setIsSaving(true);
        const latest = await experimentApi.get(numericTaskId);
        setIsSaving(false);
        if (!latest.success || !latest.data) {
            setSaveError(latest.error?.message ?? "加载最新版本失败，请重试");
            return;
        }
        setExperiment(latest.data);
        setEditorRevision((revision) => revision + 1);
        setVersionConflict(false);
        setSaveError(null);
    };

    const applyReopen = async () => {
        if (reopenStage === null || !experiment) return;
        if (versionConflict) {
            setSaveError("检测到其他页面已更新。请先加载最新版本，再重新编辑阶段。");
            setReopenStage(null);
            return;
        }
        const response = await experimentApi.reopenStage(numericTaskId, reopenStage, experiment.version);
        if (response.success && response.data) {
            setExperiment(response.data);
            setVersionConflict(false);
        }
        else {
            setSaveError(response.error?.message ?? "无法重新编辑该阶段");
            if (response.error?.code === "VERSION_CONFLICT") {
                setVersionConflict(true);
                setSaveError("检测到其他页面已更新。请先加载最新版本，再重新编辑阶段。");
            }
        }
        setReopenStage(null);
    };

    const [now, setNow] = useState(Date.now());
    useEffect(() => { if (!deadline) return; const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(timer); }, [deadline]);
    const deadlineInfo = useMemo(() => {
        if (!deadline) return null;
        const diff = new Date(deadline).getTime() - now;
        if (diff <= 0) return { text: "已截止", urgent: true };
        const hours = Math.floor(diff / 3_600_000);
        return { text: hours < 24 ? `剩余 ${hours} 小时` : `剩余 ${Math.floor(hours / 24)} 天`, urgent: hours < 24 };
    }, [deadline, now]);

    if (loading) return <div className="grid place-items-center py-24"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
    if (accessDenied) return <TopicDeletedState variant={accessDenied} />;
    if (redirect) return <Navigate to={redirect} replace />;
    if (notFound || !experiment) return <Navigate to="/" replace />;
    const currentStage = Math.max(1, Math.min(4, experiment.currentStage));
    const completed = [experiment.stage1CompletedAt, experiment.stage2CompletedAt, experiment.stage3CompletedAt, experiment.stage4CompletedAt];
    const renderStage = () => {
        if (currentStage === 1) return <QuestionnaireDesign />;
        if (currentStage === 2) return <SamplePlanning onPrev={() => setReopenStage(1)} />;
        if (currentStage === 3) return <SamplingExecution onPrev={() => setReopenStage(2)} />;
        return <AnalysisReport onPrev={() => setReopenStage(3)} onSubmit={() => navigate(`/task/${numericTaskId}/preview`)} />;
    };

    return (
        <ExperimentContext.Provider value={{ experiment, populationSize: experiment.populationSize, isSaving, completeStage }}>
            <div className="pb-12" data-testid="student-experiment-layout">
                <div className="sticky top-16 z-40 -mt-2 border-b border-border/50 bg-background/90 backdrop-blur">
                    <div className="flex items-center justify-between py-2">
                        <div className="flex items-center gap-2"><Link to="/"><Button variant="ghost" size="icon"><Home className="h-4 w-4" /></Button></Link><Link to={`/task/${numericTaskId}`}><Button variant="ghost" className="hidden gap-2 sm:flex"><ArrowLeft className="h-4 w-4" />退出实验</Button></Link><h1 className="ml-2 line-clamp-1 border-l border-border pl-4 text-sm font-semibold">{taskName}</h1></div>
                        {deadlineInfo && <span className={`hidden items-center gap-1 text-xs sm:flex ${deadlineInfo.urgent ? "text-destructive" : "text-muted-foreground"}`}>{deadlineInfo.urgent ? <AlertCircle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}{deadlineInfo.text}</span>}
                    </div>
                    {saveError && <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"><span>{saveError}</span>{versionConflict && <Button type="button" size="sm" variant="outline" disabled={isSaving} data-testid="student-load-latest-version" onClick={() => void loadLatestVersion()} className="border-destructive/30 bg-background text-destructive hover:bg-destructive/10 hover:text-destructive"><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isSaving ? "animate-spin" : ""}`} />加载最新版本</Button>}</div>}
                    <div className="flex items-center gap-2 overflow-x-auto pb-2.5" data-testid="student-experiment-stages">
                        {stages.map((stage, index) => {
                            const number = index + 1;
                            const isCurrent = number === currentStage;
                            const isCompleted = completed[index] !== null;
                            const Icon = stage.icon;
                            return <div key={stage.name} className="flex items-center gap-2">{index > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}<button disabled={number >= currentStage || !isCompleted} onClick={() => setReopenStage(number)} className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-medium ${isCurrent ? "border border-primary/30 bg-primary/15 text-primary" : isCompleted ? "text-success hover:bg-success/10" : "text-muted-foreground"}`}>{isCompleted && !isCurrent ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}<span className="hidden sm:inline">{stage.name}</span><span className="sm:hidden">{number}</span></button></div>;
                        })}
                    </div>
                </div>
                <div className="my-6 flex items-center gap-3 rounded-xl border border-border bg-card/50 px-4 py-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary">{(() => { const Icon = stages[currentStage - 1]!.icon; return <Icon className="h-4 w-4" />; })()}</span><div><p className="text-sm font-semibold">阶段 {currentStage}：{stages[currentStage - 1]!.name}</p><p className="text-xs text-muted-foreground">{stages[currentStage - 1]!.description}。仅点击阶段完成按钮时保存。</p></div></div>
                <div key={editorRevision} className="min-h-[500px]">{renderStage()}</div>
            </div>
            <AlertDialog open={reopenStage !== null} onOpenChange={(open) => !open && setReopenStage(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>重新编辑“{reopenStage ? stages[reopenStage - 1]!.name : ""}”</AlertDialogTitle><AlertDialogDescription>当前阶段内容会保留，该阶段之后的内容将被清空。确认后才能重新编辑。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void applyReopen()}>确认重新编辑</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
        </ExperimentContext.Provider>
    );
}

export default ExperimentLayout;
