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

-- 7. 内置超级管理员账号
--    邮箱/密码请按需要修改后执行；执行后该账号登录即可进入管理后台
do $$
declare
  admin_email text := 'superadmin@example.com';
  admin_pass  text := 'Admin@123456';
  new_id      uuid;
begin
  if not exists (select 1 from auth.users where lower(email) = admin_email) then
    new_id := gen_random_uuid();
    insert into auth.users (
      id, instance_id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      is_super_admin, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new
    ) values (
      new_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', admin_email,
      extensions.crypt(admin_pass, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"nickname":"超级管理员"}'::jsonb,
      false, now(), now(),
      '', '', ''
    );
  else
    select id into new_id from auth.users where lower(email) = admin_email;
  end if;

  -- 补齐 auth.identities 身份记录（没有它无法登录）
  if not exists (
    select 1 from auth.identities where user_id = new_id and provider = 'email'
  ) then
    insert into auth.identities (
      id, user_id, provider_id, identity_data,
      provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), new_id, new_id::text,
      jsonb_build_object('sub', new_id::text, 'email', admin_email),
      'email', now(), now(), now()
    );
  end if;

  update public.profiles
     set role = 'super_admin', is_banned = false
   where lower(email) = admin_email;
end $$;
