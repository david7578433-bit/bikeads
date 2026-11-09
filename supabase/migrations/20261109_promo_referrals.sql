-- =====================================================================================================
-- Media on Wheels — COMPANY PROMO CODES + REFERRALS (David, Nov 8 2026 7:00 PM: "this organization get a discount, so we
-- give this organization a promo code" / "Also, maybe add the option of referrals"). Safe to run more than once.
-- 1) mow_discounts: a promo code can be dollars off (amount_type 'fixed', amount_off), count only some campaigns
--    (applies_to 'campaigns', campaign_names), belong to one company (company_id = that client account, company = its
--    company name; empty = anyone) and have a usage limit (max_uses). mow_promo_check(code) says why a code cannot be used
--    ('notfound' | 'expired' | 'company' | 'used'); mow_check_promo(code) keeps working and now also checks company + limit.
-- 2) mow_profiles.referral_code: every account gets its own code (made by the database, a client cannot change it).
-- 3) mow_referrals: who referred whom, status (joined → requested → earned → used, or cancelled), the new client's
--    first-order discount and the referrer's reward (percent or dollars; from Admin → Referrals, mow_settings 'public':
--    refOn, refNewType, refNewValue, refRewardType, refRewardValue, refWhen). RLS: a client sees only rows where they are
--    the referrer or the new client; only the admin writes. Clients use mow_claim_referral(code) and
--    mow_referral_mark(booking id); a trigger on bookings moves the status when the first order is approved (or its
--    deposit paid) and gives a discount / reward back when its order is declined or cancelled.
-- =====================================================================================================

-- ---------- 1) promo codes for one company, dollars off, some campaigns, usage limit ----------
alter table public.mow_discounts add column if not exists amount_type    text not null default 'pct';
alter table public.mow_discounts add column if not exists amount_off     numeric(10,2);
alter table public.mow_discounts add column if not exists applies_to     text not null default 'order';
alter table public.mow_discounts add column if not exists campaign_names text[] not null default '{}';
alter table public.mow_discounts add column if not exists company_id     uuid references auth.users (id) on delete set null;
alter table public.mow_discounts add column if not exists company        text not null default '';
alter table public.mow_discounts add column if not exists max_uses       integer;
alter table public.mow_discounts drop constraint if exists mow_discounts_pct_check;
alter table public.mow_discounts add constraint mow_discounts_pct_check check (pct >= 0 and pct <= 90);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'mow_discounts_value_check' and conrelid = 'public.mow_discounts'::regclass) then
    alter table public.mow_discounts add constraint mow_discounts_value_check check (
      amount_type in ('pct', 'fixed') and applies_to in ('order', 'campaigns') and (max_uses is null or max_uses >= 1)
      and ((amount_type = 'pct' and pct > 0) or (amount_type = 'fixed' and coalesce(amount_off, 0) > 0)));
  end if;
end $$;
create index if not exists mow_discounts_company_idx on public.mow_discounts (company_id);

create or replace function public.mow_promo_check(p_code text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  d public.mow_discounts;
  v_company text;
  v_uses integer;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'reason', 'notfound'); end if;
  select * into d from public.mow_discounts x where x.kind = 'promo' and upper(x.code) = upper(trim(coalesce(p_code, ''))) limit 1;
  if not found then return jsonb_build_object('ok', false, 'reason', 'notfound'); end if;
  if not d.active or (d.expires_on is not null and d.expires_on < current_date) then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  if d.company_id is not null or trim(coalesce(d.company, '')) <> '' then
    select p.company into v_company from public.mow_profiles p where p.id = auth.uid();
    if not (d.company_id is not distinct from auth.uid()
            or (trim(coalesce(d.company, '')) <> '' and lower(regexp_replace(trim(d.company), '\s+', ' ', 'g')) = lower(regexp_replace(trim(coalesce(v_company, '')), '\s+', ' ', 'g')))) then
      return jsonb_build_object('ok', false, 'reason', 'company');
    end if;
  end if;
  if coalesce(d.max_uses, 0) > 0 then
    select count(*) into v_uses from public.mow_records r
     where r.collection = 'bookings' and upper(trim(coalesce(r.data->>'promoCode', ''))) = upper(d.code)
       and coalesce(r.data->>'status', '') not in ('declined', 'cancelled');
    if v_uses >= d.max_uses then return jsonb_build_object('ok', false, 'reason', 'used'); end if;
  end if;
  return jsonb_build_object('ok', true, 'rule', to_jsonb(d));
