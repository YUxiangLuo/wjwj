import { count } from "drizzle-orm";
import { ADMIN_PASSWORD_POLICY, evaluatePasswordRules } from "../lib/password-policy";
import { admin } from "./schema";
import { closeDatabase, db } from "./index";
import { hashPassword } from "../server/password-work";

const READABLE = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export function generateBootstrapPassword(randomValues = crypto.getRandomValues(new Uint32Array(9))) {
    const body = Array.from(randomValues, (value) => READABLE[value % READABLE.length]).join("");
    return `A${body.slice(0, 4)}!${body.slice(4)}7`;
}

async function bootstrapAdmin() {
    const username = process.env.BOOTSTRAP_ADMIN_USERNAME?.trim() || "admin";
    if (username.length > 50) throw new Error("BOOTSTRAP_ADMIN_USERNAME 不能超过 50 个字符");

    const [existing] = await db.select({ count: count() }).from(admin);
    if (Number(existing?.count ?? 0) > 0) throw new Error("管理员已存在，拒绝重复 bootstrap");

    const suppliedPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD?.trim();
    const password = suppliedPassword || generateBootstrapPassword();
    const rules = evaluatePasswordRules({
        password,
        minLength: ADMIN_PASSWORD_POLICY.minLength,
        forbiddenSubstrings: [username],
    });
    if (!rules.isPolicyValid) throw new Error(ADMIN_PASSWORD_POLICY.errorMessage);

    await db.insert(admin).values({
        username,
        password: await hashPassword(password),
    });

    console.log(`管理员 ${username} 已创建。`);
    if (!suppliedPassword) {
        console.log(`一次性初始密码：${password}`);
        console.log("请立即安全保存；该密码不会再次显示。");
    }
}

if (import.meta.main) {
    try {
        await bootstrapAdmin();
    } catch (error) {
        console.error("管理员 bootstrap 失败：", error instanceof Error ? error.message : "未知错误");
        process.exitCode = 1;
    } finally {
        await closeDatabase();
    }
}
