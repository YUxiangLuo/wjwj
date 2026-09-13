import { useEffect, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
type Props = { path: string; download: (path: string, filename: string) => Promise<void> };
export function CodebookDownloadButton(props: Props) { return <CodebookDownloadSession key={props.path} {...props} />; }
function CodebookDownloadSession({ path, download }: Props) {
    const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
    const pending = useRef(false), live = useRef(true);
    useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
    const start = async () => {
        if (pending.current) return;
        pending.current = true; setBusy(true); setError(null);
        try { await download(path, "codebook_all.xlsx"); }
        catch (cause) { if (live.current) setError(cause instanceof Error ? cause.message : "码本下载失败，请重试"); }
        finally { pending.current = false; if (live.current) setBusy(false); }
    };
    return <div className="space-y-2">
        <Button variant="outline" disabled={busy} onClick={start} data-testid="codebook-download">{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}下载提交码本 XLSX</Button>
        <p className="text-meta text-muted-foreground">使用提交时的已确认字典、题目和抽样记录，不补入当前模板定义；包括完整原始字段，不含认知试填答案。超限不截断。</p>
        {error && <p role="alert" className="text-label text-destructive">{error}</p>}
    </div>;
}
