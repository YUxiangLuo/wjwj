/**
 * Student API Routes
 * 学生端 API 接口集合
 */

import { db } from "../db";
import {
    student,
    task,
    topic,
    topicAttachment,
    topicRecommendQuestion,
    experiment,
    submission,
    notification,
    announcement,
    announcementRead,
    class_,
    userSession,
    loginLog,
    systemConfig,
} from "../db/schema";
import { eq, desc, and, sql, isNull, count } from "drizzle-orm";

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

// Experiment status
const ExperimentStatus = {
    IN_PROGRESS: 0,
    SUBMITTED: 1,
    GRADING: 2,
    GRADED: 3,
    REJECTED: 4,
} as const;

// ============================================================
// Helpers
// ============================================================

// Normsinv (inverse standard normal distribution) approximation
// Returns Z value for a given probability p
function getZValue(p: number): number {
    // Basic lookup for common confidence levels
    // p is the confidence level (e.g. 0.95)

    // Z = normsinv((1 + confidence) / 2)
    // Common values:
    // 90% -> 1.645
    // 95% -> 1.96
    // 99% -> 2.576

    if (p >= 0.99) return 2.576;
    if (p >= 0.95) return 1.96;
    if (p >= 0.90) return 1.645;

    return 1.96; // Default to 95%
}


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

const STUDENT_USER_TYPE = 4;
const STUDENT_SESSION_COOKIE = "student_session";
const STUDENT_SESSION_TTL_MINUTES = 240; // 4 hours
const STUDENT_MAX_LOGIN_ATTEMPTS = 5;
const STUDENT_LOCK_MINUTES = 30;

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

function getCookieValue(req: Request, name: string): string | null {
    const cookie = req.headers.get("cookie") ?? "";
    const match = cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
    return match?.[1] ?? null;
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
    return `${STUDENT_SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()};${secureFlag}`;
}

function clearSessionCookie(secure: boolean) {
    const secureFlag = secure ? " Secure;" : "";
    return `${STUDENT_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT;${secureFlag}`;
}

