import type { Metadata } from "next";
import { JournalPage } from "../../features/journal/JournalPage";

export const metadata: Metadata = { title: "日志" };
export default function Page() { return <JournalPage />; }
