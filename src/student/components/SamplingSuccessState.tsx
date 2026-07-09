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
            <div className="flex items-center gap-4 rounded-2xl border border-success/20 bg-success/10 p-5">
                <div className="rounded-full bg-success/20 p-3">
                    <CheckCircle2 className="w-6 h-6 text-success" />
                </div>
                <div>
                    <p className="text-lg font-medium text-success">抽样完成</p>
                    <p className="mt-1 text-sm text-success">{summary}</p>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onRerun}
                    disabled={disabled}
                    data-testid={rerunTestId}
                    className="ml-auto rounded-full text-success hover:bg-success/10 hover:text-success"
                >
                    <RefreshCw className="w-4 h-4" />
                </Button>
            </div>
        </div>
    );
}
