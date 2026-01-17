/**
 * 班级 Repository
 */

import type { Class, Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import type { PaginationParams, PaginatedResult } from '../lib/types'

export class ClassRepository {
  /**
   * 创建班级
   */
  async create(data: Prisma.ClassCreateInput): Promise<Class> {
    return prisma.class.create({ data })
  }

  /**
   * 根据 ID 查找
   */
  async findById(id: bigint): Promise<Class | null> {
    return prisma.class.findUnique({
      where: { id },
    })
  }

  /**
   * 根据 ID 查找（包含关联数据）
   */
  async findByIdWithRelations(id: bigint) {
    return prisma.class.findUnique({
      where: { id },
      include: {
        semester: true,
        teacher: true,
        _count: {
          select: {
            students: { where: { deletedAt: null, status: 1 } },
            tasks: { where: { deletedAt: null } },
          },
        },
      },
    })
  }

  /**
   * 查找教师的所有班级
   */
  async findByTeacherId(teacherId: bigint): Promise<Class[]> {
    return prisma.class.findMany({
      where: { teacherId },
      orderBy: { createdAt: 'desc' },
      include: {
        semester: true,
        _count: {
          select: {
            students: { where: { deletedAt: null, status: 1 } },
          },
        },
      },
    })
  }

  /**
   * 查找学期的所有班级
   */
  async findBySemesterId(semesterId: bigint): Promise<Class[]> {
    return prisma.class.findMany({
      where: { semesterId },
      orderBy: { name: 'asc' },
      include: {
        teacher: true,
        _count: {
          select: {
            students: { where: { deletedAt: null, status: 1 } },
          },
        },
      },
    })
  }

  /**
   * 查找当前学期的所有班级
   */
  async findCurrentSemesterClasses(): Promise<Class[]> {
    const currentSemester = await prisma.semester.findFirst({
      where: { isCurrent: true },
    })

    if (!currentSemester) {
      return []
    }

    return this.findBySemesterId(currentSemester.id)
  }

  /**
   * 分页查询
   */
  async findManyPaginated(
    where: Prisma.ClassWhereInput | undefined,
    pagination: PaginationParams
  ): Promise<PaginatedResult<Class>> {
    const total = await prisma.class.count({ where })
    const page = Math.max(1, pagination.page || 1)
    const pageSize = Math.min(100, Math.max(1, pagination.pageSize || 20))
    const totalPages = Math.ceil(total / pageSize)

    const data = await prisma.class.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        semester: true,
        teacher: true,
        _count: {
          select: {
            students: { where: { deletedAt: null, status: 1 } },
          },
        },
      },
    })

    return { data, total, page, pageSize, totalPages }
  }

  /**
   * 更新班级
   */
  async update(id: bigint, data: Prisma.ClassUpdateInput): Promise<Class> {
    return prisma.class.update({
      where: { id },
      data,
    })
  }

  /**
   * 更换授课教师
   */
  async changeTeacher(id: bigint, newTeacherId: bigint): Promise<Class> {
    return prisma.class.update({
      where: { id },
      data: { teacherId: newTeacherId },
    })
  }

  /**
   * 删除班级
   */
  async delete(id: bigint): Promise<Class> {
    return prisma.class.delete({
      where: { id },
    })
  }

  /**
   * 统计数量
   */
  async count(where?: Prisma.ClassWhereInput): Promise<number> {
    return prisma.class.count({ where })
  }

  /**
   * 获取班级学生数量
   */
  async getStudentCount(id: bigint): Promise<number> {
    return prisma.student.count({
      where: {
        classId: id,
        deletedAt: null,
        status: 1,
      },
    })
  }

  /**
   * 获取助教绑定的班级
   */
  async findByAssistantId(assistantId: bigint): Promise<Class[]> {
    const bindings = await prisma.assistantClass.findMany({
      where: { assistantId },
      include: {
        class: {
          include: {
            semester: true,
            teacher: true,
            _count: {
              select: {
                students: { where: { deletedAt: null, status: 1 } },
              },
            },
          },
        },
      },
    })

    return bindings.map((b) => b.class)
  }
}

export const classRepository = new ClassRepository()
