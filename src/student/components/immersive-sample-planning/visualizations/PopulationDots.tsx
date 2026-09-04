import { useRef, useEffect, useCallback } from "react";

interface Props {
    total: number;
    highlighted: number;
    className?: string;
}

/**
 * Canvas-based dot grid visualizing a population.
 * Highlighted dots (the sample) are rendered in indigo, the rest in light gray.
 * Automatically scales the dot count to a visually comfortable range.
 */
export function PopulationDots({ total, highlighted, className }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const drawRef = useRef<() => void>(null);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const displayW = canvas.clientWidth;
        const displayH = canvas.clientHeight;
        if (displayW === 0 || displayH === 0) return;
        canvas.width = displayW * dpr;
        canvas.height = displayH * dpr;
        ctx.scale(dpr, dpr);

        // Scale down to a manageable dot count (max ~600 dots)
        const maxDots = 600;
        const scale = total > maxDots ? maxDots / total : 1;
        const dotCount = Math.round(total * scale);
        const highlightCount = Math.round(highlighted * scale);

        // Calculate grid layout
        const cols = Math.ceil(Math.sqrt(dotCount * (displayW / displayH)));
        const rows = Math.ceil(dotCount / cols);

        const dotSize = Math.min(
            (displayW - 8) / cols,
            (displayH - 8) / rows,
            6,
        );
        const radius = Math.max(dotSize * 0.35, 1.5);
        const gapX = (displayW - cols * dotSize) / 2;
        const gapY = (displayH - rows * dotSize) / 2;

        const baseColor = "rgba(203, 213, 225, 0.6)";
        const highlightColor = "rgba(99, 102, 241, 0.7)";

        ctx.clearRect(0, 0, displayW, displayH);

        let drawn = 0;
        for (let r = 0; r < rows && drawn < dotCount; r++) {
            for (let c = 0; c < cols && drawn < dotCount; c++) {
                const x = gapX + c * dotSize + dotSize / 2;
                const y = gapY + r * dotSize + dotSize / 2;

                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fillStyle = drawn < highlightCount ? highlightColor : baseColor;
                ctx.fill();
                drawn++;
            }
        }
    }, [total, highlighted]);

    drawRef.current = draw;

    // Redraw when data changes
    useEffect(() => { draw(); }, [draw]);

    // Redraw on resize (stable observer — not recreated on data changes)
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ro = new ResizeObserver(() => drawRef.current?.());
        ro.observe(canvas);
        return () => ro.disconnect();
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className={`w-full h-36 ${className ?? ""}`}
            aria-label={`总体 ${total.toLocaleString()} 个单位中高亮 ${highlighted.toLocaleString()} 个单位`}
        />
    );
}
