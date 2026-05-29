-- ============================================================
-- DJJ 财务报表 · Supabase 建表脚本
-- 在 Supabase 控制台 → SQL Editor 里粘贴运行即可
-- ============================================================

-- 每个月一行，整本工作簿存为 JSONB（含全部 sheet / 公式 / 数据）
create table if not exists public.djj_books (
  month       text primary key,           -- 'YYYY-MM'
  data        jsonb not null,              -- { sheetName: { rows, lastRow, lastCol } }
  updated_at  timestamptz not null default now()
);

-- 自动更新 updated_at
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_touch on public.djj_books;
create trigger trg_touch before update on public.djj_books
for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- 权限（RLS）
-- 简单起步：开启 RLS 并允许 anon 读写（仅自家内部使用、URL+key 不公开）。
-- 若要更严格，可改为只允许已登录用户（见下方注释）。
-- ------------------------------------------------------------
alter table public.djj_books enable row level security;

drop policy if exists "anon all" on public.djj_books;
create policy "anon all" on public.djj_books
  for all to anon using (true) with check (true);

-- 更安全的替代方案（需接入 Supabase Auth 后启用）：
-- drop policy if exists "anon all" on public.djj_books;
-- create policy "auth read"  on public.djj_books for select to authenticated using (true);
-- create policy "auth write" on public.djj_books for all    to authenticated using (true) with check (true);
