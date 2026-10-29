-- ============================================================
-- 管理员体系迁移脚本（幂等，可重复执行）
-- 在 Supabase 控制台 -> SQL Editor 中整段执行
-- 新增内容：
--   1) profiles 增加 role（user / admin / super_admin）与 is_banned 字段
--   2) admin_applications 管理员申请表（普通用户提交，超管审批）
--   3) admin_logs 管理操作日志（审计）
--   4) items 策略放开给管理员：可强制下架 / 删除任意商品
--   5) 内置超级管理员账号（默认 superadmin@example.com / Admin@123456）
-- ============================================================

-- 0. 启用 pgcrypto（用于密码加密写入）
create extension if not exists pgcrypto with schema extensions;

-- 1. 用户角色与封禁状态
alter table public.profiles
  add column if not exists role text not null default 'user';
alter table public.profiles
  add column if not exists is_banned boolean not null default false;

-- 兼容老数据：已有 profiles 默认就是普通用户
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_role_check' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_role_check
      check (role in ('user', 'admin', 'super_admin'));
  end if;
end $$;

create index if not exists profiles_role_idx on public.profiles (role);

-- 2. 管理员申请表
create table if not exists public.admin_applications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  reason      text not null default '',
  status      text not null default 'pending'
              check (status in ('pending', 'approved', 'rejected')),
  reviewer_id uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);

-- 同一用户同时只能有一条待审申请（防重复提交刷屏）
create unique index if not exists admin_applications_pending_uniq
  on public.admin_applications (user_id)
  where status = 'pending';
create index if not exists admin_applications_status_idx
  on public.admin_applications (status, created_at desc);

-- 3. 管理操作日志
create table if not exists public.admin_logs (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid references public.profiles(id) on delete set null,
  action      text not null,
  target_type text not null default '',
  target_id   text not null default '',
  note        text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists admin_logs_created_idx
  on public.admin_logs (created_at desc);

-- 4. 权限判定函数（security definer 避免 RLS 递归）
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'super_admin')
  );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'super_admin'
  );
$$;

-- 5. RLS：新表
alter table public.admin_applications enable row level security;
alter table public.admin_logs         enable row level security;

drop policy if exists "admin_applications_select" on public.admin_applications;
create policy "admin_applications_select" on public.admin_applications
  for select using (auth.uid() = user_id or public.is_super_admin());

drop policy if exists "admin_applications_insert" on public.admin_applications;
create policy "admin_applications_insert" on public.admin_applications
  for insert with check (
    auth.uid() = user_id
    and not exists (
      select 1 from public.profiles where id = auth.uid() and role in ('admin', 'super_admin')
    )
  );

-- 审批只允许超级管理员执行
drop policy if exists "admin_applications_update" on public.admin_applications;
create policy "admin_applications_update" on public.admin_applications
  for update using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "admin_logs_select" on public.admin_logs;
create policy "admin_logs_select" on public.admin_logs
  for select using (public.is_admin());

drop policy if exists "admin_logs_insert" on public.admin_logs;
create policy "admin_logs_insert" on public.admin_logs
  for insert with check (public.is_admin());

-- 6. items：管理员可强制下架 / 删除任意商品
drop policy if exists "items_update" on public.items;
create policy "items_update" on public.items
  for update using (auth.uid() = seller_id or public.is_admin());

drop policy if exists "items_delete" on public.items;
create policy "items_delete" on public.items
  for delete using (auth.uid() = seller_id or public.is_admin());

-- 7. 超级管理员引导说明
--    不要用 SQL 直插 auth.users（会产生无法登录的残缺账号）。
--    正确方式：部署方在环境变量中设置 SUPER_ADMIN_EMAIL=<邮箱>，
--    然后用该邮箱走网站正常注册流程，注册接口会自动赋予超管身份。
--    若账号已存在（普通注册过），执行：
--      update public.profiles set role = 'super_admin'
--      where lower(email) = '<邮箱>';
