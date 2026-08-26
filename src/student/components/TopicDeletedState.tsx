import { AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface TopicDeletedStateProps {
    backTo?: string;
    backText?: string;
    /** 课题删除与「仅撤销本班任务」区分展示文案 */
    variant?: "topic_deleted" | "task_revoked";
}

export function TopicDeletedState({
    backTo = "/",
    backText = "返回任务列表",
    variant = "topic_deleted",
}: TopicDeletedStateProps) {
    const title = variant === "task_revoked" ? "任务已撤销" : "课题已删除";
    const description =
        variant === "task_revoked"
            ? "教师已撤销该班级对应的发布任务，当前页面不可继续操作。"
            : "该课题已被教师删除，相关任务已归档，当前页面不可继续操作。";

    return (
        <div className="max-w-2xl mx-auto py-12">
            <Card className="border-destructive/30 bg-destructive/10">
                <CardContent className="py-10 px-6 text-center space-y-4">
                    <div className="mx-auto w-12 h-12 rounded-full bg-destructive/20 flex items-center justify-center">
                        <AlertTriangle className="w-6 h-6 text-destructive" />
                    </div>
                    <h2 className="text-2xl font-bold text-destructive">{title}</h2>
                    <p className="text-sm text-destructive leading-relaxed max-w-md mx-auto">{description}</p>
                    <Button asChild className="bg-muted hover:bg-muted text-foreground">
                        <Link to={backTo}>{backText}</Link>
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}

export default TopicDeletedState;
