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

type ConfirmType = "delete" | "reset" | "toggle" | null;

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
}

export function StudentConfirmDialog(props: StudentConfirmDialogProps) {
    const { state, onOpenChange, onCancel, onConfirm } = props;

    return (
        <AlertDialog open={state.open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="bg-card border-border text-foreground">
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-foreground">确认操作</AlertDialogTitle>
                    <AlertDialogDescription className="text-muted-foreground">
                        {state.type === "delete" && "确认删除该学生吗？此操作不可恢复。"}
                        {state.type === "reset" && "确认重置该学生的密码为学号吗？"}
                        {state.type === "toggle" && `确认${state.student?.status === 1 ? "禁用" : "启用"}该学生账号吗？`}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={onCancel} className="bg-background border-border text-foreground/90 hover:bg-muted hover:text-foreground">
                        取消
                    </AlertDialogCancel>
                    <AlertDialogAction data-testid="teacher-student-confirm-submit" onClick={onConfirm} className={state.type === "delete" ? "bg-destructive hover:bg-destructive text-destructive-foreground" : "bg-primary hover:bg-primary text-primary-foreground"}>
                        确认
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
