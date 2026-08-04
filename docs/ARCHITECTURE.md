# 知序前端协作约定

这套框架服务于题目“考前学习任务设计器：根据考试日期、剩余时间和掌握程度，拆解每日复习任务并动态调整”。当前阶段已建立产品壳层、一级路由、模块边界，以及供所有模块复用的账号入口。

## 目录职责

- `app/`：只负责路由、页面标题和模块装配，不放业务实现。
- `components/AppShell.tsx`：全站壳层，包括侧栏、顶部栏、移动端导航、全局搜索和全局 AI 入口。
- `config/navigation.ts`：一级功能的唯一导航配置。
- `features/<module>/`：员工独立开发区。业务组件、hooks、types、services 和测试都应留在对应模块内。
- `features/home/home-types.ts`：首页只读聚合契约。其他模块通过这些类型向首页提供摘要，不允许首页反向修改业务数据。
- `features/home/home-data.ts`：首页服务端适配层；目前返回集中管理的占位数据，后续逐项替换为各模块查询服务。
- `features/shared/`：仅放至少被两个业务模块稳定复用的组件；不要把临时业务逻辑上移到这里。
- `app/api/auth/`：手机号注册、登录、会话读取与退出接口。
- `app/api/account/`：当前用户的个人资料和密码维护接口；每个接口都需要独立验证登录会话。
- `app/api/ai/respond/`：所有模块共用的模型调用接口；负责登录校验、频率限制、学习档案注入和响应保存。
- `config/ai.ts`：客户端可见的模块名称、说明和建议问题；不要在这里放密钥或服务端安全规则。
- `lib/ai-prompts.ts`：各模块的服务端提示词边界；业务模块需要新增 AI 行为时先扩展这里。
- `lib/openai.ts`：唯一允许访问 OpenAI Responses API 和 `OPENAI_API_KEY` 的服务层。
- `lib/ai-store.ts`：AI 对话和消息的 D1 持久化服务。
- `lib/auth.ts`：账号校验、密码摘要和会话服务。业务模块不要绕过此处直接处理密码或会话 Cookie。
- `db/schema.ts`、`drizzle/`：D1 数据表定义与迁移；用户资料保存在 `user_profiles`，AI 对话保存在 `ai_conversations` 与 `ai_messages`，后续用户业务数据应通过 `user.id` 关联所有权。
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

接入顺序：先在本模块实现查询函数，再替换 `placeholderHomeAdapters` 对应方法，保持 `HomeDashboardSnapshot` 字段稳定。任何调整都必须在 Timeline 中由用户确认后落地，首页不能直接写入 Timeline 或 Todo。

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
