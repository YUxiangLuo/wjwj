/**
 * Teacher API Client
 * 教师端 前端 API 调用工具
 */

// ============================================================
// Types
// ============================================================

export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
    };
}

export interface TeacherStats {
    stats: {
        label: string;
        value: number;
    }[];
    recentSubmissions: {
        student: string;
        class: string;
        topic: string;
        time: string;
    }[];
}

export interface TeacherClass {
    id: number;
    name: string;
    semester: string | null;
    studentCount: number;
    createdAt: string;
}

export interface Topic {
    id: number;
    name: string;
    description: string | null;
    status: number; // 0=draft, 1=published
    dataRows: number;
    createdAt: string;
}

export interface Task {
    id: number;
    topic: string; // name
    className: string; // name
    publishedAt: string | null;
    deadline: string | null;
    total: number;
    completed: number;
}

export interface GradingItem {
    id: number;
    studentName: string;
    studentId: string;
    topic: string;
    className: string;
    submittedAt: string;
    status: number; // 0=draft, 1=pending, 2=graded, 3=rejected
    score: number | null;
}

export interface SubmissionDetail extends GradingItem {
    topicDesc: string;
    reportContent: string;
    samplePlan: any;
    questionnaire: any;
    scoreQuestionnaire: number | null;
    scoreProcess: number | null;
    scoreReport: number | null;
    totalScore: number | null;
    teacherComment: string | null;
    gradedAt: string | null;
}

export interface Student {
    id: number;
    studentId: string;
    name: string;
    email: string | null;
    status: number; // 1=active, 0=disabled
    lastLogin: string | null;
}

export interface Assistant {
    id: number;
    name: string;
    studentId: string; // account
    email: string;
    assignedClasses: string[]; // names
    assignedClassIds: number[];
}

// ============================================================
// API Client
// ============================================================

async function request<T>(
    url: string,
    options?: RequestInit
): Promise<ApiResponse<T>> {
    try {
        const res = await fetch(url, {
            headers: {
                "Content-Type": "application/json",
                ...options?.headers,
            },
            ...options,
        });

        const data = await res.json();
        return data as ApiResponse<T>;
    } catch (error) {
        return {
            success: false,
            error: {
                code: "NETWORK_ERROR",
                message: error instanceof Error ? error.message : "网络请求失败",
            },
        };
    }
}

export const teacherApi = {
    // Dashboard
    getStats: () => request<TeacherStats>("/api/teacher/dashboard"),

    // Classes
    getClasses: () => request<TeacherClass[]>("/api/teacher/classes"),

    // Topics
    getTopics: () => request<Topic[]>("/api/teacher/topics"),
    createTopic: (data: { name: string; description?: string }) =>
        request<{ id: number }>("/api/teacher/topics", {
            method: "POST",
            body: JSON.stringify(data)
        }),
    updateTopic: (id: number, data: { name?: string; description?: string; status?: number }) =>
        request<{ success: boolean }>(`/api/teacher/topics/${id}`, {
            method: "PUT",
            body: JSON.stringify(data)
        }),
    deleteTopic: (id: number) =>
        request<{ success: boolean }>(`/api/teacher/topics/${id}`, {
            method: "DELETE"
        }),

    // Tasks
    getTasks: () => request<Task[]>("/api/teacher/tasks"),
    createTask: (data: { topicId: number; classIds: number[]; deadline?: string }) =>
        request<{ success: boolean }>("/api/teacher/tasks", {
            method: "POST",
            body: JSON.stringify(data)
        }),

    // Grading
    getGradingList: (status?: string) =>
        request<GradingItem[]>(`/api/teacher/grading${status ? `?status=${status}` : ""}`),

    getSubmissionDetail: (id: number) =>
        request<SubmissionDetail>(`/api/teacher/grading/${id}`),

    submitGrade: (id: number, data: {
        scoreQuestionnaire: number;
        scoreProcess: number;
        scoreReport: number;
        totalScore: number;
        comment: string;
        status: number;
    }) => request<{ success: boolean }>(`/api/teacher/grading/${id}`, {
        method: "POST",
        body: JSON.stringify(data)
    }),

    // Student Management
    getStudents: (classId: number) =>
        request<Student[]>(`/api/teacher/classes/${classId}/students`),

    addStudent: (classId: number, data: { studentId: string; name: string; email?: string }) =>
        request<{ success: boolean }>(`/api/teacher/classes/${classId}/students`, {
            method: "POST",
            body: JSON.stringify(data)
        }),

    updateStudent: (studentId: number, data: { action: "reset_password" | "toggle_status" }) =>
        request<{ success: boolean }>(`/api/teacher/students/${studentId}`, {
            method: "PUT",
            body: JSON.stringify(data)
        }),

    deleteStudent: (studentId: number) =>
        request<{ success: boolean }>(`/api/teacher/students/${studentId}`, {
            method: "DELETE"
        }),

    // Assistant Management
    getAssistants: () => request<Assistant[]>("/api/teacher/assistants"),

    createAssistant: (data: { name: string; studentId: string }) =>
        request<{ success: boolean }>("/api/teacher/assistants", {
            method: "POST",
            body: JSON.stringify(data)
        }),

    deleteAssistant: (id: number) =>
        request<{ success: boolean }>(`/api/teacher/assistants/${id}`, {
            method: "DELETE"
        }),

    assignClasses: (id: number, classIds: number[]) =>
        request<{ success: boolean }>(`/api/teacher/assistants/${id}/classes`, {
            method: "POST",
            body: JSON.stringify({ classIds })
        }),
};
