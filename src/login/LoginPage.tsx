import { useState } from "react";
import "../../styles/globals.css";

type UserRole = "student" | "teacher" | "assistant" | "admin";

const roleLabels: Record<UserRole, string> = {
  student: "学生",
  teacher: "教师",
  assistant: "助教",
  admin: "管理员",
};

const rolePlaceholders: Record<UserRole, string> = {
  student: "请输入学号",
  teacher: "请输入工号",
  assistant: "请输入助教账号",
  admin: "请输入管理员账号",
};

export function LoginPage() {
  const [role, setRole] = useState<UserRole>("student");
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    await new Promise(resolve => setTimeout(resolve, 500));

    if (role === "admin") {
      window.location.href = "/admin";
    } else {
      console.log("Login attempt:", { role, account, password });
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-teal-600 to-slate-700 relative overflow-hidden">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }} />
      </div>

      {/* Login Card */}
      <div className="bg-white/95 backdrop-blur-xl rounded-2xl p-8 w-full max-w-md relative z-10 shadow-2xl border border-white/30">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">
            抽样统计虚拟仿真系统
          </h1>
          <p className="text-slate-500 text-sm">Sampling Statistics Simulation</p>
        </div>

        {/* Role Tabs */}
        <div className="flex rounded-lg bg-slate-100 p-1 mb-6">
          {(Object.keys(roleLabels) as UserRole[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all duration-200 ${role === r
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
                }`}
            >
              {roleLabels[r]}
            </button>
          ))}
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              账号
            </label>
            <input
              type="text"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder={rolePlaceholders[role]}
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-slate-800 placeholder:text-slate-400 transition-all duration-200 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              密码
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-slate-800 placeholder:text-slate-400 transition-all duration-200 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 px-4 rounded-lg text-white font-medium bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          >
            {isLoading ? "登录中..." : "登 录"}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-slate-400 text-xs mt-6">
          忘记密码？请联系{role === "student" ? "班级教师" : "系统管理员"}重置
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
