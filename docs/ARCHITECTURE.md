# 知序前端协作约定

这套框架服务于题目“考前学习任务设计器：根据考试日期、剩余时间和掌握程度，拆解每日复习任务并动态调整”。当前阶段已建立产品壳层、一级路由、模块边界，以及供所有模块复用的账号入口。

## 目录职责

- `app/`：只负责路由、页面标题和模块装配，不放业务实现。
- `components/AppShell.tsx`：全站壳层，包括侧栏、顶部栏、移动端导航和全局搜索入口。
- `config/navigation.ts`：一级功能的唯一导航配置。
- `features/<module>/`：员工独立开发区。业务组件、hooks、types、services 和测试都应留在对应模块内。
- `features/shared/`：仅放至少被两个业务模块稳定复用的组件；不要把临时业务逻辑上移到这里。
- `app/api/auth/`：手机号注册、登录、会话读取与退出接口。
- `app/api/account/`：当前用户的个人资料和密码维护接口；每个接口都需要独立验证登录会话。
- `lib/auth.ts`：账号校验、密码摘要和会话服务。业务模块不要绕过此处直接处理密码或会话 Cookie。
- `db/schema.ts`、`drizzle/`：D1 数据表定义与迁移；用户资料保存在 `user_profiles`，后续用户业务数据应通过 `user.id` 关联所有权。
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