end; $$;

create or replace function public.mow_check_promo(p_code text)
returns setof public.mow_discounts
language sql stable security definer set search_path = public
as $$
  select d.* from public.mow_discounts d
   where auth.uid() is not null and d.kind = 'promo' and d.active
     and (d.expires_on is null or d.expires_on >= current_date)
     and upper(d.code) = upper(trim(coalesce(p_code, '')))
     and coalesce((public.mow_promo_check(p_code)->>'ok')::boolean, false)
   limit 1;
$$;
revoke all on function public.mow_promo_check(text) from public, anon;
grant execute on function public.mow_promo_check(text) to authenticated;
revoke all on function public.mow_check_promo(text) from public, anon;
grant execute on function public.mow_check_promo(text) to authenticated;

-- ---------- 2) every account's own referral code ----------
alter table public.mow_profiles add column if not exists referral_code text;
create unique index if not exists mow_profiles_refcode_idx on public.mow_profiles (upper(referral_code)) where referral_code is not null;

create or replace function public.mow_new_ref_code(p_company text, p_name text)
returns text language plpgsql volatile security definer set search_path = public
as $$
declare
  v_base text := left(upper(regexp_replace(coalesce(nullif(trim(p_company), ''), nullif(trim(p_name), ''), 'MOW'), '[^A-Za-z0-9]', '', 'g')), 6);
  v_code text;
begin
  if v_base = '' then v_base := 'MOW'; end if;
  loop
    v_code := v_base || '-' || (1000 + floor(random() * 9000))::int::text;
    exit when not exists (select 1 from public.mow_profiles p where upper(p.referral_code) = v_code);
  end loop;
  return v_code;
end; $$;

create or replace function public.mow_profile_refcode()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.referral_code is not null and new.referral_code is distinct from old.referral_code
     and auth.uid() is not null and not public.mow_is_admin() then
    new.referral_code := old.referral_code;                           -- a client cannot change their code
  end if;
  if coalesce(new.referral_code, '') = '' then new.referral_code := public.mow_new_ref_code(new.company, new.name); end if;
  return new;
end; $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'mow_profiles_refcode') then
    create trigger mow_profiles_refcode before insert or update on public.mow_profiles for each row execute function public.mow_profile_refcode();
  end if;
end $$;
update public.mow_profiles set referral_code = public.mow_new_ref_code(company, name) where coalesce(referral_code, '') = '';

-- ---------- 3) referrals ----------
create table if not exists public.mow_referrals (
  id                 text primary key,
  code               text not null default '',
  referrer_id        uuid references auth.users (id) on delete set null,   -- gets the reward
  referred_id        uuid references auth.users (id) on delete cascade,    -- the new client (first-order discount)
  referrer_name      text not null default '',
  referred_name      text not null default '',
  status             text not null default 'joined' check (status in ('joined', 'requested', 'earned', 'used', 'cancelled')),
  first_booking_id   text,
  reward_booking_id  text,
  new_type           text not null default 'pct' check (new_type in ('pct', 'fixed')),
  new_value          numeric(10,2) not null default 10 check (new_value >= 0),
  reward_type        text not null default 'pct' check (reward_type in ('pct', 'fixed')),
  reward_value       numeric(10,2) not null default 10 check (reward_value >= 0),
  note               text not null default '',
  manual             boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  requested_at       timestamptz,
  earned_at          timestamptz,
  used_at            timestamptz,
  check (referrer_id is distinct from referred_id)
);
comment on table public.mow_referrals is 'Media on Wheels: referrals (who referred whom, first-order discount, referrer reward and whether it was used).';
create unique index if not exists mow_referrals_one_per_client on public.mow_referrals (referred_id) where status <> 'cancelled';
create index if not exists mow_referrals_referrer_idx on public.mow_referrals (referrer_id);
create index if not exists mow_referrals_first_idx on public.mow_referrals (first_booking_id);
create index if not exists mow_referrals_reward_idx on public.mow_referrals (reward_booking_id);
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'mow_referrals_touch') then
    create trigger mow_referrals_touch before update on public.mow_referrals for each row execute function public.mow_touch();
  end if;
