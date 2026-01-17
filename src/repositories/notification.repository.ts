/**
 * 通知 Repository
 */

import type { Notification, Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import type { PaginationParams, PaginatedResult } from '../lib/types'
import { UserType } from '../lib/types'

export class NotificationRepository {
  /**
   * 创建通知
   */
  async create(data: Prisma.NotificationCreateInput): Promise<Notification> {
    return prisma.notification.create({ data })
  }

  /**
   * 批量创建通知（群发）
   */
  async createMany(
    notifications: Prisma.NotificationCreateManyInput[]
  ): Promise<{ count: number }> {
    return prisma.notification.createMany({
      data: notifications,
    })
  }

  /**
   * 根据 ID 查找
   */
  async findById(id: bigint): Promise<Notification | null> {
    return prisma.notification.findUnique({
      where: { id },
    })
  }

  /**
   * 查找用户的通知
   */
  async findByUser(
    userType: UserType,
    userId: bigint,
    pagination: PaginationParams,
    unreadOnly: boolean = false
  ): Promise<PaginatedResult<Notification>> {
    const where: Prisma.NotificationWhereInput = {
      userType,
      userId,
      ...(unreadOnly ? { isRead: false } : {}),
    }

    const total = await prisma.notification.count({ where })
    const page = Math.max(1, pagination.page || 1)
    const pageSize = Math.min(100, Math.max(1, pagination.pageSize || 20))
    const totalPages = Math.ceil(total / pageSize)

    const data = await prisma.notification.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    })

    return { data, total, page, pageSize, totalPages }
  }

  /**
   * 获取未读通知数量
   */
  async countUnread(userType: UserType, userId: bigint): Promise<number> {
    return prisma.notification.count({
      where: {
        userType,
        userId,
        isRead: false,
      },
    })
  }

  /**
   * 标记为已读
   */
  async markAsRead(id: bigint): Promise<Notification> {
    return prisma.notification.update({
      where: { id },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    })
  }

  /**
   * 批量标记为已读
   */
  async markManyAsRead(
    userType: UserType,
    userId: bigint,
    ids?: bigint[]
  ): Promise<{ count: number }> {
    const where: Prisma.NotificationWhereInput = {
      userType,
      userId,
      isRead: false,
      ...(ids ? { id: { in: ids } } : {}),
    }

    return prisma.notification.updateMany({
      where,
      data: {
        isRead: true,
        readAt: new Date(),
      },
    })
  }

  /**
   * 全部标记为已读
   */
  async markAllAsRead(
    userType: UserType,
    userId: bigint
  ): Promise<{ count: number }> {
    return prisma.notification.updateMany({
      where: {
        userType,
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    })
  }

  /**
   * 删除通知
   */
  async delete(id: bigint): Promise<Notification> {
    return prisma.notification.delete({
      where: { id },
    })
  }

  /**
   * 批量删除通知
   */
  async deleteMany(
    userType: UserType,
    userId: bigint,
    ids?: bigint[]
  ): Promise<{ count: number }> {
    const where: Prisma.NotificationWhereInput = {
      userType,
      userId,
      ...(ids ? { id: { in: ids } } : {}),
    }

    return prisma.notification.deleteMany({ where })
  }

  /**
   * 清理过期通知
   */
  async cleanupExpired(daysToKeep: number = 30): Promise<{ count: number }> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)

    return prisma.notification.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
        isRead: true,
      },
    })
  }

  /**
   * 发送系统通知（给所有用户）
   */
  async sendSystemNotification(
    title: string,
    content: string,
    userTypes: UserType[] = [
      UserType.ADMIN,
      UserType.TEACHER,
      UserType.ASSISTANT,
      UserType.STUDENT,
    ]
  ): Promise<{ count: number }> {
    const notifications: Prisma.NotificationCreateManyInput[] = []

    for (const userType of userTypes) {
      let users: { id: bigint }[] = []

      switch (userType) {
        case UserType.ADMIN:
          users = await prisma.admin.findMany({
            where: { deletedAt: null },
            select: { id: true },
          })
          break
        case UserType.TEACHER:
          users = await prisma.teacher.findMany({
            where: { deletedAt: null, status: 1 },
            select: { id: true },
          })
          break
        case UserType.ASSISTANT:
          users = await prisma.assistant.findMany({
            where: { deletedAt: null, status: 1 },
            select: { id: true },
          })
          break
        case UserType.STUDENT:
          users = await prisma.student.findMany({
            where: { deletedAt: null, status: 1 },
            select: { id: true },
          })
          break
      }

      for (const user of users) {
        notifications.push({
          userType,
          userId: user.id,
          title,
          content,
          type: 'system',
        })
      }
    }

    return this.createMany(notifications)
  }

  /**
   * 发送任务通知（给班级学生）
   */
  async sendTaskNotification(
    classId: bigint,
    title: string,
    content: string
  ): Promise<{ count: number }> {
    const students = await prisma.student.findMany({
      where: {
        classId,
        deletedAt: null,
        status: 1,
      },
      select: { id: true },
    })

    const notifications: Prisma.NotificationCreateManyInput[] = students.map(
      (student) => ({
        userType: UserType.STUDENT,
        userId: student.id,
        title,
        content,
        type: 'task',
      })
    )

    return this.createMany(notifications)
  }

  /**
   * 统计数量
   */
  async count(where?: Prisma.NotificationWhereInput): Promise<number> {
    return prisma.notification.count({ where })
  }
}

export const notificationRepository = new NotificationRepository()
