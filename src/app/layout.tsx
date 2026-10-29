import type { Metadata } from 'next';
import Navbar from '@/components/Navbar';
import SessionHeartbeat from '@/components/SessionHeartbeat';
import './globals.css';

export const metadata: Metadata = {
  title: '校园二手集市 - 校园闲置物品精准流转平台',
  description:
    '只面向本校学生的闲置物品交易平台：物品预约自提、交易完成标记、闲置到期自动下架',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <Navbar />
        <SessionHeartbeat />
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
