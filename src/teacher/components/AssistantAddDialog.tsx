import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
            <DialogContent className="bg-slate-900 border-slate-800 text-slate-200">
                <DialogHeader>
                    <DialogTitle className="text-slate-100">添加助教</DialogTitle>
                    <DialogDescription className="sr-only">
                        填写工号和姓名以创建新的助教账号。
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="assistantStudentId" className="text-slate-300">工号</Label>
                        <Input
                            id="assistantStudentId"
                            data-testid="teacher-assistant-add-account"
                            placeholder="请输入工号"
                            value={form.studentId}
                            onChange={(e) => onFormChange({ ...form, studentId: e.target.value })}
                            className="bg-slate-950 border-slate-800 text-slate-200"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="assistantName" className="text-slate-300">姓名</Label>
                        <Input
                            id="assistantName"
                            data-testid="teacher-assistant-add-name"
                            placeholder="请输入姓名"
                            value={form.name}
                            onChange={(e) => onFormChange({ ...form, name: e.target.value })}
                            className="bg-slate-950 border-slate-800 text-slate-200"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-slate-400 hover:text-slate-200 hover:bg-slate-800">取消</Button>
                    <Button data-testid="teacher-assistant-add-submit" onClick={onSubmit} disabled={!canSubmit} className="bg-indigo-600 hover:bg-indigo-700 text-white">确认添加</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
