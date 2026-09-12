import { useEffect, useState } from "react";
import { CsvFileReviewDialog } from "@/components/CsvFileReviewDialog";
import { Download, FileWarning, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface StudentImportResult {
    successCount: number;
    skippedCount?: number;
    failureCount: number;
    errors: Array<{ row: number; reason: string }>;
    skipped?: Array<{ row: number; reason: string }>;
}

interface StudentImportDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    importFile: File | null;
    onImportFileChange: (file: File | null) => void;
    importing: boolean;
    importResult: StudentImportResult | null;
    onDownloadTemplate: () => void;
    onDownloadErrors: () => void;
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
        onDownloadErrors,
        onImport,
    } = props;
    const [csvReviewFile, setCsvReviewFile] = useState<File | null>(null);
    useEffect(() => { if (!open) setCsvReviewFile(null); }, [open]);
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-card border-border text-foreground max-w-[500px] max-h-[calc(100dvh-2rem)] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-foreground">批量导入学生</DialogTitle>
                    <DialogDescription className="sr-only">
                        上传学生名单文件并查看导入结果。
                    </DialogDescription>
                </DialogHeader>
                <div className="min-w-0 space-y-4 py-4">
                    <div className="border-2 border-dashed border-input bg-background rounded-surface p-8 text-center hover:border-primary-border transition-none">
                        <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                        <label htmlFor="teacher-student-import-file" className="mb-2 block text-label text-muted-foreground">选择文件上传</label>
                        <p className="text-meta text-muted-foreground">支持 .xlsx、.csv；CSV 须先选择编码并核对预览。建议使用下载的模板填写</p>
                        <Input
                            id="teacher-student-import-file"
                            type="file"
                            data-testid="teacher-student-import-file"
                            accept=".xlsx,.csv"
                            disabled={importing}
                            className="mt-6 bg-card border-input text-foreground text-label file:bg-muted file:text-foreground file:border-0 file:rounded-control file:mr-4 file:px-3 file:py-1 cursor-pointer"
                            onChange={(e) => {
                                const file = e.target.files?.[0] ?? null;
                                e.target.value = "";
                                onImportFileChange(null);
                                if (file?.name.toLowerCase().endsWith(".csv")) setCsvReviewFile(file);
                                else onImportFileChange(file);
                            }}
                        />
                        {importFile && (
                            <div className="text-meta text-success mt-3 break-all font-mono">已选择：{importFile.name}</div>
                        )}
                    </div>
                    <Button data-testid="teacher-student-template-download" variant="link" className="text-primary hover:text-primary p-0 h-auto" onClick={onDownloadTemplate}>
                        <Download className="w-4 h-4 mr-1" />
                        下载导入模板
                    </Button>
                    {importResult && (
                        <div className="bg-background border border-border rounded-surface p-3 text-label text-muted-foreground space-y-2">
                            <div className="flex flex-wrap gap-4">
                                <span className="text-success">新建：{importResult.successCount} 条</span>
                                {(importResult.skippedCount ?? 0) > 0 && (
                                    <span>已存在跳过：{importResult.skippedCount} 条</span>
                                )}
                                <span className={importResult.failureCount > 0 ? "text-destructive" : ""}>失败：{importResult.failureCount} 条</span>
                            </div>
                            {importResult.successCount > 0 && (
                                <p className="text-meta text-info">新建学生的登录密码与学号相同。</p>
                            )}
                            {importResult.errors.length > 0 && (
                                <>
                                    <div className="max-h-32 overflow-y-auto text-meta space-y-1 bg-card p-2 rounded-control border border-border">
                                        {importResult.errors.map((err, idx) => (
                                            <div key={idx} className="text-destructive">行 {err.row === -1 ? "-" : err.row}：{err.reason}</div>
                                        ))}
                                    </div>
                                    <Button
                                        data-testid="teacher-student-import-errors-download"
                                        variant="link"
                                        className="h-auto p-0 text-primary hover:text-primary"
                                        onClick={onDownloadErrors}
                                    >
                                        <FileWarning className="mr-1 h-4 w-4" />
                                        下载错误明细（CSV）
                                    </Button>
                                </>
                            )}
                            {(importResult.skipped?.length ?? 0) > 0 && (
                                <div className="max-h-24 overflow-y-auto text-meta space-y-1 bg-card p-2 rounded-control border border-border">
                                    {importResult.skipped!.map((entry, idx) => (
                                        <div key={idx}>行 {entry.row}：{entry.reason}</div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground hover:bg-muted">取消</Button>
                    <Button data-testid="teacher-student-import-submit" onClick={onImport} disabled={importing || !importFile} className="bg-primary hover:bg-primary-hover text-primary-foreground">
                        {importing ? <><Loader2 aria-hidden="true" className="w-4 h-4 mr-2 animate-spin" />导入中...</> : "开始导入"}
                    </Button>
                </DialogFooter>
            </DialogContent>
            {open && csvReviewFile && <CsvFileReviewDialog file={csvReviewFile} onCancel={() => setCsvReviewFile(null)} onConfirm={file => {
                setCsvReviewFile(null);
                onImportFileChange(file);
            }} />}
        </Dialog>
    );
}
