-- 新版 Supabase 项目不会自动给网页开放表的访问权限，需要运行这一段。
-- 真正谁能看、谁能改，仍然由 schema.sql 里的权限规则（RLS）决定。
grant usage on schema public to anon, authenticated;
grant select on public.events, public.signups, public.team_assignments, public.photos, public.reports, public.volunteer_hours to anon;
grant select, insert, update, delete on public.profiles, public.events, public.signups, public.team_assignments, public.volunteer_hours, public.photos, public.reports to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.volunteer_leaderboard(), public.is_admin() to anon, authenticated;
