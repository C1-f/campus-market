-- ============================================================
-- 单设备登录（同一账号同一时刻只允许一台设备在线）
-- 迁移脚本（幂等，可重复执行）
--   1) profiles 增加 session_id（当前在线会话标识）与 session_last_seen（心跳时间）
--   2) 会话字段只允许服务端（service_role）写入，防止用户自己清空绕过限制
--   3) 已在线账号禁止新设备登录；空闲超过 SESSION_IDLE_MINUTES（默认 30 分钟）自动释放
-- ============================================================

alter table public.profiles
  add column if not exists session_id text;
alter table public.profiles
  add column if not exists session_last_seen timestamptz;

create index if not exists profiles_session_idx
  on public.profiles (session_id);

-- 收回普通用户对自己会话字段的写权限（service_role 拥有 BYPASSRLS，服务端仍可写）
revoke update (session_id, session_last_seen) on public.profiles from authenticated;
revoke update (session_id, session_last_seen) on public.profiles from anon;

-- 验证：应能看到 session_id / session_last_seen 两列
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
order by ordinal_position;
