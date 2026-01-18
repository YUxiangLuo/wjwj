import { Bell, LogOut, ArrowLeft } from "lucide-react";
import { Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TaskHall } from "./pages/TaskHall";
import { TopicDetails } from "./pages/TopicDetails";
import { ExperimentLayout } from "./pages/ExperimentLayout";
import "./student.css";

export function StudentApp() {
    const location = useLocation();
    const isTaskHall = location.pathname === "/";

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <header className="bg-white border-b sticky top-0 z-50">
                <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        {!isTaskHall && (
                            <Link to="/">
                                <Button variant="ghost" size="icon">
                                    <ArrowLeft className="w-5 h-5" />
                                </Button>
                            </Link>
                        )}
                        <div>
                            <h1 className="text-xl font-semibold text-slate-800">抽样统计虚拟仿真系统</h1>
                            <p className="text-sm text-muted-foreground">学生端</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" className="relative">
                            <Bell className="w-5 h-5" />
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center">
                                2
                            </span>
                        </Button>
                        <div className="flex items-center gap-2">
                            <Avatar className="w-8 h-8">
                                <AvatarFallback className="bg-primary/10 text-primary text-sm">张</AvatarFallback>
                            </Avatar>
                            <span className="text-sm font-medium">张明</span>
                        </div>
                        <Button variant="ghost" size="icon">
                            <LogOut className="w-5 h-5" />
                        </Button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-6xl mx-auto px-6 py-8">
                {/* Welcome Section - only on task hall */}
                {isTaskHall && (
                    <div className="mb-8">
                        <h2 className="text-2xl font-bold text-slate-800">你好，张明</h2>
                        <p className="text-muted-foreground mt-1">欢迎回来，继续你的实验之旅吧</p>
                    </div>
                )}

                <Routes>
                    <Route index element={<TaskHall />} />
                    <Route path="task/:taskId" element={<TopicDetails />} />
                    <Route path="task/:taskId/experiment" element={<ExperimentLayout />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </main>
        </div>
    );
}

export default StudentApp;
