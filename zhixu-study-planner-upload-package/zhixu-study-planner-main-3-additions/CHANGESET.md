# main-3 增量清单

这个目录是基于原始目录 `zhixu-study-planner-main 3` 整理出来的“新增/修改代码导出包”，用于手动合并到目标仓库。

## 新增文件

- `app/api/timeline/plan/route.ts`
- `app/api/todo/task/route.ts`
- `app/api/todo/today/route.ts`
- `app/timeline/new/page.tsx`
- `features/timeline/TimelineCreatePage.tsx`
- `lib/study-plan-ai.ts`
- `lib/study-plan-store.ts`
- `lib/study-plan-types.ts`

## 修改文件

- `app/globals.css`
- `db/schema.ts`
- `features/timeline/TimelinePage.tsx`
- `features/todo/TodoPage.tsx`
- `lib/auth.ts`
- `lib/openai.ts`
- `package-lock.json`

## 已从导出包中排除

- `.env.local`

原因：这是本地私密配置，里面可能包含 API key，不应该上传到 GitHub 私有仓库之外的任何地方。

## 合并建议

- 如果你的目标仓库已经有同名文件，请先做差异对比再合并。
- 这批代码不是“只增加新文件”那么简单，里面包含若干对原文件的必要修改，否则功能不会完整运行。
- 如果目标是“别人下载后就能用”，至少需要保留这里列出的全部新增和修改文件。
