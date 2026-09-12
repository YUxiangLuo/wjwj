import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { decodeCsvUpload, getCsvBomEncoding, type CsvEncoding } from "@/lib/csv-encoding";

const ENCODINGS: Record<CsvEncoding, string> = {
    "utf-8": "UTF-8",
    gb18030: "GBK / GB18030（Windows 简体中文）",
    "utf-16le": "UTF-16 LE",
    "utf-16be": "UTF-16 BE",
};
interface Source { file: File; buffer: ArrayBuffer; bom: CsvEncoding | null }
interface Preview {
    file: File;
    encoding: CsvEncoding;
    normalized?: File;
    columns?: string[];
    rows?: Record<string, unknown>[];
    count?: number;
    error?: string;
}
const cellText = (value: unknown) => {
    const text = String(value ?? "");
    return text.length > 200 ? text.slice(0, 200) + "…（预览已截断）" : text;
};

/** CSV is reviewed locally before any upload or account mutation. The confirmed bytes carry a UTF-8 BOM. */
export function CsvFileReviewDialog({ file, onConfirm, onCancel }: {
    file: File;
    onConfirm: (file: File) => void;
    onCancel: () => void;
}) {
    const [source, setSource] = useState<Source | null>(null);
    const [encoding, setEncoding] = useState<CsvEncoding>("utf-8");
    const [readError, setReadError] = useState<string | null>(null);
    const [preview, setPreview] = useState<Preview | null>(null);
    const confirmed = useRef(false);
    useEffect(() => {
        let current = true;
        confirmed.current = false;
        setReadError(null);
        setSource(null);
        setPreview(null);
        void (async () => {
            // Keep the spreadsheet parser (including XLSX) out of initial SPA bundles.
            const { validateSpreadsheetUploadFile } = await import("@/lib/spreadsheet");
            const invalid = validateSpreadsheetUploadFile(file);
            if (invalid) throw new Error(invalid.message);
            const buffer = await file.arrayBuffer();
            const bom = getCsvBomEncoding(buffer);
            if (current) { setEncoding(bom ?? "utf-8"); setSource({ file, buffer, bom }); }
        })().catch(error => { if (current) setReadError(error instanceof Error ? error.message : "无法读取文件，请重新选择。"); });
        return () => { current = false; };
    }, [file]);

    useEffect(() => {
        if (!source || source.file !== file) return;
        let current = true;
        void (async () => {
            const text = decodeCsvUpload(source.buffer, encoding);
            const bytes = new TextEncoder().encode("\uFEFF" + text);
            const { parseSpreadsheetFile, validateSpreadsheetUploadFile, MAX_SPREADSHEET_ROWS, MAX_SPREADSHEET_COLUMNS } = await import("@/lib/spreadsheet");
            const normalized = new File([bytes], file.name, { type: "text/csv", lastModified: file.lastModified });
            const invalid = validateSpreadsheetUploadFile(normalized);
            if (invalid) throw new Error(`转为 UTF-8 后：${invalid.message}`);
            const parsed = await parseSpreadsheetFile(bytes.buffer, file.name, { includeColumnValues: false });
            if (parsed.malformed) throw new Error("CSV 行列结构不一致或引号未闭合，请修正源文件。");
            if (parsed.duplicateColumns.length) throw new Error("CSV 存在重复列名，请修正源文件。");
            if (!parsed.rowCount) throw new Error("CSV 没有可导入的数据行。");
            if (parsed.rowCount > MAX_SPREADSHEET_ROWS || parsed.colCount > MAX_SPREADSHEET_COLUMNS) throw new Error("CSV 不能超过 100,000 行、50 列。");
            if (current) setPreview({ file, encoding, normalized, columns: parsed.columns, rows: parsed.preview, count: parsed.rowCount });
        })().catch(error => {
            if (current) setPreview({ file, encoding, error: error instanceof Error ? error.message : "无法解析 CSV，请检查文件及编码。" });
        });
        return () => { current = false; };
    }, [file, source, encoding]);

    const active = preview?.file === file && preview.encoding === encoding ? preview : null;
    const error = readError ?? active?.error;
    const ready = source?.file === file && Boolean(active?.normalized) && !error;
    return (
        <Dialog open onOpenChange={open => { if (!open) onCancel(); }}>
            <DialogContent className="flex max-w-4xl max-h-[calc(100dvh-2rem)] flex-col overflow-hidden" data-testid="csv-file-review">
                <DialogHeader className="shrink-0">
                    <DialogTitle>确认 CSV 编码与内容</DialogTitle>
                    <DialogDescription>尚未上传或写入数据。请对照原文件核对中文、编号和列名，再确认使用。</DialogDescription>
                </DialogHeader>
                <p className="shrink-0 text-meta text-muted-foreground break-all">{file.name}</p>
                <Select value={encoding} onValueChange={value => setEncoding(value as CsvEncoding)} disabled={source?.file !== file || Boolean(source?.bom)}>
                    <SelectTrigger aria-label="CSV 文件编码" className="shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(ENCODINGS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                </Select>
                <p className="shrink-0 text-meta text-muted-foreground">{source?.bom ? "已根据 BOM 确定编码。" : "无 BOM 文件默认尝试 UTF-8，不代表已正确识别。Windows 简体中文 CSV 如有乱码，请选择 GBK / GB18030；原文件若为 UTF-8 且已损坏，应重新导出，不能靠切换编码修复。"}</p>
                {error ? <p role="alert" className="text-label text-destructive">{error}</p> : !ready ? <p role="status" className="text-label text-muted-foreground">正在读取预览…</p> : <>
                    <p className="shrink-0 text-meta">共 {active!.count} 行，预览前 {active!.rows!.length} 行；仅预览显示会截断长文本，完整内容仍将保存。</p>
                    <div role="region" aria-label="CSV 内容预览，可横向和纵向滚动" tabIndex={0} className="min-h-0 max-h-56 overflow-auto rounded-surface border border-border">
                        <table className="w-full text-meta">
                            <thead><tr className="bg-muted">{active!.columns!.map(column => <th key={column} scope="col" className="px-3 py-2 text-left font-medium whitespace-pre-wrap">{cellText(column)}</th>)}</tr></thead>
                            <tbody>{active!.rows!.map((row, index) => <tr key={index} className="border-t border-border">{active!.columns!.map(column => <td key={column} className="max-w-80 px-3 py-2 whitespace-pre-wrap break-words">{cellText(row[column])}</td>)}</tr>)}</tbody>
                        </table>
                    </div>
                </>}
                <DialogFooter className="shrink-0">
                    <Button variant="outline" onClick={onCancel}>取消</Button>
                    <Button disabled={!ready} data-testid="csv-review-confirm" onClick={() => {
                        if (!ready || !active?.normalized || confirmed.current) return;
                        confirmed.current = true;
                        onConfirm(active.normalized);
                    }}>已核对，使用此文件</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
