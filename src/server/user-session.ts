import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { loginLog, userSession } from "../db/schema";
import { getClientIp, getCookieValue } from "./http";
import { getConfigNumber } from "./system-config";

export type UserSessionRecord = typeof userSession.$inferSelect;
export type UserSessionLookupFailure = "missing_token" | "missing_session" | "expired";

export interface SessionTokenSource {
    cookieName: string;
    headerName: string;
}

export interface ActiveUserSessionResult {
    token: string | null;
    session: UserSessionRecord | null;
    userType: number | null;
    failure: UserSessionLookupFailure | null;
}

export interface CreateUserSessionOptions {
    req: Request;
    userType: number;
    userId: number;
    ttlConfigKey: string;
    defaultTtlMinutes: number;
}

export function readSessionToken(req: Request, source: SessionTokenSource) {
    return getCookieValue(req, source.cookieName) ?? req.headers.get(source.headerName);
}

export async function findUserSessionByToken(token: string, userType: number) {
    const [session] = await db
        .select()
        .from(userSession)
        .where(and(eq(userSession.sessionToken, token), eq(userSession.userType, userType)))
        .limit(1);

    return session ?? null;
}

export async function findFirstUserSessionByToken(token: string, userTypes: number[]) {
    for (const userType of userTypes) {
        const session = await findUserSessionByToken(token, userType);
        if (session) {
            return { session, userType };
        }
    }

    return { session: null, userType: null };
}

export async function loadActiveUserSession(req: Request, source: SessionTokenSource, userTypes: number[]) {
    const token = readSessionToken(req, source);
    if (!token) {
        return { token: null, session: null, userType: null, failure: "missing_token" } satisfies ActiveUserSessionResult;
    }

    const { session, userType } = await findFirstUserSessionByToken(token, userTypes);
    if (!session) {
        return { token, session: null, userType: null, failure: "missing_session" } satisfies ActiveUserSessionResult;
    }

    const expiresAt = session.expiresAt ? new Date(session.expiresAt) : null;
    if (expiresAt && expiresAt <= new Date()) {
        await deleteUserSessionByToken(token);
        return { token, session: null, userType, failure: "expired" } satisfies ActiveUserSessionResult;
    }

    return { token, session, userType, failure: null } satisfies ActiveUserSessionResult;
}

export async function extendUserSession(sessionId: number, ttlConfigKey: string, defaultTtlMinutes: number) {
    const sessionTtlMinutes = await getConfigNumber(ttlConfigKey, defaultTtlMinutes);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + sessionTtlMinutes * 60 * 1000);

    await db.update(userSession).set({ lastActiveAt: now, expiresAt }).where(eq(userSession.id, sessionId));

    return { now, expiresAt };
}

export async function clearUserSessionForUser(userType: number, userId: number, excludeToken?: string | null) {
    if (excludeToken) {
        await db.delete(userSession).where(
            and(
                eq(userSession.userType, userType),
                eq(userSession.userId, userId),
                sql`${userSession.sessionToken} != ${excludeToken}`
            )
        );
        return;
    }

    await db.delete(userSession).where(and(eq(userSession.userType, userType), eq(userSession.userId, userId)));
}

export async function createSingleUserSession(options: CreateUserSessionOptions) {
    const now = new Date();
    const token = crypto.randomUUID();
    const sessionTtlMinutes = await getConfigNumber(options.ttlConfigKey, options.defaultTtlMinutes);
    const expiresAt = new Date(now.getTime() + sessionTtlMinutes * 60 * 1000);

    await clearUserSessionForUser(options.userType, options.userId);

    await db.insert(userSession).values({
        sessionToken: token,
        userType: options.userType,
        userId: options.userId,
        deviceInfo: options.req.headers.get("user-agent") ?? "",
        expiresAt,
        lastActiveAt: now,
    });

    return { token, now, expiresAt };
}

export async function deleteUserSessionByToken(token: string) {
    await db.delete(userSession).where(eq(userSession.sessionToken, token));
}

export async function recordLoginLog(req: Request, userType: number, userId: number) {
    await db.insert(loginLog).values({
        userType,
        userId,
        ipAddress: getClientIp(req),
        userAgent: req.headers.get("user-agent") ?? "",
    });
}
