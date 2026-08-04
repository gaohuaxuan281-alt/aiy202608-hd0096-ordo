import { FeatureScaffold } from "../shared/FeatureScaffold";

export function JournalPage() {
  return <FeatureScaffold eyebrow="DAILY NOTES" title="日志" description="沉淀学习过程、复盘记录与影响计划的真实事件。" glyph="▤" modulePath="features/journal" handoff="在这里实现日志编辑、标签、检索和附件记录；需要共享的数据通过明确接口输出。" aiModule="journal" />;
}
