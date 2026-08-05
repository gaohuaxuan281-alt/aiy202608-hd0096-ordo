import type { Metadata } from "next";
import { SummaryPage } from "../../features/summary/SummaryPage";
import { getCurrentUser } from "../../lib/current-user";
import { getFeedbackPageSnapshot } from "../../lib/daily-feedback";

export const metadata: Metadata = { title: "反馈总结" };
export default async function Page() {
  const user = await getCurrentUser();
  const initialSnapshot = user
    ? await getFeedbackPageSnapshot(user.id)
    : undefined;
  return <SummaryPage initialSnapshot={initialSnapshot} />;
}
