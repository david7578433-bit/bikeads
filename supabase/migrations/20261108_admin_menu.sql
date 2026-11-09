-- Media on Wheels — admin menu migration (Nov 8 2026). Safe to run more than once. Touches ONLY mow_ objects.
-- 1) mow_settings: who changed the settings last (updated_by) + a read-only key/value view of the PUBLIC settings.
-- 2) mow_discounts: optional end date for a discount / promo code (expires_on); expired codes stop working.
-- 3) mow_profiles: an admin can turn an account off (disabled); a client cannot change it on their own row.

alter table public.mow_settings add column if not exists updated_by uuid;
create or replace function public.mow_settings_by()
returns trigger language plpgsql security definer set search_path = public
as $$ begin new.updated_by := auth.uid(); new.updated_at := now(); return new; end; $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'mow_settings_by') then
    create trigger mow_settings_by before insert or update on public.mow_settings for each row execute function public.mow_settings_by();
  end if;
end $$;
-- key/value view: only the 'public' row (prices, texts, colors, switches), readable by anyone; RLS of mow_settings applies (security_invoker).
create or replace view public.mow_settings_public with (security_invoker = true) as
  select s.key, s.value, m.updated_at from public.mow_settings m, jsonb_each(m.data) s where m.id = 'public';
grant select on public.mow_settings_public to anon, authenticated;

alter table public.mow_discounts add column if not exists expires_on date;
create or replace function public.mow_check_promo(p_code text)
returns setof public.mow_discounts
language sql stable security definer set search_path = public
as $$
  select d.* from public.mow_discounts d
   where auth.uid() is not null and d.kind = 'promo' and d.active
     and (d.expires_on is null or d.expires_on >= current_date)
     and upper(d.code) = upper(trim(coalesce(p_code, '')))
   limit 1;
$$;
revoke all on function public.mow_check_promo(text) from public, anon;
grant execute on function public.mow_check_promo(text) to authenticated;

alter table public.mow_profiles add column if not exists disabled boolean not null default false;
create or replace function public.mow_guard_profile()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not public.mow_is_admin() then
    new.role     := old.role;
    new.email    := old.email;
    new.id       := old.id;
    new.disabled := old.disabled;
  end if;
  return new;
end; $$;