function validatePasswordStrength(password: string, account: string) {
    const minLength = password.length >= 8;
    const hasLetter = /[A-Za-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>\[\]\\/\-_=+~`]/.test(password);
    const containsAccount = account && password.includes(account);

    return {
        minLength,
        hasLetter,
        hasNumber,
        hasSpecial,
        containsAccount,
        isValid: minLength && hasLetter && hasNumber && hasSpecial && !containsAccount,
    };
}

function getPathParam(req: Request, position: number): string {
    const url = new URL(req.url);
    const parts = url.pathname.split("/");
    return parts[parts.length - position] ?? "";
}

// 从 session token 获取当前学生
async function getCurrentStudent(req: Request) {
    // 从 cookie 或 header 获取 session token
    const sessionToken = getCookieValue(req, STUDENT_SESSION_COOKIE) ?? req.headers.get("x-student-session");

    if (sessionToken) {
        // 查询 session
        const [session] = await db
            .select()
            .from(userSession)
            .where(
                and(
                    eq(userSession.sessionToken, sessionToken),
                    eq(userSession.userType, STUDENT_USER_TYPE) // 4 = student
                )
            );

        if (session) {
            const expiresAt = session.expiresAt ? new Date(session.expiresAt) : null;
            if (expiresAt && expiresAt <= new Date()) {
                await db.delete(userSession).where(eq(userSession.sessionToken, sessionToken));
                return null;
            }
            const sessionTtlMinutes = await getConfigNumber("session.student_timeout_minutes", STUDENT_SESSION_TTL_MINUTES);
            const now = new Date();
            const newExpiresAt = new Date(now.getTime() + sessionTtlMinutes * 60 * 1000);
            await db.update(userSession)
                .set({ lastActiveAt: now, expiresAt: newExpiresAt })
                .where(eq(userSession.id, session.id));
            // 查询学生信息
            const [s] = await db
                .select({
                    id: student.id,
                    studentId: student.studentId,
                    name: student.name,
                    classId: student.classId,
                    status: student.status,
                    isFirstLogin: student.isFirstLogin,
                })
                .from(student)
                .where(and(eq(student.id, session.userId), isNull(student.deletedAt)));

            if (s) return s;
        }
    }

    return null;
}

// ============================================================
// Auth API
// ============================================================

const loginRoutes: RouteDefinition = {
    async POST(req) {
        const body = await parseBody<{ studentId: string; password: string }>(req);
        const studentId = body.studentId?.trim();
        const password = body.password ?? "";

        if (!studentId || !password) {
            return error("请输入学号和密码", "VALIDATION_ERROR", 400);
        }

        const [s] = await db.select().from(student).where(eq(student.studentId, studentId));
        if (!s) {
            return error("账号或密码错误", "INVALID_CREDENTIALS", 401);
        }

        const now = new Date();
        const maxAttempts = await getConfigNumber("login.max_fail_count", STUDENT_MAX_LOGIN_ATTEMPTS);
        const lockMinutes = await getConfigNumber("login.lock_duration_minutes", STUDENT_LOCK_MINUTES);
        if (s.lockedUntil && new Date(s.lockedUntil) > now) {
            return error("账号已被锁定，请稍后重试", "ACCOUNT_LOCKED", 403);
        }

        const isValid = await Bun.password.verify(password, s.password);
        if (!isValid) {
            const failCount = (s.loginFailCount ?? 0) + 1;
            const updateData: any = { loginFailCount: failCount };
            if (failCount >= maxAttempts) {
                updateData.lockedUntil = new Date(now.getTime() + lockMinutes * 60 * 1000);
            }
            await db.update(student).set(updateData).where(eq(student.id, s.id));
            return error(
                failCount >= maxAttempts
                    ? `账号或密码错误，已锁定${lockMinutes}分钟`
                    : "账号或密码错误",
                "INVALID_CREDENTIALS",
                401
            );
        }

        if (s.status !== 1) {
            return error("账号已被停用，请联系教师", "ACCOUNT_DISABLED", 403);
        }

        await db.update(student).set({ loginFailCount: 0, lockedUntil: null }).where(eq(student.id, s.id));

        const token = crypto.randomUUID();
        const sessionTtlMinutes = await getConfigNumber("session.student_timeout_minutes", STUDENT_SESSION_TTL_MINUTES);
        const expiresAt = new Date(now.getTime() + sessionTtlMinutes * 60 * 1000);

        // 单设备登录：清理旧 session
        await db.delete(userSession).where(and(eq(userSession.userType, STUDENT_USER_TYPE), eq(userSession.userId, s.id)));

        await db.insert(userSession).values({
            sessionToken: token,
            userType: STUDENT_USER_TYPE,
            userId: s.id,
            deviceInfo: req.headers.get("user-agent") ?? "",
            expiresAt,
            lastActiveAt: now,
        });

        await db.insert(loginLog).values({
            userType: STUDENT_USER_TYPE,
            userId: s.id,
            ipAddress: getClientIp(req),
            userAgent: req.headers.get("user-agent") ?? "",
        });

        const secure = isSecureRequest(req);
        return json(
            {
                user: { id: s.id, studentId: s.studentId, name: s.name, classId: s.classId, isFirstLogin: s.isFirstLogin },
                expiresAt,
            },
            200,
            { "Set-Cookie": buildSessionCookie(token, expiresAt, secure) }
        );
    },
};

const logoutRoutes: RouteDefinition = {
    async POST(req) {
        const token = getCookieValue(req, STUDENT_SESSION_COOKIE) ?? req.headers.get("x-student-session");
        if (token) {
            await db.delete(userSession).where(eq(userSession.sessionToken, token));
        }
        const secure = isSecureRequest(req);
        return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie(secure) });
    },
};

const passwordRoutes: RouteDefinition = {
    async PUT(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;

        const body = await parseBody<{ currentPassword: string; newPassword: string }>(req);
        const currentPassword = body.currentPassword ?? "";
        const newPassword = body.newPassword ?? "";

        if (!currentPassword || !newPassword) {
            return error("请输入当前密码和新密码", "VALIDATION_ERROR", 400);
        }

        const [s] = await db.select().from(student).where(eq(student.id, auth.student!.id));
        if (!s) return error("账户不存在", "ACCOUNT_NOT_FOUND", 404);

        const isValid = await Bun.password.verify(currentPassword, s.password);
        if (!isValid) return error("当前密码不正确", "INVALID_CREDENTIALS", 401);

        const rules = validatePasswordStrength(newPassword, s.studentId);
        if (!rules.isValid) {
            return error("新密码不符合规则", "PASSWORD_WEAK", 400);
        }

        const hashed = await Bun.password.hash(newPassword);
        await db.update(student).set({ password: hashed, isFirstLogin: 0 }).where(eq(student.id, s.id));

        return json({ success: true });
    },
};

// 要求登录的中间件风格检查
async function requireAuth(req: Request) {
    const currentStudent = await getCurrentStudent(req);
    if (!currentStudent) {
        return { student: null, error: error("未登录或登录已过期", "UNAUTHORIZED", 401) };
    }
    if (currentStudent.status !== 1) {
        return { student: null, error: error("账号已被禁用", "ACCOUNT_DISABLED", 403) };
    }
    return { student: currentStudent, error: null };
}

// ============================================================
// Me API - 当前用户信息
// ============================================================

const meRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        // 获取班级信息
        const [classInfo] = await db
            .select({
                className: class_.name,
            })
            .from(class_)
            .where(eq(class_.id, currentStudent.classId));

        return json({
            id: currentStudent.id,
            studentId: currentStudent.studentId,
            name: currentStudent.name,
            classId: currentStudent.classId,
            className: classInfo?.className ?? null,
            isFirstLogin: currentStudent.isFirstLogin ?? 0,
        });
    },
};

// ============================================================
// Tasks API - 任务列表
// ============================================================

const tasksRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        // 获取当前学生班级的所有任务
        const tasks = await db
            .select({
                id: task.id,
                topicId: task.topicId,
                classId: task.classId,
                openTime: task.openTime,
                deadline: task.deadline,
                createdAt: task.createdAt,
                // Topic info
                topicName: topic.name,
                topicDescription: topic.description,
            })
            .from(task)
            .innerJoin(topic, eq(task.topicId, topic.id))
            .where(
                and(
                    eq(task.classId, currentStudent.classId),
                    isNull(task.deletedAt),
                    eq(topic.status, 1) // 已发布的课题
                )
            )
            .orderBy(desc(task.createdAt));

        // 获取每个任务对应的实验状态
        const taskIds = tasks.map((t) => t.id);
        const experiments =
            taskIds.length > 0
                ? await db
                    .select({
                        taskId: experiment.taskId,
                        currentStage: experiment.currentStage,
                        status: experiment.status,
                        lastSavedAt: experiment.lastSavedAt,
                    })
                    .from(experiment)
                    .where(
                        and(
                            eq(experiment.studentId, currentStudent.id),
                            sql`${experiment.taskId} IN (${sql.join(taskIds, sql`, `)})`
                        )
                    )
                : [];

        const experimentMap = new Map(experiments.map((e) => [e.taskId, e]));

        // 获取提交信息（成绩、驳回原因）
        const experimentIds = experiments.map((e) => e.taskId);
        const submissions =
            experimentIds.length > 0
                ? await db
                    .select({
                        experimentId: submission.experimentId,
                        totalScore: submission.totalScore,
                        rejectReason: submission.rejectReason,
                        status: submission.status,
                    })
                    .from(submission)
                    .innerJoin(experiment, eq(submission.experimentId, experiment.id))
                    .where(
                        and(
                            eq(experiment.studentId, currentStudent.id),
                            sql`${experiment.taskId} IN (${sql.join(taskIds, sql`, `)})`
                        )
                    )
                    .orderBy(desc(submission.submittedAt))
                : [];

        // 按 experimentId 分组，取最新的
        const submissionMap = new Map<number, (typeof submissions)[0]>();
        for (const sub of submissions) {
            if (!submissionMap.has(sub.experimentId)) {
                submissionMap.set(sub.experimentId, sub);
            }
        }

        // 组装返回数据
        const result = tasks.map((t) => {
            const exp = experimentMap.get(t.id);
            const sub = exp ? submissionMap.get(exp.taskId) : null;

            // 计算状态
            let status: string;
            let progress = 0;

            if (!exp) {
                status = "not_started";
            } else if (exp.status === ExperimentStatus.REJECTED) {
                status = "rejected";
                progress = 100;
            } else if (exp.status === ExperimentStatus.GRADED) {
                status = "graded";
                progress = 100;
            } else if (exp.status === ExperimentStatus.GRADING) {
                status = "grading";
                progress = 100;
            } else if (exp.status === ExperimentStatus.SUBMITTED) {
                status = "submitted";
                progress = 100;
            } else {
                status = "in_progress";
                progress = Math.round((exp.currentStage / 4) * 100);
            }

            return {
                id: t.id,
                topicId: t.topicId,
                name: t.topicName,
                description: t.topicDescription,
                publishedAt: t.openTime?.toISOString().split("T")[0] ?? t.createdAt.toISOString().split("T")[0],
                deadline: t.deadline?.toISOString().split("T")[0] ?? null,
                status,
                progress,
                currentStage: exp?.currentStage ?? 0,
                score: sub?.totalScore ? Number(sub.totalScore) : undefined,
                rejectReason: sub?.rejectReason ?? undefined,
            };
        });

        return json(result);
    },
};

// ============================================================
// Task Detail API - 任务详情
// ============================================================

const taskDetailRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const taskId = parseInt(getPathParam(req, 1));
        if (!taskId) {
            return error("无效的任务ID", "INVALID_ID");
        }

        // 获取任务信息
        const [taskInfo] = await db
            .select({
                id: task.id,
                topicId: task.topicId,
                classId: task.classId,
                openTime: task.openTime,
                deadline: task.deadline,
                createdAt: task.createdAt,
                topicName: topic.name,
                topicDescription: topic.description,
                excelRowCount: topic.excelRowCount,
            })
            .from(task)
            .innerJoin(topic, eq(task.topicId, topic.id))
            .where(
                and(
                    eq(task.id, taskId),
                    eq(task.classId, currentStudent.classId),
                    isNull(task.deletedAt)
                )
            );

        if (!taskInfo) {
            return error("任务不存在", "NOT_FOUND", 404);
        }

        // 获取附件
        const attachments = await db
            .select({
                id: topicAttachment.id,
                fileName: topicAttachment.fileName,
                fileType: topicAttachment.fileType,
                fileSize: topicAttachment.fileSize,
            })
            .from(topicAttachment)
            .where(eq(topicAttachment.topicId, taskInfo.topicId));

        // 获取推荐问题
        const recommendQuestions = await db
            .select({
                id: topicRecommendQuestion.id,
                questionType: topicRecommendQuestion.questionType,
                content: topicRecommendQuestion.content,
                options: topicRecommendQuestion.options,
                sortOrder: topicRecommendQuestion.sortOrder,
            })
            .from(topicRecommendQuestion)
            .where(eq(topicRecommendQuestion.topicId, taskInfo.topicId))
            .orderBy(topicRecommendQuestion.sortOrder);

        // 获取实验状态
        const [exp] = await db
            .select()
            .from(experiment)
            .where(
                and(
                    eq(experiment.studentId, currentStudent.id),
                    eq(experiment.taskId, taskId)
                )
            );

        // 获取提交信息
        let submissionInfo = null;
        if (exp) {
            const [sub] = await db
                .select()
                .from(submission)
                .where(eq(submission.experimentId, exp.id))
                .orderBy(desc(submission.submittedAt))
                .limit(1);
            submissionInfo = sub ?? null;
        }

        // 计算状态
        let status: string;
        if (!exp) {
            status = "not_started";
        } else if (exp.status === ExperimentStatus.REJECTED) {
            status = "rejected";
        } else if (exp.status === ExperimentStatus.GRADED) {
            status = "graded";
        } else if (exp.status === ExperimentStatus.GRADING) {
            status = "grading";
        } else if (exp.status === ExperimentStatus.SUBMITTED) {
            status = "submitted";
        } else {
            status = "in_progress";
        }

        return json({
            id: taskInfo.id,
            topicId: taskInfo.topicId,
            name: taskInfo.topicName,
            description: taskInfo.topicDescription,
            publishedAt: taskInfo.openTime?.toISOString().split("T")[0] ?? taskInfo.createdAt.toISOString().split("T")[0],
            deadline: taskInfo.deadline?.toISOString().split("T")[0] ?? null,
            populationSize: taskInfo.excelRowCount ?? 10000,
            attachments: attachments.map((a) => ({
                id: a.id,
                name: a.fileName,
                type: a.fileType,
                size: a.fileSize,
            })),
            recommendQuestions,
            status,
            currentStage: exp?.currentStage ?? 0,
            score: submissionInfo?.totalScore ? Number(submissionInfo.totalScore) : undefined,
            rejectReason: submissionInfo?.rejectReason ?? undefined,
        });
    },
};

// ============================================================
// Experiment API - 实验数据
// ============================================================

const experimentRoutes: RouteDefinition = {
    // 获取实验数据
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const taskId = parseInt(getPathParam(req, 2));
        if (!taskId) {
            return error("无效的任务ID", "INVALID_ID");
        }

        // 验证任务属于当前学生的班级
        const [taskInfo] = await db
            .select({ id: task.id, topicId: task.topicId })
            .from(task)
            .where(
                and(
                    eq(task.id, taskId),
                    eq(task.classId, currentStudent.classId),
                    isNull(task.deletedAt)
                )
            );

        if (!taskInfo) {
            return error("任务不存在", "NOT_FOUND", 404);
        }

        // 获取或创建实验记录
        let [exp] = await db
            .select()
            .from(experiment)
            .where(
                and(
                    eq(experiment.studentId, currentStudent.id),
                    eq(experiment.taskId, taskId)
                )
            );

        if (!exp) {
            // 创建新的实验记录
            try {
                const [result] = await db.insert(experiment).values({
                    studentId: currentStudent.id,
                    taskId: taskId,
                    currentStage: 0,
                    status: ExperimentStatus.IN_PROGRESS,
                });

                [exp] = await db.select().from(experiment).where(eq(experiment.id, result.insertId));
            } catch (e: unknown) {
                // 如果是重复键错误，说明记录已存在，重新查询
                if (e && typeof e === "object" && "code" in e && e.code === "ER_DUP_ENTRY") {
                    [exp] = await db
                        .select()
                        .from(experiment)
                        .where(
                            and(
                                eq(experiment.studentId, currentStudent.id),
                                eq(experiment.taskId, taskId)
                            )
                        );
                } else {
                    throw e;
                }
            }
        }

        if (!exp) {
            return error("创建实验记录失败", "CREATE_FAILED", 500);
        }

        // 获取课题的总体规模
        const [topicInfo] = await db
            .select({ excelRowCount: topic.excelRowCount })
            .from(topic)
            .where(eq(topic.id, taskInfo.topicId));

        return json({
            id: exp.id,
            taskId: exp.taskId,
            currentStage: exp.currentStage,
            status: exp.status,
            questionnaire: exp.questionnaire,
            samplePlan: exp.samplePlan,
            samplingResults: exp.samplingResults,
            reportContent: exp.reportContent,
            lastSavedAt: exp.lastSavedAt?.toISOString() ?? null,
            populationSize: topicInfo?.excelRowCount ?? 10000,
        });
    },

    // 保存实验数据
    async PUT(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const taskId = parseInt(getPathParam(req, 2));
        if (!taskId) {
            return error("无效的任务ID", "INVALID_ID");
        }

        const body = await parseBody<{
            currentStage?: number;
            questionnaire?: unknown;
            samplePlan?: unknown;
            samplingResults?: unknown;
            reportContent?: string;
        }>(req);

        // 获取实验记录
        const [exp] = await db
            .select()
            .from(experiment)
            .where(
                and(
                    eq(experiment.studentId, currentStudent.id),
                    eq(experiment.taskId, taskId)
                )
            );

        if (!exp) {
            return error("实验记录不存在", "NOT_FOUND", 404);
        }

        // 检查任务开放与截止
        const [taskInfo] = await db
            .select({ openTime: task.openTime, deadline: task.deadline })
            .from(task)
            .where(eq(task.id, taskId));

        if (taskInfo?.openTime && new Date(taskInfo.openTime) > new Date()) {
            return error("任务尚未开放", "TASK_NOT_OPEN");
        }

        const deadline = taskInfo?.deadline ? new Date(taskInfo.deadline) : null;
        const deadlinePassed = !!deadline && Date.now() > deadline.getTime();

        // 检查是否可以编辑（未提交或被驳回）
        if (exp.status !== ExperimentStatus.IN_PROGRESS && exp.status !== ExperimentStatus.REJECTED) {
            return error("实验已提交，无法修改", "ALREADY_SUBMITTED");
        }

        // 截止后被驳回不可继续修改
        if (exp.status === ExperimentStatus.REJECTED && deadlinePassed) {
            return error("任务已截止，无法重新提交", "TASK_DEADLINE");
        }

        // 构建更新数据
        const updates: Record<string, unknown> = {
            lastSavedAt: new Date(),
            version: exp.version + 1,
        };

        if (body.currentStage !== undefined) {
            if (deadlinePassed && body.currentStage > exp.currentStage) {
                return error("任务已截止，无法进入下一阶段", "TASK_DEADLINE");
            }
            updates.currentStage = body.currentStage;

            // 记录阶段完成时间
            if (body.currentStage >= 1 && !exp.stage1CompletedAt) {
                updates.stage1CompletedAt = new Date();
            }
            if (body.currentStage >= 2 && !exp.stage2CompletedAt) {
                updates.stage2CompletedAt = new Date();
            }
            if (body.currentStage >= 3 && !exp.stage3CompletedAt) {
                updates.stage3CompletedAt = new Date();
            }
            if (body.currentStage >= 4 && !exp.stage4CompletedAt) {
                updates.stage4CompletedAt = new Date();
            }
        }

        if (body.questionnaire !== undefined) {
            updates.questionnaire = body.questionnaire;
        }
        if (body.samplePlan !== undefined) {
            // Fetch task info for population size
            const [taskInfo] = await db
                .select({
                    topicId: task.topicId,
                    excelRowCount: topic.excelRowCount,
                })
                .from(task)
                .innerJoin(topic, eq(task.topicId, topic.id))
                .where(eq(task.id, taskId));

            // Recalculate if parameters changed
            const plan = body.samplePlan as any;
            if (plan.confidenceLevel && plan.marginOfError && taskInfo?.excelRowCount) {
                const z = getZValue(parseFloat(plan.confidenceLevel));
                const e = parseFloat(plan.marginOfError);
                const N = taskInfo.excelRowCount;
                const p = 0.5; // Conservative estimate

                // Infinite population formula: n0 = (Z^2 * p * (1-p)) / e^2
                const n0 = (Math.pow(z, 2) * p * (1 - p)) / Math.pow(e, 2);

                // Finite population correction: n = n0 / (1 + (n0 - 1) / N)
                const n = n0 / (1 + (n0 - 1) / N);

                plan.calculatedSampleSize = Math.ceil(n);
            }
            updates.samplePlan = plan;
        }
        if (body.samplingResults !== undefined) {
            updates.samplingResults = body.samplingResults;
        }
        if (body.reportContent !== undefined) {
            updates.reportContent = body.reportContent;
        }

        // 如果之前是被驳回状态，重新保存后变为进行中
        if (exp.status === ExperimentStatus.REJECTED) {
            updates.status = ExperimentStatus.IN_PROGRESS;
        }

        await db.update(experiment).set(updates).where(eq(experiment.id, exp.id));

        return json({ success: true, lastSavedAt: new Date().toISOString() });
    },
};

// Helpers for Excel reading and sampling
import * as XLSX from "xlsx";
import * as fs from "node:fs/promises";
import * as path from "node:path";

async function readPopulationData(filePath: string): Promise<any[]> {
    const fullPath = path.join(process.cwd(), "public", filePath);
    try {
        const fileBuffer = await fs.readFile(fullPath);
        const workbook = XLSX.read(fileBuffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) return [];
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) return [];
        return XLSX.utils.sheet_to_json(sheet);
    } catch (e) {
        console.error("Failed to read excel:", e);
        return [];
    }
}

// Sampling Implementations
async function performSimpleSampling(data: any[], n: number, seed?: number): Promise<any[]> {
    // Basic randomization (Fisher-Yates shuffle variation)
    // If seed is provided in real app, we'd use a seeded RNG. 
    // Here we just use Math.random() for simplicity, ignoring seed for now or using it to init RNG if needed.
    // For standard JS, proper seeding is complex, we'll stick to random shuffle for now.

    const indices = Array.from({ length: data.length }, (_, i) => i);

    // Shuffle indices
    for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = indices[i]!;
        indices[i] = indices[j]!;
        indices[j] = temp;
    }

    const selectedIndices = indices.slice(0, n);
    return selectedIndices.map(i => data[i]);
}

async function performSystematicSampling(data: any[], k: number, n: number): Promise<any[]> {
    const start = Math.floor(Math.random() * k);
    const result = [];

    for (let i = start; i < data.length; i += k) {
        result.push(data[i]);
    }

    // Allow slight overflow/underflow as per requirement or slice to exact n?
    // Requirement says just execute with K.
    // We update params with actual count.
    return result;
}

async function performStratifiedSampling(data: any[], stratifyBy: string, layers: any[]): Promise<any[]> {
    const result: any[] = [];

    // Group by stratum
    const groups: Record<string, any[]> = {};
    for (const item of data) {
        const val = String(item[stratifyBy]);
        if (!groups[val]) groups[val] = [];
        groups[val].push(item);
    }

    // Sample from each group
    for (const layer of layers) {
        const groupData = groups[layer.name] || [];
        const sampleCount = layer.sampleCount;

        if (sampleCount > 0 && groupData.length > 0) {
            const sampled = await performSimpleSampling(groupData, sampleCount);
            result.push(...sampled);
        }
    }

    return result;
}

// ============================================================
// Stats API - 总体统计信息
// ============================================================

const statsRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;

        const taskId = parseInt(getPathParam(req, 2));
        if (!taskId) return error("无效的任务ID", "INVALID_ID");

        // Get Task and Topic info
        const [taskInfo] = await db
            .select({
                topicId: task.topicId,
                excelFilePath: topic.excelFilePath,
                fieldMapping: topic.fieldMapping,
            })
            .from(task)
            .innerJoin(topic, eq(task.topicId, topic.id))
            .where(eq(task.id, taskId));

        if (!taskInfo || !taskInfo.excelFilePath) {
            return error("未找到总体的Excel数据文件", "NO_DATA_FILE");
        }

        const population = await readPopulationData(taskInfo.excelFilePath);
        let mapping = taskInfo.fieldMapping as { stratified?: string[] } | null | string;

        if (typeof mapping === "string") {
            try {
                mapping = JSON.parse(mapping);
            } catch (e) {
                console.error("Failed to parse fieldMapping:", e);
                mapping = null;
            }
        }

        const typedMapping = mapping as { stratified?: string[] } | null;

        if (!typedMapping || !typedMapping.stratified || typedMapping.stratified.length === 0) {
            return json({ stats: {} });
        }

        const stats: Record<string, Record<string, number>> = {};

        // Aggregate counts for each stratified field
        for (const field of typedMapping.stratified) {
            const counts: Record<string, number> = {};
            for (const row of population) {
                const val = String(row[field]);
                counts[val] = (counts[val] || 0) + 1;
            }
            stats[field] = counts;
        }

        return json({ stats });
    },
};

// ============================================================
// Sampling Action API - 执行抽样
// ============================================================

const samplingActionRoutes: RouteDefinition = {
    async POST(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const taskId = parseInt(getPathParam(req, 2));
        if (!taskId) return error("无效的任务ID", "INVALID_ID");

        const body = await parseBody<{
            method: "simple" | "systematic" | "stratified";
            params: any;
        }>(req);

        // Get Task and Topic info for Excel file
        const [taskInfo] = await db
            .select({
                topicId: task.topicId,
                excelFilePath: topic.excelFilePath,
            })
            .from(task)
            .innerJoin(topic, eq(task.topicId, topic.id))
            .where(eq(task.id, taskId));

        if (!taskInfo || !taskInfo.excelFilePath) {
            return error("未找到总体的Excel数据文件", "NO_DATA_FILE");
        }

        // Read population data
        const population = await readPopulationData(taskInfo.excelFilePath);
        if (population.length === 0) {
            return error("总体数据为空或读取失败", "READ_FAILED");
        }

        let sampledData: any[] = [];
        let resultParams: any = {};

        switch (body.method) {
            case "simple":
                const n = body.params.sampleSize || 100;
                sampledData = await performSimpleSampling(population, n, body.params.seed);
                resultParams = {
                    completed: true,
                    sampleCount: sampledData.length,
                    seed: body.params.seed,
                    data: sampledData.slice(0, 50) // Store preview
                };
                break;

            case "systematic":
                const k = body.params.kValue || 10;
                sampledData = await performSystematicSampling(population, k, 0); // n not strict here
                resultParams = {
                    completed: true,
                    kValue: k,
                    sampleCount: sampledData.length,
                    data: sampledData.slice(0, 50)
                };
                break;

            case "stratified":
                const stratifyBy = body.params.stratifyBy;
                const layers = body.params.layers;
                sampledData = await performStratifiedSampling(population, stratifyBy, layers);

                // Recalculate layers actual count? No, we just trust the sample function returned correct count
                resultParams = {
                    completed: true,
                    stratifyBy,
                    layers: layers,
                    stratifiedData: [],
                    data: sampledData.slice(0, 50)
                };
                break;
        }

        return json({ success: true, result: resultParams });
    },
};

// ============================================================
// Submit API - 提交实验
// ============================================================

const submitRoutes: RouteDefinition = {
    async POST(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const taskId = parseInt(getPathParam(req, 2));
        if (!taskId) {
            return error("无效的任务ID", "INVALID_ID");
        }

        // 获取实验记录
        const [exp] = await db
            .select()
            .from(experiment)
            .where(
                and(
                    eq(experiment.studentId, currentStudent.id),
                    eq(experiment.taskId, taskId)
                )
            );

        if (!exp) {
            return error("实验记录不存在", "NOT_FOUND", 404);
        }

        // 检查任务开放与截止
        const [taskInfo] = await db
            .select({ openTime: task.openTime, deadline: task.deadline })
            .from(task)
            .where(eq(task.id, taskId));

        if (taskInfo?.openTime && new Date(taskInfo.openTime) > new Date()) {
            return error("任务尚未开放", "TASK_NOT_OPEN");
        }

        if (taskInfo?.deadline) {
            const deadline = new Date(taskInfo.deadline).getTime();
            const now = Date.now();
            const grace = 30 * 1000;
            if (now > deadline + grace) {
                return error("任务已截止，无法提交", "TASK_DEADLINE");
            }
        }

        // 检查是否可以提交
        if (exp.status === ExperimentStatus.SUBMITTED || exp.status === ExperimentStatus.GRADING) {
            return error("实验已提交，请勿重复提交", "ALREADY_SUBMITTED");
        }
        if (exp.status === ExperimentStatus.GRADED) {
            return error("实验已批改完成", "ALREADY_GRADED");
        }

        // 检查是否完成所有阶段
        if (exp.currentStage < 4) {
            return error("请完成所有实验阶段后再提交", "INCOMPLETE");
        }

        // 检查报告内容
        if (!exp.reportContent || exp.reportContent.length < 100) {
            return error("报告内容不能少于100字", "REPORT_TOO_SHORT");
        }

        // 更新实验状态
        await db
            .update(experiment)
            .set({ status: ExperimentStatus.SUBMITTED })
            .where(eq(experiment.id, exp.id));

        // 创建提交记录
        await db.insert(submission).values({
            experimentId: exp.id,
            status: 1, // Pending
            submittedAt: new Date(),
        });

        return json({ success: true });
    },
};

// ============================================================
// Notifications API - 通知
// ============================================================

const notificationsRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const notifications = await db
            .select({
                id: notification.id,
                type: notification.type,
                title: notification.title,
                content: notification.content,
                isRead: notification.isRead,
                createdAt: notification.createdAt,
                relatedType: notification.relatedType,
                relatedId: notification.relatedId,
            })
            .from(notification)
            .where(
                and(
                    eq(notification.receiverType, 4), // 4 = student
                    eq(notification.receiverId, currentStudent.id)
                )
            )
            .orderBy(desc(notification.createdAt))
            .limit(50);

        // 统计未读数量
        const [unreadCount] = await db
            .select({ count: count() })
            .from(notification)
            .where(
                and(
                    eq(notification.receiverType, 4),
                    eq(notification.receiverId, currentStudent.id),
                    eq(notification.isRead, 0)
                )
            );

        return json({
            notifications,
            unreadCount: unreadCount?.count ?? 0,
        });
    },
};

const notificationReadRoutes: RouteDefinition = {
    async PUT(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const notificationId = parseInt(getPathParam(req, 2));
        if (!notificationId) {
            return error("无效的通知ID", "INVALID_ID");
        }

        // 更新为已读
        await db
            .update(notification)
            .set({ isRead: 1, readAt: new Date() })
            .where(
                and(
                    eq(notification.id, notificationId),
                    eq(notification.receiverType, 4),
                    eq(notification.receiverId, currentStudent.id)
                )
            );

        return json({ success: true });
    },
};

// 标记所有通知为已读
const notificationReadAllRoutes: RouteDefinition = {
    async PUT(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        await db
            .update(notification)
            .set({ isRead: 1, readAt: new Date() })
            .where(
                and(
                    eq(notification.receiverType, 4),
                    eq(notification.receiverId, currentStudent.id),
                    eq(notification.isRead, 0)
                )
            );

        return json({ success: true });
    },
};

// ============================================================
// Announcements API - 公告
// ============================================================

const announcementsRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        // 获取已发布的公告
        const announcements = await db
            .select({
                id: announcement.id,
                title: announcement.title,
                content: announcement.content,
                createdAt: announcement.createdAt,
            })
            .from(announcement)
            .where(eq(announcement.status, 1))
            .orderBy(desc(announcement.createdAt))
            .limit(20);

        // 获取已读状态
        const announcementIds = announcements.map((a) => a.id);
        const readRecords =
            announcementIds.length > 0
                ? await db
                    .select({ announcementId: announcementRead.announcementId })
                    .from(announcementRead)
                    .where(
                        and(
                            eq(announcementRead.userType, 4),
                            eq(announcementRead.userId, currentStudent.id),
                            sql`${announcementRead.announcementId} IN (${sql.join(announcementIds, sql`, `)})`
                        )
                    )
                : [];

        const readSet = new Set(readRecords.map((r) => r.announcementId));

        const result = announcements.map((a) => ({
            ...a,
            isRead: readSet.has(a.id),
        }));

        return json(result);
    },
};

const announcementReadRoutes: RouteDefinition = {
    async PUT(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const announcementId = parseInt(getPathParam(req, 2));
        if (!announcementId) {
            return error("无效的公告ID", "INVALID_ID");
        }

        // 检查是否已读
        const [existing] = await db
            .select()
            .from(announcementRead)
            .where(
                and(
                    eq(announcementRead.announcementId, announcementId),
                    eq(announcementRead.userType, 4),
                    eq(announcementRead.userId, currentStudent.id)
                )
            );

        if (!existing) {
            await db.insert(announcementRead).values({
                announcementId,
                userType: 4,
                userId: currentStudent.id,
            });
        }

        return json({ success: true });
    },
};

// ============================================================
// Attachment Download API - 附件下载
// ============================================================

const attachmentDownloadRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;

        const attachmentId = parseInt(getPathParam(req, 2));
        if (!attachmentId) {
            return error("无效的附件ID", "INVALID_ID");
        }

        // 获取附件信息
        const [att] = await db
            .select()
            .from(topicAttachment)
            .where(eq(topicAttachment.id, attachmentId));

        if (!att) {
            return error("附件不存在", "NOT_FOUND", 404);
        }

        // TODO: 实际下载逻辑，返回文件流
        // 这里先返回文件路径信息
        return json({
            id: att.id,
            fileName: att.fileName,
            filePath: att.filePath,
            fileType: att.fileType,
            fileSize: att.fileSize,
        });
    },
};

// ============================================================
// Export Routes
// ============================================================

export const studentApiRoutes = {
    // Auth
    "/api/student/login": loginRoutes,
    "/api/student/logout": logoutRoutes,
    "/api/student/password": passwordRoutes,

    // Me
    "/api/student/me": meRoutes,

    // Tasks
    "/api/student/tasks": tasksRoutes,
    "/api/student/tasks/:id": taskDetailRoutes,

    // Experiment
    "/api/student/tasks/:id/experiment": experimentRoutes,
    "/api/student/tasks/:id/sampling": samplingActionRoutes,
    "/api/student/tasks/:id/stats": statsRoutes, // New stats endpoint
    "/api/student/tasks/:id/submit": submitRoutes,

    // Notifications
    "/api/student/notifications": notificationsRoutes,
    "/api/student/notifications/read-all": notificationReadAllRoutes,
    "/api/student/notifications/:id/read": notificationReadRoutes,

    // Announcements
    "/api/student/announcements": announcementsRoutes,
    "/api/student/announcements/:id/read": announcementReadRoutes,

    // Attachments
    "/api/student/attachments/:id/download": attachmentDownloadRoutes,
};
