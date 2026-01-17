/**
 * 通用类型定义
 */

// 用户类型枚举
export enum UserType {
  ADMIN = 1,
  TEACHER = 2,
  ASSISTANT = 3,
  STUDENT = 4,
}

// 实验阶段枚举
export enum ExperimentStage {
  NOT_STARTED = 0,
  QUESTIONNAIRE = 1,
  SAMPLE_PLAN = 2,
  SAMPLING = 3,
  REPORT = 4,
}

// 实验状态枚举
export enum ExperimentStatus {
  IN_PROGRESS = 0,
  SUBMITTED = 1,
  GRADED = 2,
  REJECTED = 3,
}

// 提交状态枚举
export enum SubmissionStatus {
  DRAFT = 0,
  PENDING = 1,
  APPROVED = 2,
  REJECTED = 3,
}

// 课题状态枚举
export enum TopicStatus {
  DRAFT = 0,
  PUBLISHED = 1,
}

// 题目类型枚举
export enum QuestionType {
  TRUE_FALSE = 1,
  SINGLE_CHOICE = 2,
  MULTIPLE_CHOICE = 3,
  SATISFACTION_SCALE = 4,
}

// 分页参数
export interface PaginationParams {
  page?: number
  pageSize?: number
}

// 分页结果
export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// 排序参数
export interface SortParams {
  field: string
  order: 'asc' | 'desc'
}
