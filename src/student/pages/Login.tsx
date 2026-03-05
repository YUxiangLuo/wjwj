import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { authApi, meApi } from "../api-client";
import { useStudent } from "../contexts/StudentContext";
import { StudentLoginPage } from "../components/StudentLoginPage";

export function Login() {
    const navigate = useNavigate();
    const { refreshUser, refreshNotifications } = useStudent();
    const [loading, setLoading] = useState(false);
    const [checking, setChecking] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        meApi
            .get()
            .then((res) => {
                if (cancelled) return;
                if (res.success) {
                    navigate("/", { replace: true });
                }
            })
            .finally(() => {
                if (!cancelled) setChecking(false);
            });
        return () => {
            cancelled = true;
        };
    }, [navigate]);

    const handleLogin = async (credentials: { username: string; password: string }) => {
        setError(null);
        if (!credentials.username.trim() || !credentials.password) {
            setError("请输入学号和密码");
            return;
        }

        setLoading(true);
        try {
            const res = await authApi.login({
                studentId: credentials.username.trim(),
                password: credentials.password,
            });
            if (res.success && res.data) {
                sessionStorage.setItem("student_login_success", "1");
                await refreshUser();
                await refreshNotifications();
                navigate("/", { replace: true });
            } else {
                setError(res.error?.message || "登录失败，请检查账号密码");
            }
        } catch (err) {
            setError("网络错误，请稍后重试");
        } finally {
            setLoading(false);
        }
    };

    if (checking) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <StudentLoginPage
            onLogin={handleLogin}
            loading={loading}
            error={error}
        />
    );
}
