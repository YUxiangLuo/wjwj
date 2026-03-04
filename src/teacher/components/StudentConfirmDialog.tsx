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
            <AlertDialogContent className="bg-slate-900 border-slate-800 text-slate-200">
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-slate-100">确认操作</AlertDialogTitle>
                    <AlertDialogDescription className="text-slate-400">
                        {state.type === "delete" && "确认删除该学生吗？此操作不可恢复。"}
                        {state.type === "reset" && "确认重置该学生的密码为 123456 吗？"}
                        {state.type === "toggle" && `确认${state.student?.status === 1 ? "禁用" : "启用"}该学生账号吗？`}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={onCancel} className="bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white">
                        取消
                    </AlertDialogCancel>
                    <AlertDialogAction data-testid="teacher-student-confirm-submit" onClick={onConfirm} className={state.type === "delete" ? "bg-rose-600 hover:bg-rose-700 text-white" : "bg-indigo-600 hover:bg-indigo-700 text-white"}>
                        确认
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
