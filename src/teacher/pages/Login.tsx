import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { authApi } from "../api-client";
import { UnifiedLogin } from "@/components/UnifiedLogin";

export function Login() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [checking, setChecking] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        authApi
            .me()
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
            setError("请输入工号和密码");
            return;
        }

        setLoading(true);
        try {
            const res = await authApi.login({
                employeeId: credentials.username.trim(),
                password: credentials.password,
            });
            if (res.success) {
                sessionStorage.setItem("teacher_login_success", "1");
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
            role="teacher"
            onLogin={handleLogin}
            loading={loading}
            error={error}
        />
    );
}

export default Login;
