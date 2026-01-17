/**
 * 助教 Repository
 */

import type { Assistant, Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import type { PaginationParams, PaginatedResult } from '../lib/types'

export class AssistantRepository {
  /**
   * 创建助教
   */
  async create(data: Prisma.AssistantCreateInput): Promise<Assistant> {
    return prisma.assistant.create({ data })
  }

  /**
   * 根据账号查找
   */
  async findByAccount(account: string): Promise<Assistant | null> {
    return prisma.assistant.findUnique({
      where: { account },
    })
  }

  /**
   * 根据 ID 查找
   */
  async findById(id: bigint): Promise<Assistant | null> {
    return prisma.assistant.findUnique({
      where: { id },
    })
  }

  /**
   * 根据 ID 查找（包含关联数据）
   */
  async findByIdWithRelations(id: bigint) {
    return prisma.assistant.findUnique({
      where: { id },
      include: {
        creatorTeacher: true,
        assistantClasses: {
          include: {
            class: {
              include: {
                semester: true,
                _count: { select: { students: true } },
              },
            },
          },
        },
      },
    })
  }

  /**
   * 查找教师创建的所有助教
   */
  async findByTeacherId(teacherId: bigint): Promise<Assistant[]> {
    return prisma.assistant.findMany({
      where: { creatorTeacherId: teacherId },
      orderBy: { createdAt: 'desc' },
    })
  }

  /**
   * 分页查询（按教师）
   */
  async findManyPaginatedByTeacher(
    teacherId: bigint,
    pagination: PaginationParams
  ): Promise<PaginatedResult<Assistant>> {
    const where = { creatorTeacherId: teacherId }
    const total = await prisma.assistant.count({ where })
    const page = Math.max(1, pagination.page || 1)
    const pageSize = Math.min(100, Math.max(1, pagination.pageSize || 20))
    const totalPages = Math.ceil(total / pageSize)

    const data = await prisma.assistant.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { assistantClasses: true } },
      },
    })

    return { data, total, page, pageSize, totalPages }
  }

  /**
   * 更新助教
   */
  async update(
    id: bigint,
    data: Prisma.AssistantUpdateInput
  ): Promise<Assistant> {
    return prisma.assistant.update({
      where: { id },
      data,
    })
  }

  /**
   * 更新密码
   */
  async updatePassword(
    id: bigint,
    hashedPassword: string,
    isFirstLogin: boolean = false
  ): Promise<Assistant> {
    return prisma.assistant.update({
      where: { id },
      data: {
        password: hashedPassword,
        isFirstLogin,
      },
    })
  }

  /**
   * 停用/启用助教
   */
  async setStatus(id: bigint, status: number): Promise<Assistant> {
    return prisma.assistant.update({
      where: { id },
      data: { status },
    })
  }

  /**
   * 绑定班级
   */
  async bindClasses(id: bigint, classIds: bigint[]): Promise<void> {
    // 先删除现有绑定
    await prisma.assistantClass.deleteMany({
      where: { assistantId: id },
    })

    // 创建新绑定
    if (classIds.length > 0) {
      await prisma.assistantClass.createMany({
        data: classIds.map((classId) => ({
          assistantId: id,
          classId,
        })),
      })
    }
  }

  /**
   * 获取助教绑定的班级 ID 列表
   */
  async getBoundClassIds(id: bigint): Promise<bigint[]> {
    const bindings = await prisma.assistantClass.findMany({
      where: { assistantId: id },
      select: { classId: true },
    })
    return bindings.map((b) => b.classId)
  }

  /**
   * 删除助教（软删除 - 通过停用实现）
   */
  async softDelete(id: bigint): Promise<Assistant> {
    return this.setStatus(id, 0)
  }

  /**
   * 硬删除助教
   */
  async delete(id: bigint): Promise<Assistant> {
    return prisma.assistant.delete({
      where: { id },
    })
  }

  /**
   * 记录登录失败
   */
  async recordLoginFailure(id: bigint): Promise<Assistant> {
    const assistant = await this.findById(id)
    if (!assistant) throw new Error('Assistant not found')

    const newFailCount = assistant.loginFailCount + 1
    const maxFailCount = 5
    const lockDurationMinutes = 30

    return prisma.assistant.update({
      where: { id },
      data: {
        loginFailCount: newFailCount,
        lockedUntil:
          newFailCount >= maxFailCount
            ? new Date(Date.now() + lockDurationMinutes * 60 * 1000)
            : undefined,
      },
    })
  }

  /**
   * 清除登录失败记录
   */
  async clearLoginFailure(id: bigint): Promise<Assistant> {
    return prisma.assistant.update({
      where: { id },
      data: {
        loginFailCount: 0,
        lockedUntil: null,
      },
    })
  }

  /**
   * 解锁账号
   */
  async unlock(id: bigint): Promise<Assistant> {
    return prisma.assistant.update({
      where: { id },
      data: {
        loginFailCount: 0,
        lockedUntil: null,
      },
    })
  }

  /**
   * 统计数量
   */
  async count(where?: Prisma.AssistantWhereInput): Promise<number> {
    return prisma.assistant.count({ where })
  }
}

export const assistantRepository = new AssistantRepository()
