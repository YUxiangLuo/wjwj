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
            <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-[500px] overflow-y-auto border-border bg-card text-foreground">
                <DialogHeader>
                    <DialogTitle className="font-medium text-foreground">批量导入学生</DialogTitle>
                    <DialogDescription className="sr-only">
                        上传学生名单文件并查看导入结果。
                    </DialogDescription>
                </DialogHeader>
                <div className="min-w-0 space-y-4 py-3">
                    <div className="rounded-surface border border-dashed border-input bg-muted p-7 text-center transition-none hover:border-primary-border">
                        <Upload className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                        <p className="mb-1.5 text-label font-medium text-foreground">选择文件上传</p>
                        <p className="text-meta text-muted-foreground">支持 .xlsx、.csv；CSV 须先选择编码并核对预览。建议使用下载的模板填写</p>
                        <Input
                            id="teacher-student-import-file"
                            type="file"
                            data-testid="teacher-student-import-file"
                            accept=".xlsx,.csv"
                            disabled={importing}
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0] ?? null;
                                e.target.value = "";
                                onImportFileChange(null);
                                if (file?.name.toLowerCase().endsWith(".csv")) setCsvReviewFile(file);
                                else onImportFileChange(file);
                            }}
                        />
                        <Button
                            type="button"
                            variant="outline"
                            disabled={importing}
                            className="mt-5 bg-card"
                            onClick={() => document.getElementById("teacher-student-import-file")?.click()}
                        >
                            {importFile ? "重新选择文件" : "选择文件"}
                        </Button>
                        {importFile && (
                            <div className="mt-3 break-all font-mono text-meta text-success">已选择：{importFile.name}</div>
                        )}
                    </div>
                    <div className="flex items-center justify-start">
                        <Button type="button" data-testid="teacher-student-template-download" variant="outline" size="sm" onClick={onDownloadTemplate}>
                            <Download className="mr-1.5 h-4 w-4" />
                            下载导入模板
                        </Button>
                    </div>
                    {importResult && (
                        <div className="space-y-2 rounded-surface border border-border bg-muted p-3.5 text-label text-muted-foreground">
                            <div className="flex flex-wrap gap-4 font-medium">
                                <span className="text-success">新建：{importResult.successCount} 条</span>
                                {(importResult.skippedCount ?? 0) > 0 && (
                                    <span className="text-foreground">已存在跳过：{importResult.skippedCount} 条</span>
                                )}
                                <span className={importResult.failureCount > 0 ? "text-destructive" : "text-foreground"}>失败：{importResult.failureCount} 条</span>
                            </div>
                            {importResult.successCount > 0 && (
                                <p className="text-meta text-muted-foreground">新建学生的登录密码与学号相同。</p>
                            )}
                            {importResult.errors.length > 0 && (
                                <>
                                    <div className="max-h-32 space-y-1 overflow-y-auto rounded-control border border-border bg-card p-2.5 text-meta">
                                        {importResult.errors.map((err, idx) => (
                                            <div key={idx} className="text-destructive">行 {err.row === -1 ? "-" : err.row}：{err.reason}</div>
                                        ))}
                                    </div>
                                    <Button
                                        type="button"
                                        data-testid="teacher-student-import-errors-download"
                                        variant="outline"
                                        size="sm"
                                        className="bg-card"
                                        onClick={onDownloadErrors}
                                    >
                                        <FileWarning className="mr-1.5 h-4 w-4" />
                                        下载错误明细（CSV）
                                    </Button>
                                </>
                            )}
                            {(importResult.skipped?.length ?? 0) > 0 && (
                                <div className="max-h-24 space-y-1 overflow-y-auto rounded-control border border-border bg-card p-2.5 text-meta">
                                    {importResult.skipped!.map((entry, idx) => (
                                        <div key={idx}>行 {entry.row}：{entry.reason}</div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
                    <Button data-testid="teacher-student-import-submit" onClick={onImport} disabled={importing || !importFile}>
                        {importing ? <><Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />导入中...</> : "开始导入"}
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
