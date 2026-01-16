// 班级
export interface Class {
    id: number
    name: string
    semesterName: string
    studentCount: number
}

// 学生
export interface Student {
    id: number
    studentId: string
    name: string
    status: number // 1: active, 0: disabled
    lastLogin: string
    createdAt: string
}

// 课题
export interface Topic {
    id: number
    name: string
    description: string
    status: number // 0: draft, 1: published
    dataRowCount: number
    attachmentCount: number
    createdAt: string
}

// 任务
export interface Task {
    id: number
    topicId: number
    topicName: string
    classId: number
    className: string
    openTime: string | null
    deadline: string | null
    totalStudents: number
    completedStudents: number
    pendingGrading: number
}

// 提交/作业
export interface Submission {
    id: number
    studentId: string
    studentName: string
    className: string
    topicName: string
    status: number // 0: draft, 1: pending, 2: graded, 3: rejected
    submittedAt: string
    questionnairePdfUrl?: string
    reportPdfUrl?: string
    machineScore?: number
    questionnaireScore?: number
    processScore?: number
    reportScore?: number
    totalScore?: number
    comment?: string
}

// 助教
export interface Assistant {
    id: number
    account: string
    name: string
    status: number // 1: active, 0: disabled
    classNames: string[]
    createdAt: string
}

// 公告
export interface Announcement {
    id: number
    title: string
    content: string
    createdAt: string
    isRead: boolean
}

// 成绩记录
export interface GradeRecord {
    studentId: string
    studentName: string
    topicName: string
    questionnaireScore: number
    processScore: number
    reportScore: number
    totalScore: number
    status: string
    submittedAt: string
}

// 统计数据
export interface DashboardStats {
    classCount: number
    topicCount: number
    pendingGrading: number
    activeTasks: number
}

// 最近活动
export interface RecentActivity {
    id: number
    type: 'submission' | 'grading'
    studentName: string
    topicName: string
    time: string
}
