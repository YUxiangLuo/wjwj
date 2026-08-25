import { sql, type SQLWrapper } from "drizzle-orm";

export const MAX_LOGIN_ATTEMPTS = 5;
export const LOGIN_LOCK_MINUTES = 30;

export interface LoginLockState {
    loginFailCount?: number | null;
    lockedUntil?: Date | null;
}

export function isLoginLocked(state: LoginLockState, now = new Date()) {
    return state.lockedUntil != null && state.lockedUntil.getTime() > now.getTime();
}

export function nextFailedLoginState(state: LoginLockState, now = new Date()) {
    const previousLockExpired = state.lockedUntil != null && state.lockedUntil.getTime() <= now.getTime();
    const loginFailCount = (previousLockExpired ? 0 : (state.loginFailCount ?? 0)) + 1;
    const locked = loginFailCount >= MAX_LOGIN_ATTEMPTS;
    return {
        loginFailCount,
        lockedUntil: locked ? new Date(now.getTime() + LOGIN_LOCK_MINUTES * 60_000) : null,
        locked,
        remainingAttempts: Math.max(0, MAX_LOGIN_ATTEMPTS - loginFailCount),
    };
}

export function buildAtomicFailedLoginUpdate(
    columns: { loginFailCount: SQLWrapper; lockedUntil: SQLWrapper },
    now = new Date(),
) {
    const lockExpiresAt = new Date(now.getTime() + LOGIN_LOCK_MINUTES * 60_000);
    const nextCount = sql<number>`CASE
        WHEN ${columns.lockedUntil} IS NOT NULL AND ${columns.lockedUntil} <= ${now} THEN 1
        ELSE ${columns.loginFailCount} + 1
    END`;

    return {
        loginFailCount: nextCount,
        lockedUntil: sql<Date | null>`CASE
            WHEN (${nextCount}) >= ${MAX_LOGIN_ATTEMPTS} THEN ${lockExpiresAt}::timestamptz
            ELSE NULL::timestamptz
        END`,
    };
}

export function failedLoginMessage(
    _result: ReturnType<typeof nextFailedLoginState>,
    message = "账号或密码错误",
) {
    return message;
}