end $$;

alter table public.mow_referrals enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mow_referrals' and policyname = 'mow_referrals_read') then
    create policy mow_referrals_read on public.mow_referrals for select to authenticated
      using (referrer_id = auth.uid() or referred_id = auth.uid() or public.mow_is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mow_referrals' and policyname = 'mow_referrals_admin') then
    create policy mow_referrals_admin on public.mow_referrals for all to authenticated
      using (public.mow_is_admin()) with check (public.mow_is_admin());
  end if;
end $$;
revoke all on public.mow_referrals from anon;
grant select, insert, update, delete on public.mow_referrals to authenticated;

-- the program settings (Admin → Referrals), read from the public settings row
create or replace function public.mow_ref_setting(p_key text, p_default text)
returns text language sql stable security definer set search_path = public
as $$ select coalesce(nullif((select s.data->>p_key from public.mow_settings s where s.id = 'public'), ''), p_default); $$;

-- a new client uses another client's code (internal; clients call mow_claim_referral)
create or replace function public.mow_do_claim(p_uid uuid, p_code text)
returns jsonb language plpgsql volatile security definer set search_path = public
as $$
declare
  me public.mow_profiles;
  owner public.mow_profiles;
  r public.mow_referrals;
  dg_a text; dg_b text;
begin
  if p_uid is null then return jsonb_build_object('ok', false, 'reason', 'signin'); end if;
  if lower(public.mow_ref_setting('refOn', 'true')) = 'false' then return jsonb_build_object('ok', false, 'reason', 'off'); end if;
  select * into me from public.mow_profiles p where p.id = p_uid;
  if not found then return jsonb_build_object('ok', false, 'reason', 'signin'); end if;
  select * into owner from public.mow_profiles p where upper(p.referral_code) = upper(trim(coalesce(p_code, ''))) limit 1;
  if not found then return jsonb_build_object('ok', false, 'reason', 'notfound'); end if;
  dg_a := regexp_replace(coalesce(owner.phone, ''), '\D', '', 'g'); dg_b := regexp_replace(coalesce(me.phone, ''), '\D', '', 'g');
  if owner.id = me.id or (owner.email <> '' and lower(owner.email) = lower(me.email))
     or (trim(owner.company) <> '' and lower(regexp_replace(trim(owner.company), '\s+', ' ', 'g')) = lower(regexp_replace(trim(me.company), '\s+', ' ', 'g')))
     or (length(dg_a) >= 7 and dg_a = dg_b) then
    return jsonb_build_object('ok', false, 'reason', 'self');
  end if;
  select * into r from public.mow_referrals x where x.referred_id = me.id and x.status <> 'cancelled' limit 1;
  if found then
    if upper(r.code) = upper(trim(p_code)) then return jsonb_build_object('ok', true, 'reason', 'already', 'referral', to_jsonb(r)); end if;
    return jsonb_build_object('ok', false, 'reason', 'already');
  end if;
  if exists (select 1 from public.mow_records b where b.collection = 'bookings' and b.owner_id = me.id and coalesce(b.data->>'status', '') not in ('declined', 'cancelled')) then
    return jsonb_build_object('ok', false, 'reason', 'notnew');
  end if;
  insert into public.mow_referrals (id, code, referrer_id, referred_id, referrer_name, referred_name, status, new_type, new_value, reward_type, reward_value)
  values ('ref_' || substr(md5(random()::text || clock_timestamp()::text || me.id::text), 1, 14), owner.referral_code, owner.id, me.id,
          coalesce(nullif(owner.company, ''), nullif(owner.name, ''), owner.email), coalesce(nullif(me.company, ''), nullif(me.name, ''), me.email), 'joined',
          case when public.mow_ref_setting('refNewType', 'pct') = 'fixed' then 'fixed' else 'pct' end, greatest(0, public.mow_ref_setting('refNewValue', '10')::numeric),
          case when public.mow_ref_setting('refRewardType', 'pct') = 'fixed' then 'fixed' else 'pct' end, greatest(0, public.mow_ref_setting('refRewardValue', '10')::numeric))
  returning * into r;
  return jsonb_build_object('ok', true, 'referral', to_jsonb(r));
end; $$;

create or replace function public.mow_claim_referral(p_code text)
returns jsonb language sql volatile security definer set search_path = public
as $$ select public.mow_do_claim(auth.uid(), p_code); $$;

-- a new order used the first-order discount / the reward (lines on the booking carry the referral id)
create or replace function public.mow_referral_mark(p_booking_id text)
returns jsonb language plpgsql volatile security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  b public.mow_records;
  n1 integer := 0; n2 integer := 0;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'signin'); end if;
  select * into b from public.mow_records r where r.collection = 'bookings' and r.id = p_booking_id and r.owner_id = v_uid;
  if not found then return jsonb_build_object('ok', false, 'reason', 'notfound'); end if;
  update public.mow_referrals x set status = 'requested', first_booking_id = p_booking_id, requested_at = now()
   where x.referred_id = v_uid and x.status = 'joined' and x.first_booking_id is null
     and x.id in (select d->>'id' from jsonb_array_elements(case when jsonb_typeof(b.data->'discounts') = 'array' then b.data->'discounts' else '[]'::jsonb end) d where d->>'kind' = 'referral');
  get diagnostics n1 = row_count;
  update public.mow_referrals x set status = 'used', reward_booking_id = p_booking_id, used_at = now()
   where x.referrer_id = v_uid and x.status = 'earned' and x.reward_booking_id is null
     and x.id in (select d->>'id' from jsonb_array_elements(case when jsonb_typeof(b.data->'discounts') = 'array' then b.data->'discounts' else '[]'::jsonb end) d where d->>'kind' = 'reward');
  get diagnostics n2 = row_count;
  return jsonb_build_object('ok', true, 'first', n1, 'reward', n2);
