/**
 * 课题 Repository
 */

import type { Topic, TopicAttachment, TopicRecommendQuestion, Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import type { PaginationParams, PaginatedResult } from '../lib/types'
import { TopicStatus } from '../lib/types'

export class TopicRepository {
  /**
   * 创建课题
   */
  async create(data: Prisma.TopicCreateInput): Promise<Topic> {
    return prisma.topic.create({ data })
  }

  /**
   * 根据 ID 查找
   */
  async findById(id: bigint): Promise<Topic | null> {
    return prisma.topic.findUnique({
      where: { id, deletedAt: null },
    })
  }

  /**
   * 根据 ID 查找（包含关联数据）
   */
  async findByIdWithRelations(id: bigint) {
    return prisma.topic.findUnique({
      where: { id, deletedAt: null },
      include: {
        teacher: true,
        attachments: true,
        recommendQuestions: {
          orderBy: { sortOrder: 'asc' },
        },
        _count: {
          select: {
            tasks: { where: { deletedAt: null } },
          },
        },
      },
    })
  }

  /**
   * 查找教师的所有课题
   */
  async findByTeacherId(
    teacherId: bigint,
    status?: TopicStatus
  ): Promise<Topic[]> {
    return prisma.topic.findMany({
      where: {
        teacherId,
        deletedAt: null,
        ...(status !== undefined ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            attachments: true,
            recommendQuestions: true,
            tasks: { where: { deletedAt: null } },
          },
        },
      },
    })
  }

  /**
   * 分页查询（按教师）
   */
  async findManyPaginatedByTeacher(
    teacherId: bigint,
    status: TopicStatus | undefined,
    pagination: PaginationParams
  ): Promise<PaginatedResult<Topic>> {
    const where: Prisma.TopicWhereInput = {
      teacherId,
      deletedAt: null,
      ...(status !== undefined ? { status } : {}),
    }

    const total = await prisma.topic.count({ where })
    const page = Math.max(1, pagination.page || 1)
    const pageSize = Math.min(100, Math.max(1, pagination.pageSize || 20))
    const totalPages = Math.ceil(total / pageSize)

    const data = await prisma.topic.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            attachments: true,
            tasks: { where: { deletedAt: null } },
          },
        },
      },
    })

    return { data, total, page, pageSize, totalPages }
  }

  /**
   * 更新课题
   */
  async update(id: bigint, data: Prisma.TopicUpdateInput): Promise<Topic> {
    return prisma.topic.update({
      where: { id },
      data,
    })
  }

  /**
   * 发布课题
   */
  async publish(id: bigint): Promise<Topic> {
    return prisma.topic.update({
      where: { id },
      data: { status: TopicStatus.PUBLISHED },
    })
  }

  /**
   * 复制课题
   */
  async duplicate(id: bigint, newName: string): Promise<Topic> {
    const original = await this.findByIdWithRelations(id)
    if (!original) {
      throw new Error('课题不存在')
    }

    return prisma.$transaction(async (tx) => {
      // 创建课题副本
      const newTopic = await tx.topic.create({
        data: {
          teacherId: original.teacherId,
          name: newName,
          description: original.description,
          excelFilePath: original.excelFilePath,
          excelRowCount: original.excelRowCount,
          fieldMapping: original.fieldMapping as Prisma.JsonValue,
          weightConfig: original.weightConfig as Prisma.JsonValue,
          status: TopicStatus.DRAFT,
        },
      })

      // 复制推荐题目
      if (original.recommendQuestions.length > 0) {
        await tx.topicRecommendQuestion.createMany({
          data: original.recommendQuestions.map((q) => ({
            topicId: newTopic.id,
            questionType: q.questionType,
            content: q.content,
            options: q.options as Prisma.JsonValue,
            sortOrder: q.sortOrder,
          })),
        })
      }

      return newTopic
    })
  }

  /**
   * 软删除课题
   */
  async softDelete(id: bigint): Promise<Topic> {
    return prisma.topic.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isDeleted: true,
      },
    })
  }

  /**
   * 获取编辑锁定状态
   */
  async getLockStatus(
    id: bigint
  ): Promise<{ isLocked: boolean; lockedBy: bigint | null; lockedAt: Date | null }> {
    const topic = await prisma.topic.findUnique({
      where: { id },
      select: { lockedBy: true, lockedAt: true },
    })

    if (!topic) {
      throw new Error('课题不存在')
    }

    const lockTimeoutMinutes = 30 // TODO: 从配置读取
    const isLocked =
      topic.lockedAt !== null &&
      new Date().getTime() - topic.lockedAt.getTime() <
        lockTimeoutMinutes * 60 * 1000

    return {
      isLocked,
      lockedBy: isLocked ? topic.lockedBy : null,
      lockedAt: isLocked ? topic.lockedAt : null,
    }
  }

  /**
   * 获取编辑锁
   */
  async acquireLock(id: bigint, teacherId: bigint): Promise<boolean> {
    const { isLocked, lockedBy } = await this.getLockStatus(id)

    if (isLocked && lockedBy !== teacherId) {
      return false
    }

    await prisma.topic.update({
      where: { id },
      data: {
        lockedBy: teacherId,
        lockedAt: new Date(),
      },
    })

    return true
  }

  /**
   * 释放编辑锁
   */
  async releaseLock(id: bigint, teacherId: bigint): Promise<void> {
    await prisma.topic.updateMany({
      where: {
        id,
        lockedBy: teacherId,
      },
      data: {
        lockedBy: null,
        lockedAt: null,
      },
    })
  }

  /**
   * 统计数量
   */
  async count(where?: Prisma.TopicWhereInput): Promise<number> {
    return prisma.topic.count({
      where: { ...where, deletedAt: null },
    })
  }

  // ========== 附件操作 ==========

  /**
   * 添加附件
   */
  async addAttachment(
    topicId: bigint,
    data: Omit<Prisma.TopicAttachmentCreateInput, 'topic'>
  ): Promise<TopicAttachment> {
    return prisma.topicAttachment.create({
      data: {
        ...data,
        topic: { connect: { id: topicId } },
      },
    })
  }

  /**
   * 删除附件
   */
  async removeAttachment(attachmentId: bigint): Promise<TopicAttachment> {
    return prisma.topicAttachment.delete({
      where: { id: attachmentId },
    })
  }

  /**
   * 获取课题的所有附件
   */
  async getAttachments(topicId: bigint): Promise<TopicAttachment[]> {
    return prisma.topicAttachment.findMany({
      where: { topicId },
      orderBy: { createdAt: 'asc' },
    })
  }

  // ========== 推荐题目操作 ==========

  /**
   * 添加推荐题目
   */
  async addRecommendQuestion(
    topicId: bigint,
    data: Omit<Prisma.TopicRecommendQuestionCreateInput, 'topic'>
  ): Promise<TopicRecommendQuestion> {
    return prisma.topicRecommendQuestion.create({
      data: {
        ...data,
        topic: { connect: { id: topicId } },
      },
    })
  }

  /**
   * 更新推荐题目
   */
  async updateRecommendQuestion(
    questionId: bigint,
    data: Prisma.TopicRecommendQuestionUpdateInput
  ): Promise<TopicRecommendQuestion> {
    return prisma.topicRecommendQuestion.update({
      where: { id: questionId },
      data,
    })
  }

  /**
   * 删除推荐题目
   */
  async removeRecommendQuestion(
    questionId: bigint
  ): Promise<TopicRecommendQuestion> {
    return prisma.topicRecommendQuestion.delete({
      where: { id: questionId },
    })
  }

  /**
   * 获取课题的所有推荐题目
   */
  async getRecommendQuestions(
    topicId: bigint
  ): Promise<TopicRecommendQuestion[]> {
    return prisma.topicRecommendQuestion.findMany({
      where: { topicId },
      orderBy: { sortOrder: 'asc' },
    })
  }

  /**
   * 批量更新推荐题目排序
   */
  async reorderRecommendQuestions(
    updates: { id: bigint; sortOrder: number }[]
  ): Promise<void> {
    await prisma.$transaction(
      updates.map((u) =>
        prisma.topicRecommendQuestion.update({
          where: { id: u.id },
          data: { sortOrder: u.sortOrder },
        })
      )
    )
  }
}

export const topicRepository = new TopicRepository()
