/**
 * 开发模式开关（前后端共用）。
 *
 * 开启后：
 * - 三个登录页预填演示账号和密码；
 * - 跳过“首次登录 / 密码重置后必须修改密码”的强制流程
 *   （前端不再弹出强制改密对话框，服务端也不再以 PASSWORD_CHANGE_REQUIRED 拦截 API）。
 *
 * 非生产环境下，`DEV_AUTH_MODE=1` 强制开启，`DEV_AUTH_MODE=0` 强制关闭。
 * 未设置时：本地开发默认开启，`NODE_ENV=test` 默认关闭；生产环境始终关闭。
 * 读取环境变量必须写 `process.env.DEV_AUTH_MODE` / `process.env.NODE_ENV`，生产 `define` 才能内联。
 */
export function resolveDevAuthMode(env: Record<string, string | undefined>): boolean {
    if (env.NODE_ENV === "production") return false;
    if (env.DEV_AUTH_MODE === "0") return false;
    if (env.DEV_AUTH_MODE === "1") return true;
    return env.NODE_ENV !== "test" && env.NODE_ENV !== "production";
}

function readBundledEnv(): Record<string, string | undefined> {
    try {
        return {
            DEV_AUTH_MODE: process.env.DEV_AUTH_MODE,
            NODE_ENV: process.env.NODE_ENV,
        };
    } catch {
        return {};
    }
}

export const DEV_AUTH_MODE = resolveDevAuthMode(readBundledEnv());

/** 开发模式下的演示账号和密码（与 src/db/seeds/default.ts 一致）。 */
export const DEV_STUDENT_ID = "S010";
export const DEV_STUDENT_PASSWORD = "Student!010";
export const DEV_TEACHER_ID = "T001";
export const DEV_TEACHER_PASSWORD = "Teacher!2026";
export const DEV_ADMIN_USERNAME = "admin";

/** 开发模式下管理员演示密码（src/db/seeds/default.ts 在开发鉴权开启时写入该值）。 */
export const DEV_ADMIN_PASSWORD = "admin123";
