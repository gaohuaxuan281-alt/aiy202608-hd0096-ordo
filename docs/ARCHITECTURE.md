# 知序前端协作约定

这套框架服务于题目“考前学习任务设计器：根据考试日期、剩余时间和掌握程度，拆解每日复习任务并动态调整”。当前阶段已建立产品壳层、一级路由、模块边界，以及供所有模块复用的账号入口。

## 目录职责

- `app/`：只负责路由、页面标题和模块装配，不放业务实现。
- `components/AppShell.tsx`：全站壳层，包括侧栏、顶部栏、移动端导航、全局搜索和全局 AI 入口。
- `config/navigation.ts`：一级功能的唯一导航配置。
- `features/<module>/`：员工独立开发区。业务组件、hooks、types、services 和测试都应留在对应模块内。
- `features/home/home-types.ts`：首页只读聚合契约。其他模块通过这些类型向首页提供摘要，不允许首页反向修改业务数据。
- `features/home/home-data.ts`：首页服务端适配层；目前返回集中管理的占位数据，后续逐项替换为各模块查询服务。
- `features/journal/journal-types.ts`：跨模块操作事件与日志展示的稳定契约；来源模块只提交事实，不引用日志页面内部状态。
- `features/journal/journal-data.ts`：日志只读查询适配层与事件目录；生产页面使用 D1 适配器，测试和独立预览可注入样例适配器。
- `lib/journal-store.ts`：追加日志和按用户查询日志的唯一服务端入口，包含敏感字段防护与 JSON 变化记录解析。
- `features/shared/`：仅放至少被两个业务模块稳定复用的组件；不要把临时业务逻辑上移到这里。
- `app/api/auth/`：手机号注册、登录、会话读取与退出接口。
- `app/api/account/`：当前用户的个人资料和密码维护接口；每个接口都需要独立验证登录会话。
- `app/api/account/diagnostic-quiz/`：供 Timeline、洞察等客户端页面读取当前用户诊断摘要，不返回正确答案。
- `app/api/ai/respond/`：所有模块共用的模型调用接口；负责登录校验、频率限制、学习档案注入和响应保存。
- `app/api/onboarding/diagnostic-quiz/`：首次使用诊断 Quiz 的生成与提交接口；正确答案只保存在服务端。
- `config/ai.ts`：客户端可见的模块名称、说明和建议问题；不要在这里放密钥或服务端安全规则。
- `lib/ai-prompts.ts`：各模块的服务端提示词边界；业务模块需要新增 AI 行为时先扩展这里。
- `lib/openai.ts`：唯一允许访问 OpenAI Responses API 和 `OPENAI_API_KEY` 的服务层。
- `lib/diagnostic-quiz.ts`：诊断题、答案、评分、薄弱知识点与 Timeline 读取结果的服务端边界。
- `lib/diagnostic-quiz-generator.ts`：将年级、教材和 Unit 范围转换成 10 个覆盖目标，并校验 AI 的结构化题目输出。
- `lib/ai-store.ts`：AI 对话和消息的 D1 持久化服务。
- `lib/auth.ts`：账号校验、密码摘要和会话服务。业务模块不要绕过此处直接处理密码或会话 Cookie。
- `db/schema.ts`、`drizzle/`：D1 数据表定义与迁移；用户资料保存在 `user_profiles`，年级、计划考试日期、科目教材和考试 Unit 范围保存在 `user_learning_profiles` 与 `user_subject_preferences`，诊断数据保存在 `diagnostic_quiz_attempts`、`diagnostic_quiz_questions` 与 `diagnostic_quiz_answers`，AI 对话保存在 `ai_conversations` 与 `ai_messages`，所有用户业务数据通过 `user.id` 关联所有权。
- `app/globals.css`：全局设计变量和框架布局。模块专用样式应与模块同目录维护。

## 八个模块

| 功能 | 路由 | 员工开发目录 |
| --- | --- | --- |
| 首页 | `/` | `features/home/` |
| Timeline | `/timeline` | `features/timeline/` |
| Todo | `/todo` | `features/todo/` |
| AI Tutor | `/ai-tutor` | `features/ai-tutor/` |
| 日志 | `/journal` | `features/journal/` |
| 反馈总结 | `/summary` | `features/summary/` |
| 进展洞察 | `/insights` | `features/insights/` |
| 用户中心 | `/profile` | `features/profile/` |

