import { ArrowLeft, FileText, Download, Play, Image, File, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { StudentTask, TaskStatus } from "./TaskHall";

// Mock topic details
interface TopicAttachment {
    id: number;
    name: string;
    type: "image" | "video" | "pdf" | "doc" | "other";
    size: string;
}

interface TopicDetails {
    id: number;
    name: string;
    description: string;
    attachments: TopicAttachment[];
    publishedAt: string;
    deadline: string | null;
}

const mockTopicDetails: Record<number, TopicDetails> = {
    101: {
        id: 101,
        name: "消费者行为调研",
        description: `
## 研究背景

在当今竞争激烈的市场环境中，了解消费者行为对于企业制定营销策略至关重要。本课题旨在通过科学的抽样调查方法，收集和分析消费者在购物决策过程中的行为特征和影响因素。

## 研究目标

1. 了解目标消费群体的基本特征
2. 分析影响购买决策的关键因素
3. 探索不同人群消费偏好的差异
4. 为企业营销策略提供数据支持

## 研究要求

- 设计科学合理的调查问卷
- 正确计算并确定样本量
- 掌握三种基本抽样方法的应用
- 撰写完整的调研报告
        `.trim(),
        attachments: [
            { id: 1, name: "研究指南.pdf", type: "pdf", size: "2.3 MB" },
            { id: 2, name: "参考文献.pdf", type: "pdf", size: "1.8 MB" },
            { id: 3, name: "示例数据说明.docx", type: "doc", size: "156 KB" },
        ],
        publishedAt: "2024-03-01",
        deadline: "2024-04-15",
    },
    102: {
        id: 102,
        name: "医疗可及性调查",
        description: `
## 研究背景

医疗服务的可及性是公共卫生领域的重要议题。本课题关注不同地区居民获取医疗服务的便利程度。

## 研究目标

1. 评估医疗服务的地理可及性
2. 分析影响就医行为的因素
3. 为医疗资源优化配置提供建议
        `.trim(),
        attachments: [
            { id: 1, name: "研究框架.pdf", type: "pdf", size: "1.2 MB" },
        ],
        publishedAt: "2024-03-10",
        deadline: "2024-04-20",
    },
};

const stageNames = ["问卷设计", "样本量规划", "抽样执行", "分析与报告"];

const statusConfig: Record<TaskStatus, { label: string; color: string }> = {
    not_started: { label: "未开始", color: "bg-slate-100 text-slate-700" },
    in_progress: { label: "进行中", color: "bg-blue-100 text-blue-700" },
    submitted: { label: "已提交", color: "bg-amber-100 text-amber-700" },
    grading: { label: "批改中", color: "bg-orange-100 text-orange-700" },
    graded: { label: "已批改", color: "bg-emerald-100 text-emerald-700" },
    rejected: { label: "被驳回", color: "bg-red-100 text-red-700" },
};

function getFileIcon(type: TopicAttachment["type"]) {
    switch (type) {
        case "image": return <Image className="w-5 h-5 text-blue-500" />;
        case "video": return <Play className="w-5 h-5 text-purple-500" />;
        case "pdf": return <FileText className="w-5 h-5 text-red-500" />;
        case "doc": return <FileText className="w-5 h-5 text-blue-600" />;
        default: return <File className="w-5 h-5 text-slate-500" />;
    }
}

interface TopicDetailsProps {
    task: StudentTask;
    onBack: () => void;
    onStartExperiment: () => void;
}

export function TopicDetails({ task, onBack, onStartExperiment }: TopicDetailsProps) {
    const topic = mockTopicDetails[task.topicId] || {
        id: task.topicId,
        name: task.name,
        description: task.description,
        attachments: [],
        publishedAt: task.publishedAt,
        deadline: task.deadline,
    };

    const status = statusConfig[task.status];

    const getActionButton = () => {
        switch (task.status) {
            case "not_started":
                return { text: "开始实验", action: onStartExperiment };
            case "in_progress":
                return { text: "继续实验", action: onStartExperiment };
            case "submitted":
            case "grading":
                return { text: "查看提交内容", action: () => { } };
            case "graded":
                return { text: "查看成绩", action: () => { } };
            case "rejected":
                return { text: "重新开始", action: onStartExperiment };
        }
    };

    const action = getActionButton();

    return (
        <div className="space-y-6">
            {/* Back button */}
            <Button variant="ghost" onClick={onBack} className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                返回任务列表
            </Button>

            {/* Header */}
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-2xl font-bold">{topic.name}</h1>
                    <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                        <span>发布时间：{topic.publishedAt}</span>
                        {topic.deadline && <span>截止时间：{topic.deadline}</span>}
                    </div>
                </div>
                <Badge className={status.color + " text-sm px-3 py-1"}>{status.label}</Badge>
            </div>

            {/* Progress Stepper */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">实验进度</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between">
                        {stageNames.map((stage, index) => {
                            const stageNum = index + 1;
                            const isCompleted = task.currentStage > stageNum || task.status === "graded";
                            const isCurrent = task.currentStage === stageNum && task.status !== "graded";

                            return (
                                <div key={stage} className="flex items-center flex-1">
                                    <div className="flex flex-col items-center">
                                        <div className={`
                                            w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium
                                            ${isCompleted ? "bg-emerald-500 text-white" :
                                                isCurrent ? "bg-blue-500 text-white" :
                                                    "bg-slate-200 text-slate-500"}
                                        `}>
                                            {isCompleted ? <CheckCircle className="w-5 h-5" /> : stageNum}
                                        </div>
                                        <span className={`text-xs mt-2 ${isCurrent ? "font-medium text-blue-600" : "text-muted-foreground"}`}>
                                            {stage}
                                        </span>
                                    </div>
                                    {index < stageNames.length - 1 && (
                                        <div className={`flex-1 h-1 mx-2 ${task.currentStage > stageNum ? "bg-emerald-500" : "bg-slate-200"
                                            }`} />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            {/* Description */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">课题介绍</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="prose prose-sm max-w-none">
                        <div className="whitespace-pre-line">{topic.description}</div>
                    </div>
                </CardContent>
            </Card>

            {/* Attachments */}
            {topic.attachments.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">相关资料 ({topic.attachments.length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {topic.attachments.map((file) => (
                                <div key={file.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                    <div className="flex items-center gap-3">
                                        {getFileIcon(file.type)}
                                        <div>
                                            <p className="text-sm font-medium">{file.name}</p>
                                            <p className="text-xs text-muted-foreground">{file.size}</p>
                                        </div>
                                    </div>
                                    <Button variant="ghost" size="sm">
                                        <Download className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Reject reason */}
            {task.status === "rejected" && task.rejectReason && (
                <Card className="border-red-200 bg-red-50">
                    <CardHeader>
                        <CardTitle className="text-base text-red-700">驳回理由</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-red-700">{task.rejectReason}</p>
                    </CardContent>
                </Card>
            )}

            {/* Score */}
            {task.status === "graded" && task.score !== undefined && (
                <Card className="border-emerald-200 bg-emerald-50">
                    <CardHeader>
                        <CardTitle className="text-base text-emerald-700">实验成绩</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-3">
                            <span className="text-4xl font-bold text-emerald-600">{task.score}</span>
                            <span className="text-emerald-600">分</span>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Action Button */}
            <div className="flex justify-end">
                <Button size="lg" onClick={action.action}>
                    {action.text}
                </Button>
            </div>
        </div>
    );
}

export default TopicDetails;
