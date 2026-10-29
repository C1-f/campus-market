-- ============================================================
-- 修复内置超级管理员账号（supabase/migrate-admin.sql 第 7 节）
-- 问题：直接用 SQL 往 auth.users 插用户时漏了 auth.identities
--       身份记录，导致该账号无法登录、注册同邮箱时报
--       "Database error checking email"
-- 执行后可正常登录：superadmin@example.com / Admin@123456
-- ============================================================

-- 1. 补齐 auth.identities 身份记录（email 登录方式）
insert into auth.identities (
  id, user_id, provider_id, identity_data,
  provider, last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(),
  u.id,
  u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  'email',
  now(), now(), now()
from auth.users u
where lower(u.email) = 'superadmin@example.com'
  and not exists (
    select 1 from auth.identities i
    where i.user_id = u.id and i.provider = 'email'
  );

-- 2. 兜底：确保 profile 存在且角色为超级管理员
insert into public.profiles (id, email, nickname, role)
select u.id, u.email, '超级管理员', 'super_admin'
from auth.users u
where lower(u.email) = 'superadmin@example.com'
on conflict (id) do update set role = 'super_admin', is_banned = false;

-- 3. 验证：应返回 1 行，identity_count = 1
select u.email,
       (select count(*) from auth.identities i where i.user_id = u.id) as identity_count,
       (select role from public.profiles p where p.id = u.id) as role
from auth.users u
where lower(u.email) = 'superadmin@example.com';
