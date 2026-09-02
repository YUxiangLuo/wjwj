import { useEffect, useRef, useState } from "react";

import { AuthLoginScreen } from "@/components/AuthLoginScreen";
import { DEMO_MODE, DEMO_STUDENT_ID, DEMO_STUDENT_PASSWORD } from "@/lib/demo-mode";
import { DEV_AUTH_MODE, DEV_STUDENT_ID, DEV_STUDENT_PASSWORD } from "@/lib/dev-mode";
import { authApi } from "../api-client";

const prefilledUsername = DEMO_MODE ? DEMO_STUDENT_ID : DEV_AUTH_MODE ? DEV_STUDENT_ID : "";
const prefilledPassword = DEMO_MODE ? DEMO_STUDENT_PASSWORD : DEV_AUTH_MODE ? DEV_STUDENT_PASSWORD : "";

export function Login() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [username, setUsername] = useState(prefilledUsername);
    const [password, setPassword] = useState(prefilledPassword);
    const editedRef = useRef(false);

    useEffect(() => {
        if (!DEMO_MODE) return;
        const controller = new AbortController();
        void authApi.getDemoStudentCredential(controller.signal).then((response) => {
            if (!response.success || !response.data || editedRef.current) return;
            setUsername(response.data.studentId);
            setPassword(response.data.password);
        });
        return () => controller.abort();
    }, []);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        if (!username.trim() || !password) {
            setError("请输入学号和密码");
            return;
        }

        setLoading(true);
        try {
            const response = await authApi.login({ studentId: username.trim(), password });
            if (response.success && response.data) {
                window.location.assign("/student");
            } else {
                setError(response.error?.message || "登录失败，请检查账号密码");
            }
        } catch {
            setError("网络错误，请稍后重试");
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLoginScreen
            portal="student"
            heading="学生登录"
            description="请输入您的学号和密码登录系统"
            accountLabel="学号"
            accountPlaceholder="请输入学号"
            resetHint="忘记密码？请联系班级教师重置"
            username={username}
            password={password}
            loading={loading}
            error={error}
            alternateLinks={[
                { href: "/admin/login", label: "管理员登录" },
                { href: "/teacher/login", label: "教师登录" },
            ]}
            onUsernameChange={(value) => {
                editedRef.current = true;
                setUsername(value);
            }}
            onPasswordChange={(value) => {
                editedRef.current = true;
                setPassword(value);
            }}
            onSubmit={handleSubmit}
        />
    );
}
