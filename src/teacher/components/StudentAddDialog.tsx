import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isValidOptionalEmail } from "@/lib/email";
import { isStudentAddFormComplete, type StudentAddFormState } from "./student-add-form";

interface StudentAddDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    form: StudentAddFormState;
    onFormChange: (value: StudentAddFormState) => void;
    submitting: boolean;
    onSubmit: () => void;
}

export function StudentAddDialog(props: StudentAddDialogProps) {
    const { open, onOpenChange, form, onFormChange, submitting, onSubmit } = props;
    const emailInvalid = !isValidOptionalEmail(form.email);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[425px] border-border bg-card text-foreground">
                <DialogHeader>
                    <DialogTitle className="font-medium text-foreground">添加学生</DialogTitle>
                    <DialogDescription className="sr-only">
                        录入学生学号、姓名和邮箱信息。
                    </DialogDescription>
                </DialogHeader>
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (!submitting && isStudentAddFormComplete(form)) onSubmit();
                    }}
                >
                    <div className="space-y-4 py-3">
                        <p className="rounded-surface bg-muted px-3.5 py-2.5 text-meta text-muted-foreground">
                            新建学生的初始登录密码默认与学号一致，学生首次登录后可自行修改密码。
                        </p>
                        <div className="space-y-2">
                            <Label htmlFor="studentId" className="text-foreground">学号（必填）</Label>
                            <Input
                                id="studentId"
                                data-testid="teacher-student-add-id"
                                placeholder="请输入学号"
                                maxLength={50}
                                required
                                value={form.id}
                                onChange={(e) => onFormChange({ ...form, id: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="studentName" className="text-foreground">姓名（必填）</Label>
                            <Input
                                id="studentName"
                                data-testid="teacher-student-add-name"
                                placeholder="请输入姓名"
                                maxLength={100}
                                required
                                value={form.name}
                                onChange={(e) => onFormChange({ ...form, name: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="studentEmail" className="text-foreground">邮箱（可选）</Label>
                            <Input
                                id="studentEmail"
                                data-testid="teacher-student-add-email"
                                type="email"
                                placeholder="请输入邮箱"
                                maxLength={120}
                                value={form.email}
                                onChange={(e) => onFormChange({ ...form, email: e.target.value })}
                                aria-invalid={emailInvalid}
                                aria-describedby={emailInvalid ? "studentEmail-error" : undefined}
                            />
                            {emailInvalid && (
                                <p id="studentEmail-error" role="alert" className="text-meta text-destructive">
                                    请输入有效的邮箱地址
                                </p>
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
                        <Button
                            type="submit"
                            data-testid="teacher-student-add-submit"
                            disabled={submitting || !isStudentAddFormComplete(form)}
                        >
                            {submitting ? <><Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />添加中...</> : "确认添加"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
