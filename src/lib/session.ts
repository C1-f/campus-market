// 单设备登录（单点会话）配置与判定逻辑
// 说明：profiles.session_id 保存当前占位的会话标识，只有服务端可写（客户端已被收回列级写权限）

import type { CookieOptions } from '@supabase/ssr';

export const SESSION_COOKIE = 'cm_sid';
export const HEARTBEAT_COOKIE = 'cm_hb';

// 把 Cookie 改为会话级（不写 Max-Age / Expires）：
// 浏览器关闭时自动清除 -> 用户关闭网页即视为退出登录
// 删除类操作（maxAge === 0）保持原样，确保登出/吊销能正常清 Cookie
export function toSessionCookieOptions(options: CookieOptions): CookieOptions {
  const o: Record<string, unknown> = { ...options };
  if (o.maxAge !== 0) {
    delete o.maxAge;
    delete o.expires;
  }
  return o as CookieOptions;
}

// 中间件心跳检查间隔：30 秒内不重复查库，控制请求开销
export const HEARTBEAT_INTERVAL_MS = 30_000;

// 默认空闲超时：30 分钟无任何请求视为已离线，允许其他设备接管
const DEFAULT_IDLE_MINUTES = 30;

export function sessionIdleMs(): number {
  const n = Number(process.env.SESSION_IDLE_MINUTES || DEFAULT_IDLE_MINUTES);
  return (Number.isFinite(n) && n > 0 ? n : DEFAULT_IDLE_MINUTES) * 60_000;
}

// 登录占用判定窗口：其他设备最近 N 分钟内有心跳才视为"正在使用中"，拒绝新登录
// （网页关闭后心跳停止，超过该窗口即可直接接管，无需等待完整的空闲超时）
const DEFAULT_ACTIVE_MINUTES = 2;

export function sessionActiveMs(): number {
  const n = Number(process.env.SESSION_ACTIVE_MINUTES || DEFAULT_ACTIVE_MINUTES);
  return (Number.isFinite(n) && n > 0 ? n : DEFAULT_ACTIVE_MINUTES) * 60_000;
}

export interface SessionState {
  session_id: string | null;
  session_last_seen: string | null;
}

// 该账号当前是否"在线占用中"（有会话标识且最近有活动）
export function isSessionActive(state: SessionState | null | undefined, now = Date.now()): boolean {
  if (!state?.session_id || !state.session_last_seen) return false;
  const last = new Date(state.session_last_seen).getTime();
  if (!Number.isFinite(last)) return false;
  return now - last < sessionIdleMs();
}

// 该账号是否"正在被使用中"（最近一个短窗口内仍有心跳）
// 用于登录接口：只有原设备确实正在浏览时才拒绝新登录，否则直接接管
export function isSessionBusy(state: SessionState | null | undefined, now = Date.now()): boolean {
  if (!state?.session_id || !state.session_last_seen) return false;
  const last = new Date(state.session_last_seen).getTime();
  if (!Number.isFinite(last)) return false;
  return now - last < sessionActiveMs();
}
