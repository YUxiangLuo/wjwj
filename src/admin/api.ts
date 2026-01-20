/**
 * Admin API Routes
 * 管理员端 API 接口集合
 */

import { db } from "../db";
import { access, readdir, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { createBackupArtifacts } from "./backup";
import {
    admin,
    semester,
    teacher,
    assistant,
    class_,
    student,
    announcement,
    loginLog,
    assistantClass,
    studentTransfer,
    operationLog,
    experiment,
    submission,
    announcementRead,
    systemConfig,
    task,
    topic,
    userSession,
    notification,
} from "../db/schema";
import { eq, desc, asc, sql, and, like, or, isNull, count } from "drizzle-orm";

// ============================================================
// Types
// ============================================================

type RouteHandler = (req: Request) => Promise<Response> | Response;

interface RouteDefinition {
    GET?: RouteHandler;
    POST?: RouteHandler;
    PUT?: RouteHandler;
    DELETE?: RouteHandler;
}

// ============================================================
// Helpers
// ============================================================

function json<T>(data: T, status = 200, headers?: HeadersInit): Response {
    return Response.json({ success: true, data }, { status, headers });
}

function error(message: string, code: string, status = 400): Response {
    return Response.json({ success: false, error: { code, message } }, { status });
}

async function parseBody<T>(req: Request): Promise<T> {
    return req.json() as Promise<T>;
}

function getSearchParams(req: Request) {
    return new URL(req.url).searchParams;
}

const ADMIN_USER_TYPE = 1;
const ADMIN_SESSION_COOKIE = "admin_session";
const DEFAULT_ADMIN_SESSION_TTL_MINUTES = 30;
const DEFAULT_ADMIN_MAX_LOGIN_ATTEMPTS = 5;
const DEFAULT_ADMIN_LOCK_MINUTES = 30;

let lastNetSample: { time: number; bytes: number } | null = null;

function getCookieValue(req: Request, name: string): string | null {
    const cookie = req.headers.get("cookie") ?? "";
    const match = cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
    return match?.[1] ?? null;
}

function validateAdminPassword(password: string, username: string) {
    const minLength = password.length >= 12;
    const hasLetter = /[A-Za-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>\[\]\\/\-_=+~`]/.test(password);
    const containsUsername = username && password.includes(username);

    return {
        minLength,
        hasLetter,
        hasNumber,
        hasSpecial,
        containsUsername,
        isValid: minLength && hasLetter && hasNumber && hasSpecial && !containsUsername,
    };
}

async function getConfigNumber(key: string, fallback: number) {
    const [row] = await db
        .select({ value: systemConfig.configValue, valueType: systemConfig.valueType })
        .from(systemConfig)
        .where(eq(systemConfig.configKey, key))
        .limit(1);

    if (!row) return fallback;
    if (row.valueType === "number") return Number(row.value);
    if (row.valueType === "boolean") return row.value === "true" ? 1 : 0;
    const parsed = Number(row.value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function getClientIp(req: Request): string {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]?.trim() ?? "";
    return req.headers.get("x-real-ip") ?? "";
}

function isSecureRequest(req: Request) {
    const forwardedProto = req.headers.get("x-forwarded-proto");
    if (forwardedProto) {
        return forwardedProto.split(",")[0]?.trim() === "https";
    }
    return new URL(req.url).protocol === "https:";
}

function buildSessionCookie(token: string, expiresAt: Date, secure: boolean) {
    const secureFlag = secure ? " Secure;" : "";
    return `${ADMIN_SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()};${secureFlag}`;
}

function clearSessionCookie(secure: boolean) {
    const secureFlag = secure ? " Secure;" : "";
    return `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT;${secureFlag}`;
}

async function requireAdminAuth(req: Request) {
    const token = getCookieValue(req, ADMIN_SESSION_COOKIE) ?? req.headers.get("x-admin-session");
    if (!token) {
        return { admin: null, error: error("未登录或登录已过期", "UNAUTHORIZED", 401) };
    }

    const [session] = await db
        .select()
        .from(userSession)
        .where(
            and(
                eq(userSession.sessionToken, token),
                eq(userSession.userType, ADMIN_USER_TYPE)
            )
        )
        .limit(1);

    if (!session) {
        return { admin: null, error: error("未登录或登录已过期", "UNAUTHORIZED", 401) };
    }

    const expiresAt = session.expiresAt ? new Date(session.expiresAt) : null;
    if (expiresAt && expiresAt <= new Date()) {
        await db.delete(userSession).where(eq(userSession.sessionToken, token));
        return { admin: null, error: error("未登录或登录已过期", "UNAUTHORIZED", 401) };
    }

    const [adm] = await db
        .select({ id: admin.id, username: admin.username, isFirstLogin: admin.isFirstLogin })
        .from(admin)
        .where(eq(admin.id, session.userId));

    if (!adm) {
        return { admin: null, error: error("账户不存在", "ACCOUNT_NOT_FOUND", 401) };
    }

    const now = new Date();
    const sessionTtlMinutes = await getConfigNumber("session.admin_timeout_minutes", DEFAULT_ADMIN_SESSION_TTL_MINUTES);
    const newExpiresAt = new Date(now.getTime() + sessionTtlMinutes * 60 * 1000);

    await db
        .update(userSession)
        .set({ lastActiveAt: now, expiresAt: newExpiresAt })
        .where(eq(userSession.id, session.id));

    return { admin: adm, error: null, session: { ...session, expiresAt: newExpiresAt } };
}

function withAdminAuth(routes: RouteDefinition): RouteDefinition {
    return {
        GET: routes.GET
            ? async (req) => {
                const auth = await requireAdminAuth(req);
                if (auth.error) return auth.error;
                return routes.GET!(req);
            }
            : undefined,
        POST: routes.POST
            ? async (req) => {
                const auth = await requireAdminAuth(req);
                if (auth.error) return auth.error;
                return routes.POST!(req);
            }
            : undefined,
        PUT: routes.PUT
            ? async (req) => {
                const auth = await requireAdminAuth(req);
                if (auth.error) return auth.error;
                return routes.PUT!(req);
            }
            : undefined,
        DELETE: routes.DELETE
            ? async (req) => {
                const auth = await requireAdminAuth(req);
                if (auth.error) return auth.error;
                return routes.DELETE!(req);
            }
            : undefined,
    };
}

// ============================================================
// Auth API
// ============================================================

const adminLoginRoutes: RouteDefinition = {
    async POST(req) {
        const body = await parseBody<{ username: string; password: string }>(req);
        const username = body.username?.trim();
        const password = body.password ?? "";

        if (!username || !password) {
            return error("请输入用户名和密码", "VALIDATION_ERROR", 400);
        }

        const [adm] = await db.select().from(admin).where(eq(admin.username, username));

        if (!adm) {
            return error("用户名或密码错误", "INVALID_CREDENTIALS", 401);
        }

        const now = new Date();
        const maxAttempts = await getConfigNumber("login.max_fail_count", DEFAULT_ADMIN_MAX_LOGIN_ATTEMPTS);
        const lockMinutes = await getConfigNumber("login.lock_duration_minutes", DEFAULT_ADMIN_LOCK_MINUTES);
        if (adm.lockedUntil && new Date(adm.lockedUntil) > now) {
            return error("账号已锁定，请稍后再试", "ACCOUNT_LOCKED", 403);
        }

        const isValid = await Bun.password.verify(password, adm.password);
        if (!isValid) {
            const failCount = (adm.loginFailCount ?? 0) + 1;
            const updateData: any = { loginFailCount: failCount };

            if (failCount >= maxAttempts) {
                updateData.lockedUntil = new Date(now.getTime() + lockMinutes * 60 * 1000);
            }

            await db.update(admin).set(updateData).where(eq(admin.id, adm.id));

            const remainingAttempts = Math.max(maxAttempts - failCount, 0);

            return error(
                failCount >= maxAttempts
                    ? `密码错误次数过多，账号已锁定${lockMinutes}分钟`
                    : `用户名或密码错误，还剩${remainingAttempts}次尝试机会`,
                "INVALID_CREDENTIALS",
                401
            );
        }

        await db
            .update(admin)
            .set({ loginFailCount: 0, lockedUntil: null })
            .where(eq(admin.id, adm.id));

        const token = crypto.randomUUID();
        const sessionTtlMinutes = await getConfigNumber("session.admin_timeout_minutes", DEFAULT_ADMIN_SESSION_TTL_MINUTES);
        const expiresAt = new Date(now.getTime() + sessionTtlMinutes * 60 * 1000);

        // Single-device login: clear existing sessions
        await db
            .delete(userSession)
            .where(and(eq(userSession.userType, ADMIN_USER_TYPE), eq(userSession.userId, adm.id)));

        await db.insert(userSession).values({
            sessionToken: token,
            userType: ADMIN_USER_TYPE,
            userId: adm.id,
            deviceInfo: req.headers.get("user-agent") ?? "",
            expiresAt,
            lastActiveAt: now,
        });

        await db.insert(loginLog).values({
            userType: ADMIN_USER_TYPE,
            userId: adm.id,
            ipAddress: getClientIp(req),
            userAgent: req.headers.get("user-agent") ?? "",
        });

        const secure = isSecureRequest(req);
        return json(
            {
                user: { id: adm.id, username: adm.username, isFirstLogin: adm.isFirstLogin, sessionExpiresAt: expiresAt },
                expiresAt,
            },
            200,
            { "Set-Cookie": buildSessionCookie(token, expiresAt, secure) }
        );
    },
};

const adminMeRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAdminAuth(req);
        if (auth.error) return auth.error;
        return json({
            ...auth.admin!,
            sessionExpiresAt: auth.session?.expiresAt ?? null,
        });
    },
};

const adminLogoutRoutes: RouteDefinition = {
    async POST(req) {
        const token = getCookieValue(req, ADMIN_SESSION_COOKIE) ?? req.headers.get("x-admin-session");
        if (token) {
            await db.delete(userSession).where(eq(userSession.sessionToken, token));
        }
        const secure = isSecureRequest(req);
        return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie(secure) });
    },
};

const adminPasswordRoutes: RouteDefinition = {
    async PUT(req) {
        const auth = await requireAdminAuth(req);
        if (auth.error) return auth.error;

        const body = await parseBody<{ currentPassword: string; newPassword: string }>(req);
        const currentPassword = body.currentPassword ?? "";
        const newPassword = body.newPassword ?? "";

        if (!currentPassword || !newPassword) {
            return error("请输入当前密码和新密码", "VALIDATION_ERROR", 400);
        }

        if (newPassword === currentPassword) {
            return error("新密码不能与当前密码相同", "VALIDATION_ERROR", 400);
        }

        const [adm] = await db.select().from(admin).where(eq(admin.id, auth.admin!.id));
        if (!adm) {
            return error("账户不存在", "ACCOUNT_NOT_FOUND", 404);
        }

        const isValid = await Bun.password.verify(currentPassword, adm.password);
        if (!isValid) {
            return error("当前密码不正确", "INVALID_CREDENTIALS", 401);
        }

        const policy = validateAdminPassword(newPassword, adm.username ?? "");
        if (!policy.isValid) {
            return error("新密码需至少12位且包含字母、数字和特殊字符，且不包含用户名", "VALIDATION_ERROR", 400);
        }

        const hashed = await Bun.password.hash(newPassword);
        await db
            .update(admin)
            .set({ password: hashed, isFirstLogin: 0 })
            .where(eq(admin.id, adm.id));

        await db.insert(operationLog).values({
            userType: ADMIN_USER_TYPE,
            userId: adm.id,
            action: "CHANGE_PASSWORD",
            targetType: "admin",
            targetId: adm.id,
            detail: { by: "self" },
            ipAddress: getClientIp(req),
        });

        return json({ success: true });
    },
};

// ============================================================
// Stats API
// ============================================================

const statsRoutes = {
    async GET() {
        // Basic counts
        const [semesterCount] = await db.select({ count: count() }).from(semester);
        const [teacherCount] = await db.select({ count: count() }).from(teacher);
        const [classCount] = await db.select({ count: count() }).from(class_);
        const [studentCount] = await db.select({ count: count() }).from(student);
        const [assistantCount] = await db.select({ count: count() }).from(assistant);

        // Current semester
        const [currentSem] = await db
            .select()
            .from(semester)
            .where(eq(semester.isCurrent, 1))
            .limit(1);

        // Today's Stats
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // Today Logins
        const [todayLogins] = await db
            .select({ count: count() })
            .from(loginLog)
            .where(sql`${loginLog.loginAt} >= ${startOfDay}`);

        // Today Active Users (Distinct users who logged in)
        // Using sql within select to ensure correct return type integration
        const [activeUserStat] = await db
            .select({
                count: sql<number>`count(distinct ${loginLog.userType}, ${loginLog.userId})`
            })
            .from(loginLog)
            .where(sql`${loginLog.loginAt} >= ${startOfDay}`);

        // Pending Items (e.g. ungraded submissions)
        const [pendingSubs] = await db
            .select({ count: count() })
            .from(submission)
            .where(eq(submission.status, 1));

        const pendingItems = pendingSubs?.count ?? 0;

        return json({
            currentSemester: currentSem?.name ?? "未设置",
            teacherCount: teacherCount?.count ?? 0,
            classCount: classCount?.count ?? 0,
            studentCount: studentCount?.count ?? 0,
            assistantCount: assistantCount?.count ?? 0,
            todayLogins: todayLogins?.count ?? 0,
            todayActiveUsers: Number(activeUserStat?.count ?? 0),
            pendingItems: pendingItems,
        });
    },
};

// ============================================================
// System Metrics API
// ============================================================

const systemMetricsRoutes = {
    async GET() {
        const os = await import("node:os");

        // Memory
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const memUsage = Math.round((usedMem / totalMem) * 100);

        // CPU (Approximation using loadavg)
        const cpus = os.cpus();
        const load = os.loadavg()[0] ?? 0; // 1 min load average
        const cpuUsage = Math.min(Math.round((load / cpus.length) * 100), 100);

        // Disk usage using df -Pk
        let diskUsage = 0;
        try {
            const dfProcess = Bun.spawn({
                cmd: ["df", "-Pk", "."],
                stdout: "pipe",
                stderr: "pipe",
            });
            const output = await new Response(dfProcess.stdout).text();
            await dfProcess.exited;
            const lines = output.trim().split("\n");
            if (lines.length > 1 && lines[1]) {
                const parts = lines[1].trim().split(/\s+/);
                const usedPercent = parts[4] ?? "0%";
                diskUsage = Math.min(Math.max(parseInt(usedPercent.replace("%", ""), 10) || 0, 0), 100);
            }
        } catch {
            diskUsage = 0;
        }

        // Network throughput using /proc/net/dev (Mbps)
        let networkMbps = 0;
        try {
            const netText = await Bun.file("/proc/net/dev").text();
            const lines = netText.trim().split("\n").slice(2);
            const totalBytes = lines.reduce((sum, line) => {
                const [ifacePart, rest] = line.split(":");
                const iface = ifacePart?.trim();
                if (!iface || iface === "lo" || !rest) return sum;
                const cols = rest.trim().split(/\s+/).map(Number);
                const rx = cols[0] ?? 0;
                const tx = cols[8] ?? 0;
                return sum + rx + tx;
            }, 0);

            const now = Date.now();
            if (lastNetSample) {
                const deltaBytes = totalBytes - lastNetSample.bytes;
                const deltaSeconds = (now - lastNetSample.time) / 1000;
                if (deltaSeconds > 0 && deltaBytes >= 0) {
                    networkMbps = Math.round((deltaBytes * 8) / (deltaSeconds * 1_000_000));
                }
            }
            lastNetSample = { time: now, bytes: totalBytes };
        } catch {
            networkMbps = 0;
        }

        // Active Connections (Approximation using recent login logs or session table)
        // Since we don't have a direct "active connection" counter in this stateless setup,
        // we can count distinct users who logged in or had activity in the last 15 minutes.
        // For now, let's use a simple query on loginLog for the last 1 day as a rough "active today" proxy, 
        // OR better, checking 'user_session' table if we are using it (schema has userSession).
        // Let's use userSession table for active connections (valid sessions).
        const [sessionCount] = await db
            .select({ count: count() })
            .from(userSession)
            .where(
                and(
                    sql`${userSession.expiresAt} > NOW()`,
                    sql`${userSession.lastActiveAt} > DATE_SUB(NOW(), INTERVAL 30 MINUTE)` // Active in last 30 mins
                )
            );

        const activeConnections = sessionCount?.count ?? 0;

        return json({
            cpu: cpuUsage,
            memory: memUsage,
            disk: diskUsage,
            network: networkMbps,
            activeConnections: activeConnections,
        });
    },
};

const systemSettingsRoutes = {
    async GET() {
        const configs = await db.select().from(systemConfig);

        // Convert array to key-value object
        const settings: Record<string, any> = {};

        configs.forEach(c => {
            if (c.valueType === 'boolean') {
                settings[c.configKey] = c.configValue === 'true';
            } else if (c.valueType === 'number') {
                settings[c.configKey] = Number(c.configValue);
            } else {
                settings[c.configKey] = c.configValue;
            }
        });

        return json(settings);
    },

    async PUT(req: Request) {
        const body = await req.json();

        // Loop through keys and upsert
        for (const [key, value] of Object.entries(body)) {
            let valStr = String(value);
            let valType = "string";

            if (typeof value === "boolean") {
                valType = "boolean";
                valStr = value ? "true" : "false";
            } else if (typeof value === "number") {
                valType = "number";
            }

            await db.insert(systemConfig).values({
                configKey: key,
                configValue: valStr,
                valueType: valType,
            }).onDuplicateKeyUpdate({
                set: {
                    configValue: valStr,
                    valueType: valType,
                }
            });
        }

        // Log operation
        // (Simplified, normally get real user ID)
        await db.insert(operationLog).values({
            userType: 1, // Admin (assuming)
            userId: 0, // System
            action: 'UPDATE_SETTINGS',
            targetType: 'system',
            detail: body,
            ipAddress: '127.0.0.1'
        });

        return json({ success: true });
    },
};

// ============================================================
// Semester API
// ============================================================

const semesterRoutes: RouteDefinition = {
    async GET() {
        const rows = await db
            .select({
                id: semester.id,
                name: semester.name,
                isCurrent: semester.isCurrent,
                createdAt: semester.createdAt,
                classCount: sql<number>`(SELECT COUNT(*) FROM class WHERE class.semester_id = ${semester.id})`,
            })
            .from(semester)
            .orderBy(desc(semester.createdAt));

        return json(rows);
    },

    async POST(req) {
        const body = await parseBody<{ name: string; setAsCurrent?: boolean }>(req);

        if (!body.name?.trim()) {
            return error("学期名称不能为空", "VALIDATION_ERROR");
        }

        // 检查名称是否重复
        const [existing] = await db
            .select()
            .from(semester)
            .where(eq(semester.name, body.name.trim()));

        if (existing) {
            return error("学期名称已存在", "DUPLICATE_NAME");
        }

        // 如果设为当前学期，先取消其他学期的当前状态
        if (body.setAsCurrent) {
            await db.update(semester).set({ isCurrent: 0 });
        }

        const [result] = await db.insert(semester).values({
            name: body.name.trim(),
            isCurrent: body.setAsCurrent ? 1 : 0,
        });

        return json({ id: result.insertId }, 201);
    },
};

const semesterCurrentRoutes = {
    async PUT(req: Request) {
        const url = new URL(req.url);
        const id = parseInt(url.pathname.split("/").pop() ?? "");

        if (!id) {
            return error("无效的学期ID", "INVALID_ID");
        }

        // 取消所有学期的当前状态
        await db.update(semester).set({ isCurrent: 0 });

        // 设置指定学期为当前
        await db.update(semester).set({ isCurrent: 1 }).where(eq(semester.id, id));

        return json({ success: true });
    },
};

const semesterDeleteRoutes = {
    async DELETE(req: Request) {
        const url = new URL(req.url);
        const id = parseInt(url.pathname.split("/").pop() ?? "");

        if (!id) {
            return error("无效的学期ID", "INVALID_ID");
        }

        // 检查是否有关联班级
        const [classCount] = await db
            .select({ count: count() })
            .from(class_)
            .where(eq(class_.semesterId, id));

        if (classCount && classCount.count > 0) {
            return error("该学期下有班级，无法删除", "HAS_CLASSES");
        }

        await db.delete(semester).where(eq(semester.id, id));

        return json({ success: true });
    },
};

// ============================================================
// Teacher API
// ============================================================

const teacherRoutes: RouteDefinition = {
    async GET(req) {
        const params = getSearchParams(req);
        const search = params.get("search") ?? "";

        let query = db
            .select({
                id: teacher.id,
                employeeId: teacher.employeeId,
                name: teacher.name,
                status: teacher.status,
                isFirstLogin: teacher.isFirstLogin,
                lockedUntil: teacher.lockedUntil,
                createdAt: teacher.createdAt,
                classCount: sql<number>`(SELECT COUNT(*) FROM class WHERE class.teacher_id = ${teacher.id})`,
            })
            .from(teacher)
            .orderBy(desc(teacher.createdAt))
            .$dynamic();

        if (search) {
            query = query.where(
                or(
                    like(teacher.employeeId, `%${search}%`),
                    like(teacher.name, `%${search}%`)
                )
            );
        }

        const rows = await query;

        // 获取最后登录时间
        const teacherIds = rows.map((r) => r.id);
        const lastLogins =
            teacherIds.length > 0
                ? await db
                    .select({
                        userId: loginLog.userId,
                        lastLogin: sql<Date>`MAX(${loginLog.loginAt})`,
                    })
                    .from(loginLog)
                    .where(
                        and(
                            eq(loginLog.userType, 2), // 2 = teacher
                            sql`${loginLog.userId} IN (${sql.join(teacherIds, sql`, `)})`
                        )
                    )
                    .groupBy(loginLog.userId)
                : [];

        const lastLoginMap = new Map(lastLogins.map((l) => [l.userId, l.lastLogin]));

        const result = rows.map((r) => ({
            ...r,
            isLocked: r.lockedUntil ? new Date(r.lockedUntil) > new Date() : false,
            lastLogin: lastLoginMap.get(r.id) ?? null,
        }));

        return json(result);
    },

    async POST(req) {
        const body = await parseBody<{ employeeId: string; name: string }>(req);

        if (!body.employeeId?.trim() || !body.name?.trim()) {
            return error("工号和姓名不能为空", "VALIDATION_ERROR");
        }

        // 检查工号是否重复
        const [existing] = await db
            .select()
            .from(teacher)
            .where(eq(teacher.employeeId, body.employeeId.trim()));

        if (existing) {
            return error("工号已存在", "DUPLICATE_EMPLOYEE_ID");
        }

        // 密码使用工号，实际应用中应该加密
        const hashedPassword = await Bun.password.hash(body.employeeId.trim());

        const [result] = await db.insert(teacher).values({
            employeeId: body.employeeId.trim(),
            name: body.name.trim(),
            password: hashedPassword,
            isFirstLogin: 1,
            status: 1,
        });

        return json({ id: result.insertId }, 201);
    },
};

const teacherStatusRoutes = {
    async PUT(req: Request) {
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const id = parseInt(parts[parts.length - 2] ?? "");
        const body = await parseBody<{ status: number }>(req);

        if (!id) {
            return error("无效的教师ID", "INVALID_ID");
        }

        await db
            .update(teacher)
            .set({ status: body.status })
            .where(eq(teacher.id, id));

        return json({ success: true });
    },
};

const teacherUnlockRoutes = {
    async PUT(req: Request) {
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const id = parseInt(parts[parts.length - 2] ?? "");

        if (!id) {
            return error("无效的教师ID", "INVALID_ID");
        }

        await db
            .update(teacher)
            .set({ lockedUntil: null, loginFailCount: 0 })
            .where(eq(teacher.id, id));

        return json({ success: true });
    },
};

const teacherResetPasswordRoutes = {
    async POST(req: Request) {
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const id = parseInt(parts[parts.length - 2] ?? "");

        if (!id) {
            return error("无效的教师ID", "INVALID_ID");
        }

        // 获取教师信息
        const [t] = await db.select().from(teacher).where(eq(teacher.id, id));

        if (!t) {
            return error("教师不存在", "NOT_FOUND", 404);
        }

        // 重置密码为工号
        const hashedPassword = await Bun.password.hash(t.employeeId);

        await db
            .update(teacher)
            .set({ password: hashedPassword, isFirstLogin: 1 })
            .where(eq(teacher.id, id));

        return json({ success: true });
    },
};

// ============================================================
// Assistant API
// ============================================================

const assistantRoutes: RouteDefinition = {
    async GET(req) {
        const params = getSearchParams(req);
        const teacherId = params.get("teacher_id");

        let query = db
            .select({
                id: assistant.id,
                account: assistant.account,
                name: assistant.name,
                creatorTeacherId: assistant.creatorTeacherId,
                status: assistant.status,
                lockedUntil: assistant.lockedUntil,
                createdAt: assistant.createdAt,
                teacherName: teacher.name,
                classCount: sql<number>`(SELECT COUNT(*) FROM assistant_class WHERE assistant_class.assistant_id = ${assistant.id})`,
            })
            .from(assistant)
            .leftJoin(teacher, eq(assistant.creatorTeacherId, teacher.id))
            .orderBy(desc(assistant.createdAt))
            .$dynamic();

        if (teacherId && teacherId !== "all") {
            query = query.where(eq(assistant.creatorTeacherId, parseInt(teacherId)));
        }

        const rows = await query;

        const result = rows.map((r) => ({
            ...r,
            isLocked: r.lockedUntil ? new Date(r.lockedUntil) > new Date() : false,
        }));

        return json(result);
    },

    async POST(req) {
        const body = await parseBody<{ account: string; name: string; teacherId: number }>(req);

        if (!body.account?.trim() || !body.name?.trim() || !body.teacherId) {
            return error("账号、姓名和所属教师不能为空", "VALIDATION_ERROR");
        }

        // 检查账号是否重复
        const [existing] = await db
            .select()
            .from(assistant)
            .where(eq(assistant.account, body.account.trim()));

        if (existing) {
            return error("账号已存在", "DUPLICATE_ACCOUNT");
        }

        const hashedPassword = await Bun.password.hash(body.account.trim());

        const [result] = await db.insert(assistant).values({
            account: body.account.trim(),
            name: body.name.trim(),
            password: hashedPassword,
            creatorTeacherId: body.teacherId,
            isFirstLogin: 1,
            status: 1,
        });

        return json({ id: result.insertId }, 201);
    },
};

const assistantStatusRoutes = {
    async PUT(req: Request) {
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const id = parseInt(parts[parts.length - 2] ?? "");
        const body = await parseBody<{ status: number }>(req);

        if (!id) {
            return error("无效的助教ID", "INVALID_ID");
        }

        await db
            .update(assistant)
            .set({ status: body.status })
            .where(eq(assistant.id, id));

        return json({ success: true });
    },
};

const assistantDeleteRoutes = {
    async DELETE(req: Request) {
        const url = new URL(req.url);
        const id = parseInt(url.pathname.split("/").pop() ?? "");

        if (!id) {
            return error("无效的助教ID", "INVALID_ID");
        }

        // 删除助教班级关联
        await db.delete(assistantClass).where(eq(assistantClass.assistantId, id));

        // 删除助教
        await db.delete(assistant).where(eq(assistant.id, id));

        return json({ success: true });
    },
};

const assistantUnlockRoutes = {
    async PUT(req: Request) {
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const id = parseInt(parts[parts.length - 2] ?? "");

        if (!id) {
            return error("无效的助教ID", "INVALID_ID");
        }

        await db
            .update(assistant)
            .set({ lockedUntil: null, loginFailCount: 0 })
            .where(eq(assistant.id, id));

        return json({ success: true });
    },
};

const assistantResetPasswordRoutes = {
    async POST(req: Request) {
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const id = parseInt(parts[parts.length - 2] ?? "");

        if (!id) {
            return error("无效的助教ID", "INVALID_ID");
        }

        // 获取助教信息
        const [a] = await db.select().from(assistant).where(eq(assistant.id, id));

        if (!a) {
            return error("助教不存在", "NOT_FOUND", 404);
        }

        // 重置密码为账号
        const hashedPassword = await Bun.password.hash(a.account);

        await db
            .update(assistant)
            .set({ password: hashedPassword, isFirstLogin: 1 })
            .where(eq(assistant.id, id));

        return json({ success: true });
    },
};

// ============================================================
// Class API
// ============================================================

const classRoutes: RouteDefinition = {
    async GET(req) {
        const params = getSearchParams(req);
        const semesterId = params.get("semester_id");
        const teacherId = params.get("teacher_id");

        let query = db
            .select({
                id: class_.id,
                name: class_.name,
                semesterId: class_.semesterId,
                teacherId: class_.teacherId,
                createdAt: class_.createdAt,
                semesterName: semester.name,
                teacherName: teacher.name,
                studentCount: sql<number>`(SELECT COUNT(*) FROM student WHERE student.class_id = ${class_.id} AND student.deleted_at IS NULL)`,
            })
            .from(class_)
            .leftJoin(semester, eq(class_.semesterId, semester.id))
            .leftJoin(teacher, eq(class_.teacherId, teacher.id))
            .orderBy(desc(class_.createdAt))
            .$dynamic();

        const conditions = [];
        if (semesterId && semesterId !== "all") {
            conditions.push(eq(class_.semesterId, parseInt(semesterId)));
        }
        if (teacherId && teacherId !== "all") {
            conditions.push(eq(class_.teacherId, parseInt(teacherId)));
        }
        if (conditions.length > 0) {
            query = query.where(and(...conditions));
        }

        const rows = await query;
        return json(rows);
    },

    async POST(req) {
        const body = await parseBody<{ name: string; semesterId: number; teacherId: number }>(req);

        if (!body.name?.trim() || !body.semesterId || !body.teacherId) {
            return error("班级名称、学期和教师不能为空", "VALIDATION_ERROR");
        }

        const [result] = await db.insert(class_).values({
            name: body.name.trim(),
            semesterId: body.semesterId,
            teacherId: body.teacherId,
        });

        return json({ id: result.insertId }, 201);
    },
};

const classUpdateRoutes = {
    async PUT(req: Request) {
        const url = new URL(req.url);
        const id = parseInt(url.pathname.split("/").pop() ?? "");
        const body = await parseBody<{ name?: string; teacherId?: number }>(req);

        if (!id) {
            return error("无效的班级ID", "INVALID_ID");
        }

        const updates: Record<string, unknown> = {};
        if (body.name?.trim()) updates.name = body.name.trim();
        if (body.teacherId) updates.teacherId = body.teacherId;

        if (Object.keys(updates).length > 0) {
            await db.update(class_).set(updates).where(eq(class_.id, id));
        }

        return json({ success: true });
    },

    async DELETE(req: Request) {
        const url = new URL(req.url);
        const id = parseInt(url.pathname.split("/").pop() ?? "");

        if (!id) {
            return error("无效的班级ID", "INVALID_ID");
        }

        // 软删除班级内的学生
        await db
            .update(student)
            .set({ deletedAt: new Date() })
            .where(eq(student.classId, id));

        // 删除班级
        await db.delete(class_).where(eq(class_.id, id));

        return json({ success: true });
    },
};

// ============================================================
// Student API
// ============================================================

const studentRoutes: RouteDefinition = {
    async GET(req) {
        const params = getSearchParams(req);
        const classId = params.get("class_id");
        const search = params.get("search") ?? "";

        let query = db
            .select({
                id: student.id,
                studentId: student.studentId,
                name: student.name,
                classId: student.classId,
                status: student.status,
                lockedUntil: student.lockedUntil,
                createdAt: student.createdAt,
                className: class_.name,
            })
            .from(student)
            .leftJoin(class_, eq(student.classId, class_.id))
            .where(isNull(student.deletedAt))
            .orderBy(desc(student.createdAt))
            .$dynamic();

        const conditions = [isNull(student.deletedAt)];
        if (classId && classId !== "all") {
            conditions.push(eq(student.classId, parseInt(classId)));
        }
        if (search) {
            conditions.push(
                or(
                    like(student.studentId, `%${search}%`),
                    like(student.name, `%${search}%`)
                )!
            );
        }

        query = query.where(and(...conditions));

        const rows = await query;

        // 获取最后活跃时间
        const studentIds = rows.map((r) => r.id);
        const lastActives =
            studentIds.length > 0
                ? await db
                    .select({
                        userId: loginLog.userId,
                        lastActive: sql<Date>`MAX(${loginLog.loginAt})`,
                    })
                    .from(loginLog)
                    .where(
                        and(
                            eq(loginLog.userType, 4), // 4 = student
                            sql`${loginLog.userId} IN (${sql.join(studentIds, sql`, `)})`
                        )
                    )
                    .groupBy(loginLog.userId)
                : [];

        const lastActiveMap = new Map(lastActives.map((l) => [l.userId, l.lastActive]));

        // 获取实验进度
        const experiments =
            studentIds.length > 0
                ? await db
                    .select({
                        studentId: experiment.studentId,
                        currentStage: experiment.currentStage,
                        status: experiment.status,
                    })
                    .from(experiment)
                    .where(
                        sql`${experiment.studentId} IN (${sql.join(studentIds, sql`, `)})`
                    )
                : [];

        const progressMap = new Map();
        experiments.forEach(e => {
            const p = e.status === 1 ? 100 : Math.min(e.currentStage * 25, 100);
            const current = progressMap.get(e.studentId) || 0;
            if (p > current) {
                progressMap.set(e.studentId, p);
            }
        });

        const result = rows.map((r) => ({
            ...r,
            isLocked: r.lockedUntil ? new Date(r.lockedUntil) > new Date() : false,
            progress: progressMap.get(r.id) || 0,
            lastActive: lastActiveMap.get(r.id) || null,
        }));

        return json(result);
    },
};

const studentExperimentsRoutes = {
    async GET(req: Request) {
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const id = parseInt(parts[parts.length - 2] ?? "");

        if (!id) {
            return error("无效的学生ID", "INVALID_ID");
        }

        const rows = await db
            .select({
                id: experiment.id,
                taskName: topic.name,
                currentStage: experiment.currentStage,
                status: experiment.status,
                submitTime: experiment.stage4CompletedAt,
                score: submission.totalScore,
                lastUpdate: experiment.updatedAt,
            })
            .from(experiment)
            .leftJoin(task, eq(experiment.taskId, task.id))
            .leftJoin(topic, eq(task.topicId, topic.id))
            .leftJoin(submission, eq(submission.experimentId, experiment.id))
            .where(eq(experiment.studentId, id))
            .orderBy(desc(experiment.updatedAt));

        const result = rows.map(r => ({
            ...r,
            progress: r.status >= 1 ? 100 : Math.min(r.currentStage * 25, 100),
            statusText: r.status === 2 ? "已批改" : (r.status === 1 ? "已提交" : "进行中"),
        }));

        return json(result);
    },
};

const studentStatusRoutes = {
    async PUT(req: Request) {
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const id = parseInt(parts[parts.length - 2] ?? "");
        const body = await parseBody<{ status: number }>(req);

        if (!id) {
            return error("无效的学生ID", "INVALID_ID");
        }

        await db.update(student).set({ status: body.status }).where(eq(student.id, id));

        return json({ success: true });
    },
};


const studentResetPasswordRoutes = {
    async POST(req: Request) {
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const id = parseInt(parts[parts.length - 2] ?? "");

        if (!id) {
            return error("无效的学生ID", "INVALID_ID");
        }

        const [s] = await db.select().from(student).where(eq(student.id, id));

        if (!s) {
            return error("学生不存在", "NOT_FOUND", 404);
        }

        const hashedPassword = await Bun.password.hash(s.studentId);

        await db
            .update(student)
            .set({ password: hashedPassword, isFirstLogin: 1 })
            .where(eq(student.id, id));

        return json({ success: true });
    },
};

const studentTransferRoutes = {
    async POST(req: Request) {
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const id = parseInt(parts[parts.length - 2] ?? "");
        const body = await parseBody<{ targetClassId: number; reason?: string }>(req);

        if (!id) {
            return error("无效的学生ID", "INVALID_ID");
        }
        if (!body.targetClassId) {
            return error("目标班级不能为空", "VALIDATION_ERROR");
        }

        const [s] = await db.select().from(student).where(eq(student.id, id));
        if (!s) {
            return error("学生不存在", "NOT_FOUND", 404);
        }

        // Check if target class exists
        const [targetClass] = await db.select().from(class_).where(eq(class_.id, body.targetClassId));
        if (!targetClass) {
            return error("目标班级不存在", "NOT_FOUND", 404);
        }

        if (s.classId === body.targetClassId) {
            return error("学生已在该班级", "SAME_CLASS");
        }

        // Record transfer
        await db.insert(studentTransfer).values({
            studentId: id,
            fromClassId: s.classId,
            toClassId: body.targetClassId,
            reason: body.reason,
            operatedBy: 1, // Mock Admin ID
        });

        // Update student class
        await db
            .update(student)
            .set({ classId: body.targetClassId })
            .where(eq(student.id, id));

        return json({ success: true });
    },
};

// ============================================================
// Announcement API
// ============================================================

const announcementRoutes: RouteDefinition = {
    async GET() {
        const rows = await db
            .select()
            .from(announcement)
            .orderBy(desc(announcement.createdAt));

        return json(rows);
    },

    async POST(req) {
        const body = await parseBody<{ title: string; content: string; publish?: boolean }>(req);

        if (!body.title?.trim() || !body.content?.trim()) {
            return error("标题和内容不能为空", "VALIDATION_ERROR");
        }

        const [result] = await db.insert(announcement).values({
            title: body.title.trim(),
            content: body.content.trim(),
            status: body.publish ? 1 : 0,
        });

        return json({ id: result.insertId }, 201);
    },
};

const announcementUpdateRoutes = {
    async PUT(req: Request) {
        const url = new URL(req.url);
        const id = parseInt(url.pathname.split("/").pop() ?? "");
        const body = await parseBody<{ title?: string; content?: string }>(req);

        if (!id) {
            return error("无效的公告ID", "INVALID_ID");
        }

        const updates: Record<string, unknown> = {};
        if (body.title?.trim()) updates.title = body.title.trim();
        if (body.content?.trim()) updates.content = body.content.trim();

        if (Object.keys(updates).length > 0) {
            await db.update(announcement).set(updates).where(eq(announcement.id, id));
        }

        return json({ success: true });
    },

    async DELETE(req: Request) {
        const url = new URL(req.url);
        const id = parseInt(url.pathname.split("/").pop() ?? "");

        if (!id) {
            return error("无效的公告ID", "INVALID_ID");
        }

        await db.delete(announcement).where(eq(announcement.id, id));

        return json({ success: true });
    },
};

const announcementPublishRoutes = {
    async PUT(req: Request) {
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const id = parseInt(parts[parts.length - 2] ?? "");

        if (!id) {
            return error("无效的公告ID", "INVALID_ID");
        }

        await db.update(announcement).set({ status: 1 }).where(eq(announcement.id, id));

        return json({ success: true });
    },
};

const announcementUnpublishRoutes = {
    async PUT(req: Request) {
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const id = parseInt(parts[parts.length - 2] ?? "");

        if (!id) {
            return error("无效的公告ID", "INVALID_ID");
        }

        await db.update(announcement).set({ status: 0 }).where(eq(announcement.id, id));

        return json({ success: true });
    },
};

const announcementStatsRoutes = {
    async GET(req: Request) {
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const id = parseInt(parts[parts.length - 2] ?? "");

        if (!id) {
            return error("无效的公告ID", "INVALID_ID");
        }

        const [an] = await db.select().from(announcement).where(eq(announcement.id, id));
        if (!an) {
            return error("公告不存在", "NOT_FOUND", 404);
        }

        // Count total potential readers (Teachers + Assistants + Students)
        // Note: In a real system you might want to cache this or filter by status
        const [tCount] = await db.select({ count: count() }).from(teacher).where(eq(teacher.status, 1));
        const [aCount] = await db.select({ count: count() }).from(assistant).where(eq(assistant.status, 1));
        const [sCount] = await db.select({ count: count() }).from(student).where(eq(student.status, 1));

        const totalCount = (tCount?.count ?? 0) + (aCount?.count ?? 0) + (sCount?.count ?? 0);

        // Count reads
        const [rCount] = await db
            .select({ count: count() })
            .from(announcementRead)
            .where(eq(announcementRead.announcementId, id));

        const readCount = rCount?.count ?? 0;
        const readRate = totalCount > 0 ? Math.round((readCount / totalCount) * 100) : 0;

        return json({
            readCount,
            totalCount,
            readRate,
        });
    },
};



const notificationRoutes = {
    async GET(req: Request) {
        const auth = await requireAdminAuth(req);
        if (auth.error) return auth.error;

        const adminId = auth.admin!.id;

        const [countRow] = await db
            .select({ count: count() })
            .from(notification)
            .where(
                and(
                    eq(notification.receiverType, ADMIN_USER_TYPE),
                    eq(notification.receiverId, adminId),
                    eq(notification.isRead, 0)
                )
            );

        const items = await db
            .select({
                id: notification.id,
                type: notification.type,
                title: notification.title,
                content: notification.content,
                isRead: notification.isRead,
                createdAt: notification.createdAt,
            })
            .from(notification)
            .where(
                and(
                    eq(notification.receiverType, ADMIN_USER_TYPE),
                    eq(notification.receiverId, adminId)
                )
            )
            .orderBy(desc(notification.createdAt))
            .limit(5);

        return json({
            count: countRow?.count ?? 0,
            items,
            sessionExpiresAt: auth.session?.expiresAt ?? null,
        });
    },
};

const notificationMarkReadRoutes = {
    async PUT(req: Request) {
        const auth = await requireAdminAuth(req);
        if (auth.error) return auth.error;

        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const id = parseInt(parts[parts.length - 2] ?? "");

        if (!id) {
            return error("无效的通知ID", "INVALID_ID");
        }

        await db
            .update(notification)
            .set({ isRead: 1, readAt: new Date() })
            .where(
                and(
                    eq(notification.id, id),
                    eq(notification.receiverType, ADMIN_USER_TYPE),
                    eq(notification.receiverId, auth.admin!.id)
                )
            );

        return json({ success: true });
    },
};

const notificationReadAllRoutes = {
    async PUT(req: Request) {
        const auth = await requireAdminAuth(req);
        if (auth.error) return auth.error;

        await db
            .update(notification)
            .set({ isRead: 1, readAt: new Date() })
            .where(
                and(
                    eq(notification.receiverType, ADMIN_USER_TYPE),
                    eq(notification.receiverId, auth.admin!.id),
                    eq(notification.isRead, 0)
                )
            );

        return json({ success: true });
    },
};

const semesterUpdateRoutes: RouteDefinition = {
    async PUT(req: Request) {
        const url = new URL(req.url);
        const parts = url.pathname.split("/");
        const id = parseInt(parts[parts.length - 2] ?? "");

        if (!id) {
            return error("无效的学期ID", "INVALID_ID");
        }

        const body = await parseBody<{ name?: string }>(req);
        const name = body.name?.trim();

        if (!name) {
            return error("学期名称不能为空", "VALIDATION_ERROR");
        }

        const [existing] = await db
            .select()
            .from(semester)
            .where(and(eq(semester.name, name), sql`${semester.id} <> ${id}`));

        if (existing) {
            return error("学期名称已存在", "DUPLICATE_NAME");
        }

        await db.update(semester).set({ name }).where(eq(semester.id, id));

        return json({ success: true });
    },
};

const backupCreateRoutes: RouteDefinition = {
    async POST(req: Request) {
        const auth = await requireAdminAuth(req);
        if (auth.error) return auth.error;

        const result = await createBackupArtifacts("backup");
        if (!result.ok) {
            await db.insert(notification).values({
                receiverType: ADMIN_USER_TYPE,
                receiverId: auth.admin!.id,
                type: "BACKUP_FAILED",
                title: "备份失败",
                content: `备份失败：${result.error}`,
            });
            return error(result.error, result.code, 500);
        }

        await db.insert(operationLog).values({
            userType: ADMIN_USER_TYPE,
            userId: auth.admin!.id,
            action: "CREATE_BACKUP",
            targetType: "system",
            detail: { backupId: result.backupId, sqlPath: result.sqlPath, zipPath: result.zipPath },
            ipAddress: getClientIp(req),
        });

        await db.insert(notification).values({
            receiverType: ADMIN_USER_TYPE,
            receiverId: auth.admin!.id,
            type: "BACKUP_CREATED",
            title: "备份已完成",
            content: `备份 ${result.backupId} 已创建成功。`,
        });

        return json({ backupId: result.backupId, createdAt: result.createdAt, sqlPath: result.sqlPath, zipPath: result.zipPath });
    },
};

const backupRestoreRoutes: RouteDefinition = {
    async POST(req: Request) {
        const auth = await requireAdminAuth(req);
        if (auth.error) return auth.error;

        const body = await parseBody<{ backupId?: string; password?: string; confirmPassword?: string }>(req);
        const backupId = body.backupId?.trim();
        const password = body.password ?? "";
        const confirmPassword = body.confirmPassword ?? "";
        const sessionToken = getCookieValue(req, ADMIN_SESSION_COOKIE) ?? req.headers.get("x-admin-session");

        if (!backupId) {
            return error("缺少备份ID", "VALIDATION_ERROR");
        }

        if (!password || !confirmPassword) {
            return error("请输入管理员密码确认", "VALIDATION_ERROR");
        }

        if (password !== confirmPassword) {
            return error("两次输入的密码不一致", "VALIDATION_ERROR");
        }

        const [adm] = await db.select().from(admin).where(eq(admin.id, auth.admin!.id));
        if (!adm) {
            return error("账户不存在", "ACCOUNT_NOT_FOUND", 401);
        }

        const passwordValid = await Bun.password.verify(password, adm.password);
        if (!passwordValid) {
            return error("管理员密码不正确", "INVALID_CREDENTIALS", 401);
        }

        if (!/^[a-zA-Z0-9_-]+$/.test(backupId)) {
            return error("备份ID格式不合法", "INVALID_ID");
        }

        const backupDir = join(process.cwd(), "backups");
        const sqlPath = join(backupDir, `${backupId}.sql`);
        const zipPath = join(backupDir, `${backupId}.zip`);

        try {
            await access(sqlPath);
            await access(zipPath);
        } catch {
            return error("备份文件不存在", "BACKUP_NOT_FOUND", 404);
        }

        const dbHost = process.env.DB_HOST || "localhost";
        const dbUser = process.env.DB_USER || "root";
        const dbPassword = process.env.DB_PASSWORD || "root";
        const dbName = process.env.DB_NAME || "sampling_simulation";

        const preBackup = await createBackupArtifacts("pre_restore");
        if (!preBackup.ok) {
            return error(preBackup.error, preBackup.code, 500);
        }

        const resetProcess = Bun.spawn({
            cmd: [
                "mariadb",
                "-h",
                dbHost,
                "-u",
                dbUser,
                "-e",
                `DROP DATABASE IF EXISTS \`${dbName}\`; CREATE DATABASE \`${dbName}\`;`,
            ],
            env: { ...process.env, MYSQL_PWD: dbPassword },
            stdout: "ignore",
            stderr: "pipe",
        });

        const resetExit = await resetProcess.exited;
        if (resetExit !== 0) {
            const errorText = await new Response(resetProcess.stderr).text();
            return error(`数据库清空失败: ${errorText || "未知错误"}`, "DB_RESET_FAILED", 500);
        }

        const sqlFile = Bun.file(sqlPath);
        const restoreProcess = Bun.spawn({
            cmd: ["mariadb", "-h", dbHost, "-u", dbUser, dbName],
            env: { ...process.env, MYSQL_PWD: dbPassword },
            stdin: sqlFile,
            stdout: "ignore",
            stderr: "pipe",
        });

        const restoreExit = await restoreProcess.exited;
        if (restoreExit !== 0) {
            const errorText = await new Response(restoreProcess.stderr).text();
            return error(`数据库恢复失败: ${errorText || "未知错误"}`, "DB_RESTORE_FAILED", 500);
        }

        const unzipProcess = Bun.spawn({
            cmd: ["unzip", "-o", zipPath, "-d", process.cwd()],
            stdout: "ignore",
            stderr: "pipe",
        });

        const unzipExit = await unzipProcess.exited;
        if (unzipExit !== 0) {
            const errorText = await new Response(unzipProcess.stderr).text();
            return error(`文件恢复失败: ${errorText || "未知错误"}`, "PUBLIC_RESTORE_FAILED", 500);
        }

        await db.insert(operationLog).values({
            userType: ADMIN_USER_TYPE,
            userId: auth.admin!.id,
            action: "RESTORE_BACKUP",
            targetType: "system",
            detail: {
                backupId,
                preRestoreBackupId: preBackup.backupId,
                preRestoreSqlPath: preBackup.sqlPath,
                preRestoreZipPath: preBackup.zipPath,
            },
            ipAddress: getClientIp(req),
        });

        if (sessionToken) {
            await db.delete(userSession).where(eq(userSession.sessionToken, sessionToken));
        }

        const secure = isSecureRequest(req);
        return json({ success: true, restoredFrom: backupId }, 200, { "Set-Cookie": clearSessionCookie(secure) });
    },
};

