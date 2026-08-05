import type { Metadata } from "next";
import { TimelineCreatePage } from "../../../features/timeline/TimelineCreatePage";

export const metadata: Metadata = { title: "创建 Timeline" };
export default function Page() { return <TimelineCreatePage />; }
