import { Button } from "@/components/ui/button";
import { CheckCircle2, RefreshCw } from "lucide-react";

interface SamplingSuccessStateProps {
    summary: string;
    onRerun: () => void;
    disabled: boolean;
    rerunTestId: string;
}

export function SamplingSuccessState({ summary, onRerun, disabled, rerunTestId }: SamplingSuccessStateProps) {
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5">
                <div className="rounded-full bg-emerald-500/20 p-3">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                    <p className="text-lg font-medium text-emerald-600">抽样完成</p>
                    <p className="mt-1 text-sm text-emerald-800/70 dark:text-emerald-200/70">{summary}</p>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onRerun}
                    disabled={disabled}
                    data-testid={rerunTestId}
                    className="ml-auto rounded-full text-emerald-700 hover:bg-emerald-500/10 hover:text-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-500/15 dark:hover:text-emerald-200"
                >
                    <RefreshCw className="w-4 h-4" />
                </Button>
            </div>
        </div>
    );
}
