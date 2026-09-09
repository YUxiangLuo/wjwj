import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { userSession } from "../db/schema";
import { error, getCookieValue, json } from "./http";

export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export type UserSessionRecord = typeof userSession.$inferSelect;

export interface ActiveUserSessionResult {
    token: string | null;
    session: UserSessionRecord | null;
    userType: number | null;
    failure: "missing_token" | "missing_session" | "expired" | "identity_changed" | null;
}

export async function loadActiveUserSession(
    req: Request,
    cookieName: string,
    userTypes: number[],
): Promise<ActiveUserSessionResult> {
    const token = getCookieValue(req, cookieName);
    if (!token) {
        return { token: null, session: null, userType: null, failure: "missing_token" };
    }

    const [session] = await db
        .select()
        .from(userSession)
        .where(and(eq(userSession.sessionToken, token), inArray(userSession.userType, userTypes)))
        .limit(1);

    if (!session) {
        return { token, session: null, userType: null, failure: "missing_session" };
    }

    if (session.expiresAt <= new Date()) {
        await deleteUserSessionByToken(token);
        return { token, session: null, userType: session.userType, failure: "expired" };
    }

    // Consistency only: authorization always comes from the role-scoped session.
    // JSON/Blob requests use the header; native media/links use the URL parameter.
    // Neither grants access. Missing constraints remain compatible with non-browser callers.
    const expectedUsers = [req.headers.get("X-Expected-User-Id"), ...new URL(req.url).searchParams.getAll("expected_user_id")];
    if (expectedUsers.some(expected => expected !== null && expected !== String(session.userId))) {
        return { token, session: null, userType: session.userType, failure: "identity_changed" };
    }
    return { token, session, userType: session.userType, failure: null };
}

export function sessionChangedError() {
    return error("登录账号已变化，请重新确认身份后重试", "SESSION_CHANGED", 409);
}

export async function logoutUserSession(req: Request, cookieName: string, userType: number) {
    const active = await loadActiveUserSession(req, cookieName, [userType]);
    if (active.failure === "identity_changed") return sessionChangedError();
    if (active.session && active.token) await deleteUserSessionByToken(active.token);
    // Do not clear the browser cookie: this response may arrive after a newer login.
    // The revoked token cannot authorize; expiry or the next login replaces the cookie.
    return json({ ok: true });
}

type SessionExecutor = Pick<typeof db, "delete" | "insert">;

export async function createUserSession(userType: number, userId: number, executor: SessionExecutor = db) {
    const now = new Date();
    const token = crypto.randomUUID();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

    // Opportunistic GC must not wait on another account's password rotation.
    // Select and delete a small, unlocked batch in one statement; no scheduler needed.
    await executor.delete(userSession).where(sql`${userSession.id} in (
        select ${userSession.id} from ${userSession}
        where ${lte(userSession.expiresAt, now)}
        order by ${userSession.expiresAt}, ${userSession.id}
        limit 100
        for update skip locked
    )`);
    await executor.insert(userSession).values({ sessionToken: token, userType, userId, expiresAt });

    return { token, expiresAt };
}

export async function deleteUserSessionByToken(token: string) {
    await db.delete(userSession).where(eq(userSession.sessionToken, token));
}

export async function clearUserSessionsForUser(userType: number, userId: number, executor: SessionExecutor = db) {
    await executor.delete(userSession).where(and(eq(userSession.userType, userType), eq(userSession.userId, userId)));
}

/** Invalidate every copied token and issue a fresh token after a password change. */
export async function rotateUserSession(userType: number, userId: number, executor: SessionExecutor = db) {
    await clearUserSessionsForUser(userType, userId, executor);
    return createUserSession(userType, userId, executor);
}
