import { FeatureScaffold } from "../shared/FeatureScaffold";

export function AITutorPage() {
  return <FeatureScaffold eyebrow="PERSONAL COACH" title="AI Tutor" description="围绕当前任务提供解释、追问、诊断和个性化学习支持。" glyph="✦" modulePath="features/ai-tutor" handoff="在这里实现对话、上下文、模型调用与学习辅导流程；API 与密钥配置保持在模块服务层。" />;
}
