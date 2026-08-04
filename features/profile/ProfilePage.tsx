import { FeatureScaffold } from "../shared/FeatureScaffold";

export function ProfilePage() {
  return <FeatureScaffold eyebrow="ACCOUNT & PREFERENCES" title="用户中心" description="管理学生信息、考试目标、学习偏好与账号设置。" glyph="◎" modulePath="features/profile" handoff="在这里实现个人档案、考试配置、通知与数据设置；身份鉴权接入时保持外层路由不变。" />;
}
