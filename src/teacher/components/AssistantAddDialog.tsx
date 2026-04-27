import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

interface NewAssistantForm {
    name: string;
    studentId: string;
}

interface AssistantAddDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    form: NewAssistantForm;
    onFormChange: (value: NewAssistantForm) => void;
    onSubmit: () => void;
}

export function AssistantAddDialog(props: AssistantAddDialogProps) {
    const {
        open,
        onOpenChange,
        form,
        onFormChange,
        onSubmit,
    } = props;
    const canSubmit = form.studentId.trim().length > 0 && form.name.trim().length > 0;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>添加助教</DialogTitle>
                    <DialogDescription className="sr-only">
                        填写工号和姓名以创建新的助教账号。
                    </DialogDescription>
                </DialogHeader>
                <FieldGroup className="gap-4 py-4">
                    <Field>
                        <FieldLabel htmlFor="assistantStudentId">工号</FieldLabel>
                        <Input
                            id="assistantStudentId"
                            data-testid="teacher-assistant-add-account"
                            placeholder="请输入工号"
                            value={form.studentId}
                            onChange={(e) => onFormChange({ ...form, studentId: e.target.value })}
                        />
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="assistantName">姓名</FieldLabel>
                        <Input
                            id="assistantName"
                            data-testid="teacher-assistant-add-name"
                            placeholder="请输入姓名"
                            value={form.name}
                            onChange={(e) => onFormChange({ ...form, name: e.target.value })}
                        />
                    </Field>
                </FieldGroup>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
                    <Button data-testid="teacher-assistant-add-submit" onClick={onSubmit} disabled={!canSubmit}>确认添加</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
