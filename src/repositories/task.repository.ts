/**
 * 任务 Repository
 */

import type { Task, Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import type { PaginationParams, PaginatedResult } from '../lib/types'

export class TaskRepository {
  /**
   * 创建任务
   */
  async create(data: Prisma.TaskCreateInput): Promise<Task> {
    return prisma.task.create({ data })
  }

  /**
   * 批量创建任务（发布到多个班级）
   */
  async createMany(
    topicId: bigint,
    classIds: bigint[],
    openTime?: Date,
    deadline?: Date
  ): Promise<{ count: number }> {
    return prisma.task.createMany({
      data: classIds.map((classId) => ({
        topicId,
        classId,
        openTime,
        deadline,
      })),
      skipDuplicates: true,
    })
  }

  /**
   * 根据 ID 查找
   */
  async findById(id: bigint): Promise<Task | null> {
    return prisma.task.findUnique({
      where: { id, deletedAt: null },
    })
  }

  /**
   * 根据 ID 查找（包含关联数据）
   */
  async findByIdWithRelations(id: bigint) {
    return prisma.task.findUnique({
      where: { id, deletedAt: null },
      include: {
        topic: {
          include: { teacher: true },
        },
        class: {
          include: { semester: true },
        },
      },
    })
  }

  /**
   * 根据课题和班级查找
   */
  async findByTopicAndClass(
    topicId: bigint,
    classId: bigint
  ): Promise<Task | null> {
    return prisma.task.findUnique({
      where: {
        topicId_classId: { topicId, classId },
        deletedAt: null,
      },
    })
  }

  /**
   * 查找课题的所有任务
   */
  async findByTopicId(topicId: bigint): Promise<Task[]> {
    return prisma.task.findMany({
      where: { topicId, deletedAt: null },
      include: {
        class: {
          include: {
            semester: true,
            _count: {
              select: {
                students: { where: { deletedAt: null, status: 1 } },
              },
            },
          },
        },
      },
    })
  }

  /**
   * 查找班级的所有任务
   */
  async findByClassId(classId: bigint): Promise<Task[]> {
    return prisma.task.findMany({
      where: { classId, deletedAt: null },
      include: {
        topic: true,
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  /**
   * 查找教师的所有任务
   */
  async findByTeacherId(teacherId: bigint) {
    return prisma.task.findMany({
      where: {
        deletedAt: null,
        topic: { teacherId, deletedAt: null },
      },
      include: {
        topic: true,
        class: {
          include: { semester: true },
        },
        _count: {
          select: { experiments: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  /**
   * 查找学生可见的任务（当前学期、已开放、班级匹配）
   */
  async findVisibleForStudent(studentId: bigint, classId: bigint) {
    const now = new Date()

    return prisma.task.findMany({
      where: {
        classId,
        deletedAt: null,
        topic: { deletedAt: null, status: 1 },
        OR: [{ openTime: null }, { openTime: { lte: now } }],
      },
      include: {
        topic: true,
        experiments: {
          where: { studentId },
          include: {
            submissions: {
              orderBy: { submittedAt: 'desc' },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  /**
   * 分页查询
   */
  async findManyPaginated(
    where: Prisma.TaskWhereInput | undefined,
    pagination: PaginationParams
  ): Promise<PaginatedResult<Task>> {
    const baseWhere = { ...where, deletedAt: null }
    const total = await prisma.task.count({ where: baseWhere })
    const page = Math.max(1, pagination.page || 1)
    const pageSize = Math.min(100, Math.max(1, pagination.pageSize || 20))
    const totalPages = Math.ceil(total / pageSize)

    const data = await prisma.task.findMany({
      where: baseWhere,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        topic: true,
        class: true,
      },
    })

    return { data, total, page, pageSize, totalPages }
  }

  /**
   * 更新任务
   */
  async update(id: bigint, data: Prisma.TaskUpdateInput): Promise<Task> {
    return prisma.task.update({
      where: { id },
      data,
    })
  }

  /**
   * 延长截止时间
   */
  async extendDeadline(id: bigint, newDeadline: Date): Promise<Task> {
    return prisma.task.update({
      where: { id },
      data: { deadline: newDeadline },
    })
  }

  /**
   * 软删除任务
   */
  async softDelete(id: bigint): Promise<Task> {
    return prisma.task.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
  }

  /**
   * 获取任务进度统计
   */
  async getProgressStats(id: bigint) {
    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        class: {
          include: {
            students: {
              where: { deletedAt: null, status: 1 },
              select: { id: true },
            },
          },
        },
        experiments: {
          select: {
            id: true,
            status: true,
            currentStage: true,
          },
        },
      },
    })

    if (!task) {
      throw new Error('任务不存在')
    }

    const totalStudents = task.class.students.length
    const experiments = task.experiments

    return {
      totalStudents,
      notStarted: totalStudents - experiments.length,
      stage1: experiments.filter((e) => e.currentStage === 1 && e.status === 0).length,
      stage2: experiments.filter((e) => e.currentStage === 2 && e.status === 0).length,
      stage3: experiments.filter((e) => e.currentStage === 3 && e.status === 0).length,
      stage4: experiments.filter((e) => e.currentStage === 4 && e.status === 0).length,
      submitted: experiments.filter((e) => e.status === 1).length,
      graded: experiments.filter((e) => e.status === 2).length,
      rejected: experiments.filter((e) => e.status === 3).length,
    }
  }

  /**
   * 获取任务的学生进度列表
   */
  async getStudentProgress(id: bigint) {
    return prisma.student.findMany({
      where: {
        class: {
          tasks: { some: { id } },
        },
        deletedAt: null,
        status: 1,
      },
      include: {
        experiments: {
          where: { taskId: id },
          include: {
            submissions: {
              orderBy: { submittedAt: 'desc' },
              take: 1,
            },
          },
        },
      },
      orderBy: { studentId: 'asc' },
    })
  }

  /**
   * 统计数量
   */
  async count(where?: Prisma.TaskWhereInput): Promise<number> {
    return prisma.task.count({
      where: { ...where, deletedAt: null },
    })
  }

  /**
   * 检查任务是否已截止
   */
  async isExpired(id: bigint): Promise<boolean> {
    const task = await this.findById(id)
    if (!task || !task.deadline) {
      return false
    }
    return task.deadline < new Date()
  }
}

export const taskRepository = new TaskRepository()
