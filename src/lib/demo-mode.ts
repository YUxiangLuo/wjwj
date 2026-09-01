import {
    DEV_ADMIN_PASSWORD,
    DEV_ADMIN_USERNAME,
    DEV_STUDENT_ID,
    DEV_STUDENT_PASSWORD,
    DEV_TEACHER_ID,
    DEV_TEACHER_PASSWORD,
} from "./dev-mode";

/**
 * 演示模式开关（前端与构建脚本共用，构建期由 define 内联；服务端不引用本模块）。
 *
 * 开启后：三个登录页自动填入与默认 seed 一致的演示账号和密码，访客打开即可登录。
 * 与 DEV_AUTH_MODE 的区别：
 * - 只预填凭据，不跳过“首次登录 / 密码重置后必须修改密码”的门禁，服务端行为完全不变；
 * - 只对构建产物生效。`bun run dev` 的浏览器 bundle 没有 process 全局，
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

/** 演示账号与开发模式相同（与 src/db/seeds/default.ts 一致；S010、T001 均非首次登录，不会触发改密门禁）。 */
export const DEMO_STUDENT_ID = DEV_STUDENT_ID;
export const DEMO_STUDENT_PASSWORD = DEV_STUDENT_PASSWORD;
export const DEMO_TEACHER_ID = DEV_TEACHER_ID;
export const DEMO_TEACHER_PASSWORD = DEV_TEACHER_PASSWORD;
export const DEMO_ADMIN_USERNAME = DEV_ADMIN_USERNAME;
/**
 * 演示库必须用 `SEED_ADMIN_PASSWORD=admin123 bun run db:seed`（或 db:reset）初始化，
 * 否则 seed 会生成随机管理员密码。seed 的管理员是首次登录，首次进入仍需完成一次改密。
 */
export const DEMO_ADMIN_PASSWORD = DEV_ADMIN_PASSWORD;
