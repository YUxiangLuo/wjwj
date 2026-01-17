/**
 * 实验 Repository
 */

import type { Experiment, Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import type { PaginationParams, PaginatedResult } from '../lib/types'
import { ExperimentStatus, ExperimentStage } from '../lib/types'

export class ExperimentRepository {
  /**
   * 创建实验记录
   */
  async create(data: Prisma.ExperimentCreateInput): Promise<Experiment> {
    return prisma.experiment.create({ data })
  }

  /**
   * 根据 ID 查找
   */
  async findById(id: bigint): Promise<Experiment | null> {
    return prisma.experiment.findUnique({
      where: { id },
    })
  }

  /**
   * 根据 ID 查找（包含关联数据）
   */
  async findByIdWithRelations(id: bigint) {
    return prisma.experiment.findUnique({
      where: { id },
      include: {
        student: true,
        task: {
          include: {
            topic: {
              include: {
                attachments: true,
                recommendQuestions: { orderBy: { sortOrder: 'asc' } },
              },
            },
            class: true,
          },
        },
        submissions: {
          orderBy: { submittedAt: 'desc' },
        },
      },
    })
  }

  /**
   * 根据任务和学生查找
   */
  async findByTaskAndStudent(
    taskId: bigint,
    studentId: bigint
  ): Promise<Experiment | null> {
    return prisma.experiment.findUnique({
      where: {
        taskId_studentId: { taskId, studentId },
      },
    })
  }

  /**
   * 根据任务和学生查找（包含关联数据）
   */
  async findByTaskAndStudentWithRelations(taskId: bigint, studentId: bigint) {
    return prisma.experiment.findUnique({
      where: {
        taskId_studentId: { taskId, studentId },
      },
      include: {
        student: true,
        task: {
          include: {
            topic: {
              include: {
                attachments: true,
                recommendQuestions: { orderBy: { sortOrder: 'asc' } },
              },
            },
          },
        },
        submissions: {
          orderBy: { submittedAt: 'desc' },
        },
      },
    })
  }

  /**
   * 查找或创建实验记录
   */
  async findOrCreate(taskId: bigint, studentId: bigint): Promise<Experiment> {
    const existing = await this.findByTaskAndStudent(taskId, studentId)
    if (existing) {
      return existing
    }

    return prisma.experiment.create({
      data: {
        task: { connect: { id: taskId } },
        student: { connect: { id: studentId } },
        status: ExperimentStatus.IN_PROGRESS,
        currentStage: ExperimentStage.QUESTIONNAIRE,
      },
    })
  }

  /**
   * 查找学生的所有实验
   */
  async findByStudentId(studentId: bigint): Promise<Experiment[]> {
    return prisma.experiment.findMany({
      where: { studentId },
      include: {
        task: {
          include: {
            topic: true,
            class: true,
          },
        },
        submissions: {
          orderBy: { submittedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  /**
   * 查找任务的所有实验
   */
  async findByTaskId(taskId: bigint): Promise<Experiment[]> {
    return prisma.experiment.findMany({
      where: { taskId },
      include: {
        student: true,
        submissions: {
          orderBy: { submittedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  /**
   * 分页查询任务的实验
   */
  async findManyPaginatedByTask(
    taskId: bigint,
    status: ExperimentStatus | undefined,
    pagination: PaginationParams
  ): Promise<PaginatedResult<Experiment>> {
    const where: Prisma.ExperimentWhereInput = {
      taskId,
      ...(status !== undefined ? { status } : {}),
    }

    const total = await prisma.experiment.count({ where })
    const page = Math.max(1, pagination.page || 1)
    const pageSize = Math.min(100, Math.max(1, pagination.pageSize || 20))
    const totalPages = Math.ceil(total / pageSize)

    const data = await prisma.experiment.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        student: true,
        submissions: {
          orderBy: { submittedAt: 'desc' },
          take: 1,
        },
      },
    })

    return { data, total, page, pageSize, totalPages }
  }

  /**
   * 更新实验
   */
  async update(
    id: bigint,
    data: Prisma.ExperimentUpdateInput
  ): Promise<Experiment> {
    return prisma.experiment.update({
      where: { id },
      data,
    })
  }

  /**
   * 保存阶段数据
   */
  async saveStageData(
    id: bigint,
    stage: ExperimentStage,
    stageData: Record<string, unknown>
  ): Promise<Experiment> {
    const fieldMap: Record<ExperimentStage, string> = {
      [ExperimentStage.QUESTIONNAIRE]: 'stage1Data',
      [ExperimentStage.SAMPLE_PLAN]: 'stage2Data',
      [ExperimentStage.SAMPLING]: 'stage3Data',
      [ExperimentStage.ANALYSIS]: 'stage4Data',
    }

    const field = fieldMap[stage]
    if (!field) {
      throw new Error('无效的阶段')
    }

    return prisma.experiment.update({
      where: { id },
      data: {
        [field]: stageData as Prisma.JsonValue,
        lastSavedAt: new Date(),
      },
    })
  }

  /**
   * 推进到下一阶段
   */
  async advanceStage(id: bigint): Promise<Experiment> {
    const experiment = await this.findById(id)
    if (!experiment) {
      throw new Error('实验记录不存在')
    }

    const nextStage = experiment.currentStage + 1
    if (nextStage > ExperimentStage.ANALYSIS) {
      throw new Error('已经是最后阶段')
    }

    return prisma.experiment.update({
      where: { id },
      data: { currentStage: nextStage },
    })
  }

  /**
   * 提交实验
   */
  async submit(id: bigint): Promise<Experiment> {
    return prisma.experiment.update({
      where: { id },
      data: {
        status: ExperimentStatus.SUBMITTED,
        submittedAt: new Date(),
      },
    })
  }

  /**
   * 批改实验
   */
  async grade(
    id: bigint,
    score: number,
    feedback: string | null,
    gradedBy: bigint
  ): Promise<Experiment> {
    return prisma.experiment.update({
      where: { id },
      data: {
        status: ExperimentStatus.GRADED,
        score,
        feedback,
        gradedAt: new Date(),
        gradedBy,
      },
    })
  }

  /**
   * 驳回实验
   */
  async reject(
    id: bigint,
    feedback: string,
    gradedBy: bigint
  ): Promise<Experiment> {
    return prisma.experiment.update({
      where: { id },
      data: {
        status: ExperimentStatus.REJECTED,
        feedback,
        gradedAt: new Date(),
        gradedBy,
      },
    })
  }

  /**
   * 重置实验（驳回后重新开始）
   */
  async reset(id: bigint, stage?: ExperimentStage): Promise<Experiment> {
    return prisma.experiment.update({
      where: { id },
      data: {
        status: ExperimentStatus.IN_PROGRESS,
        currentStage: stage ?? ExperimentStage.QUESTIONNAIRE,
        submittedAt: null,
      },
    })
  }

  /**
   * 统计数量
   */
  async count(where?: Prisma.ExperimentWhereInput): Promise<number> {
    return prisma.experiment.count({ where })
  }

  /**
   * 按状态统计
   */
  async countByStatus(taskId: bigint): Promise<Record<string, number>> {
    const [inProgress, submitted, graded, rejected] = await Promise.all([
      prisma.experiment.count({
        where: { taskId, status: ExperimentStatus.IN_PROGRESS },
      }),
      prisma.experiment.count({
        where: { taskId, status: ExperimentStatus.SUBMITTED },
      }),
      prisma.experiment.count({
        where: { taskId, status: ExperimentStatus.GRADED },
      }),
      prisma.experiment.count({
        where: { taskId, status: ExperimentStatus.REJECTED },
      }),
    ])

    return { inProgress, submitted, graded, rejected }
  }

  /**
   * 获取待批改的实验列表
   */
  async findPendingGrading(
    teacherId: bigint,
    pagination: PaginationParams
  ): Promise<PaginatedResult<Experiment>> {
    const where: Prisma.ExperimentWhereInput = {
      status: ExperimentStatus.SUBMITTED,
      task: {
        topic: { teacherId },
      },
    }

    const total = await prisma.experiment.count({ where })
    const page = Math.max(1, pagination.page || 1)
    const pageSize = Math.min(100, Math.max(1, pagination.pageSize || 20))
    const totalPages = Math.ceil(total / pageSize)

    const data = await prisma.experiment.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { submittedAt: 'asc' },
      include: {
        student: true,
        task: {
          include: {
            topic: true,
            class: true,
          },
        },
      },
    })

    return { data, total, page, pageSize, totalPages }
  }

  /**
   * 获取成绩统计
   */
  async getScoreStats(taskId: bigint) {
    const experiments = await prisma.experiment.findMany({
      where: {
        taskId,
        status: ExperimentStatus.GRADED,
        score: { not: null },
      },
      select: { score: true },
    })

    if (experiments.length === 0) {
      return {
        count: 0,
        average: 0,
        max: 0,
        min: 0,
        distribution: {},
      }
    }

    const scores = experiments.map((e) => e.score!)
    const sum = scores.reduce((a, b) => a + b, 0)

    // 分数段分布
    const distribution: Record<string, number> = {
      '90-100': 0,
      '80-89': 0,
      '70-79': 0,
      '60-69': 0,
      '0-59': 0,
    }

    for (const score of scores) {
      if (score >= 90) distribution['90-100']++
      else if (score >= 80) distribution['80-89']++
      else if (score >= 70) distribution['70-79']++
      else if (score >= 60) distribution['60-69']++
      else distribution['0-59']++
    }

    return {
      count: scores.length,
      average: Math.round((sum / scores.length) * 100) / 100,
      max: Math.max(...scores),
      min: Math.min(...scores),
      distribution,
    }
  }
}

export const experimentRepository = new ExperimentRepository()
