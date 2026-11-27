-- 让组织者可以在后台调整接龙顺序、代别人报名。
-- 普通用户的报名时间仍由服务器决定，不能插队。
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
