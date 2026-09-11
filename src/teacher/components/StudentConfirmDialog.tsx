import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Student } from "../api-client";

type ConfirmType = "delete" | "reset" | null;

interface ConfirmState {
    open: boolean;
    type: ConfirmType;
    student: Student | null;
}

interface StudentConfirmDialogProps {
    state: ConfirmState;
    onOpenChange: (open: boolean) => void;
    onCancel: () => void;
    onConfirm: () => void;
    /** Hard deletes cascade; show the numbers the teacher is about to destroy. */
    impactSummary?: string | null;
    impactPending?: boolean;
}

export function StudentConfirmDialog(props: StudentConfirmDialogProps) {
    const { state, onOpenChange, onCancel, onConfirm, impactSummary, impactPending } = props;

    return (
        <AlertDialog open={state.open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="bg-card border-border text-foreground">
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-foreground">确认操作</AlertDialogTitle>
                    <AlertDialogDescription className="text-muted-foreground">
                        {state.type === "delete" && "将永久删除该学生账号、全部实验进度、提交、成绩和抽样记录。此操作不可恢复；之后再次导入同一学号会创建全新账号。"}
                        {state.type === "delete" && impactPending && (
                            <span className="mt-2 block">正在统计将被删除的实验与成绩…</span>
                        )}
                        {state.type === "delete" && !impactPending && impactSummary && (
                            <span data-testid="teacher-student-delete-impact" className="mt-2 block font-medium text-destructive">
                                {impactSummary}
                            </span>
                        )}
                        {state.type === "reset" && "确认重置该学生的密码为学号吗？"}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={onCancel}>
                        取消
                    </AlertDialogCancel>
                    <AlertDialogAction data-testid="teacher-student-confirm-submit" onClick={onConfirm} variant={state.type === "delete" ? "destructive" : "default"}>
                        {state.type === "delete" ? "永久删除" : "确认"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
