import type { Metadata } from "next";
import { ProfilePage } from "../../features/profile/ProfilePage";
import { getCurrentUser } from "../../lib/current-user";
import { getUserProfile } from "../../lib/profile";
import { DEFAULT_USER_PROFILE } from "../../lib/profile-types";

export const metadata: Metadata = { title: "用户中心" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser();
  const profile = user ? await getUserProfile(user.id) : DEFAULT_USER_PROFILE;
  return <ProfilePage initialProfile={profile} />;
}
