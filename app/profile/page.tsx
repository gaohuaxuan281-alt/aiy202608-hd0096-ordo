import type { Metadata } from "next";
import { ProfilePage } from "../../features/profile/ProfilePage";

export const metadata: Metadata = { title: "用户中心" };
export default function Page() { return <ProfilePage />; }
