export type FeatureId =
  | "home"
  | "timeline"
  | "todo"
  | "ai-tutor"
  | "journal"
  | "summary"
  | "insights"
  | "profile";

export type NavigationItem = {
  id: FeatureId;
  label: string;
  href: string;
  glyph: string;
  badge?: string;
};

export const navigation: NavigationItem[] = [
  { id: "home", label: "首页", href: "/", glyph: "⌂" },
  { id: "timeline", label: "Timeline", href: "/timeline", glyph: "◫" },
  { id: "todo", label: "Todo", href: "/todo", glyph: "✓", badge: "3" },
  { id: "ai-tutor", label: "AI Tutor", href: "/ai-tutor", glyph: "✦" },
  { id: "journal", label: "日志", href: "/journal", glyph: "▤" },
  { id: "summary", label: "反馈总结", href: "/summary", glyph: "◇" },
  { id: "insights", label: "进展洞察", href: "/insights", glyph: "◒" },
  { id: "profile", label: "用户中心", href: "/profile", glyph: "◎" },
];
