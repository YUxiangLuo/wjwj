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
            <Card className="border-rose-500/30 bg-rose-500/10">
                <CardContent className="py-10 px-6 text-center space-y-4">
                    <div className="mx-auto w-12 h-12 rounded-full bg-rose-500/20 flex items-center justify-center">
                        <AlertTriangle className="w-6 h-6 text-rose-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-rose-500">{title}</h2>
                    <p className="text-sm text-rose-100/80 leading-relaxed max-w-md mx-auto">{description}</p>
                    <Link to={backTo}>
                        <Button className="bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100">
                            {backText}
                        </Button>
                    </Link>
                </CardContent>
            </Card>
        </div>
    );
}

export default TopicDeletedState;
