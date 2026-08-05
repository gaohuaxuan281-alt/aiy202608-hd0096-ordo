import { HomePage } from "../features/home/HomePage";
import { getHomeDashboardSnapshot } from "../features/home/home-data";
import { getCurrentUser } from "../lib/current-user";
import { getLearningProfile } from "../lib/learning-profile";

export default async function Page() {
  const user = await getCurrentUser();
  const examPlan = user ? await getLearningProfile(user.id) : null;
  const snapshot = await getHomeDashboardSnapshot({ examPlan });
  return <HomePage snapshot={snapshot} />;
}
