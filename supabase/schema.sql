-- ============================================================
-- 校园闲置物品精准流转平台 - 数据库结构
-- 在 Supabase 控制台 -> SQL Editor 中整段执行
-- ============================================================

-- 1. 用户资料表（注册时自动创建，关联 auth.users）
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  nickname    text not null check (char_length(nickname) between 2 and 20),
  created_at  timestamptz not null default now()
);

-- 2. 商品（闲置物品）表
create table if not exists public.items (
  id              uuid primary key default gen_random_uuid(),
  seller_id       uuid not null references public.profiles(id) on delete cascade,
  title           text not null check (char_length(title) between 2 and 60),
  description     text not null default '',
  category        text not null default 'other'
                  check (category in ('books','exam','sports','dorm','electronics','other')),
  price           numeric(10,2) not null check (price >= 0),
  negotiable      boolean not null default true,        -- 可议价 / 不议价
  status          text not null default 'available'
                  check (status in ('available','reserved','sold','expired')),
  image_urls      text[] not null default '{}',
  pickup_location text not null default '',              -- 自提地点
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null                   -- 闲置到期时间，到期自动下架
);
create index if not exists items_list_idx on public.items (status, expires_at desc, created_at desc);
create index if not exists items_category_idx on public.items (category);

-- 3. 收藏表
create table if not exists public.favorites (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  item_id     uuid not null references public.items(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, item_id)
);

-- 4. 预约自提表
create table if not exists public.reservations (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.items(id) on delete cascade,
  buyer_id    uuid not null references public.profiles(id) on delete cascade,
  note        text not null default '',                  -- 给卖家的留言（如方便的时间）
  status      text not null default 'pending'
              check (status in ('pending','confirmed','cancelled')),
  created_at  timestamptz not null default now(),
  unique (item_id, buyer_id)                             -- 同一买家对同一商品只能预约一次
);
create index if not exists reservations_item_idx on public.reservations (item_id);
create index if not exists reservations_buyer_idx on public.reservations (buyer_id);

-- ============================================================
-- 行级安全策略（RLS）：保证用户只能操作自己的数据
-- ============================================================
alter table public.profiles     enable row level security;
alter table public.items        enable row level security;
alter table public.favorites    enable row level security;
alter table public.reservations enable row level security;

-- profiles：所有人可读（用于显示卖家昵称），仅本人可改
create policy "profiles_select" on public.profiles
  for select using (true);
create policy "profiles_update" on public.profiles
  for update using (auth.uid() = id);

-- items：所有人可读；登录用户可发布自己的；仅卖家本人可改/删
create policy "items_select" on public.items
  for select using (true);
create policy "items_insert" on public.items
  for insert with check (auth.uid() = seller_id);
create policy "items_update" on public.items
  for update using (auth.uid() = seller_id);
create policy "items_delete" on public.items
  for delete using (auth.uid() = seller_id);

-- favorites：每人只能看到自己的收藏
create policy "fav_select" on public.favorites
  for select using (auth.uid() = user_id);
create policy "fav_insert" on public.favorites
  for insert with check (auth.uid() = user_id);
create policy "fav_delete" on public.favorites
  for delete using (auth.uid() = user_id);

-- reservations：买卖双方都可见；买家创建；取消=买卖双方，确认=仅卖家
create policy "resv_select" on public.reservations
  for select using (
    auth.uid() = buyer_id
    or exists (select 1 from public.items where id = item_id and seller_id = auth.uid())
  );
create policy "resv_insert" on public.reservations
  for insert with check (auth.uid() = buyer_id);
create policy "resv_update" on public.reservations
  for update using (
    auth.uid() = buyer_id
    or exists (select 1 from public.items where id = item_id and seller_id = auth.uid())
  );

-- ============================================================
-- 新用户注册时自动创建 profile（服务端注册 API 也会显式创建，双保险）
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, nickname)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nickname', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- （可选）到期自动下架：将 expires_at 已过的在售商品标记为 expired
-- 需要先在 Database -> Extensions 启用 pg_cron，再取消下面注释：
-- select cron.schedule('expire-items', '*/10 * * * *',
--   $$update public.items set status='expired'
--     where status='available' and expires_at < now()$$);
-- 注意：应用查询层本身已做 expires_at 过滤，即便不启用 cron，过期商品也不会展示。
-- ============================================================

-- ============================================================
-- 图片存储桶 item-images（公开读）
-- 在 Storage 页面手动创建同名 bucket 也可以，此处用 SQL 一键创建：
-- ============================================================
insert into storage.buckets (id, name, public)
values ('item-images', 'item-images', true)
on conflict (id) do nothing;

create policy "item_images_read" on storage.objects
  for select using (bucket_id = 'item-images');
create policy "item_images_insert" on storage.objects
  for insert with check (bucket_id = 'item-images' and auth.role() = 'authenticated');
