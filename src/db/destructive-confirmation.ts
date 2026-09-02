export function databaseNameFromUrl(databaseUrl: string) {
    try {
        const pathname = new URL(databaseUrl).pathname.replace(/^\/+/, "");
        return pathname ? decodeURIComponent(pathname) : null;
    } catch {
        return null;
    }
}

export function validateDatabaseConfirmation(databaseUrl: string, confirmation: string | undefined) {
    const databaseName = databaseNameFromUrl(databaseUrl);
    if (!databaseName) return "DATABASE_URL 中缺少有效数据库名";
    if (confirmation?.trim() !== databaseName) {
        return `危险操作确认失败：请设置 CONFIRM_DATABASE_NAME=${databaseName}`;
    }
    return null;
}
