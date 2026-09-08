import { and, eq, inArray, lte, ne, sql } from "drizzle-orm";
import { db } from "../db";
import { userSession } from "../db/schema";
import { getCookieValue } from "./http";

export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export type UserSessionRecord = typeof userSession.$inferSelect;

export interface ActiveUserSessionResult {
    token: string | null;
    session: UserSessionRecord | null;
    userType: number | null;
    failure: "missing_token" | "missing_session" | "expired" | null;
}

export function readSessionToken(req: Request, cookieName: string) {
    return getCookieValue(req, cookieName);
}

export async function loadActiveUserSession(
    req: Request,
    cookieName: string,
    userTypes: number[],
): Promise<ActiveUserSessionResult> {
    const token = readSessionToken(req, cookieName);
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

    return { token, session, userType: session.userType, failure: null };
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

export async function clearOtherUserSessionsForUser(userType: number, userId: number, currentToken: string) {
    await db.delete(userSession).where(and(
        eq(userSession.userType, userType),
        eq(userSession.userId, userId),
        ne(userSession.sessionToken, currentToken),
    ));
}

/** Invalidate every copied token and issue a fresh token after a password change. */
export async function rotateUserSession(userType: number, userId: number, executor: SessionExecutor = db) {
    await clearUserSessionsForUser(userType, userId, executor);
    return createUserSession(userType, userId, executor);
}
