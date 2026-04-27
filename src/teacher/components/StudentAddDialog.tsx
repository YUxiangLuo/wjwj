import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="studentId" className="text-foreground">学号</Label>
                        <Input
                            id="studentId"
                            data-testid="teacher-student-add-id"
                            placeholder="请输入学号"
                            value={form.id}
                            onChange={(e) => onFormChange({ ...form, id: e.target.value })}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="studentName" className="text-foreground">姓名</Label>
                        <Input
                            id="studentName"
                            data-testid="teacher-student-add-name"
                            placeholder="请输入姓名"
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
                            value={form.email}
                            onChange={(e) => onFormChange({ ...form, email: e.target.value })}
                        />
                    </div>
                </div>
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
