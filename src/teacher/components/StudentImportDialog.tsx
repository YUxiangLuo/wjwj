import { Download, Loader2, Upload } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

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
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>批量导入学生</DialogTitle>
                    <DialogDescription className="sr-only">
                        上传学生名单文件并查看导入结果。
                    </DialogDescription>
                </DialogHeader>
                <FieldGroup className="gap-4 py-4">
                    <Field className="border-2 border-dashed border-border bg-background/50 p-8 text-center transition-colors hover:border-primary/50">
                        <Upload className="mx-auto mb-4 size-12 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground mb-2">选择文件上传</p>
                        <FieldDescription className="text-center text-xs">支持 .xlsx, .xls, .csv 格式</FieldDescription>
                        <Input
                            type="file"
                            data-testid="teacher-student-import-file"
                            accept=".xlsx,.xls,.csv"
                            className="mt-6 file:bg-muted file:text-foreground file:border-0 file:rounded-md file:mr-4 file:px-3 file:py-1 cursor-pointer"
                            onChange={(e) => onImportFileChange(e.target.files?.[0] ?? null)}
                        />
                        {importFile && (
                            <div className="text-xs text-success mt-3 font-mono">已选择：{importFile.name}</div>
                        )}
                    </Field>
                    <Button data-testid="teacher-student-template-download" variant="link" size="xs" onClick={onDownloadTemplate}>
                        <Download data-icon="inline-start" />
                        下载导入模板
                    </Button>
                    {importResult && (
                        <Alert variant={importResult.failureCount > 0 ? "warning" : "success"}>
                            <AlertDescription className="flex flex-col gap-2">
                                <div className="flex gap-4">
                                <span className="text-success">成功：{importResult.successCount} 条</span>
                                <span className={importResult.failureCount > 0 ? "text-destructive" : ""}>失败：{importResult.failureCount} 条</span>
                                </div>
                                {importResult.errors.length > 0 && (
                                    <ScrollArea className="h-32 max-h-32 overflow-hidden border border-border bg-card p-2">
                                        <div className="flex flex-col gap-1 text-xs">
                                            {importResult.errors.map((err, idx) => (
                                                <div key={idx} className="text-destructive">行 {err.row === -1 ? "-" : err.row}：{err.reason}</div>
                                            ))}
                                        </div>
                                    </ScrollArea>
                                )}
                            </AlertDescription>
                        </Alert>
                    )}
                </FieldGroup>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
                    <Button data-testid="teacher-student-import-submit" onClick={onImport} disabled={importing || !importFile}>
                        {importing ? <Loader2 className="animate-spin" /> : "开始导入"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
