import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

/** No workspace/autosave is mounted while the saved option representation is invalid. */
export function InvalidQuestionnaireDraft({ error, draft, onDiscard }: { error: string; draft?: unknown; onDiscard?: () => void }) {
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [backupError, setBackupError] = useState("");
    function backup() {
        let url: string | undefined;
        try {
            url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: "application/json;charset=utf-8" }));
            const link = document.createElement("a"); link.href = url; link.download = "questionnaire-draft-backup.json";
            document.body.append(link); link.click(); link.remove(); setBackupError("");
        } catch { setBackupError("备份下载失败，本地草稿仍保留；请重试，不要直接丢弃。"); }
        finally { if (url) URL.revokeObjectURL(url); }
    }
    return <section className="space-y-4 rounded-surface border border-warning-border bg-warning-muted p-6" data-testid="invalid-questionnaire-draft">
        <h2 className="text-section-title">问卷选项存储格式需要处理</h2>
        <p role="alert" className="text-body">{error}。不会自动转换或生成身份。</p>
        {onDiscard ? <>
            <p className="text-body">本地草稿已保留，自动保存和试填已暂停。可先下载备份，再明确丢弃本地草稿并重新加载服务端已保存问卷；不会删除服务端成果。</p>
            <div className="flex gap-3"><Button variant="outline" onClick={backup}>下载本地草稿备份</Button><Button variant="outline" onClick={() => setConfirmOpen(true)}>丢弃本地草稿并重新加载</Button></div>
            {backupError && <p role="alert" className="text-label text-destructive">{backupError}</p>}
            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>确认丢弃本地草稿？</AlertDialogTitle><AlertDialogDescription>此操作只删除当前版本的浏览器草稿，未保存到服务端的编辑无法恢复。请先保留需要的备份。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>保留草稿</AlertDialogCancel><AlertDialogAction onClick={onDiscard}>确认丢弃并重新加载</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
        </> : <p className="text-body">服务端记录格式无效，请联系管理员检查增量迁移或明确修正；不会用空问卷覆盖记录。</p>}
    </section>;
}
