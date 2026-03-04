import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
            <DialogContent className="bg-slate-900 border-slate-800 text-slate-200 sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="text-slate-100">添加学生</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="studentId" className="text-slate-300">学号</Label>
                        <Input
                            id="studentId"
                            data-testid="teacher-student-add-id"
                            placeholder="请输入学号"
                            value={form.id}
                            onChange={(e) => onFormChange({ ...form, id: e.target.value })}
                            className="bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600 focus:border-indigo-500/50"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="studentName" className="text-slate-300">姓名</Label>
                        <Input
                            id="studentName"
                            data-testid="teacher-student-add-name"
                            placeholder="请输入姓名"
                            value={form.name}
                            onChange={(e) => onFormChange({ ...form, name: e.target.value })}
                            className="bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600 focus:border-indigo-500/50"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="studentEmail" className="text-slate-300">邮箱（可选）</Label>
                        <Input
                            id="studentEmail"
                            data-testid="teacher-student-add-email"
                            type="email"
                            placeholder="请输入邮箱"
                            value={form.email}
                            onChange={(e) => onFormChange({ ...form, email: e.target.value })}
                            className="bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600 focus:border-indigo-500/50"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-slate-400 hover:text-slate-200 hover:bg-slate-800">取消</Button>
                    <Button data-testid="teacher-student-add-submit" onClick={onSubmit} disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "确认添加"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
