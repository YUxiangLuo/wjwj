import { useState } from "react";

import { AuthLoginScreen } from "@/components/AuthLoginScreen";
import { DEMO_MODE, DEMO_TEACHER_ID, DEMO_TEACHER_PASSWORD } from "@/lib/demo-mode";
import { DEV_AUTH_MODE, DEV_TEACHER_ID, DEV_TEACHER_PASSWORD } from "@/lib/dev-mode";
import { authApi } from "../api-client";

const prefilledUsername = DEMO_MODE ? DEMO_TEACHER_ID : DEV_AUTH_MODE ? DEV_TEACHER_ID : "";
const prefilledPassword = DEMO_MODE ? DEMO_TEACHER_PASSWORD : DEV_AUTH_MODE ? DEV_TEACHER_PASSWORD : "";

export function Login() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [username, setUsername] = useState(prefilledUsername);
    const [password, setPassword] = useState(prefilledPassword);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        if (!username.trim() || !password) {
            setError("请输入工号/账号和密码");
            return;
        }

        setLoading(true);
        try {
            const response = await authApi.login({ employeeId: username.trim(), password });
            if (!response.success) {
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
            portal="teacher"
            heading="教师登录"
            description="使用教师工号和密码登录"
            accountLabel="教师工号"
            accountPlaceholder="请输入教师工号"
            resetHint="忘记密码？请联系系统管理员重置"
            username={username}
            password={password}
            loading={loading}
            error={error}
            alternateLinks={[
                { href: "/admin/login", label: "管理员登录" },
                { href: "/student/login", label: "学生登录" },
            ]}
            onUsernameChange={setUsername}
            onPasswordChange={setPassword}
            onSubmit={handleSubmit}
        />
    );
}

export default Login;
