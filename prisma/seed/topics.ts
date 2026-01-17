/**
 * 课题 Seed
 */

import type { PrismaClient, Topic, Teacher } from '@prisma/client'

// 课题数据
const topicData = [
  {
    name: '消费者行为调研',
    description: `
      <h3>项目背景</h3>
      <p>随着电子商务的快速发展，了解消费者的购物行为和偏好对企业制定营销策略至关重要。本调研旨在通过抽样调查的方法，分析不同人群的消费特征和购物习惯。</p>

      <h3>调研目标</h3>
      <ul>
        <li>了解消费者的基本购物习惯</li>
        <li>分析不同年龄段消费者的偏好差异</li>
        <li>探索影响购物决策的关键因素</li>
      </ul>

      <h3>调研范围</h3>
      <p>本次调研的总体为某城市18-65岁的常住居民，总体规模约为500万人。</p>
    `,
    excelRowCount: 10000,
    fieldMapping: {
      identifier: 'id',
      stratifyVars: ['gender', 'age_group', 'income_level'],
      numericVars: ['monthly_spending', 'purchase_frequency', 'satisfaction_score'],
    },
    weightConfig: {
      questionnaire: 30,
      process: 40,
      report: 30,
    },
  },
  {
    name: '大学生学习行为调查',
    description: `
      <h3>项目背景</h3>
      <p>高等教育质量的提升需要深入了解学生的学习行为和学习效果。本调研通过科学的抽样方法，调查大学生的学习时间分配、学习方式偏好和学习效果。</p>

      <h3>调研目标</h3>
      <ul>
        <li>了解大学生的日常学习时间分配</li>
        <li>分析不同专业学生的学习方式差异</li>
        <li>探索影响学习效果的关键因素</li>
      </ul>

      <h3>调研范围</h3>
      <p>本次调研的总体为某大学全体在校本科生，总体规模约为20000人。</p>
    `,
    excelRowCount: 5000,
    fieldMapping: {
      identifier: 'student_id',
      stratifyVars: ['grade', 'major_category', 'gender'],
      numericVars: ['study_hours', 'gpa', 'library_visits'],
    },
    weightConfig: {
      questionnaire: 25,
      process: 45,
      report: 30,
    },
  },
  {
    name: '居民健康状况调查',
    description: `
      <h3>项目背景</h3>
      <p>居民健康是社会发展的重要基础。本调研旨在通过抽样调查了解城市居民的健康状况、生活习惯和医疗服务需求。</p>

      <h3>调研目标</h3>
      <ul>
        <li>了解居民的基本健康状况</li>
        <li>分析不同人群的健康风险因素</li>
        <li>评估医疗服务的可及性和满意度</li>
      </ul>

      <h3>调研范围</h3>
      <p>本次调研的总体为某城市18岁以上常住居民，总体规模约为800万人。</p>
    `,
    excelRowCount: 8000,
    fieldMapping: {
      identifier: 'resident_id',
      stratifyVars: ['district', 'age_group', 'occupation'],
      numericVars: ['bmi', 'health_score', 'medical_expense'],
    },
    weightConfig: {
      questionnaire: 30,
      process: 35,
      report: 35,
    },
  },
]

// 推荐题目数据
const recommendQuestions = [
  // 消费者行为调研
  [
    { questionType: 2, content: '您每月的网购消费金额大约是多少？', options: ['500元以下', '500-1000元', '1000-2000元', '2000-5000元', '5000元以上'] },
    { questionType: 3, content: '您通常通过哪些渠道获取商品信息？（可多选）', options: ['社交媒体', '电商平台推荐', '朋友推荐', '传统广告', '直播带货'] },
    { questionType: 4, content: '请对您最近一次网购体验的满意度进行评分', options: { minLabel: '非常不满意', maxLabel: '非常满意' } },
    { questionType: 1, content: '您是否会因为促销活动而购买原本不需要的商品？', options: ['是', '否'] },
  ],
  // 大学生学习行为调查
  [
    { questionType: 2, content: '您每天的课外学习时间大约是多少？', options: ['1小时以下', '1-2小时', '2-4小时', '4-6小时', '6小时以上'] },
    { questionType: 3, content: '您通常采用哪些学习方式？（可多选）', options: ['阅读教材', '观看视频课程', '刷题', '小组讨论', '请教老师'] },
    { questionType: 4, content: '请对您目前的学习效果进行自我评价', options: { minLabel: '效果很差', maxLabel: '效果很好' } },
    { questionType: 1, content: '您是否制定了明确的学习计划？', options: ['是', '否'] },
  ],
  // 居民健康状况调查
  [
    { questionType: 2, content: '您每周进行体育锻炼的频率是？', options: ['从不', '1-2次', '3-4次', '5-6次', '每天'] },
    { questionType: 3, content: '您认为影响您健康的主要因素有哪些？（可多选）', options: ['工作压力', '饮食习惯', '睡眠质量', '运动不足', '环境污染'] },
    { questionType: 4, content: '请对您目前的整体健康状况进行评分', options: { minLabel: '很差', maxLabel: '很好' } },
    { questionType: 1, content: '您是否有定期体检的习惯？', options: ['是', '否'] },
  ],
]

export async function seedTopics(
  prisma: PrismaClient,
  teachers: Teacher[]
): Promise<Topic[]> {
  const topics: Topic[] = []

  for (let i = 0; i < topicData.length && i < teachers.length; i++) {
    const data = topicData[i]
    const teacher = teachers[i]

    // 查找或创建课题
    const existingTopic = await prisma.topic.findFirst({
      where: {
        name: data.name,
        teacherId: teacher.id,
      },
    })

    let topic: Topic
    if (existingTopic) {
      topic = existingTopic
    } else {
      topic = await prisma.topic.create({
        data: {
          teacherId: teacher.id,
          name: data.name,
          description: data.description,
          excelFilePath: `/uploads/topics/${Date.now()}/data.xlsx`,
          excelRowCount: data.excelRowCount,
          fieldMapping: data.fieldMapping,
          weightConfig: data.weightConfig,
          status: 1, // 已发布
        },
      })

      // 创建推荐题目
      const questions = recommendQuestions[i] || []
      for (let j = 0; j < questions.length; j++) {
        const q = questions[j]
        await prisma.topicRecommendQuestion.create({
          data: {
            topicId: topic.id,
            questionType: q.questionType,
            content: q.content,
            options: q.options,
            sortOrder: j + 1,
          },
        })
      }
    }

    topics.push(topic)
  }

  return topics
}
