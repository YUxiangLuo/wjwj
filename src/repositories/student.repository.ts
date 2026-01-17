/**
 * 学生 Repository
 */

import type { Student, Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import type { PaginationParams, PaginatedResult } from '../lib/types'

export class StudentRepository {
  /**
   * 创建学生
   */
  async create(data: Prisma.StudentCreateInput): Promise<Student> {
    return prisma.student.create({ data })
  }

  /**
   * 批量创建学生
   */
  async createMany(
    data: Prisma.StudentCreateManyInput[]
  ): Promise<{ count: number }> {
    return prisma.student.createMany({
      data,
      skipDuplicates: true,
    })
  }

  /**
   * 根据学号查找
   */
  async findByStudentId(studentId: string): Promise<Student | null> {
    return prisma.student.findUnique({
      where: { studentId },
    })
  }

  /**
   * 根据 ID 查找
   */
  async findById(id: bigint): Promise<Student | null> {
    return prisma.student.findUnique({
      where: { id },
    })
  }

  /**
   * 根据 ID 查找（包含关联数据）
   */
  async findByIdWithRelations(id: bigint) {
    return prisma.student.findUnique({
      where: { id },
      include: {
        class: {
          include: {
            semester: true,
            teacher: true,
          },
        },
        experiments: {
          include: {
            task: {
              include: {
                topic: true,
              },
            },
            submissions: {
              orderBy: { submittedAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    })
  }

  /**
   * 查找班级的所有学生
   */
  async findByClassId(classId: bigint): Promise<Student[]> {
    return prisma.student.findMany({
      where: {
        classId,
        deletedAt: null,
        status: 1,
      },
      orderBy: { studentId: 'asc' },
    })
  }

  /**
   * 分页查询（按班级）
   */
  async findManyPaginatedByClass(
    classId: bigint,
    pagination: PaginationParams,
    includeDeleted: boolean = false
  ): Promise<PaginatedResult<Student>> {
    const where: Prisma.StudentWhereInput = {
      classId,
      ...(includeDeleted ? {} : { deletedAt: null }),
    }

    const total = await prisma.student.count({ where })
    const page = Math.max(1, pagination.page || 1)
    const pageSize = Math.min(100, Math.max(1, pagination.pageSize || 20))
    const totalPages = Math.ceil(total / pageSize)

    const data = await prisma.student.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { studentId: 'asc' },
    })

    return { data, total, page, pageSize, totalPages }
  }

  /**
   * 搜索学生（按学号或姓名）
   */
  async search(
    keyword: string,
    pagination: PaginationParams
  ): Promise<PaginatedResult<Student>> {
    const where: Prisma.StudentWhereInput = {
      deletedAt: null,
      OR: [
        { studentId: { contains: keyword } },
        { name: { contains: keyword } },
      ],
    }

    const total = await prisma.student.count({ where })
    const page = Math.max(1, pagination.page || 1)
    const pageSize = Math.min(100, Math.max(1, pagination.pageSize || 20))
    const totalPages = Math.ceil(total / pageSize)

    const data = await prisma.student.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { studentId: 'asc' },
      include: {
        class: {
          include: { semester: true },
        },
      },
    })

    return { data, total, page, pageSize, totalPages }
  }

  /**
   * 更新学生
   */
  async update(id: bigint, data: Prisma.StudentUpdateInput): Promise<Student> {
    return prisma.student.update({
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
  ): Promise<Student> {
    return prisma.student.update({
      where: { id },
      data: {
        password: hashedPassword,
        isFirstLogin,
      },
    })
  }

  /**
   * 停用/启用学生
   */
  async setStatus(id: bigint, status: number): Promise<Student> {
    return prisma.student.update({
      where: { id },
      data: { status },
    })
  }

  /**
   * 软删除学生
   */
  async softDelete(id: bigint): Promise<Student> {
    return prisma.student.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
  }

  /**
   * 恢复删除的学生
   */
  async restore(id: bigint): Promise<Student> {
    return prisma.student.update({
      where: { id },
      data: { deletedAt: null },
    })
  }

  /**
   * 转班
   */
  async transfer(
    id: bigint,
    fromClassId: bigint,
    toClassId: bigint,
    operatedBy: bigint,
    reason?: string
  ): Promise<Student> {
    return prisma.$transaction(async (tx) => {
      // 更新学生班级
      const student = await tx.student.update({
        where: { id },
        data: { classId: toClassId },
      })

      // 记录转班历史
      await tx.studentTransfer.create({
        data: {
          studentId: id,
          fromClassId,
          toClassId,
          operatedBy,
          reason,
        },
      })

      return student
    })
  }

  /**
   * 获取转班历史
   */
  async getTransferHistory(studentId: bigint) {
    return prisma.studentTransfer.findMany({
      where: { studentId },
      orderBy: { transferredAt: 'desc' },
      include: {
        fromClass: true,
        toClass: true,
        operator: true,
      },
    })
  }

  /**
   * 记录登录失败
   */
  async recordLoginFailure(id: bigint): Promise<Student> {
    const student = await this.findById(id)
    if (!student) throw new Error('Student not found')

    const newFailCount = student.loginFailCount + 1
    const maxFailCount = 5
    const lockDurationMinutes = 30

    return prisma.student.update({
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
  async clearLoginFailure(id: bigint): Promise<Student> {
    return prisma.student.update({
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
  async unlock(id: bigint): Promise<Student> {
    return prisma.student.update({
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
  async count(where?: Prisma.StudentWhereInput): Promise<number> {
    return prisma.student.count({ where })
  }

  /**
   * 统计班级学生数量
   */
  async countByClass(classId: bigint): Promise<number> {
    return prisma.student.count({
      where: {
        classId,
        deletedAt: null,
        status: 1,
      },
    })
  }
}

export const studentRepository = new StudentRepository()
