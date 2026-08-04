import type { Metadata } from "next";
import { ProfilePage } from "../../features/profile/ProfilePage";
import { getCurrentUser } from "../../lib/current-user";
import { getLearningProfile } from "../../lib/learning-profile";
import { getUserProfile } from "../../lib/profile";
import { DEFAULT_USER_PROFILE } from "../../lib/profile-types";

export const metadata: Metadata = { title: "用户中心" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser();
  const [profile, learningProfile] = user
    ? await Promise.all([getUserProfile(user.id), getLearningProfile(user.id)])
    : [DEFAULT_USER_PROFILE, null];
  if (!learningProfile) return null;
  return <ProfilePage initialProfile={profile} initialLearningProfile={learningProfile} />;
}
