// 单设备登录（单点会话）配置与判定逻辑
// 说明：profiles.session_id 保存当前占位的会话标识，只有服务端可写（客户端已被收回列级写权限）

export const SESSION_COOKIE = 'cm_sid';
export const HEARTBEAT_COOKIE = 'cm_hb';

// 中间件心跳检查间隔：30 秒内不重复查库，控制请求开销
export const HEARTBEAT_INTERVAL_MS = 30_000;

// 默认空闲超时：30 分钟无任何请求视为已离线，允许其他设备接管
const DEFAULT_IDLE_MINUTES = 30;

export function sessionIdleMs(): number {
  const n = Number(process.env.SESSION_IDLE_MINUTES || DEFAULT_IDLE_MINUTES);
  return (Number.isFinite(n) && n > 0 ? n : DEFAULT_IDLE_MINUTES) * 60_000;
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
