/**
 * Repository 统一导出
 */

// 用户域
export { AdminRepository, adminRepository } from './admin.repository'
export { TeacherRepository, teacherRepository } from './teacher.repository'
export { AssistantRepository, assistantRepository } from './assistant.repository'
export { StudentRepository, studentRepository } from './student.repository'

// 组织域
export { SemesterRepository, semesterRepository } from './semester.repository'
export { ClassRepository, classRepository } from './class.repository'

// 教学域
export { TopicRepository, topicRepository } from './topic.repository'
export { TaskRepository, taskRepository } from './task.repository'

// 实验域
export { ExperimentRepository, experimentRepository } from './experiment.repository'
export { SubmissionRepository, submissionRepository } from './submission.repository'

// 系统域
export { NotificationRepository, notificationRepository } from './notification.repository'
export { SessionRepository, sessionRepository } from './session.repository'
export { ConfigRepository, configRepository } from './config.repository'

// 类型和工具
export * from '../lib/types'
