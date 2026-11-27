-- AYLUS 社区公益篮球活动 · 数据库结构
-- 在 Supabase 后台 → SQL Editor 里整段粘贴运行一次即可。可重复运行。

-- ========== 用户资料 ==========
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- 新用户注册时自动建一条资料
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(coalesce(new.email, ''), '@', 1))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 是否组织者（管理员）
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- 普通用户不能把自己改成管理员
create or replace function public.protect_admin_flag() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() 为空表示在 SQL Editor 里以管理身份运行，允许修改
  if new.is_admin is distinct from old.is_admin and auth.uid() is not null and not public.is_admin() then
    new.is_admin := old.is_admin;
  end if;
  return new;
end $$;
drop trigger if exists profiles_protect_admin on public.profiles;
create trigger profiles_protect_admin before update on public.profiles
  for each row execute function public.protect_admin_flag();

-- ========== 每周活动 ==========
create table if not exists public.events (
  id bigint generated always as identity primary key,
  round int not null,                       -- 第几回
  event_date date not null unique,
  time_text text not null default '9:00–13:00',
  location text not null default 'Syosset-Woodbury Community Park 篮球场（11791）',
  cap int not null default 15,              -- 人数上限
  status text not null default 'ok' check (status in ('ok','tbd','cancel')),
  weather_note text not null default '',
  notice text not null default '',
  signup_open boolean not null default true,
  created_at timestamptz not null default now()
);

-- ========== 接龙报名 ==========
create table if not exists public.signups (
  id bigint generated always as identity primary key,
  event_id bigint not null references public.events(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  age int not null check (age between 1 and 99),
  is_volunteer boolean not null default false,
  join_after boolean not null default true,  -- 参加训练后交流活动
  no_photo boolean not null default false,   -- 不希望被拍照
  created_at timestamptz not null default now()
);
create index if not exists signups_event_idx on public.signups(event_id, created_at);
create unique index if not exists signups_unique_name on public.signups(event_id, user_id, lower(name));

-- 报名时间由服务器决定，防止插队（组织者可在后台调整顺序）
create or replace function public.signup_stamp() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.user_id := coalesce(auth.uid(), new.user_id);
    if not public.is_admin() then new.created_at := now(); end if;
  else
    new.user_id := old.user_id; new.event_id := old.event_id;
    if not public.is_admin() then new.created_at := old.created_at; end if;
  end if;
  return new;
end $$;
drop trigger if exists signups_stamp on public.signups;
create trigger signups_stamp before insert or update on public.signups
  for each row execute function public.signup_stamp();

-- ========== 分组（只有组织者能改） ==========
create table if not exists public.team_assignments (
  signup_id bigint primary key references public.signups(id) on delete cascade,
  team text not null check (team in ('A','B','T'))
);

-- ========== 义工时长（只有组织者能改） ==========
create table if not exists public.volunteer_hours (
  signup_id bigint primary key references public.signups(id) on delete cascade,
  hours numeric(4,1) not null check (hours >= 0 and hours <= 24),
  updated_at timestamptz not null default now()
);

-- 义工排行榜：按“账号 + 称呼”汇总，所有人可看
create or replace function public.volunteer_leaderboard()
returns table(name text, total_hours numeric, events int)
language sql stable security definer set search_path = public as $$
  select min(s.name) as name, sum(h.hours) as total_hours, count(*)::int as events
  from public.volunteer_hours h join public.signups s on s.id = h.signup_id
  group by s.user_id, lower(s.name)
  order by total_hours desc, name;
$$;

-- ========== 照片墙 ==========
create table if not exists public.photos (
  id bigint generated always as identity primary key,
  event_id bigint references public.events(id) on delete set null,
  path text not null,             -- Storage 里 photos 桶中的路径
  caption text not null default '',
  created_at timestamptz not null default now()
);

-- ========== 每周活动报告 ==========
create table if not exists public.reports (
  id bigint generated always as identity primary key,
  event_id bigint unique references public.events(id) on delete cascade,
  title text not null,
  body text not null,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ========== 权限规则（Row Level Security） ==========
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.signups enable row level security;
alter table public.team_assignments enable row level security;
alter table public.volunteer_hours enable row level security;
alter table public.photos enable row level security;
alter table public.reports enable row level security;

do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname='public'
    and tablename in ('profiles','events','signups','team_assignments','volunteer_hours','photos','reports')
  loop execute format('drop policy %I on public.%I', r.policyname, r.tablename); end loop;
end $$;

-- 资料：自己看自己改，组织者看全部
create policy p_read on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy p_update on public.profiles for update using (id = auth.uid() or public.is_admin());

-- 活动：所有人可看，组织者可改
create policy e_read on public.events for select using (true);
create policy e_admin on public.events for all using (public.is_admin()) with check (public.is_admin());

-- 报名：所有人可看名单；登录用户给自己报名、取消自己的；组织者可改全部
create policy s_read on public.signups for select using (true);
create policy s_insert on public.signups for insert to authenticated
  with check (exists (select 1 from public.events e where e.id = event_id and e.signup_open and e.status <> 'cancel'));
create policy s_update on public.signups for update to authenticated using (user_id = auth.uid() or public.is_admin());
create policy s_delete on public.signups for delete to authenticated using (user_id = auth.uid() or public.is_admin());

-- 分组：所有人可看，组织者可改
create policy t_read on public.team_assignments for select using (true);
create policy t_admin on public.team_assignments for all using (public.is_admin()) with check (public.is_admin());

-- 义工时长：本人和组织者可看明细，只有组织者可改
create policy h_read on public.volunteer_hours for select using (
  public.is_admin() or exists (select 1 from public.signups s where s.id = signup_id and s.user_id = auth.uid()));
create policy h_admin on public.volunteer_hours for all using (public.is_admin()) with check (public.is_admin());

-- 照片、报告：所有人可看（报告需已发布），组织者可改
create policy ph_read on public.photos for select using (true);
create policy ph_admin on public.photos for all using (public.is_admin()) with check (public.is_admin());
create policy r_read on public.reports for select using (published or public.is_admin());
create policy r_admin on public.reports for all using (public.is_admin()) with check (public.is_admin());


-- ========== 表访问权限 ==========
grant usage on schema public to anon, authenticated;
grant select on public.events, public.signups, public.team_assignments, public.photos, public.reports, public.volunteer_hours to anon;
grant select, insert, update, delete on public.profiles, public.events, public.signups, public.team_assignments, public.volunteer_hours, public.photos, public.reports to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.volunteer_leaderboard(), public.is_admin() to anon, authenticated;

-- ========== 照片存储桶 ==========
insert into storage.buckets (id, name, public) values ('photos', 'photos', true)
  on conflict (id) do update set public = true;
drop policy if exists photos_admin_write on storage.objects;
create policy photos_admin_write on storage.objects for all to authenticated
  using (bucket_id = 'photos' and public.is_admin())
  with check (bucket_id = 'photos' and public.is_admin());

-- ========== 第一期活动（可删改） ==========
insert into public.events (round, event_date) values (13, '2026-11-29') on conflict (event_date) do nothing;

-- ========== 最后一步：把你自己设为组织者 ==========
-- 先在网站上用你的邮箱登录一次，再把下面的邮箱换成你的，去掉开头的 -- 运行：
-- update public.profiles set is_admin = true where id = (select id from auth.users where email = 'you@example.com');
