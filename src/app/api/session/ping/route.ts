import { NextResponse } from 'next/server';

// 会话心跳端点：请求会经过 middleware，
// - 已登录 -> middleware 顺带刷新 session_last_seen（本接口只需返回成功）
// - 会话已被其他设备接管 -> middleware 重定向到 /login，客户端据跳转落点判断被踢
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ ok: true });
}