end; $$;

-- a new account whose sign-up carried a referral code (?ref= link or the sign-up box): use it right away
create or replace function public.mow_profile_ref_signup()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_ref text;
begin
  select u.raw_user_meta_data->>'ref' into v_ref from auth.users u where u.id = new.id;
  if coalesce(v_ref, '') <> '' and new.role = 'client' then
    begin perform public.mow_do_claim(new.id, v_ref); exception when others then null; end;  -- never stop a sign-up
  end if;
  return new;
end; $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'mow_profiles_ref_signup') then
    create trigger mow_profiles_ref_signup after insert on public.mow_profiles for each row execute function public.mow_profile_ref_signup();
  end if;
end $$;

-- keep the statuses in step with the orders
create or replace function public.mow_booking_referrals()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_st text := coalesce(new.data->>'status', '');
  v_dep boolean := coalesce(new.data->>'depositPaid', 'false') = 'true';
  v_open boolean := coalesce(new.data->>'status', '') not in ('declined', 'cancelled');
  v_earned boolean;
begin
  if new.collection <> 'bookings' then return new; end if;
  v_earned := case when public.mow_ref_setting('refWhen', 'approved') = 'deposit' then v_dep else (v_st in ('approved', 'completed') or v_dep) end;
  if v_earned then
    update public.mow_referrals set status = 'earned', earned_at = now() where first_booking_id = new.id and status in ('joined', 'requested');
  elsif not v_open then
    update public.mow_referrals set status = 'joined', first_booking_id = null where first_booking_id = new.id and status in ('joined', 'requested');
  end if;
  if not v_open then
    update public.mow_referrals set status = 'earned', reward_booking_id = null, used_at = null where reward_booking_id = new.id;
  end if;
  return new;
end; $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'mow_records_referrals') then
    create trigger mow_records_referrals after insert or update on public.mow_records for each row execute function public.mow_booking_referrals();
  end if;
end $$;

revoke all on function public.mow_new_ref_code(text, text) from public, anon, authenticated;
revoke all on function public.mow_profile_refcode() from public, anon, authenticated;
revoke all on function public.mow_ref_setting(text, text) from public, anon, authenticated;
revoke all on function public.mow_do_claim(uuid, text) from public, anon, authenticated;
revoke all on function public.mow_profile_ref_signup() from public, anon, authenticated;
revoke all on function public.mow_booking_referrals() from public, anon, authenticated;
revoke all on function public.mow_claim_referral(text) from public, anon;
grant execute on function public.mow_claim_referral(text) to authenticated;
revoke all on function public.mow_referral_mark(text) from public, anon;
grant execute on function public.mow_referral_mark(text) to authenticated;
