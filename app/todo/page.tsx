import type { Metadata } from "next";
import { TodoPage } from "../../features/todo/TodoPage";

export const metadata: Metadata = { title: "Todo" };
export default function Page() { return <TodoPage />; }
