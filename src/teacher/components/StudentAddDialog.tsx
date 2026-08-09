import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-card border-border text-foreground sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="text-foreground">添加学生</DialogTitle>
                    <DialogDescription className="sr-only">
                        录入学生学号、姓名和邮箱信息。
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="studentId" className="text-foreground/90">学号（必填）</Label>
                        <Input
                            id="studentId"
                            data-testid="teacher-student-add-id"
                            placeholder="请输入学号"
                            maxLength={50}
                            required
                            value={form.id}
                            onChange={(e) => onFormChange({ ...form, id: e.target.value })}
                            className="bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-ring"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="studentName" className="text-foreground/90">姓名（必填）</Label>
                        <Input
                            id="studentName"
                            data-testid="teacher-student-add-name"
                            placeholder="请输入姓名"
                            maxLength={100}
                            required
                            value={form.name}
                            onChange={(e) => onFormChange({ ...form, name: e.target.value })}
                            className="bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-ring"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="studentEmail" className="text-foreground/90">邮箱（可选）</Label>
                        <Input
                            id="studentEmail"
                            data-testid="teacher-student-add-email"
                            type="email"
                            placeholder="请输入邮箱"
                            maxLength={120}
                            value={form.email}
                            onChange={(e) => onFormChange({ ...form, email: e.target.value })}
                            className="bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-ring"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground hover:bg-muted">取消</Button>
                    <Button
                        data-testid="teacher-student-add-submit"
                        onClick={onSubmit}
                        disabled={submitting || !isStudentAddFormComplete(form)}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground"
                    >
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "确认添加"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
