import type { Metadata } from "next";
import { headers } from "next/headers";
import { AppShell } from "../components/AppShell";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const description = "根据考试日期、剩余时间和掌握程度，拆解每日复习任务并动态调整。";

  return {
    metadataBase: new URL(origin),
    title: {
      default: "知序 · 考前学习任务设计器",
      template: "%s · 知序",
    },
    description,
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      type: "website",
      locale: "zh_CN",
      siteName: "知序",
      title: "知序 · 考前学习任务设计器",
      description,
      images: [{ url: `${origin}/og.png`, width: 1731, height: 909, alt: "知序考前学习任务设计器" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "知序 · 考前学习任务设计器",
      description,
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
