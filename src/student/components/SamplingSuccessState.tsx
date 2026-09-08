import { Button } from "@/components/ui/button";
import { CheckCircle2, RefreshCw } from "lucide-react";
import { IconTile } from "@/components/IconTile";

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
            <div className="flex flex-wrap items-center gap-4 rounded-surface border border-success-border bg-success-muted p-4" role="status">
                <IconTile intent="success">
                    <CheckCircle2 className="w-6 h-6 text-success" />
                </IconTile>
                <div className="min-w-0 flex-1">
                    <p className="text-subheading font-medium text-success">抽样完成，结果已保存</p>
                    <p className="mt-1 text-label text-success">{summary}</p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onRerun}
                    disabled={disabled}
                    aria-label={rerunLabel}
                    title={rerunLabel}
                    data-testid={rerunTestId}
                    className="ml-auto shrink-0 bg-card"
                >
                    <RefreshCw className="mr-2 w-4 h-4" />重新抽样
                </Button>
            </div>
            <p className="text-meta text-muted-foreground">重新抽样会替换本方法的当前记录。请先查看下方结果，再决定是否重新执行。</p>
        </div>
    );
}
