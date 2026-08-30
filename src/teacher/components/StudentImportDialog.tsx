import { Download, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface StudentImportResult {
    successCount: number;
    failureCount: number;
    errors: Array<{ row: number; reason: string }>;
}

interface StudentImportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    importFile: File | null;
    onImportFileChange: (file: File | null) => void;
    importing: boolean;
    importResult: StudentImportResult | null;
    onDownloadTemplate: () => void;
    onImport: () => void;
}

export function StudentImportDialog(props: StudentImportDialogProps) {
    const {
        open,
        onOpenChange,
        importFile,
        onImportFileChange,
        importing,
        importResult,
        onDownloadTemplate,
        onImport,
    } = props;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-card border-border text-foreground max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="text-foreground">批量导入学生</DialogTitle>
                    <DialogDescription className="sr-only">
                        上传学生名单文件并查看导入结果。
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="border-2 border-dashed border-input bg-background/50 rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
                        <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                        <label htmlFor="teacher-student-import-file" className="mb-2 block text-sm text-muted-foreground">选择文件上传</label>
                        <p className="text-xs text-muted-foreground">支持 .xlsx, .csv 格式</p>
                        <Input
                            id="teacher-student-import-file"
                            type="file"
                            data-testid="teacher-student-import-file"
                            accept=".xlsx,.csv"
                            className="mt-6 bg-card/50 border-input text-foreground/90 text-sm file:bg-muted file:text-foreground/90 file:border-0 file:rounded-md file:mr-4 file:px-3 file:py-1 cursor-pointer"
                            onChange={(e) => onImportFileChange(e.target.files?.[0] ?? null)}
                        />
                        {importFile && (
                            <div className="text-xs text-success mt-3 font-mono">已选择：{importFile.name}</div>
                        )}
                    </div>
                    <Button data-testid="teacher-student-template-download" variant="link" className="text-primary hover:text-primary p-0 h-auto" onClick={onDownloadTemplate}>
                        <Download className="w-4 h-4 mr-1" />
                        下载导入模板
                    </Button>
                    {importResult && (
                        <div className="bg-background border border-border rounded-lg p-3 text-sm text-muted-foreground space-y-2">
                            <div className="flex gap-4">
                                <span className="text-success">成功：{importResult.successCount} 条</span>
                                <span className={importResult.failureCount > 0 ? "text-destructive" : ""}>失败：{importResult.failureCount} 条</span>
                            </div>
                            {importResult.errors.length > 0 && (
                                <div className="max-h-32 overflow-y-auto text-xs space-y-1 bg-card p-2 rounded border border-border">
                                    {importResult.errors.map((err, idx) => (
                                        <div key={idx} className="text-destructive">行 {err.row === -1 ? "-" : err.row}：{err.reason}</div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground hover:bg-muted">取消</Button>
                    <Button data-testid="teacher-student-import-submit" onClick={onImport} disabled={importing || !importFile} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                        {importing ? <><Loader2 aria-hidden="true" className="w-4 h-4 mr-2 animate-spin" />导入中...</> : "开始导入"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
