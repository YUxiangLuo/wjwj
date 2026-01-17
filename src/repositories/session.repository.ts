/**
 * 用户会话 Repository
 */

import type { UserSession, Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { UserType } from '../lib/types'
import { randomBytes } from 'crypto'

export class SessionRepository {
  /**
   * 创建会话
   */
  async create(data: Prisma.UserSessionCreateInput): Promise<UserSession> {
    return prisma.userSession.create({ data })
  }

  /**
   * 根据 Token 查找
   */
  async findByToken(token: string): Promise<UserSession | null> {
    return prisma.userSession.findUnique({
      where: { token },
    })
  }

  /**
   * 根据 Token 查找有效会话
   */
  async findValidByToken(token: string): Promise<UserSession | null> {
    return prisma.userSession.findFirst({
      where: {
        token,
        expiresAt: { gt: new Date() },
      },
    })
  }

  /**
   * 查找用户的所有会话
   */
  async findByUser(userType: UserType, userId: bigint): Promise<UserSession[]> {
    return prisma.userSession.findMany({
      where: { userType, userId },
      orderBy: { createdAt: 'desc' },
    })
  }

  /**
   * 查找用户的活跃会话
   */
  async findActiveByUser(
    userType: UserType,
    userId: bigint
  ): Promise<UserSession[]> {
    return prisma.userSession.findMany({
      where: {
        userType,
        userId,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastActiveAt: 'desc' },
    })
  }

  /**
   * 创建新会话
   */
  async createSession(
    userType: UserType,
    userId: bigint,
    ipAddress?: string,
    userAgent?: string,
    expiresInHours: number = 24
  ): Promise<UserSession> {
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + expiresInHours)

    return prisma.userSession.create({
      data: {
        userType,
        userId,
        token,
        ipAddress,
        userAgent,
        expiresAt,
      },
    })
  }

  /**
   * 更新最后活跃时间
   */
  async updateLastActive(token: string): Promise<UserSession> {
    return prisma.userSession.update({
      where: { token },
      data: { lastActiveAt: new Date() },
    })
  }

  /**
   * 延长会话有效期
   */
  async extend(token: string, hours: number = 24): Promise<UserSession> {
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + hours)

    return prisma.userSession.update({
      where: { token },
      data: {
        expiresAt,
        lastActiveAt: new Date(),
      },
    })
  }

  /**
   * 删除会话（登出）
   */
  async delete(token: string): Promise<UserSession> {
    return prisma.userSession.delete({
      where: { token },
    })
  }

  /**
   * 删除用户的所有会话（强制登出）
   */
  async deleteAllByUser(
    userType: UserType,
    userId: bigint
  ): Promise<{ count: number }> {
    return prisma.userSession.deleteMany({
      where: { userType, userId },
    })
  }

  /**
   * 删除用户的其他会话（保留当前会话）
   */
  async deleteOthersByUser(
    userType: UserType,
    userId: bigint,
    currentToken: string
  ): Promise<{ count: number }> {
    return prisma.userSession.deleteMany({
      where: {
        userType,
        userId,
        token: { not: currentToken },
      },
    })
  }

  /**
   * 清理过期会话
   */
  async cleanupExpired(): Promise<{ count: number }> {
    return prisma.userSession.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    })
  }

  /**
   * 统计用户活跃会话数
   */
  async countActiveByUser(userType: UserType, userId: bigint): Promise<number> {
    return prisma.userSession.count({
      where: {
        userType,
        userId,
        expiresAt: { gt: new Date() },
      },
    })
  }

  /**
   * 检查是否超过最大会话数
   */
  async checkSessionLimit(
    userType: UserType,
    userId: bigint,
    maxSessions: number = 5
  ): Promise<boolean> {
    const count = await this.countActiveByUser(userType, userId)
    return count >= maxSessions
  }

  /**
   * 删除最旧的会话（保持在限制内）
   */
  async removeOldestSessions(
    userType: UserType,
    userId: bigint,
    keepCount: number = 5
  ): Promise<{ count: number }> {
    const sessions = await prisma.userSession.findMany({
      where: {
        userType,
        userId,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastActiveAt: 'desc' },
      skip: keepCount,
      select: { token: true },
    })

    if (sessions.length === 0) {
      return { count: 0 }
    }

    return prisma.userSession.deleteMany({
      where: {
        token: { in: sessions.map((s) => s.token) },
      },
    })
  }

  /**
   * 验证会话
   */
  async validate(
    token: string
  ): Promise<{ valid: boolean; session?: UserSession }> {
    const session = await this.findValidByToken(token)

    if (!session) {
      return { valid: false }
    }

    // 更新最后活跃时间
    await this.updateLastActive(token)

    return { valid: true, session }
  }

  /**
   * 统计数量
   */
  async count(where?: Prisma.UserSessionWhereInput): Promise<number> {
    return prisma.userSession.count({ where })
  }

  /**
   * 获取活跃会话统计
   */
  async getActiveStats(): Promise<Record<string, number>> {
    const now = new Date()

    const [admin, teacher, assistant, student] = await Promise.all([
      prisma.userSession.count({
        where: { userType: UserType.ADMIN, expiresAt: { gt: now } },
      }),
      prisma.userSession.count({
        where: { userType: UserType.TEACHER, expiresAt: { gt: now } },
      }),
      prisma.userSession.count({
        where: { userType: UserType.ASSISTANT, expiresAt: { gt: now } },
      }),
      prisma.userSession.count({
        where: { userType: UserType.STUDENT, expiresAt: { gt: now } },
      }),
    ])

    return {
      admin,
      teacher,
      assistant,
      student,
      total: admin + teacher + assistant + student,
    }
  }
}

export const sessionRepository = new SessionRepository()
