-- ============================================================
-- 修复内置超级管理员账号
-- 背景：migrate-admin.sql 旧版第 7 节用 SQL 直插 auth.users，
--       产生的账号缺少 GoTrue 完整内部状态，无法登录且会导致
--       管理 API 报错（Database error loading/finding users）。
-- 正确做法：先删除残缺账号（本脚本），再通过网站注册流程
--       或 Supabase 管理 API 重新创建——注册接口会自动识别
--       SUPER_ADMIN_EMAIL 环境变量并赋予超管身份。
-- ============================================================

-- 1. 删除残缺的身份记录
delete from auth.identities
where user_id in (
  select id from auth.users where lower(email) = 'superadmin@example.com'
);

-- 2. 删除残缺的 auth 账号（profiles 行会级联删除）
delete from auth.users
where lower(email) = 'superadmin@example.com';

-- 3. 验证：应返回 0 行
select count(*) as remaining from auth.users
where lower(email) = 'superadmin@example.com';

-- 4. 重建方式（任选其一）：
--    a) 网站注册页用 superadmin@example.com 正常注册
--       （注册接口会按 SUPER_ADMIN_EMAIL 自动提权为超管）
--    b) 或由部署方调用 Supabase Admin API 创建后执行：
--       update public.profiles set role = 'super_admin'
--       where lower(email) = 'superadmin@example.com';
