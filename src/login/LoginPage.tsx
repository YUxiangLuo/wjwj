import { useState } from "react";
import "./login.css";

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

    // Simulate login delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Redirect based on role (prototype behavior)
    if (role === "admin") {
      window.location.href = "/admin";
    } else {
      // TODO: Implement login API for other roles
      console.log("Login attempt:", { role, account, password });
      setIsLoading(false);
    }
  };

  return (
    <div className="login-bg min-h-screen flex items-center justify-center p-4">
      <div className="glass-card rounded-2xl p-8 w-full max-w-md relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            抽样统计虚拟仿真系统
          </h1>
          <p className="text-gray-500 text-sm">Sampling Statistics Simulation</p>
        </div>

        {/* Role Tabs */}
        <div className="flex rounded-lg bg-gray-100 p-1 mb-6">
          {(Object.keys(roleLabels) as UserRole[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all duration-200 ${role === r
                ? "bg-white text-gray-800 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
                }`}
            >
              {roleLabels[r]}
            </button>
          ))}
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              账号
            </label>
            <input
              type="text"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder={rolePlaceholders[role]}
              className="input-focus w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-800 placeholder:text-gray-400 transition-all duration-200"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              密码
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              className="input-focus w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-800 placeholder:text-gray-400 transition-all duration-200"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="btn-gradient w-full py-2.5 px-4 rounded-lg text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "登录中..." : "登 录"}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-gray-400 text-xs mt-6">
          忘记密码？请联系{role === "student" ? "班级教师" : "系统管理员"}重置
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
