import { useState } from "react";
import { Loader2, Lock, HelpCircle, BarChart3, LineChart, PieChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface UnifiedLoginProps {
  role: "student" | "teacher" | "admin";
  onLogin: (credentials: { username: string; password: string }) => Promise<void>;
  loading?: boolean;
  error?: string | null;
}

export function UnifiedLogin({ role, onLogin, loading = false, error }: UnifiedLoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (username && password) {
      await onLogin({ username, password });
    }
  };

  const currentTab = role === "admin" ? "admin" : role === "teacher" ? "teacher" : "student";

  const handleTabChange = (value: string) => {
    if (value === currentTab) return;
    
    // Redirect to the correct login page
    if (value === "student") window.location.href = "/student";
    if (value === "teacher") window.location.href = "/teacher";
    if (value === "admin") window.location.href = "/admin";
  };

  const getRoleLabel = () => {
    switch (role) {
      case "student": return "学号";
      case "teacher": return "工号";
      case "admin": return "用户名";
      default: return "账号";
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left Side: Hero / Branding */}
      <div className="hidden lg:flex flex-col justify-between bg-zinc-900 relative overflow-hidden p-10 text-white">
        {/* Background Visuals */}
        <div className="absolute inset-0 z-0">
           {/* Abstract Data Visualization Background */}
           <div className="absolute inset-0 bg-primary/90 z-10 mix-blend-multiply opacity-90" />
           <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=2670&auto=format&fit=crop')] bg-cover bg-center grayscale" />
        </div>

        <div className="relative z-20 flex items-center gap-2 text-lg font-medium">
          <div className="bg-white/20 p-1.5 rounded-lg backdrop-blur-sm">
             <BarChart3 className="w-5 h-5 text-white" />
          </div>
          Sampling Stats Sim
        </div>

        <div className="relative z-20 mt-auto max-w-md">
          <blockquote className="space-y-2">
            <h1 className="text-3xl font-bold leading-tight tracking-tight">
              探索数据背后的真相
            </h1>
            <p className="text-lg text-blue-100/90 font-light">
              通过虚拟仿真实验，深入理解抽样分布、参数估计与假设检验的核心原理。
            </p>
          </blockquote>
          
          <div className="mt-8 flex gap-4 opacity-50">
             <LineChart className="w-12 h-12" />
             <PieChart className="w-12 h-12" />
             <BarChart3 className="w-12 h-12" />
          </div>
        </div>
      </div>

      {/* Right Side: Login Form */}
      <div className="flex flex-col justify-center items-center p-8 bg-background">
        <div className="w-full max-w-sm space-y-8">
          <div className="flex flex-col space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">
              抽样统计虚拟仿真系统
            </h1>
            <p className="text-sm text-muted-foreground">
              请选择角色并登录系统
            </p>
          </div>

          <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="student">学生</TabsTrigger>
              <TabsTrigger value="teacher">教师</TabsTrigger>
              <TabsTrigger value="admin">管理员</TabsTrigger>
            </TabsList>
          </Tabs>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">{getRoleLabel()}</Label>
                <Input
                  id="username"
                  placeholder={`请输入${getRoleLabel()}`}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">密码</Label>
                  <a href="#" className="text-sm font-medium text-primary hover:text-primary/90">
                    忘记密码?
                  </a>
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="请输入密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="h-11"
                />
              </div>
            </div>

            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md border border-destructive/20 flex items-center gap-2">
                 <div className="w-1.5 h-1.5 rounded-full bg-destructive" />
                 {error}
              </div>
            )}

            <div className="space-y-4">
              <Button type="submit" className="w-full h-11 text-base shadow-lg shadow-primary/20" disabled={loading}>
                {loading ? (
                    <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        登录中...
                    </>
                ) : (
                    <>
                        登录系统
                    </>
                )}
              </Button>
            </div>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                需要帮助?
              </span>
            </div>
          </div>

          <div className="flex justify-center gap-6 text-sm text-muted-foreground">
             <a href="#" className="flex items-center gap-1 hover:text-foreground">
                <HelpCircle className="w-4 h-4" />
                使用指南
             </a>
             <a href="#" className="flex items-center gap-1 hover:text-foreground">
                <Lock className="w-4 h-4" />
                隐私政策
             </a>
          </div>
        </div>
      </div>
    </div>
  );
}
