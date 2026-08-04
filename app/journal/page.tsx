import type { Metadata } from "next";
import { createD1JournalAdapter, getJournalSnapshot } from "../../features/journal/journal-data";
import { JournalPage } from "../../features/journal/JournalPage";
import { getCurrentUser } from "../../lib/current-user";

export const metadata: Metadata = { title: "日志" };
export default async function Page() {
  const user = await getCurrentUser();
  const snapshot = await getJournalSnapshot(user ? createD1JournalAdapter(user.id) : undefined);
  return <JournalPage snapshot={snapshot} />;
}
