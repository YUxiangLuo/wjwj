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

export function failedLoginMessage(result: ReturnType<typeof nextFailedLoginState>) {
    return result.locked
        ? `登录失败次数过多，账号已锁定${LOGIN_LOCK_MINUTES}分钟`
        : `账号或密码错误，还剩${result.remainingAttempts}次尝试机会`;
}
