'use client';

import { useEffect } from 'react';

// 会话保活心跳：页面打开期间每 60 秒向后端报告一次在线状态
// - 维持单设备登录的"正在使用中"判定（用户停留在页面浏览也算活跃，不会被误判离线）
// - 会话被其他设备接管 / 管理员强制下线时，自动跳回登录页并提示
export default function SessionHeartbeat() {
  useEffect(() => {
    let stopped = false;

    const ping = async () => {
      try {
        const res = await fetch('/api/session/ping', { cache: 'no-store' });
        // 被踢时 middleware 把请求重定向到登录页：fetch 跟随重定向后落点是 /login
        if (res.redirected && new URL(res.url).pathname === '/login') {
          stopped = true;
          window.location.replace('/login?kicked=1');
        }
      } catch {
        // 网络波动忽略，下一轮心跳重试
      }
    };

    void ping();
    const timer = setInterval(() => {
      if (!stopped) void ping();
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  return null;
}
