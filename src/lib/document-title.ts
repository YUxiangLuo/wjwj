const SYSTEM_NAME = "抽样统计虚拟仿真系统";

function title(page: string, area: string) {
    return `${page} - ${SYSTEM_NAME} - ${area}`;
}

export function getStudentDocumentTitle(pathname: string) {
    if (pathname === "/login") return title("学生登录", "学生端");
    if (pathname === "/profile") return title("个人信息", "学生端");
    if (/^\/task\/[^/]+\/experiment\/?$/.test(pathname)) return title("实验过程", "学生端");
    if (/^\/task\/[^/]+\/preview\/?$/.test(pathname)) return title("提交预览", "学生端");
    if (/^\/task\/[^/]+\/result\/?$/.test(pathname)) return title("实验结果", "学生端");
    if (/^\/task\/[^/]+\/?$/.test(pathname)) return title("课题详情", "学生端");
    return title("任务大厅", "学生端");
}

export function getTeacherDocumentTitle(pathname: string) {
    if (pathname === "/login") return title("教师登录", "教师端");
    if (/^\/class\/[^/]+\/students\/?$/.test(pathname)) return title("班级学生", "教师端");
    if (/^\/task\/[^/]+\/progress\/?$/.test(pathname)) return title("任务进度", "教师端");
    if (/^\/grading\/[^/]+\/?$/.test(pathname)) return title("批改详情", "教师端");
    if (pathname.startsWith("/class")) return title("班级管理", "教师端");
    if (pathname.startsWith("/topic")) return title("课题管理", "教师端");
    if (pathname.startsWith("/task")) return title("任务管理", "教师端");
    if (pathname.startsWith("/grading")) return title("作业批改", "教师端");
    if (pathname.startsWith("/export")) return title("成绩导出", "教师端");
    return title("教学概览", "教师端");
}

export function getAdminDocumentTitle(pathname: string) {
    if (pathname === "/login") return title("管理员登录", "管理后台");
    if (pathname.startsWith("/semester")) return title("学期管理", "管理后台");
    if (pathname.startsWith("/teacher")) return title("教师管理", "管理后台");
    if (pathname.startsWith("/class")) return title("班级管理", "管理后台");
    if (pathname.startsWith("/student")) return title("学生管理", "管理后台");
    if (pathname.startsWith("/announcement")) return title("公告管理", "管理后台");
    return title("首页概览", "管理后台");
}
