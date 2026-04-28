export interface JsonApiResponse<T> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
    };
}

type ApiResponseInterceptor = (
    url: string,
    status: number,
    response: Pick<JsonApiResponse<unknown>, "error"> | null | undefined,
) => void;

function invalidResponse(status: number): JsonApiResponse<never> {
    return {
        success: false,
        error: {
            code: "INVALID_RESPONSE",
            message: `服务器返回了非预期的响应 (${status})`,
        },
    };
}

export async function parseJsonApiResponse<T>(
    url: string,
    res: Response,
    intercept?: ApiResponseInterceptor,
): Promise<JsonApiResponse<T>> {
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
        return invalidResponse(res.status);
    }

    try {
        const data = await res.json() as JsonApiResponse<T>;
        intercept?.(url, res.status, data as JsonApiResponse<unknown>);
        return data;
    } catch {
        return invalidResponse(res.status);
    }
}