## 协作规则

1. 每位员工默认只修改自己负责的 `features/<module>/` 目录及对应测试。
2. 一级路由地址保持稳定；模块内部可以继续拆分子路由。
3. 跨模块共享数据时先定义类型和只读接口，禁止直接引用另一个模块的内部组件或状态。
4. 设计颜色、间距和圆角优先使用 `globals.css` 中已有变量，避免各模块视觉分叉。
5. 修改公共壳层、导航配置或全局变量前，先与其他模块负责人确认影响范围。
6. 需要当前账号时，客户端组件通过 `useAuthUser()` 读取；服务端接口必须独立校验会话，不能只依赖前端是否显示按钮。
7. 禁止保存或记录明文密码，也不要把会话令牌返回到页面 JavaScript；账号表和会话表的变更需要同时提交 Drizzle 迁移。
8. 业务模块禁止在浏览器中直接调用 OpenAI。使用全局 AI 抽屉时派发 `zhixu:open-ai` 事件；需要定制数据契约时调用受保护的 `/api/ai/respond`，并在公共服务层扩展。
9. `OPENAI_API_KEY` 只允许保存在本地忽略文件或托管平台的 Secret 中；禁止写入源码、测试、日志、PR 描述或截图。

## 首页聚合契约

首页不建立独立业务表，也不复制其他模块的状态。`app/page.tsx` 只调用 `getHomeDashboardSnapshot()`，再把完整快照交给 `HomePage` 渲染。员工接入真实数据时，应实现 `HomeDashboardAdapters` 中自己负责的只读切片：

| 首页内容 | 权威来源 | 首页行为 |
| --- | --- | --- |
| 当前考试、倒计时、下一项任务、风险、计划变化、待确认调整 | Timeline | 只读展示并跳转到 Timeline |
| 今日完成进度、剩余可用时间 | Todo | 监听任务状态后的聚合结果 |
| 各科进展摘要 | 进展洞察 | 只读展示趋势和风险 |
| AI Tutor 快速入口 | AI Tutor | 传入建议问题和当前任务上下文 |
| 每日反馈提醒 | 反馈总结 | 展示状态并跳转到反馈流程 |
| 操作来源说明 | 日志 | 展示最近事件，不编辑日志 |

接入顺序：先在本模块实现查询函数，再替换 `emptyHomeAdapters` 对应方法，保持 `HomeDashboardSnapshot` 字段稳定。默认适配器只返回 `null` 或空数组，禁止使用演示任务、虚构统计或猜测值填满首页。当前首页只直接聚合已保存的考试档案、诊断 Quiz 和真实日志；任何调整都必须在 Timeline 中由用户确认后落地，首页不能直接写入 Timeline 或 Todo。

## 考试学习档案

首次问卷共六步：年级、科目、教材、计划考试日期、各科教材考试 Unit 范围，以及 10 题诊断 Quiz。考试日期使用中国本地日历的 `YYYY-MM-DD` 保存；每个科目分别保存 `examUnitStart` 与 `examUnitEnd`，范围为 Unit 1–20，且起始 Unit 不得大于结束 Unit。

第六步按选中科目和 Unit 生成恰好 10 道原创选择题。服务端先为题目分配覆盖位置，再使用 OpenAI Structured Outputs 生成题干、选项、知识点标签和解析，并进行二次校验。生成接口只返回题目和选项；正确答案在提交评分前不会进入浏览器。提交后持久化逐题答案、分科正确率和薄弱知识点。

旧账号缺少考试日期、任一科目的 Unit 范围，或没有与当前考试档案匹配的已完成 Quiz 时，会在进入应用前补充信息并完成诊断，同时保留已有年级、科目和教材选择。保存后的考试信息与诊断得分会显示在用户中心，首页倒计时优先读取考试日期，统一 AI 接口会自动注入考试日期、剩余天数、每科 Unit 范围、诊断正确率和薄弱知识点。

Timeline、Todo 等模块读取 `LearningProfile` 获得考试输入，并通过 `getLatestCompletedDiagnosticQuiz(userId)` 获得掌握程度。禁止各模块另外复制或猜测考试日期、考试范围或诊断结果。

