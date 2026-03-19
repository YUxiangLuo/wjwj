import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, Info } from "lucide-react";

type Variant = "online" | "offline" | "warning";

const styles: Record<Variant, { card: string; icon: string; text: string }> = {
    online: {
        card: "border-emerald-500/30 bg-emerald-500/10",
        icon: "text-emerald-600",
        text: "text-emerald-700 dark:text-emerald-300",
    },
    offline: {
        card: "border-rose-500/30 bg-rose-500/10",
        icon: "text-rose-600",
        text: "text-rose-600",
    },
    warning: {
        card: "border-amber-500/30 bg-amber-500/10",
        icon: "text-amber-600",
        text: "text-amber-700 dark:text-amber-300",
    },
};

interface NetworkStatusBannerProps {
    notice: string;
    variant: Variant;
    testId?: string;
}

export function NetworkStatusBanner({ notice, variant, testId }: NetworkStatusBannerProps) {
    const style = styles[variant];

    return (
        <Card className={`rounded-2xl border shadow-sm ${style.card}`} data-testid={testId}>
            <CardContent className="px-4 py-3">
                <div className="flex items-center gap-2 text-sm">
                    {variant === "online" ? (
                        <CheckCircle className={`h-4 w-4 ${style.icon}`} />
                    ) : (
                        <Info className={`h-4 w-4 ${style.icon}`} />
                    )}
                    <span className={style.text}>{notice}</span>
                </div>
            </CardContent>
        </Card>
    );
}
