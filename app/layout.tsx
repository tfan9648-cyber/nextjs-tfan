import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "上市公司要闻汇总",
  description: "AI 自动汇总上市公司最新动态",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body style={{ fontFamily: 'sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