## 日志事件契约

日志是操作记录中心，不是用户手写日记。页面通过 `getJournalSnapshot()` 读取追加式事件流，并提供日期、模块、操作者、操作类型和全文检索，以及前后变化、原因、关联对象和 CSV 导出。

其他模块完成业务操作后，应发布一个命名明确的领域事件。事件名统一维护在 `JOURNAL_EVENT_CATALOG`，当前覆盖任务、计划、反馈、答疑、掌握度、会员、注册、登录、退出、账号资料、安全设置、学习档案和纠正记录等事件。

每条 `JournalEntry` 必须包含：时间、操作者、操作类型、涉及模块、涉及对象、修改前后内容、修改原因和是否可撤销。不得把密码、会话令牌、完整手机号、AI 密钥或支付凭证写入日志。

日志采用追加式模型：已写入记录不可更新或删除。撤销业务操作时，来源模块先完成自己的补偿操作，再追加 `CorrectionRecorded` 并通过 `correctionOf` 指向原记录。日志页面不直接修改 Timeline、Todo 或其他模块状态。

生产页面通过 `createD1JournalAdapter(user.id)` 读取 `journal_entries`，按当前用户隔离所有权；客户端只接收经过权限校验的日志快照。其他模块在服务端调用 `appendJournalEntry()`，或在不应影响主操作结果的场景调用 `appendJournalEntryBestEffort()`。不得从浏览器直接伪造日志事件。

## 统一 AI 调用契约

客户端向 `POST /api/ai/respond` 发送：

```json
{
  "module": "timeline",
  "message": "帮我调整今晚的复习计划",
  "conversationId": "可选，继续已有对话",
  "context": "可选，本模块当前页面的精简上下文"
}
```

`module` 只能使用 `home`、`timeline`、`todo`、`ai-tutor`、`journal`、`summary`、`insights` 或 `profile`。接口会在服务端自动加入当前账号的年级、科目和教材信息。员工不要从客户端重复提交密码、手机号或其他敏感账号信息。

页面需要打开统一 AI 抽屉时：

```ts
window.dispatchEvent(new CustomEvent("zhixu:open-ai", {
  detail: { module: "timeline", prompt: "帮我检查计划风险" },
}));
```

## 每日反馈闭环

反馈总结的权威入口是 `GET/POST /api/summary/daily`，确认入口是 `POST /api/summary/adjustment`。服务端通过 `lib/daily-feedback.ts` 自动读取当日 Todo、按计划时长估算的完成分钟数、延期与跳过任务、AI Tutor 使用、今日日志和剩余 Timeline；估算时长不得标记为实际用时。

AI 结构化输出先写入 `daily_feedbacks` 与 `feedback_adjustments`，状态保持待确认。接受建议时，`lib/study-plan/store.ts` 会校验计划版本、锁定状态、日期时间、重叠、每日预算、依赖顺序和硬边界，再生成带父版本的新 Timeline；拒绝不会写计划。Todo 始终从最新 Timeline 派生。接受、拒绝和新版 Timeline 使用确定性日志 ID 追加到 `journal_entries`，重复请求不会重复写日志。首页通过 `getHomeSummarySlice()` 读取真实反馈状态。

## 进展洞察数据契约

`/insights` 通过受登录保护的 `GET /api/insights/summary` 获取只读聚合结果，服务端查询集中在 `lib/insights-store.ts`。洞察模块不建立第二套任务或统计数据源，而是聚合当前用户最新且与学习档案指纹匹配的 Timeline、Todo 任务状态、诊断 Quiz、每日反馈实际学习分钟数、AI Tutor 使用记录和计划调整日志。

新生成的 Timeline 必须在 `StudyPlanGenerationInput.learningProfileFingerprint` 保存当前学习档案指纹；用户修改年级、教材、考试日期或 Unit 范围后，旧计划不能继续作为当前洞察依据，需要重新生成。没有权威计划或统计数据时，界面展示“暂无”，不得用虚构任务或 `0%` 冒充真实结果。实际学习时长只统计当前计划任务日期范围内由用户反馈提交的分钟数。
