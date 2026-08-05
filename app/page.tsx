import { HomePage } from "../features/home/HomePage";
import {
  emptyHomeAdapters,
  getHomeDashboardSnapshot,
} from "../features/home/home-data";
import { getCurrentUser } from "../lib/current-user";
import { getHomeSummarySlice } from "../lib/daily-feedback";
import { getLatestCompletedDiagnosticQuiz } from "../lib/diagnostic-quiz";
import { listJournalEntries } from "../lib/journal-store";
import { getLearningProfile } from "../lib/learning-profile";

export default async function Page() {
  const user = await getCurrentUser();
  const [examPlan, diagnosticQuiz, journalEntries] = user
    ? await Promise.all([
        getLearningProfile(user.id),
        getLatestCompletedDiagnosticQuiz(user.id),
        listJournalEntries(user.id, 4),
      ])
    : [null, null, []];
  const snapshot = await getHomeDashboardSnapshot({
    adapters: user
      ? {
          ...emptyHomeAdapters,
          summary: () => getHomeSummarySlice(user.id),
        }
      : emptyHomeAdapters,
    examPlan,
    diagnosticQuiz,
    journalEntries,
  });
  return <HomePage snapshot={snapshot} />;
}
