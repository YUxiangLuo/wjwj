/**
 * 提交记录 Repository
 */

import type { Submission, Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import type { PaginationParams, PaginatedResult } from '../lib/types'

export class SubmissionRepository {
  /**
   * 创建提交记录
   */
  async create(data: Prisma.SubmissionCreateInput): Promise<Submission> {
    return prisma.submission.create({ data })
  }

  /**
   * 根据 ID 查找
   */
  async findById(id: bigint): Promise<Submission | null> {
    return prisma.submission.findUnique({
      where: { id },
    })
  }

  /**
   * 根据 ID 查找（包含关联数据）
   */
  async findByIdWithRelations(id: bigint) {
    return prisma.submission.findUnique({
      where: { id },
      include: {
        experiment: {
          include: {
            student: true,
            task: {
              include: {
                topic: true,
                class: true,
              },
            },
          },
        },
      },
    })
  }

  /**
   * 查找实验的所有提交记录
   */
  async findByExperimentId(experimentId: bigint): Promise<Submission[]> {
    return prisma.submission.findMany({
      where: { experimentId },
      orderBy: { submittedAt: 'desc' },
    })
  }

  /**
   * 查找实验的最新提交
   */
  async findLatestByExperimentId(
    experimentId: bigint
  ): Promise<Submission | null> {
    return prisma.submission.findFirst({
      where: { experimentId },
      orderBy: { submittedAt: 'desc' },
    })
  }

  /**
   * 分页查询实验的提交历史
   */
  async findManyPaginatedByExperiment(
    experimentId: bigint,
    pagination: PaginationParams
  ): Promise<PaginatedResult<Submission>> {
    const where: Prisma.SubmissionWhereInput = { experimentId }

    const total = await prisma.submission.count({ where })
    const page = Math.max(1, pagination.page || 1)
    const pageSize = Math.min(100, Math.max(1, pagination.pageSize || 20))
    const totalPages = Math.ceil(total / pageSize)

    const data = await prisma.submission.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { submittedAt: 'desc' },
    })

    return { data, total, page, pageSize, totalPages }
  }

  /**
   * 创建新提交（完整流程）
   */
  async createSubmission(
    experimentId: bigint,
    stage1Data: Record<string, unknown>,
    stage2Data: Record<string, unknown>,
    stage3Data: Record<string, unknown>,
    stage4Data: Record<string, unknown>,
    pdfPath?: string
  ): Promise<Submission> {
    return prisma.$transaction(async (tx) => {
      // 创建提交记录
      const submission = await tx.submission.create({
        data: {
          experiment: { connect: { id: experimentId } },
          stage1Data: stage1Data as Prisma.JsonValue,
          stage2Data: stage2Data as Prisma.JsonValue,
          stage3Data: stage3Data as Prisma.JsonValue,
          stage4Data: stage4Data as Prisma.JsonValue,
          pdfPath,
        },
      })

      // 更新实验状态为已提交
      await tx.experiment.update({
        where: { id: experimentId },
        data: {
          status: 1, // SUBMITTED
          submittedAt: new Date(),
        },
      })

      return submission
    })
  }

  /**
   * 批改提交
   */
  async grade(
    id: bigint,
    score: number,
    feedback: string | null,
    gradedBy: bigint
  ): Promise<Submission> {
    return prisma.$transaction(async (tx) => {
      // 更新提交记录
      const submission = await tx.submission.update({
        where: { id },
        data: {
          score,
          feedback,
          gradedAt: new Date(),
          gradedBy,
        },
      })

      // 更新实验状态为已批改
      await tx.experiment.update({
        where: { id: submission.experimentId },
        data: {
          status: 2, // GRADED
          score,
          feedback,
          gradedAt: new Date(),
          gradedBy,
        },
      })

      return submission
    })
  }

  /**
   * 驳回提交
   */
  async reject(
    id: bigint,
    feedback: string,
    gradedBy: bigint
  ): Promise<Submission> {
    return prisma.$transaction(async (tx) => {
      // 更新提交记录
      const submission = await tx.submission.update({
        where: { id },
        data: {
          score: 0,
          feedback,
          gradedAt: new Date(),
          gradedBy,
        },
      })

      // 更新实验状态为驳回
      await tx.experiment.update({
        where: { id: submission.experimentId },
        data: {
          status: 3, // REJECTED
          feedback,
          gradedAt: new Date(),
          gradedBy,
        },
      })

      return submission
    })
  }

  /**
   * 统计提交次数
   */
  async countByExperiment(experimentId: bigint): Promise<number> {
    return prisma.submission.count({
      where: { experimentId },
    })
  }

  /**
   * 获取提交版本号
   */
  async getNextVersion(experimentId: bigint): Promise<number> {
    const count = await this.countByExperiment(experimentId)
    return count + 1
  }

  /**
   * 更新 PDF 路径
   */
  async updatePdfPath(id: bigint, pdfPath: string): Promise<Submission> {
    return prisma.submission.update({
      where: { id },
      data: { pdfPath },
    })
  }

  /**
   * 统计数量
   */
  async count(where?: Prisma.SubmissionWhereInput): Promise<number> {
    return prisma.submission.count({ where })
  }

  /**
   * 获取最近的提交记录（用于仪表盘）
   */
  async findRecent(limit: number = 10): Promise<Submission[]> {
    return prisma.submission.findMany({
      take: limit,
      orderBy: { submittedAt: 'desc' },
      include: {
        experiment: {
          include: {
            student: true,
            task: {
              include: {
                topic: true,
                class: true,
              },
            },
          },
        },
      },
    })
  }

  /**
   * 获取待批改的提交列表
   */
  async findPendingGrading(
    teacherId: bigint,
    pagination: PaginationParams
  ): Promise<PaginatedResult<Submission>> {
    const where: Prisma.SubmissionWhereInput = {
      gradedAt: null,
      experiment: {
        status: 1, // SUBMITTED
        task: {
          topic: { teacherId },
        },
      },
    }

    const total = await prisma.submission.count({ where })
    const page = Math.max(1, pagination.page || 1)
    const pageSize = Math.min(100, Math.max(1, pagination.pageSize || 20))
    const totalPages = Math.ceil(total / pageSize)

    const data = await prisma.submission.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { submittedAt: 'asc' },
      include: {
        experiment: {
          include: {
            student: true,
            task: {
              include: {
                topic: true,
                class: true,
              },
            },
          },
        },
      },
    })

    return { data, total, page, pageSize, totalPages }
  }
}

export const submissionRepository = new SubmissionRepository()
