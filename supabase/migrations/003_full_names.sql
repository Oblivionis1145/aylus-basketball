-- 报名增加 First name / Last name；原来的 name 字段作为 Preferred name（名单上显示的称呼）。
alter table public.signups add column if not exists first_name text not null default '';
alter table public.signups add column if not exists last_name text not null default '';
alter table public.signups drop constraint if exists signups_first_len;
alter table public.signups add constraint signups_first_len check (char_length(first_name) <= 40);
alter table public.signups drop constraint if exists signups_last_len;
alter table public.signups add constraint signups_last_len check (char_length(last_name) <= 40);
