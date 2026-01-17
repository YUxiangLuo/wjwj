/**
 * 教师 Repository
 */

import type { Teacher, Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import type { PaginationParams, PaginatedResult } from '../lib/types'

export class TeacherRepository {
  /**
   * 创建教师
   */
  async create(data: Prisma.TeacherCreateInput): Promise<Teacher> {
    return prisma.teacher.create({ data })
  }

  /**
   * 根据工号查找
   */
  async findByEmployeeId(employeeId: string): Promise<Teacher | null> {
    return prisma.teacher.findUnique({
      where: { employeeId },
    })
  }

  /**
   * 根据 ID 查找
   */
  async findById(id: bigint): Promise<Teacher | null> {
    return prisma.teacher.findUnique({
      where: { id },
    })
  }

  /**
   * 根据 ID 查找（包含关联数据）
   */
  async findByIdWithRelations(id: bigint) {
    return prisma.teacher.findUnique({
      where: { id },
      include: {
        classes: {
          include: {
            semester: true,
            _count: { select: { students: true } },
          },
        },
        topics: {
          where: { deletedAt: null },
        },
        assistants: true,
      },
    })
  }

  /**
   * 查找所有教师
   */
  async findMany(where?: Prisma.TeacherWhereInput): Promise<Teacher[]> {
    return prisma.teacher.findMany({
      where: { ...where, status: 1 },
      orderBy: { createdAt: 'desc' },
    })
  }

  /**
   * 分页查询
   */
  async findManyPaginated(
    where: Prisma.TeacherWhereInput | undefined,
    pagination: PaginationParams
  ): Promise<PaginatedResult<Teacher>> {
    const total = await prisma.teacher.count({ where })
    const page = Math.max(1, pagination.page || 1)
    const pageSize = Math.min(100, Math.max(1, pagination.pageSize || 20))
    const totalPages = Math.ceil(total / pageSize)

    const data = await prisma.teacher.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    })

    return { data, total, page, pageSize, totalPages }
  }

  /**
   * 更新教师
   */
  async update(id: bigint, data: Prisma.TeacherUpdateInput): Promise<Teacher> {
    return prisma.teacher.update({
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
  ): Promise<Teacher> {
    return prisma.teacher.update({
      where: { id },
      data: {
        password: hashedPassword,
        isFirstLogin,
      },
    })
  }

  /**
   * 停用/启用教师
   */
  async setStatus(id: bigint, status: number): Promise<Teacher> {
    return prisma.teacher.update({
      where: { id },
      data: { status },
    })
  }

  /**
   * 记录登录失败
   */
  async recordLoginFailure(id: bigint): Promise<Teacher> {
    const teacher = await this.findById(id)
    if (!teacher) throw new Error('Teacher not found')

    const newFailCount = teacher.loginFailCount + 1
    const maxFailCount = 5
    const lockDurationMinutes = 30

    return prisma.teacher.update({
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
  async clearLoginFailure(id: bigint): Promise<Teacher> {
    return prisma.teacher.update({
      where: { id },
      data: {
        loginFailCount: 0,
        lockedUntil: null,
      },
    })
  }

  /**
   * 检查账号是否被锁定
   */
  async isLocked(id: bigint): Promise<boolean> {
    const teacher = await this.findById(id)
    if (!teacher) return false

    return teacher.lockedUntil !== null && teacher.lockedUntil > new Date()
  }

  /**
   * 解锁账号
   */
  async unlock(id: bigint): Promise<Teacher> {
    return prisma.teacher.update({
      where: { id },
      data: {
        loginFailCount: 0,
        lockedUntil: null,
      },
    })
  }

  /**
   * 统计教师数量
   */
  async count(where?: Prisma.TeacherWhereInput): Promise<number> {
    return prisma.teacher.count({ where })
  }
}

export const teacherRepository = new TeacherRepository()
