import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RequestError } from "@/components/RequestError";

/**
 * 学生端整页状态（加载失败 / 记录不存在 / 无效编号）。
 *
 * 这些状态会把页面正文整段替换掉，因此必须自带一级标题与出口：
 * axe 的 page-has-heading-one 与键盘用户都依赖它，重试后仍失败时也能返回。
 */
export function StudentStatusPage({ title, message, error, backTo = "/", backLabel = "返回任务大厅", children }: {
    title: string;
    message?: ReactNode;
    error?: { message: string; onRetry: () => void };
    backTo?: string;
    backLabel?: string;
    children?: ReactNode;
}) {
    return (
        <section className="mx-auto max-w-xl space-y-3 rounded-surface border border-border bg-card p-8 text-center">
            <h1 className="text-page-title font-semibold text-foreground">{title}</h1>
            {message && <p className="text-muted-foreground">{message}</p>}
            {error && <RequestError message={error.message} onRetry={error.onRetry} backTo={backTo} backLabel={backLabel} />}
            {children}
            {!error && (
                <Button asChild variant="ghost" className="gap-2">
                    <Link to={backTo}><ArrowLeft className="h-4 w-4" />{backLabel}</Link>
                </Button>
            )}
        </section>
    );
}
