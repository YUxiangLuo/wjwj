import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { authApi } from "../api-client";
import { useStudent } from "../contexts/StudentContext";
import { UnifiedLogin } from "@/components/UnifiedLogin";

export function Login() {
    const navigate = useNavigate();
    const { refreshUser } = useStudent();
    const [loading, setLoading] = useState(false);
    const [checking, setChecking] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setChecking(false);
    }, []);

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
            if (res.success) {
                sessionStorage.setItem("student_login_success", "1");
                await refreshUser();
                navigate("/", { replace: true });
            } else {
                setError(res.error?.message ?? "登录失败");
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "登录失败");
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
        <UnifiedLogin 
            role="student"
            onLogin={handleLogin}
            loading={loading}
            error={error}
        />
    );
}

export default Login;
