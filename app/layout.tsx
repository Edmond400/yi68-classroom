import type { Metadata } from "next";
import "./globals.css";
import { SiteShell } from '@/components/site-shell';
import { Toaster } from '@/components/ui/sonner';

export const metadata: Metadata = {
  title: { default: '艺68 · 班级服务站', template: '%s · 艺68' },
  description: '六八六八，艺路生花。清华大学美术学院艺68班：班务日志、日程与DDL、重要事项和班内意见反馈。',
  icons: {
    icon: "/brand/class-emblem.png",
    shortcut: "/brand/class-emblem.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased"><SiteShell>{children}</SiteShell><Toaster position="top-center" /></body>
    </html>
  );
}
