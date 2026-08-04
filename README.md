# 知序 · 考前学习任务设计器

面向高中生的考前学习规划框架：根据考试日期、剩余时间和掌握程度，拆解每日复习任务并动态调整。

当前版本已经搭好统一产品壳层和八个一级模块：首页、Timeline、Todo、AI Tutor、日志、反馈总结、进展洞察、用户中心。各模块可由不同员工独立持续开发。

## 本地运行

项目要求 Node.js `>=22.13.0`。

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`。提交代码前运行：

```bash
npm run build
```

## 开发入口

- 路由装配：`app/`
- 公共产品壳层：`components/AppShell.tsx`
- 一级导航：`config/navigation.ts`
- 业务模块：`features/`
- 协作与模块边界：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- 员工接手流程：[docs/TEAM_HANDOFF.md](docs/TEAM_HANDOFF.md)

员工应优先在自己负责的 `features/<module>/` 内开发，避免直接修改其他业务模块。一级路由、公共主题或壳层变更需要先确认跨模块影响。

所有功能改动通过 Pull Request 合并到 `main`。仓库内置构建检查和 PR 模板，功能分支命名与接手步骤见员工接手手册。

## 技术底座

- React 19 + TypeScript
- Next.js App Router 兼容目录
- vinext / Vite 构建
- Cloudflare Sites 兼容输出

`.openai/hosting.json` 保留 Sites 托管声明；当前框架不依赖数据库或对象存储。
