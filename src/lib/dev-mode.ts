/**
 * 开发模式开关（前后端共用）。
 *
 * 开启后：
 * - 三个登录页预填演示账号的密码；
 * - 跳过“首次登录 / 密码重置后必须修改密码”的强制流程
 *   （前端不再弹出强制改密对话框，服务端也不再以 PASSWORD_CHANGE_REQUIRED 拦截 API）。
 *
 * 默认开启；`DEV_AUTH_MODE=0` 可显式关闭，测试环境（NODE_ENV=test）自动关闭。
 * 上线前必须关闭。
 *
 * 注意：浏览器 bundle 中没有 `process` 全局，必须先用 typeof 防护。
 */
const runtimeEnv: Record<string, string | undefined> =
    typeof process !== "undefined" ? process.env : {};

export const DEV_AUTH_MODE = runtimeEnv.DEV_AUTH_MODE === "0"
    ? false
    : runtimeEnv.DEV_AUTH_MODE === "1" || runtimeEnv.NODE_ENV !== "test";

/** 开发模式下管理员演示密码（与 src/db/seeds/default.ts 中的默认值一致）。 */
export const DEV_ADMIN_PASSWORD = "admin123";
