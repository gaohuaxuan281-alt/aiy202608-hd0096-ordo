import type { Metadata } from "next";
import { InsightsPage } from "../../features/insights/InsightsPage";

export const metadata: Metadata = { title: "进展洞察" };
export default function Page() { return <InsightsPage />; }
