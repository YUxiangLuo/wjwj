import {
    DEV_ADMIN_PASSWORD,
    DEV_ADMIN_USERNAME,
    DEV_STUDENT_ID,
    DEV_STUDENT_PASSWORD,
    DEV_TEACHER_ID,
    DEV_TEACHER_PASSWORD,
} from "./dev-mode";

/**
 * 演示模式开关。浏览器构建期由 define 内联；服务端由启动环境读取。
 *
 * 开启后：登录页使用默认 seed 的演示账号，访客打开即可登录。
 * 与 DEV_AUTH_MODE 的区别：
 * - 学生账号由受保护的 demo-only 服务端端点随机选择；教师与管理员保持固定；
 * - `bun run dev` 的浏览器 bundle 没有 process 全局，
 *   readBundledEnv 走 catch 分支恒为关闭（开发预填由 DEV_AUTH_MODE 提供，账号相同）。
 *
 * 普通生产构建（`bun run build`）把 `process.env.DEMO_MODE` 内联为 "0"，预填在运行时恒为关闭；
 * 只有 `bun run build:demo`（DEMO_MODE=1）内联 "1"。
 * 读取环境变量必须写 `process.env.DEMO_MODE`，构建 `define` 才能内联。
 */
export function resolveDemoMode(env: Record<string, string | undefined>): boolean {
    return env.DEMO_MODE === "1";
}

// 浏览器 bundle 中没有 process 全局（dev 服务器不做内联），必须 try/catch 兜底。
// 与 dev-mode.ts 相同的取舍：普通生产包里预填分支作为不可达代码存在，运行时恒为 false。
function readBundledEnv(): Record<string, string | undefined> {
    try {
        return {
            DEMO_MODE: process.env.DEMO_MODE,
        };
    } catch {
        return {};
    }
}

export const DEMO_MODE = resolveDemoMode(readBundledEnv());

/** 静态学生值仅是 demo API 不可用时的回退；正常 demo 刷新会随机替换。 */
export const DEMO_STUDENT_ID = DEV_STUDENT_ID;
export const DEMO_STUDENT_PASSWORD = DEV_STUDENT_PASSWORD;
export const DEMO_TEACHER_ID = DEV_TEACHER_ID;
export const DEMO_TEACHER_PASSWORD = DEV_TEACHER_PASSWORD;
export const DEMO_ADMIN_USERNAME = DEV_ADMIN_USERNAME;
/** 演示库应使用 `bun run db:reset:demo` 初始化。 */
export const DEMO_ADMIN_PASSWORD = DEV_ADMIN_PASSWORD;
