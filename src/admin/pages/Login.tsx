import { useState } from "react";

import { AuthLoginScreen } from "@/components/AuthLoginScreen";
import { DEMO_ADMIN_PASSWORD, DEMO_ADMIN_USERNAME, DEMO_MODE } from "@/lib/demo-mode";
import { DEV_ADMIN_PASSWORD, DEV_ADMIN_USERNAME, DEV_AUTH_MODE } from "@/lib/dev-mode";
import { authApi } from "../api-client";

const prefilledUsername = DEMO_MODE ? DEMO_ADMIN_USERNAME : DEV_AUTH_MODE ? DEV_ADMIN_USERNAME : "";
const prefilledPassword = DEMO_MODE ? DEMO_ADMIN_PASSWORD : DEV_AUTH_MODE ? DEV_ADMIN_PASSWORD : "";

export function Login() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [username, setUsername] = useState(prefilledUsername);
    const [password, setPassword] = useState(prefilledPassword);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        if (!username.trim() || !password) {
            setError("请输入用户名和密码");
            return;
        }

        setLoading(true);
        try {
            const response = await authApi.login({ username: username.trim(), password });
            if (response.success) {
                window.location.assign("/admin");
            } else {
                setError(response.error?.message ?? "登录失败");
            }
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "登录失败");
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLoginScreen
            portal="admin"
            heading="管理员登录"
            description="请输入您的用户名和密码登录系统"
            accountLabel="用户名"
            accountPlaceholder="请输入用户名"
            resetHint="忘记密码？请联系系统管理员通过后台重置"
            username={username}
            password={password}
            loading={loading}
            error={error}
            alternateLinks={[
                { href: "/teacher/login", label: "教师登录" },
                { href: "/student/login", label: "学生登录" },
            ]}
            onUsernameChange={setUsername}
            onPasswordChange={setPassword}
            onSubmit={handleSubmit}
        />
    );
}
