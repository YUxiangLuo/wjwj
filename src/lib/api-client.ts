import { notifyAuthExpired } from "./auth-expired";

export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: { code: string; message: string };
}

export async function parseApiResponse<T>(response: Response): Promise<ApiResponse<T>> {
    try {
        const payload = await response.json() as ApiResponse<T>;
        notifyAuthExpired(response, payload.error?.code);
        return payload;
    } catch (cause) {
        notifyAuthExpired(response);
        return {
            success: false,
            error: { code: "INVALID_RESPONSE", message: cause instanceof Error ? cause.message : "服务端响应格式无效" },
        };
    }
}

export async function requestJson<T>(url: string, options?: RequestInit): Promise<ApiResponse<T>> {
    try {
        const response = await fetch(url, {
            credentials: "include",
            ...options,
            headers: { "Content-Type": "application/json", ...options?.headers },
        });
        return await parseApiResponse<T>(response);
    } catch (cause) {
        return {
            success: false,
            error: { code: "NETWORK_ERROR", message: cause instanceof Error ? cause.message : "网络请求失败" },
        };
    }
}

export async function uploadFile<T>(url: string, file: File): Promise<ApiResponse<T>> {
    try {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch(url, { method: "POST", body: formData, credentials: "include" });
        return await parseApiResponse<T>(response);
    } catch (cause) {
        return {
            success: false,
            error: { code: "NETWORK_ERROR", message: cause instanceof Error ? cause.message : "网络请求失败" },
        };
    }
}
