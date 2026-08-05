# 员工接手手册

## 第一次接手

1. 克隆私有仓库并从 `main` 拉取最新代码。
2. 切换到自己负责的远程功能分支。
3. 安装依赖并启动本地开发服务。
4. 只在对应业务模块中实现功能；需要修改公共框架时先在 PR 中说明影响范围。
5. 推送改动并向 `main` 提交 Pull Request。

## 功能分支与目录

| 功能 | 长期功能分支 | 业务目录 | 页面路由 |
| --- | --- | --- | --- |
| 首页 | `feature/home` | `features/home/` | `/` |
| Timeline | `feature/timeline` | `features/timeline/` | `/timeline` |
| Todo | `feature/todo` | `features/todo/` | `/todo` |
| AI Tutor | `feature/ai-tutor` | `features/ai-tutor/` | `/ai-tutor` |
| 日志 | `feature/journal` | `features/journal/` | `/journal` |
| 反馈总结 | `feature/summary` | `features/summary/` | `/summary` |
| 进展洞察 | `feature/insights` | `features/insights/` | `/insights` |
| 用户中心 | `feature/profile` | `features/profile/` | `/profile` |

## 日常开发

```bash
git switch feature/<module>
git pull
npm install
npm run dev
```

提交前：

```bash
npm run build
git status
```

本地使用 AI 功能前，将 `.env.example` 复制为 `.env.local`，由项目管理员提供并写入开发密钥。真实密钥不得通过聊天、邮件、代码提交或 PR 传递。

首次学习问卷保存 `grade`、`examDate` 以及每科的 `textbook`、`examUnitStart`、`examUnitEnd`。Timeline、Todo、AI Tutor 和首页需要考试上下文时，统一读取 `LearningProfile`；不要在各模块重复创建考试日期或 Unit 范围字段。旧账号会在进入应用前被引导补齐新增信息。

## 合并规则

- `main` 只接收通过 Pull Request 的改动。
- 一个 PR 尽量只解决一个模块中的一个明确问题。
- 公共导航、全局主题和壳层改动必须由项目所有者审核。
- CI 构建必须通过后才可合并。
- 不允许在业务模块之间直接导入内部组件或状态。
- 不允许从前端直接调用 OpenAI 或读取 `OPENAI_API_KEY`；所有模块统一使用 `/api/ai/respond` 和 `config/ai.ts` 中的模块标识。

## 首页数据接入

首页框架已经覆盖考试倒计时、今日进度、下一任务、剩余时间、风险、计划变化、待确认调整、各科进展、AI Tutor、反馈提醒和快捷入口。占位数据统一位于 `features/home/home-data.ts`，不要在 `HomePage.tsx` 中继续写散落的演示数据。

各模块负责人完成真实功能后，只需提供对应的只读首页切片：

- Timeline：`HomeTimelineSlice`
- Todo：`HomeTodoSlice`
- AI Tutor：`HomeTutorSlice`
- 反馈总结：`HomeSummarySlice`
- 进展洞察：`HomeInsightsSlice`

首页负责人负责把这些实现装配到 `HomeDashboardAdapters`。字段需要调整时，先修改 `home-types.ts` 并在 PR 中说明受影响模块；禁止从首页直接导入其他模块的内部组件或客户端状态。

## 日志数据接入

日志页面位于 `features/journal/`，由三层组成：

1. `journal-types.ts` 定义跨模块事件、前后变化和关联对象。
2. `journal-data.ts` 提供服务端只读适配器与统一事件名目录。
3. `JournalPage.tsx` 负责筛选、检索、详情、关联跳转和导出，不持有其他模块的业务状态。

Todo、Timeline、AI Tutor、反馈总结、进展洞察和用户中心在业务操作成功后发布对应领域事件。先完成来源模块的事务，再追加日志；失败的业务操作不得伪造“成功”日志。撤销和纠正必须新增记录，禁止覆盖原始事件。

生产环境已经使用 D1 的 `journal_entries` 表，路由通过 `createD1JournalAdapter(user.id)` 按当前用户查询。来源模块应在服务端调用 `appendJournalEntry()`，或在日志失败不应阻断主操作时调用 `appendJournalEntryBestEffort()`；不要从浏览器直接写入日志。保持 `JournalSnapshot` 与 `JournalEntry` 字段稳定，且不得记录密码内容、令牌、完整手机号、API 密钥或支付凭证。

## 当前项目管理员

- `@gaohuaxuan281-alt`
- `@yqxcecilia-coder`
- `@monm0101`
- `@Mary-cjy`

以上账号共同拥有全部代码的审核权。员工接受 GitHub 私有仓库邀请后，即可管理代码、分支、Issues、Projects 与仓库设置。
