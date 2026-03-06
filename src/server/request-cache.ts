type RequestCache<T> = Request & { [key: symbol]: Promise<T> | undefined };

export async function getOrCreateRequestCache<T>(
    req: Request,
    key: symbol,
    factory: () => Promise<T>
) {
    const cachedReq = req as RequestCache<T>;
    if (cachedReq[key]) {
        return cachedReq[key]!;
    }

    const promise = factory();
    cachedReq[key] = promise;

    try {
        return await promise;
    } catch (error) {
        delete cachedReq[key];
        throw error;
    }
}
