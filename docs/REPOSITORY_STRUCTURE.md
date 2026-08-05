# 仓库目录规范

仓库只保留一套可运行源码。ZIP、导出包和整份项目副本不得提交；需要交接时使用功能分支和 Pull Request。

| 目录 | 职责 | 允许内容 |
| --- | --- | --- |
| `app/` | 路由与接口装配 | 页面入口、API Route；不堆放业务实现 |
| `features/<module>/` | 一级业务模块 UI | 页面组件、模块内展示逻辑 |
| `components/` | 跨模块公共 UI | AppShell、登录态、全局 AI |
| `lib/` | 服务端公共能力 | 认证、AI、资料、日志等稳定边界 |
| `lib/study-plan/` | Timeline 与 Todo 共享领域 | `types.ts`、`store.ts`、`generator.ts` |
| `config/` | 静态产品配置 | 导航、教材目录、AI 模块标识 |
| `db/`、`drizzle/` | 数据库 | Schema 与顺序迁移 |
| `docs/` | 协作规范 | 架构、接手手册、目录说明 |
| `tests/` | 自动验证 | 关键架构与安全契约测试 |

## Timeline 与 Todo 数据流

`app/api/timeline/plan` 调用 `lib/study-plan/generator.ts` 生成计划，并通过 `store.ts` 写入 D1。Timeline 展示完整计划；Todo 的两个 API 从同一计划读取当日任务并更新任务状态。两者共享 `types.ts`，不得再复制一套任务类型或存储。

## 新功能归位步骤

1. 页面放到对应 `features/<module>/`。
2. 路由只放到 `app/`，服务端业务进入 `lib/` 或模块专属领域目录。
3. Schema 变化同时提交 `db/schema.ts`、运行时初始化和 Drizzle 迁移。
4. 修改后运行 lint、测试和生产构建。
5. 通过功能分支/PR 合并；不要上传 ZIP 或嵌套项目目录。
