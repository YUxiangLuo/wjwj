export function formatLockoutRetryDuration(totalMinutes: number) {
    const safeMinutes = Math.max(1, Math.ceil(totalMinutes));

    if (safeMinutes < 60) {
        return `${safeMinutes}分钟`;
    }

    if (safeMinutes < 24 * 60) {
        const hours = Math.floor(safeMinutes / 60);
        const minutes = safeMinutes % 60;
        return minutes > 0 ? `${hours}小时${minutes}分钟` : `${hours}小时`;
    }

    const days = Math.floor(safeMinutes / (24 * 60));
    const remainingMinutes = safeMinutes % (24 * 60);
    const roundedHours = Math.ceil(remainingMinutes / 60);

    if (roundedHours <= 0) {
        return `${days}天`;
    }

    if (roundedHours >= 24) {
        return `${days + 1}天`;
    }

    return `${days}天${roundedHours}小时`;
}
