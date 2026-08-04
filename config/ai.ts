export const AI_MODULES = {
  home: {
    label: "首页助理",
    description: "梳理当前学习重点和下一步行动",
    welcome: "我可以结合你的年级、科目与教材，帮你判断今天最值得先做什么。",
    suggestions: ["帮我安排今晚的学习顺序", "今天时间不够，应该舍弃什么？", "给我一个 30 分钟启动方案"],
  },
  timeline: {
    label: "Timeline 规划师",
    description: "拆解复习节奏、排期和动态调整方案",
    welcome: "告诉我考试日期、可用时间或计划变化，我会给出可执行的时间轴建议。",
    suggestions: ["帮我生成一周复习时间轴", "今晚少了 1 小时，怎么调整？", "检查计划里可能超时的部分"],
  },
  todo: {
    label: "Todo 拆解助手",
    description: "把目标拆成今天可以完成的任务",
    welcome: "给我一个学习目标，我会把它拆成有顺序、有时长、有完成标准的任务。",
    suggestions: ["把数学复习拆成今日任务", "帮我确定任务优先级", "把这项大任务拆成 20 分钟小任务"],
  },
  "ai-tutor": {
    label: "AI Tutor",
    description: "讲解知识、诊断卡点并引导练习",
    welcome: "把不会的题目、概念或你的解题过程发给我。我会先定位卡点，再用适合你年级的方式讲清楚。",
    suggestions: ["帮我讲清楚一个概念", "检查我的解题思路", "用一道例题带我练习"],
  },
  journal: {
    label: "日志整理助手",
    description: "解释操作记录、变化原因与跨模块影响",
    welcome: "我可以帮你读懂系统记录、定位反复发生的变化，并准备纠正建议；原始日志不会被修改。",
    suggestions: ["解释今天发生的计划变化", "找出最近反复延期的任务", "为错误操作准备一条纠正建议"],
  },
  summary: {
    label: "反馈总结助手",
    description: "分析每日反馈并提出计划调整建议",
    welcome: "把今天的完成情况和真实感受告诉我，我会提炼反馈并给出明天的调整建议。",
    suggestions: ["根据今天的情况生成反馈总结", "哪些任务安排得不合理？", "把我的复盘变成明天的调整方案"],
  },
  insights: {
    label: "进展洞察助手",
    description: "解释趋势、风险和学习效率变化",
    welcome: "我可以帮助你理解完成率、超时、掌握程度等变化意味着什么。",
    suggestions: ["我最近进步在哪里？", "分析任务总是超时的原因", "告诉我当前最大的备考风险"],
  },
  profile: {
    label: "学习档案顾问",
    description: "根据学习阶段给出设置和使用建议",
    welcome: "我可以根据你的年级、科目和教材，建议更合适的知序使用方式。",
    suggestions: ["根据我的学习档案给建议", "我应该先在知序里设置什么？", "怎样调整科目重点更合理？"],
  },
} as const;

export type AIModule = keyof typeof AI_MODULES;

export function isAIModule(value: string): value is AIModule {
  return Object.hasOwn(AI_MODULES, value);
}

export function getAIModuleFromPathname(pathname: string): AIModule {
  if (pathname.startsWith("/timeline")) return "timeline";
  if (pathname.startsWith("/todo")) return "todo";
  if (pathname.startsWith("/ai-tutor")) return "ai-tutor";
  if (pathname.startsWith("/journal")) return "journal";
  if (pathname.startsWith("/summary")) return "summary";
  if (pathname.startsWith("/insights")) return "insights";
  if (pathname.startsWith("/profile")) return "profile";
  return "home";
}
