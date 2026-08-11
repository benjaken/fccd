import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "FCCD 資料遷移控制台",
  description: "Bubble.io 至 Supabase 的資料遷移工具",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
