import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

interface StudentFormState {
    id: string;
    name: string;
    email: string;
}

interface StudentAddDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    form: StudentFormState;
    onFormChange: (value: StudentFormState) => void;
    submitting: boolean;
    onSubmit: () => void;
}

export function StudentAddDialog(props: StudentAddDialogProps) {
    const { open, onOpenChange, form, onFormChange, submitting, onSubmit } = props;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>添加学生</DialogTitle>
                    <DialogDescription className="sr-only">
                        录入学生学号、姓名和邮箱信息。
                    </DialogDescription>
                </DialogHeader>
                <FieldGroup className="gap-4 py-4">
                    <Field>
                        <FieldLabel htmlFor="studentId">学号</FieldLabel>
                        <Input
                            id="studentId"
                            data-testid="teacher-student-add-id"
                            placeholder="请输入学号"
                            value={form.id}
                            onChange={(e) => onFormChange({ ...form, id: e.target.value })}
                        />
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="studentName">姓名</FieldLabel>
                        <Input
                            id="studentName"
                            data-testid="teacher-student-add-name"
                            placeholder="请输入姓名"
                            value={form.name}
                            onChange={(e) => onFormChange({ ...form, name: e.target.value })}
                        />
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="studentEmail">邮箱（可选）</FieldLabel>
                        <Input
                            id="studentEmail"
                            data-testid="teacher-student-add-email"
                            type="email"
                            placeholder="请输入邮箱"
                            value={form.email}
                            onChange={(e) => onFormChange({ ...form, email: e.target.value })}
                        />
                    </Field>
                </FieldGroup>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
                    <Button data-testid="teacher-student-add-submit" onClick={onSubmit} disabled={submitting}>
                        {submitting ? <Loader2 className="animate-spin" /> : "确认添加"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
