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
            <DialogContent className="bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="text-slate-900 dark:text-slate-100">批量导入学生</DialogTitle>
                    <DialogDescription className="sr-only">
                        上传学生名单文件并查看导入结果。
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 bg-white/50 dark:bg-slate-950/50 rounded-lg p-8 text-center hover:border-indigo-500/50 transition-colors">
                        <Upload className="w-12 h-12 mx-auto text-slate-500 mb-4" />
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">选择文件上传</p>
                        <p className="text-xs text-slate-500">支持 .xlsx, .xls, .csv 格式</p>
                        <Input
                            type="file"
                            data-testid="teacher-student-import-file"
                            accept=".xlsx,.xls,.csv"
                            className="mt-6 bg-slate-50/50 dark:bg-slate-900/50 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm file:bg-slate-200 dark:file:bg-slate-800 file:text-slate-700 dark:file:text-slate-300 file:border-0 file:rounded-md file:mr-4 file:px-3 file:py-1 cursor-pointer"
                            onChange={(e) => onImportFileChange(e.target.files?.[0] ?? null)}
                        />
                        {importFile && (
                            <div className="text-xs text-emerald-600 mt-3 font-mono">已选择：{importFile.name}</div>
                        )}
                    </div>
                    <Button data-testid="teacher-student-template-download" variant="link" className="text-indigo-500 hover:text-indigo-600 p-0 h-auto" onClick={onDownloadTemplate}>
                        <Download className="w-4 h-4 mr-1" />
                        下载导入模板
                    </Button>
                    {importResult && (
                        <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-3 text-sm text-slate-600 dark:text-slate-400 space-y-2">
                            <div className="flex gap-4">
                                <span className="text-emerald-600">成功：{importResult.successCount} 条</span>
                                <span className={importResult.failureCount > 0 ? "text-rose-600" : ""}>失败：{importResult.failureCount} 条</span>
                            </div>
                            {importResult.errors.length > 0 && (
                                <div className="max-h-32 overflow-y-auto text-xs space-y-1 bg-slate-50 dark:bg-slate-900 p-2 rounded border border-slate-200 dark:border-slate-800">
                                    {importResult.errors.map((err, idx) => (
                                        <div key={idx} className="text-rose-600">行 {err.row === -1 ? "-" : err.row}：{err.reason}</div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800">取消</Button>
                    <Button data-testid="teacher-student-import-submit" onClick={onImport} disabled={importing || !importFile} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                        {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : "开始导入"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
