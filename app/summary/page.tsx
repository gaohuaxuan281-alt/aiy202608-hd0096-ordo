import type { Metadata } from "next";
import { SummaryPage } from "../../features/summary/SummaryPage";

export const metadata: Metadata = { title: "反馈总结" };
export default function Page() { return <SummaryPage />; }
