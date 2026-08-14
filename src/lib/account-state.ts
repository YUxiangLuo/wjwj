export type AccountState = "normal" | "locked" | "disabled";
export type AccountStateFilter = AccountState | "all";

export function getAccountState(
    status: number,
    lockedUntil: string | Date | null | undefined,
    now = Date.now(),
): AccountState {
    if (status !== 1) return "disabled";
    if (!lockedUntil) return "normal";
    const expiresAt = lockedUntil instanceof Date ? lockedUntil.getTime() : Date.parse(lockedUntil);
    return Number.isFinite(expiresAt) && expiresAt > now ? "locked" : "normal";
}

export function matchesAccountState(
    status: number,
    lockedUntil: string | Date | null | undefined,
    filter: AccountStateFilter,
    now = Date.now(),
) {
    return filter === "all" || getAccountState(status, lockedUntil, now) === filter;
}
