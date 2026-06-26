import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "AI 链上身份社区管家",
  description: "Discord + EVM + AI Agent community stewardship MVP"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