const backupListRoutes: RouteDefinition = {
    async GET() {
        const backupDir = join(process.cwd(), "backups");
        try {
            const entries = await readdir(backupDir);
            const sqlFiles = entries.filter((file) => extname(file) === ".sql");
            const items = await Promise.all(
                sqlFiles.map(async (file) => {
                    const backupId = file.replace(/\.sql$/, "");
                    const sqlPath = join(backupDir, `${backupId}.sql`);
                    const zipPath = join(backupDir, `${backupId}.zip`);
                    let hasZip = false;
                    try {
                        await access(zipPath);
                        hasZip = true;
                    } catch {
                        hasZip = false;
                    }
                    const fileStat = await stat(sqlPath);
                    return {
                        backupId,
                        createdAt: fileStat.mtime.toISOString(),
                        sqlPath,
                        zipPath,
                        hasZip,
                    };
                })
            );

            items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            return json(items);
        } catch {
            return json([] as Array<{ backupId: string; createdAt: string; sqlPath: string; zipPath: string; hasZip: boolean }>);
        }
    },
};

const systemLogsRoutes = {
    async GET() {
        // Fetch recent operation logs and login logs, combine and sort
        const ops = await db
            .select({
                id: operationLog.id,
                type: sql<string>`'OPERATION'`,
                time: operationLog.createdAt,
                message: operationLog.action,
                detail: operationLog.detail,
            })
            .from(operationLog)
            .orderBy(desc(operationLog.createdAt))
            .limit(20);

        const logins = await db
            .select({
                id: loginLog.id,
                type: sql<string>`'LOGIN'`,
                time: loginLog.loginAt,
                message: sql<string>`concat('用户 ', ${loginLog.userId}, ' (', ${loginLog.userType}, ') 登录')`,
                detail: sql<string>`''`,
            })
            .from(loginLog)
            .orderBy(desc(loginLog.loginAt))
            .limit(20);

        // Combine and sort
        const logs = [...ops, ...logins]
            .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
            .slice(0, 20)
            .map(log => ({
                id: `${log.type}_${log.id}`,
                time: log.time,
                level: "INFO",
                message: log.message,
                source: log.type === 'LOGIN' ? 'AuthService' : 'Admin',
            }));

        return json(logs);
    },
};

