import type {
    Class,
    Student,
    Topic,
    Task,
    Submission,
    Assistant,
    Announcement,
    DashboardStats,
    RecentActivity,
    GradeRecord,
} from '@/types'

export const mockClasses: Class[] = [
    { id: 1, name: '统计101-A班', semesterName: '2024-Spring', studentCount: 45 },
    { id: 2, name: '统计101-B班', semesterName: '2024-Spring', studentCount: 42 },
    { id: 3, name: '统计102-A班', semesterName: '2024-Spring', studentCount: 38 },
]

export const mockStudents: Student[] = [
    { id: 1, studentId: '2024010001', name: '王小明', status: 1, lastLogin: '2024-03-15 10:20', createdAt: '2024-02-01' },
    { id: 2, studentId: '2024010002', name: '李华', status: 1, lastLogin: '2024-03-14 09:15', createdAt: '2024-02-01' },
    { id: 3, studentId: '2024010003', name: '张伟', status: 0, lastLogin: '2024-02-20 14:30', createdAt: '2024-02-01' },
    { id: 4, studentId: '2024010004', name: '刘芳', status: 1, lastLogin: '2024-03-15 11:45', createdAt: '2024-02-01' },
    { id: 5, studentId: '2024010005', name: '陈静', status: 1, lastLogin: 'Never', createdAt: '2024-02-15' },
]

export const mockTopics: Topic[] = [
    {
        id: 1,
        name: '消费者行为调查',
        description: '本课题旨在研究大学生的消费行为和消费观念...',
        status: 1,
        dataRowCount: 10000,
        attachmentCount: 3,
        createdAt: '2024-03-01',
    },
    {
        id: 2,
        name: '市场调研方法',
        description: '探索不同市场调研方法的有效性...',
        status: 0,
        dataRowCount: 0,
        attachmentCount: 0,
        createdAt: '2024-03-10',
    },
    {
        id: 3,
        name: '社会媒体使用习惯',
        description: '调查大学生社交媒体使用习惯与时间分配...',
        status: 1,
        dataRowCount: 8500,
        attachmentCount: 2,
        createdAt: '2024-02-15',
    },
]

export const mockTasks: Task[] = [
    {
        id: 1,
        topicId: 1,
        topicName: '消费者行为调查',
        classId: 1,
        className: '统计101-A班',
        openTime: '2024-03-01 08:00',
        deadline: '2024-03-31 23:59',
        totalStudents: 45,
        completedStudents: 32,
        pendingGrading: 8,
    },
    {
        id: 2,
        topicId: 1,
        topicName: '消费者行为调查',
        classId: 2,
        className: '统计101-B班',
        openTime: '2024-03-01 08:00',
        deadline: '2024-03-31 23:59',
        totalStudents: 42,
        completedStudents: 28,
        pendingGrading: 5,
    },
    {
        id: 3,
        topicId: 3,
        topicName: '社会媒体使用习惯',
        classId: 3,
        className: '统计102-A班',
        openTime: '2024-03-05 08:00',
        deadline: '2024-04-05 23:59',
        totalStudents: 38,
        completedStudents: 15,
        pendingGrading: 3,
    },
]

export const mockSubmissions: Submission[] = [
    {
        id: 1,
        studentId: '2024010001',
        studentName: '王小明',
        className: '统计101-A班',
        topicName: '消费者行为调查',
        status: 1,
        submittedAt: '2024-03-15 14:30',
        machineScore: 85,
    },
    {
        id: 2,
        studentId: '2024010002',
        studentName: '李华',
        className: '统计101-A班',
        topicName: '消费者行为调查',
        status: 0,
        submittedAt: '2024-03-14 10:20',
        machineScore: 78,
        questionnaireScore: 80,
        processScore: 75,
    },
    {
        id: 3,
        studentId: '2024010004',
        studentName: '刘芳',
        className: '统计101-A班',
        topicName: '消费者行为调查',
        status: 2,
        submittedAt: '2024-03-13 16:45',
        machineScore: 90,
        questionnaireScore: 88,
        processScore: 92,
        reportScore: 85,
        totalScore: 88,
        comment: '整体完成度高，报告撰写清晰。',
    },
    {
        id: 4,
        studentId: '2024010005',
        studentName: '陈静',
        className: '统计101-A班',
        topicName: '消费者行为调查',
        status: 3,
        submittedAt: '2024-03-12 09:30',
        comment: '报告格式不符合要求，请按照模板重新提交。',
    },
    {
        id: 5,
        studentId: '2024010006',
        studentName: '赵强',
        className: '统计101-B班',
        topicName: '消费者行为调查',
        status: 1,
        submittedAt: '2024-03-15 11:20',
        machineScore: 82,
    },
]

export const mockAssistants: Assistant[] = [
    {
        id: 1,
        account: 'ta_wang',
        name: '王芳',
        status: 1,
        classNames: ['统计101-A班', '统计101-B班'],
        createdAt: '2024-02-01',
    },
    {
        id: 2,
        account: 'ta_li',
        name: '李华',
        status: 0,
        classNames: ['统计102-A班'],
        createdAt: '2024-02-15',
    },
]

export const mockAnnouncements: Announcement[] = [
    {
        id: 1,
        title: '系统将于本周日进行维护',
        content: '系统将于本周日凌晨2:00-6:00进行维护升级，届时将暂停服务。',
        createdAt: '2024-03-15 09:00',
        isRead: false,
    },
    {
        id: 2,
        title: '新功能上线：批改草稿功能',
        content: '现在您可以保存批改草稿，稍后继续完成批改工作。',
        createdAt: '2024-03-10 14:00',
        isRead: true,
    },
]

export const mockDashboardStats: DashboardStats = {
    classCount: 3,
    topicCount: 3,
    pendingGrading: 16,
    activeTasks: 3,
}

export const mockRecentActivities: RecentActivity[] = [
    { id: 1, type: 'submission', studentName: '王小明', topicName: '消费者行为调查', time: '10分钟前' },
    { id: 2, type: 'submission', studentName: '赵强', topicName: '消费者行为调查', time: '30分钟前' },
    { id: 3, type: 'grading', studentName: '刘芳', topicName: '消费者行为调查', time: '1小时前' },
    { id: 4, type: 'submission', studentName: '李明', topicName: '社会媒体使用习惯', time: '2小时前' },
    { id: 5, type: 'grading', studentName: '张伟', topicName: '消费者行为调查', time: '3小时前' },
]

export const mockGradeRecords: GradeRecord[] = [
    {
        studentId: '2024010001',
        studentName: '王小明',
        topicName: '消费者行为调查',
        questionnaireScore: 85,
        processScore: 88,
        reportScore: 82,
        totalScore: 85,
        status: '已批改',
        submittedAt: '2024-03-15',
    },
    {
        studentId: '2024010002',
        studentName: '李华',
        topicName: '消费者行为调查',
        questionnaireScore: 90,
        processScore: 85,
        reportScore: 88,
        totalScore: 87,
        status: '已批改',
        submittedAt: '2024-03-14',
    },
    {
        studentId: '2024010004',
        studentName: '刘芳',
        topicName: '消费者行为调查',
        questionnaireScore: 88,
        processScore: 92,
        reportScore: 85,
        totalScore: 88,
        status: '已批改',
        submittedAt: '2024-03-13',
    },
]
