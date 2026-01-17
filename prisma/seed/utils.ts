/**
 * Seed 工具函数
 */

import bcrypt from 'bcryptjs'

const SALT_ROUNDS = 10

/**
 * 密码哈希
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

/**
 * 生成随机中文姓名
 */
export function generateChineseName(): string {
  const surnames = ['张', '王', '李', '赵', '刘', '陈', '杨', '黄', '周', '吴', '徐', '孙', '马', '朱', '胡', '林', '郭', '何', '高', '罗']
  const names = ['伟', '芳', '娜', '秀英', '敏', '静', '丽', '强', '磊', '洋', '艳', '勇', '军', '杰', '娟', '涛', '明', '超', '秀兰', '霞', '平', '刚', '桂英', '文', '华', '梅', '鑫', '龙', '玲', '飞']

  const surname = surnames[Math.floor(Math.random() * surnames.length)]
  const name1 = names[Math.floor(Math.random() * names.length)]
  const name2 = Math.random() > 0.5 ? names[Math.floor(Math.random() * names.length)] : ''

  return surname + name1 + name2
}

/**
 * 生成学号 (格式: 2024XXXX)
 */
export function generateStudentId(year: number, index: number): string {
  return `${year}${String(index).padStart(4, '0')}`
}

/**
 * 生成工号 (格式: TXXXX)
 */
export function generateEmployeeId(index: number): string {
  return `T${String(index).padStart(4, '0')}`
}

/**
 * 获取当前学期名称
 */
export function getCurrentSemesterName(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  // 2-7月为春季学期，8-1月为秋季学期
  if (month >= 2 && month <= 7) {
    return `${year}-Spring`
  } else {
    return month >= 8 ? `${year}-Fall` : `${year - 1}-Fall`
  }
}

/**
 * 生成随机日期（从现在开始的若干天内）
 */
export function randomFutureDate(daysFromNow: number): Date {
  const now = new Date()
  const randomDays = Math.floor(Math.random() * daysFromNow)
  return new Date(now.getTime() + randomDays * 24 * 60 * 60 * 1000)
}
