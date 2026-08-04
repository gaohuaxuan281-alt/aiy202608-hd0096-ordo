import { HomePage } from "../features/home/HomePage";
import { getHomeDashboardSnapshot } from "../features/home/home-data";

export default async function Page() {
  const snapshot = await getHomeDashboardSnapshot();
  return <HomePage snapshot={snapshot} />;
}
