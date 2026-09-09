import { useEffect, useState } from "react";
import { isAuthError, reloadPage, type ApiResponse } from "@/lib/api-client";

/** Bootstrap once per document. Retrying or changing identity starts a new document. */
export function useWorkspaceAuth<T>(fetchUser: (signal?: AbortSignal) => Promise<ApiResponse<T>>) {
    const [state, setState] = useState<{ user: T | null; checking: boolean; error: string | null }>({
        user: null, checking: true, error: null,
    });
    useEffect(() => {
        const controller = new AbortController();
        void fetchUser(controller.signal).then(response => {
            if (controller.signal.aborted) return;
            setState({
                user: response.success ? response.data ?? null : null,
                checking: false,
                error: response.success || isAuthError(response.error?.code) ? null
                    : "暂时无法确认登录状态，请检查网络或稍后重试。当前页面地址和已保存的本地草稿会保留。",
            });
        }).catch(() => {
            if (!controller.signal.aborted) setState({ user: null, checking: false, error: "暂时无法确认登录状态，请检查网络或稍后重试。" });
        });
        return () => controller.abort();
    }, [fetchUser]);
    return { ...state, retry: reloadPage };
}
