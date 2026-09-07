import { useState, useEffect, useCallback, useRef } from "react";
import { Rocket, Target, Shield, Hash, ChevronRight } from "lucide-react";
import { formatMarginOfError, getMarginOfErrorLabel } from "../experiment/sample-plan-display";

interface Props {
    populationSize: number;
    sampleSize: number;
    estimationType?: "proportion" | "mean";
    confidenceLevel: string;
    marginOfError: number;
    onComplete: () => void;
    onClose: () => void;
}

const CONFIDENCE_LABELS: Record<string, string> = {
    "90": "90%",
    "95": "95%",
    "99": "99%",
};

type Phase =
    | { type: "intro" }
    | { type: "params" }
    | { type: "launch" }
    | { type: "ready" };

export function ImmersiveExperimentLaunch({
    populationSize,
    sampleSize,
    estimationType = "proportion",
    confidenceLevel,
    marginOfError,
    onComplete,
    onClose,
}: Props) {
    const [phase, setPhase] = useState<Phase>({ type: "intro" });
    const [opacity, setOpacity] = useState(0);
    const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    // entrance fade
    useEffect(() => {
        const t = setTimeout(() => setOpacity(1), 30);
        return () => clearTimeout(t);
    }, []);

    // phase auto-progression
    useEffect(() => {
        switch (phase.type) {
            case "intro":
                timerRef.current = setTimeout(() => setPhase({ type: "params" }), 1200);
                break;
            case "params":
                timerRef.current = setTimeout(() => setPhase({ type: "launch" }), 2400);
                break;
            case "launch":
                timerRef.current = setTimeout(() => setPhase({ type: "ready" }), 1500);
                break;
            case "ready":
                break;
        }
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [phase]);

    const handleClose = useCallback(() => {
        setOpacity(0);
        setTimeout(onClose, 300);
    }, [onClose]);

    const handleProceed = useCallback(() => {
        setOpacity(0);
        setTimeout(onComplete, 300);
    }, [onComplete]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") handleClose();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [handleClose]);

    const params = [
        { icon: Target, label: "总体规模", value: populationSize.toLocaleString(), color: "text-primary", bg: "bg-primary-muted", border: "border-primary-border" },
        { icon: Hash, label: "样本量", value: sampleSize.toLocaleString(), color: "text-info", bg: "bg-info-muted", border: "border-info-border" },
        { icon: Shield, label: "置信水平", value: CONFIDENCE_LABELS[confidenceLevel] ?? `${confidenceLevel}%`, color: "text-warning", bg: "bg-warning-muted", border: "border-warning-border" },
        {
            icon: Target,
            label: getMarginOfErrorLabel(estimationType),
            value: formatMarginOfError(marginOfError, estimationType),
            color: "text-destructive",
            bg: "bg-destructive-muted",
            border: "border-destructive-border",
        },
    ];

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
            style={{ opacity, transition: "opacity 300ms ease" }}
        >
            <div className="absolute inset-0 bg-background" />

            {/* content */}
            <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-2xl">
                {/* intro phase */}
                {phase.type === "intro" && (
                    <div className="animate-in fade-in duration-500">
                        <div className="w-20 h-20 rounded-surface bg-primary-muted border border-primary-border flex items-center justify-center mx-auto mb-6">
                            <Rocket className="w-10 h-10 text-primary" />
                        </div>
                        <h1 className="text-display font-bold text-foreground mb-3">实验准备就绪</h1>
                        <p className="text-muted-foreground">正在检查实验参数...</p>
                    </div>
                )}

                {/* params phase */}
                {phase.type === "params" && (
                    <div className="w-full">
                        <h2 className="text-section-title font-semibold text-foreground mb-6 animate-in fade-in duration-500">
                            实验参数确认
                        </h2>
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            {params.map((p, i) => {
                                const Icon = p.icon;
                                return (
                                    <div
                                        key={p.label}
                                        className={`rounded-surface ${p.bg} border ${p.border} p-4 text-left animate-in fade-in slide-in-from-bottom-4 duration-500`}
                                        style={{ animationDelay: `${i * 120}ms`, animationFillMode: "both" }}
                                    >
                                        <div className="flex items-center gap-2 mb-2">
                                            <Icon className={`w-4 h-4 ${p.color}`} />
                                            <span className="text-meta text-muted-foreground">{p.label}</span>
                                        </div>
                                        <div className={`text-page-title font-bold font-mono ${p.color}`}>
                                            {p.value}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <p className="text-label text-muted-foreground animate-in fade-in duration-500" style={{ animationDelay: "600ms", animationFillMode: "both" }}>
                            即将进入抽样执行阶段...
                        </p>
                    </div>
                )}

                {/* launch phase */}
                {phase.type === "launch" && (
                    <div className="animate-in fade-in duration-500">
                        <div className="mb-4">
                            <Rocket className="w-16 h-16 text-primary mx-auto animate-bounce" />
                        </div>
                        <h1 className="mb-2 text-display font-bold text-primary">
                            启动实验!
                        </h1>
                        <p className="text-muted-foreground text-subheading">正在初始化抽样环境...</p>
                    </div>
                )}

                {/* ready phase */}
                {phase.type === "ready" && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="w-16 h-16 rounded-control bg-success-muted border border-success-border flex items-center justify-center mx-auto mb-6">
                            <Rocket className="w-8 h-8 text-success" />
                        </div>
                        <h2 className="text-page-title font-bold text-foreground mb-2">准备就绪</h2>
                        <p className="text-muted-foreground mb-8">
                            总体 {populationSize.toLocaleString()} 个单位，计划抽取 {sampleSize.toLocaleString()} 个样本单位
                        </p>
                        <button
                            onClick={handleProceed}
                            className="inline-flex items-center gap-2 px-8 py-3 rounded-surface bg-primary hover:bg-primary-hover text-primary-foreground font-semibold transition-none "
                        >
                            进入抽样执行
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default ImmersiveExperimentLaunch;
