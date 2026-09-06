import { useCallback, useEffect, useRef, useState } from "react";

interface ApiResult<T> { success: boolean; data?: T; error?: { message: string } }

/** Turn API failures into explicit load errors, never empty lists or missing records. */
export function requireApiData<T>(response: ApiResult<T>, fallback: string): T {
    if (!response.success || response.data == null) throw new Error(response.error?.message ?? fallback);
    return response.data;
}

export function useAsyncLoad(fallback: string) {
    const generation = useRef(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const cancel = useCallback(() => { generation.current += 1; }, []);
    useEffect(() => cancel, [cancel]);

    const run = useCallback(async <T,>(request: () => Promise<T>, accept: (value: T) => void) => {
        const current = ++generation.current;
        setLoading(true);
        setError(null);
        try {
            const value = await request();
            if (current !== generation.current) return false;
            accept(value);
            return true;
        } catch (cause) {
            if (current === generation.current) setError(cause instanceof Error ? cause.message : fallback);
            return false;
        } finally {
            if (current === generation.current) setLoading(false);
        }
    }, [fallback]);

    return { loading, error, run, cancel };
}
