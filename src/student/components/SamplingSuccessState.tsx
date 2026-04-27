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
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4 rounded-lg border border-primary/20 bg-primary/10 p-5">
                <div className="rounded-full bg-primary/15 p-3">
                    <CheckCircle2 className="size-6 text-primary" />
                </div>
                <div>
                    <p className="text-lg font-medium text-foreground">抽样完成</p>
                    <p className="mt-1 text-sm text-muted-foreground">{summary}</p>
                </div>
                <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={onRerun}
                    disabled={disabled}
                    data-testid={rerunTestId}
                    className="ml-auto"
                    aria-label="重新执行抽样"
                >
                    <RefreshCw />
                </Button>
            </div>
        </div>
    );
}
