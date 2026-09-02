/**
 * 本地开发时使用的 seed 演示凭据。
 *
 * 生产构建会由 scripts/build.ts 的插件替换整个模块：普通构建全部导出空字符串，
 * demo 构建才注入这些值。这样既保留 bun run dev 的便利，也不会把演示密码写进
 * 普通生产浏览器包。
 */
export const PREFILL_STUDENT_ID = "S010";
export const PREFILL_STUDENT_PASSWORD = "Student!010";
export const PREFILL_TEACHER_ID = "T001";
export const PREFILL_TEACHER_PASSWORD = "Teacher!2026";
export const PREFILL_ADMIN_USERNAME = "admin";
export const PREFILL_ADMIN_PASSWORD = "admin123";
