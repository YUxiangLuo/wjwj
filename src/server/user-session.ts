import { and, eq, inArray, lte, ne } from "drizzle-orm";
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

export async function createUserSession(userType: number, userId: number) {
    const now = new Date();
    const token = crypto.randomUUID();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

    // Fixed sessions need no scheduler. Expired rows are removed opportunistically.
    await db.delete(userSession).where(lte(userSession.expiresAt, now));
    await db.insert(userSession).values({ sessionToken: token, userType, userId, expiresAt });

    return { token, expiresAt };
}

export async function deleteUserSessionByToken(token: string) {
    await db.delete(userSession).where(eq(userSession.sessionToken, token));
}

export async function clearUserSessionsForUser(userType: number, userId: number) {
    await db.delete(userSession).where(and(eq(userSession.userType, userType), eq(userSession.userId, userId)));
}

export async function clearOtherUserSessionsForUser(userType: number, userId: number, currentToken: string) {
    await db.delete(userSession).where(and(
        eq(userSession.userType, userType),
        eq(userSession.userId, userId),
        ne(userSession.sessionToken, currentToken),
    ));
}
