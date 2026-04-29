import { useState, useEffect, useCallback, useRef } from "react";
import { Rocket, Target, Shield, Hash, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
        { icon: Target, label: "总体规模", value: populationSize.toLocaleString(), tone: "student-method-simple" },
        { icon: Hash, label: "样本量", value: sampleSize.toLocaleString(), tone: "student-method-systematic" },
        { icon: Shield, label: "置信水平", value: CONFIDENCE_LABELS[confidenceLevel] ?? `${confidenceLevel}%`, tone: "student-method-stratified" },
        {
            icon: Target,
            label: getMarginOfErrorLabel(estimationType),
            value: formatMarginOfError(marginOfError, estimationType),
            tone: "student-method-pps",
        },
    ];

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
            style={{ opacity, transition: "opacity 300ms ease" }}
        >
            {/* background */}
            <div className="absolute inset-0 bg-background">
                {/* subtle grid pattern */}
                <div
                    className="absolute inset-0 opacity-[0.03]"
                    style={{
                        backgroundImage: "linear-gradient(color-mix(in oklch, var(--foreground) 8%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in oklch, var(--foreground) 8%, transparent) 1px, transparent 1px)",
                        backgroundSize: "40px 40px",
                    }}
                />
                {/* radial glow */}
                <div
                    className="absolute inset-0 transition-opacity duration-1000"
                    style={{
                        background: phase.type === "launch"
                            ? "radial-gradient(circle at 50% 50%, color-mix(in oklch, var(--primary) 30%, transparent) 0%, transparent 60%)"
                            : "radial-gradient(circle at 50% 50%, color-mix(in oklch, var(--primary) 8%, transparent) 0%, transparent 60%)",
                        opacity: phase.type === "launch" ? 1 : 0.6,
                    }}
                />
            </div>

            {/* content */}
            <div className="relative z-10 flex max-w-2xl flex-col items-center px-6 text-center">
                {/* intro phase */}
                {phase.type === "intro" && (
                    <div className="animate-in fade-in zoom-in-95 duration-700">
                        <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                            <Rocket className="size-10" />
                        </div>
                        <h1 className="mb-3 text-3xl font-bold text-foreground">实验准备就绪</h1>
                        <p className="text-muted-foreground">正在检查实验参数...</p>
                    </div>
                )}

                {/* params phase */}
                {phase.type === "params" && (
                    <div className="w-full">
                        <h2 className="animate-in fade-in mb-6 text-xl font-semibold text-foreground duration-500">
                            实验参数确认
                        </h2>
                        <div className="mb-6 grid grid-cols-2 gap-4">
                            {params.map((p, i) => {
                                const Icon = p.icon;
                                return (
                                    <div
                                        key={p.label}
                                        className={cn("animate-in fade-in slide-in-from-bottom-4 rounded-xl border p-4 text-left duration-500", p.tone)}
                                        style={{ animationDelay: `${i * 120}ms`, animationFillMode: "both" }}
                                    >
                                        <div className="mb-2 flex items-center gap-2">
                                            <Icon className="size-4" />
                                            <span className="text-xs text-muted-foreground">{p.label}</span>
                                        </div>
                                        <div className="font-mono text-2xl font-bold">
                                            {p.value}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <p className="animate-in fade-in text-sm text-muted-foreground duration-500" style={{ animationDelay: "600ms", animationFillMode: "both" }}>
                            即将进入抽样执行阶段...
                        </p>
                    </div>
                )}

                {/* launch phase */}
                {phase.type === "launch" && (
                    <div className="animate-in fade-in zoom-in-50 duration-500">
                        <div className="mb-4">
                            <Rocket className="mx-auto size-16 animate-bounce text-primary" />
                        </div>
                        <h1 className="mb-2 bg-gradient-to-r from-primary via-success to-primary bg-clip-text text-4xl font-black text-transparent">
                            启动实验!
                        </h1>
                        <p className="text-lg text-muted-foreground">正在初始化抽样环境...</p>
                    </div>
                )}

                {/* ready phase */}
                {phase.type === "ready" && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
                            <Rocket className="size-8" />
                        </div>
                        <h2 className="mb-2 text-2xl font-bold text-foreground">准备就绪</h2>
                        <p className="mb-8 text-muted-foreground">
                            总体 {populationSize.toLocaleString()} 人，计划抽取 {sampleSize.toLocaleString()} 个样本
                        </p>
                        <Button
                            type="button"
                            onClick={handleProceed}
                            size="lg"
                            className="rounded-xl px-8 shadow-lg shadow-primary/30"
                        >
                            进入抽样执行
                            <ChevronRight data-icon="inline-end" />
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default ImmersiveExperimentLaunch;
