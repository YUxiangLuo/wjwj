import { Button } from "@/components/ui/button";
import { CheckCircle2, RefreshCw } from "lucide-react";

interface SamplingSuccessStateProps {
    summary: string;
    onRerun: () => void;
    disabled: boolean;
    rerunTestId: string;
    rerunLabel: string;
}

export function SamplingSuccessState({ summary, onRerun, disabled, rerunTestId, rerunLabel }: SamplingSuccessStateProps) {
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-4 rounded-surface border border-success-border bg-success-muted p-5">
                <div className="rounded-control bg-success-muted p-3">
                    <CheckCircle2 className="w-6 h-6 text-success" />
                </div>
                <div>
                    <p className="text-subheading font-medium text-success">抽样完成</p>
                    <p className="mt-1 text-label text-success">{summary}</p>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onRerun}
                    disabled={disabled}
                    aria-label={rerunLabel}
                    title={rerunLabel}
                    data-testid={rerunTestId}
                    className="ml-auto rounded-control text-success hover:bg-success-muted hover:text-success"
                >
                    <RefreshCw className="w-4 h-4" />
                </Button>
            </div>
        </div>
    );
}
