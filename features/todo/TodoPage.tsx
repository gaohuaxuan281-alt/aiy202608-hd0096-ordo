import { FeatureScaffold } from "../shared/FeatureScaffold";

export function TodoPage() {
  return <FeatureScaffold eyebrow="DAILY EXECUTION" title="Todo" description="承接由考试目标拆解出的每日复习任务与完成状态。" glyph="✓" modulePath="features/todo" handoff="在这里实现任务队列、优先级、完成状态与复习任务拆分；模块对外仅暴露稳定页面入口。" aiModule="todo" />;
}