// ============================================================
// Export Routes
// ============================================================

export const adminApiRoutes = {
    // Auth
    "/api/admin/login": adminLoginRoutes,
    "/api/admin/me": adminMeRoutes,
    "/api/admin/logout": adminLogoutRoutes,
    "/api/admin/password": withAdminAuth(adminPasswordRoutes),

    // Stats
    "/api/admin/stats": withAdminAuth(statsRoutes),
    "/api/admin/notifications": withAdminAuth(notificationRoutes),
    "/api/admin/notifications/:id/read": withAdminAuth(notificationMarkReadRoutes),
    "/api/admin/notifications/read-all": withAdminAuth(notificationReadAllRoutes),

    // Semesters
    "/api/admin/semesters": withAdminAuth(semesterRoutes),
    "/api/admin/semesters/:id/current": withAdminAuth(semesterCurrentRoutes),
    "/api/admin/semesters/:id": withAdminAuth(semesterDeleteRoutes),
    "/api/admin/semesters/:id/update": withAdminAuth(semesterUpdateRoutes),

    // Teachers
    "/api/admin/teachers": withAdminAuth(teacherRoutes),
    "/api/admin/teachers/:id/status": withAdminAuth(teacherStatusRoutes),
    "/api/admin/teachers/:id/unlock": withAdminAuth(teacherUnlockRoutes),
    "/api/admin/teachers/:id/reset-password": withAdminAuth(teacherResetPasswordRoutes),

    // Assistants
    "/api/admin/assistants": withAdminAuth(assistantRoutes),
    "/api/admin/assistants/:id/status": withAdminAuth(assistantStatusRoutes),
    "/api/admin/assistants/:id/unlock": withAdminAuth(assistantUnlockRoutes),
    "/api/admin/assistants/:id/reset-password": withAdminAuth(assistantResetPasswordRoutes),
    "/api/admin/assistants/:id": withAdminAuth(assistantDeleteRoutes),

    // Classes
    "/api/admin/classes": withAdminAuth(classRoutes),
    "/api/admin/classes/:id": withAdminAuth(classUpdateRoutes),

    // Students
    "/api/admin/students": withAdminAuth(studentRoutes),
    "/api/admin/students/:id/status": withAdminAuth(studentStatusRoutes),
    "/api/admin/students/:id/reset-password": withAdminAuth(studentResetPasswordRoutes),
    "/api/admin/students/:id/transfer": withAdminAuth(studentTransferRoutes),
    "/api/admin/students/:id/experiments": withAdminAuth(studentExperimentsRoutes),

    // Announcements
    "/api/admin/announcements": withAdminAuth(announcementRoutes),
    "/api/admin/announcements/:id": withAdminAuth(announcementUpdateRoutes),
    "/api/admin/announcements/:id/publish": withAdminAuth(announcementPublishRoutes),
    "/api/admin/announcements/:id/unpublish": withAdminAuth(announcementUnpublishRoutes),
    "/api/admin/announcements/:id/stats": withAdminAuth(announcementStatsRoutes),

    // System
    "/api/admin/system/metrics": withAdminAuth(systemMetricsRoutes),
    "/api/admin/system/logs": withAdminAuth(systemLogsRoutes),
    "/api/admin/settings": withAdminAuth(systemSettingsRoutes),
    "/api/admin/backups": withAdminAuth(backupListRoutes),
    "/api/admin/backup": withAdminAuth(backupCreateRoutes),
    "/api/admin/restore": withAdminAuth(backupRestoreRoutes),
};
