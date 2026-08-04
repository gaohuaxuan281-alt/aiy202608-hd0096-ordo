import type { Metadata } from "next";
import { AITutorPage } from "../../features/ai-tutor/AITutorPage";

export const metadata: Metadata = { title: "AI Tutor" };
export default function Page() { return <AITutorPage />; }
