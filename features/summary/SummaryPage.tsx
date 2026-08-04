import { FeatureScaffold } from "../shared/FeatureScaffold";

export function SummaryPage() {
  return <FeatureScaffold eyebrow="FEEDBACK LOOP" title="反馈总结" description="把任务结果、AI 建议与个人反思汇总成可执行反馈。" glyph="◇" modulePath="features/summary" handoff="在这里实现周报、阶段总结和反馈闭环；聚合其他模块时使用只读数据契约。" />;
}
