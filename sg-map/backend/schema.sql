-- 新加坡探店地图 · Supabase 数据库结构
-- 在 Supabase SQL Editor 里整段运行即可（可重复运行）。
-- 原则：任何人只能「读」；所有写入都经过 Edge Function（服务端校验口令后用 secret key 写）。

-- 1. 地点表 -------------------------------------------------------------
create table if not exists public.places (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  -- 类别代号，对应前端 config.js 里的 key；数据库不限定具体有哪些，方便以后增减
  category    text not null check (category ~ '^[a-z0-9_-]{1,32}$'),
  postal      text check (postal ~ '^[0-9]{6}$'),
  address     text check (char_length(address) <= 300),
  unit        text check (char_length(unit) <= 60),          -- 楼层/门牌，如 #B2-01
  lat         double precision not null check (lat between 1.1 and 1.5),
  lng         double precision not null check (lng between 103.5 and 104.2),
  images      jsonb not null default '[]'::jsonb             -- [{ "path": "...", "w": 1200, "h": 1600 }]，第一张为封面
              check (jsonb_typeof(images) = 'array' and jsonb_array_length(images) <= 12),
  links       text[] not null default '{}' check (cardinality(links) <= 10),
  note        text check (char_length(note) <= 2000),
  created_by  text not null check (char_length(created_by) between 1 and 24),
  updated_by  text check (char_length(updated_by) <= 24),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.places enable row level security;

drop policy if exists "places are readable by everyone" on public.places;
create policy "places are readable by everyone"
  on public.places for select to anon, authenticated using (true);
-- 不建 insert / update / delete 策略 → 公开 key 无法写入。再撤销权限，双保险。
revoke insert, update, delete, truncate on public.places from anon, authenticated;

-- 2. 内部表（OneMap token 缓存、口令失败记录）：公开 key 完全不可读写 --------
create table if not exists public.sgmap_kv (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.sgmap_kv enable row level security;
revoke all on public.sgmap_kv from anon, authenticated;

create table if not exists public.sgmap_auth_failures (
  id  bigint generated always as identity primary key,
  ip  text not null,
  at  timestamptz not null default now()
);
create index if not exists sgmap_auth_failures_ip_at on public.sgmap_auth_failures (ip, at);
alter table public.sgmap_auth_failures enable row level security;
revoke all on public.sgmap_auth_failures from anon, authenticated;

-- 3. 图片存储桶：公开读取，不建上传策略（只有 Edge Function 能写） -------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sg-map', 'sg-map', true, 1048576, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
