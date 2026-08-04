import { FeatureScaffold } from "../shared/FeatureScaffold";

export function InsightsPage() {
  return <FeatureScaffold eyebrow="LEARNING SIGNALS" title="进展洞察" description="观察掌握程度、执行效率与计划风险随时间的变化。" glyph="◒" modulePath="features/insights" handoff="在这里实现指标卡片、趋势图表和风险提示；指标定义应集中维护并可追溯。" aiModule="insights" />;
}
