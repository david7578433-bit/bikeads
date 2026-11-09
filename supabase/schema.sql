-- =====================================================================================================
-- Media on Wheels (repo: bikeads) — shared database + sign-in.  Supabase / PostgreSQL.
-- Written Nov 8, 2026.
--
-- SAFE TO RUN INSIDE AN EXISTING PROJECT (David, Nov 8: "put it in one of my projects, his guys will move it later"):
--   * Every object this file makes is named mow_…  (tables, functions, policies, the trigger).
--   * ADDITIVE ONLY: no DROP, no ALTER of any table that is not mow_…, no change to other apps' tables or policies.
--     The only thing it adds outside its own tables is ONE trigger named mow_on_auth_user_created on auth.users,
--     and that trigger only acts on sign-ups that come from the Media on Wheels site (metadata app = 'mediaonwheels').
--   * Safe to run twice (CREATE … IF NOT EXISTS / CREATE OR REPLACE / policies created only when missing).
--
-- HOW TO RUN: Supabase dashboard → SQL Editor → New query → paste this whole file → Run.
-- Then: Authentication → Providers → Google (see PRODUCTION.md), and put the Project URL + anon/publishable key
-- in docs/js/config.js. Never put the service_role / secret key in the site.
--
-- What is where:
--   mow_profiles      one row per person who signed in to Media on Wheels: name, company, phone, role (admin/client…)
--   mow_admin_emails  emails that get the admin role (David)
--   mow_settings      'public' row (prices, main-page texts, payment methods — everyone may read)
--                     'private' row (money settings — admin only)
--   mow_discounts     the admin's price-table discounts (by bikes, by weeks, promo code, one client)
--   mow_records       everything else the app saves (bikes, service areas, bookings, transactions, …), one row
--                     per record, JSON data, owner_id = the client a booking belongs to
--   mow_feedback      "Leave feedback": stars + comment on the website and on our service (anyone sends, admin reads)
--   mow_call_requests "Request a call": name, phone, best time, note; admin marks it called (anyone sends, admin reads)
-- Row Level Security: a client sees and changes only their own profile and their own bookings; everyone can see
-- bikes and service areas (so the booking calendar works) and, through mow_bike_holds(), WHICH bikes are taken on
-- which days — but never other clients' names, prices or contact details. The admin sees and changes everything.
-- =====================================================================================================

-- ---------- tables ----------
create table if not exists public.mow_profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null default '',
  name        text not null default '',
  company     text not null default '',
  phone       text not null default '',
  role        text not null default 'client' check (role in ('admin', 'client', 'driver', 'store', 'boss')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.mow_profiles is 'Media on Wheels: one row per signed-in person (role admin/client; driver/store/boss are for the delivery side, off for now).';

create table if not exists public.mow_admin_emails (
  email text primary key
);
comment on table public.mow_admin_emails is 'Media on Wheels: emails that get the admin role on first sign-in.';
insert into public.mow_admin_emails (email) values ('david7578433@gmail.com') on conflict (email) do nothing;

create table if not exists public.mow_settings (
  id          text primary key check (id in ('public', 'private')),
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
comment on table public.mow_settings is 'Media on Wheels: settings. public = prices, main page, payment methods; private = money settings (admin only).';

create table if not exists public.mow_records (
  collection  text not null check (collection in ('locations', 'bikes', 'bookings', 'transactions', 'reconciliations',
                                                  'stores', 'drivers', 'orders', 'smslog', 'shifts', 'invoices', 'payouts')),
  id          text not null,
  data        jsonb not null default '{}'::jsonb,
  owner_id    uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (collection, id)
);
comment on table public.mow_records is 'Media on Wheels: app records (bikes, areas, bookings, transactions, …) as JSON. owner_id = the client a booking belongs to.';
create index if not exists mow_records_owner_idx on public.mow_records (owner_id);
create index if not exists mow_records_collection_idx on public.mow_records (collection);

create table if not exists public.mow_discounts (
  id            text primary key,
  kind          text not null check (kind in ('bikes', 'weeks', 'promo', 'client')),
  min_count     integer check (min_count is null or min_count >= 1),       -- bikes / weeks: from how many
  code          text,                                                     -- promo: the code (stored in capitals)
  client_id     uuid references auth.users (id) on delete cascade,        -- client: this person ...
  client_email  text,                                                     -- ... or this email
  pct           numeric(5,2) not null check (pct > 0 and pct <= 90),      -- percent off the subtotal
  label         text not null default '',
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.mow_discounts is 'Media on Wheels: admin price table discounts (by number of bikes, by number of weeks, promo code, one client).';
create unique index if not exists mow_discounts_code_idx on public.mow_discounts (upper(code)) where kind = 'promo';

-- ---------- helper: is the signed-in person a Media on Wheels admin? ----------
create or replace function public.mow_is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.mow_profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

-- ---------- keep updated_at fresh ----------
create or replace function public.mow_touch()
returns trigger language plpgsql set search_path = public
as $$ begin new.updated_at := now(); return new; end; $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'mow_profiles_touch') then
    create trigger mow_profiles_touch before update on public.mow_profiles for each row execute function public.mow_touch();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'mow_settings_touch') then
    create trigger mow_settings_touch before update on public.mow_settings for each row execute function public.mow_touch();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'mow_records_touch') then
    create trigger mow_records_touch before update on public.mow_records for each row execute function public.mow_touch();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'mow_discounts_touch') then
    create trigger mow_discounts_touch before update on public.mow_discounts for each row execute function public.mow_touch();
  end if;
end $$;

-- ---------- guard: a non-admin cannot make themselves admin, change their email, or approve their own booking ----------
create or replace function public.mow_guard_profile()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not public.mow_is_admin() then
    new.role  := old.role;
    new.email := old.email;
    new.id    := old.id;
  end if;
  return new;
end; $$;

create or replace function public.mow_guard_booking()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.collection <> 'bookings' or auth.uid() is null or public.mow_is_admin() then
    return new;
  end if;
  new.owner_id := auth.uid();                          -- a client's booking is always their own
  new.data := jsonb_set(new.data, '{clientId}', to_jsonb(auth.uid()::text));
  if tg_op = 'INSERT' then
    -- new requests always wait for the admin (an upsert of an EXISTING booking is checked by the UPDATE branch)
    if not exists (select 1 from public.mow_records r where r.collection = new.collection and r.id = new.id) then
      new.data := jsonb_set(new.data, '{status}', '"pending"');
    end if;
  elsif coalesce(new.data->>'status', '') is distinct from coalesce(old.data->>'status', '')
        and coalesce(new.data->>'status', '') <> 'cancelled' then
    new.data := jsonb_set(new.data, '{status}', coalesce(old.data->'status', '"pending"'));  -- only "cancel" is allowed
  end if;
  return new;
end; $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'mow_profiles_guard') then
    create trigger mow_profiles_guard before update on public.mow_profiles for each row execute function public.mow_guard_profile();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'mow_records_guard') then
    create trigger mow_records_guard before insert or update on public.mow_records for each row execute function public.mow_guard_booking();
  end if;
end $$;

-- ---------- profile on sign-up ----------
-- (a) Trigger: a person who signs up with email + password on the Media on Wheels site gets a profile at once.
--     Only sign-ups carrying metadata app = 'mediaonwheels' are touched, so other apps in this project are not affected.
create or replace function public.mow_handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(new.raw_user_meta_data->>'app', '') = 'mediaonwheels' then
    insert into public.mow_profiles (id, email, name, company, phone, role)
    values (new.id, lower(coalesce(new.email, '')),
            coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', ''),
            coalesce(new.raw_user_meta_data->>'company', ''),
            coalesce(new.raw_user_meta_data->>'phone', ''),
            case when exists (select 1 from public.mow_admin_emails a where a.email = lower(coalesce(new.email, ''))) then 'admin' else 'client' end)
    on conflict (id) do nothing;
  end if;
  return new;
end; $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'mow_on_auth_user_created') then
    create trigger mow_on_auth_user_created after insert on auth.users for each row execute function public.mow_handle_new_user();
  end if;
end $$;

-- (b) Called by the site right after every sign-in (also covers "Continue with Google", which carries no app tag,
--     and people who already had an account in this project from another app). Creates the profile if it is
--     missing and returns it. Role: admin for an email in mow_admin_emails, else client.
create or replace function public.mow_ensure_profile(p_name text default '', p_company text default '', p_phone text default '')
returns setof public.mow_profiles
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_meta jsonb;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select lower(coalesce(u.email, '')), coalesce(u.raw_user_meta_data, '{}'::jsonb) into v_email, v_meta from auth.users u where u.id = v_uid;
  insert into public.mow_profiles (id, email, name, company, phone, role)
  values (v_uid, v_email,
          coalesce(nullif(p_name, ''), v_meta->>'name', v_meta->>'full_name', split_part(v_email, '@', 1)),
          coalesce(nullif(p_company, ''), v_meta->>'company', ''),
          coalesce(nullif(p_phone, ''), v_meta->>'phone', ''),
          case when exists (select 1 from public.mow_admin_emails a where a.email = v_email) then 'admin' else 'client' end)
  on conflict (id) do nothing;
  -- an email added to mow_admin_emails later becomes admin at the next sign-in
  update public.mow_profiles p set role = 'admin'
   where p.id = v_uid and p.role <> 'admin' and exists (select 1 from public.mow_admin_emails a where a.email = v_email);
  return query select * from public.mow_profiles p where p.id = v_uid;
end; $$;

-- ---------- availability for clients: which bikes are taken on which days (no names, no prices) ----------
create or replace function public.mow_bike_holds()
returns table (id text, start_date text, end_date text, bike_ids jsonb, status text)
language sql stable security definer set search_path = public
as $$
  select r.id, r.data->>'start', r.data->>'end', coalesce(r.data->'bikeIds', '[]'::jsonb), r.data->>'status'
    from public.mow_records r
   where r.collection = 'bookings'
     and auth.uid() is not null
     and coalesce(r.data->>'status', '') in ('approved', 'pending');
$$;


-- ---------- promo codes: a signed-in client types a code, the database says whether it is valid (codes stay hidden) ----------
create or replace function public.mow_check_promo(p_code text)
returns setof public.mow_discounts
language sql stable security definer set search_path = public
as $$
  select d.* from public.mow_discounts d
   where auth.uid() is not null and d.kind = 'promo' and d.active
     and upper(d.code) = upper(trim(coalesce(p_code, '')))
   limit 1;
$$;

-- ---------- who may call the functions ----------
revoke all on function public.mow_ensure_profile(text, text, text) from public, anon;
grant execute on function public.mow_ensure_profile(text, text, text) to authenticated;
revoke all on function public.mow_bike_holds() from public, anon;
grant execute on function public.mow_bike_holds() to authenticated;
revoke all on function public.mow_check_promo(text) from public, anon;
grant execute on function public.mow_check_promo(text) to authenticated;
revoke all on function public.mow_handle_new_user() from public, anon, authenticated;
grant execute on function public.mow_is_admin() to anon, authenticated;

-- ---------- Row Level Security ----------
alter table public.mow_profiles     enable row level security;
alter table public.mow_admin_emails enable row level security;
alter table public.mow_settings     enable row level security;
alter table public.mow_records      enable row level security;
alter table public.mow_discounts    enable row level security;

do $$
begin
  -- profiles: see / change your own; the admin sees and changes everyone. Rows are made only by the functions above.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mow_profiles' and policyname = 'mow_profiles_select') then
    create policy mow_profiles_select on public.mow_profiles for select to authenticated using (id = auth.uid() or public.mow_is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mow_profiles' and policyname = 'mow_profiles_update') then
    create policy mow_profiles_update on public.mow_profiles for update to authenticated using (id = auth.uid() or public.mow_is_admin()) with check (id = auth.uid() or public.mow_is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mow_profiles' and policyname = 'mow_profiles_delete') then
    create policy mow_profiles_delete on public.mow_profiles for delete to authenticated using (public.mow_is_admin());
  end if;

  -- admin emails: only the admin can see or change the list
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mow_admin_emails' and policyname = 'mow_admin_emails_admin') then
    create policy mow_admin_emails_admin on public.mow_admin_emails for all to authenticated using (public.mow_is_admin()) with check (public.mow_is_admin());
  end if;

  -- settings: everyone (also visitors) reads the public row; only the admin reads the private row and writes
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mow_settings' and policyname = 'mow_settings_read') then
    create policy mow_settings_read on public.mow_settings for select to anon, authenticated using (id = 'public' or public.mow_is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mow_settings' and policyname = 'mow_settings_write') then
    create policy mow_settings_write on public.mow_settings for all to authenticated using (public.mow_is_admin()) with check (public.mow_is_admin());
  end if;

  -- records: service areas are public; bikes for signed-in people; bookings only your own; the admin sees all
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mow_records' and policyname = 'mow_records_read') then
    create policy mow_records_read on public.mow_records for select to anon, authenticated using (
      collection = 'locations'
      or (auth.uid() is not null and collection = 'bikes')
      or (auth.uid() is not null and collection = 'bookings' and owner_id = auth.uid())
      or public.mow_is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mow_records' and policyname = 'mow_records_insert') then
    create policy mow_records_insert on public.mow_records for insert to authenticated with check (
      public.mow_is_admin() or (collection = 'bookings' and owner_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mow_records' and policyname = 'mow_records_update') then
    create policy mow_records_update on public.mow_records for update to authenticated
      using (public.mow_is_admin() or (collection = 'bookings' and owner_id = auth.uid()))
      with check (public.mow_is_admin() or (collection = 'bookings' and owner_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mow_records' and policyname = 'mow_records_delete') then
    create policy mow_records_delete on public.mow_records for delete to authenticated using (public.mow_is_admin());
  end if;
  -- discounts: bikes / weeks discounts are public (shown on the price page); a client discount only to that client;
  -- promo codes are never listed (checked one at a time by mow_check_promo); the admin sees and changes everything
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mow_discounts' and policyname = 'mow_discounts_read') then
    create policy mow_discounts_read on public.mow_discounts for select to anon, authenticated using (
      (active and kind in ('bikes', 'weeks'))
      or (active and kind = 'client' and auth.uid() is not null
          and (client_id = auth.uid() or lower(coalesce(client_email, '')) = lower(coalesce(auth.jwt() ->> 'email', '-'))))
      or public.mow_is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mow_discounts' and policyname = 'mow_discounts_write') then
    create policy mow_discounts_write on public.mow_discounts for all to authenticated using (public.mow_is_admin()) with check (public.mow_is_admin());
  end if;
end $$;

-- ---------- table rights for the site's (anon / signed-in) key; RLS above decides which ROWS ----------
grant select on public.mow_settings to anon, authenticated;
grant insert, update, delete on public.mow_settings to authenticated;
grant select on public.mow_records to anon, authenticated;
grant insert, update, delete on public.mow_records to authenticated;
grant select, update, delete on public.mow_profiles to authenticated;
grant select, insert, update, delete on public.mow_admin_emails to authenticated;
grant select on public.mow_discounts to anon, authenticated;
grant insert, update, delete on public.mow_discounts to authenticated;

-- ---------- Nov 8, 2026: "Leave feedback" and "Request a call" (David) ----------
-- Anyone (also a visitor who is not signed in) can SEND one; only the admin can read them. No public display.
-- Nothing here sends an email or a text.
create table if not exists public.mow_feedback (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  site_stars       smallint check (site_stars is null or site_stars between 1 and 5),       -- the website, 1–5
  site_comment     text not null default '' check (char_length(site_comment) <= 1000),
  service_stars    smallint check (service_stars is null or service_stars between 1 and 5), -- our service ("how good we are"), 1–5
  service_comment  text not null default '' check (char_length(service_comment) <= 1000),
  name             text not null default '' check (char_length(name) <= 120),
  email            text not null default '' check (char_length(email) <= 200),
  source           text not null default '' check (char_length(source) <= 40),             -- where it was sent from: home, booking, account
  booking_id       text not null default '' check (char_length(booking_id) <= 80),
  user_id          uuid default auth.uid(),
  constraint mow_feedback_not_empty check (site_stars is not null or service_stars is not null or site_comment <> '' or service_comment <> '')
);
comment on table public.mow_feedback is 'Media on Wheels: feedback on the website and on the service. Anyone can send; only the admin reads.';

create table if not exists public.mow_call_requests (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null check (char_length(name) between 1 and 120),
  phone       text not null check (char_length(phone) between 7 and 40),
  best_time   text not null default '' check (char_length(best_time) <= 120),
  note        text not null default '' check (char_length(note) <= 500),
  user_id     uuid default auth.uid(),
  called      boolean not null default false,
  called_at   timestamptz
);
comment on table public.mow_call_requests is 'Media on Wheels: "Request a call" form. Anyone can send; only the admin reads and marks them called.';

alter table public.mow_feedback      enable row level security;
alter table public.mow_call_requests enable row level security;

do $$
begin
  -- anyone may add one (a signed-in person only under their own id); new call requests always start "not called"
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mow_feedback' and policyname = 'mow_feedback_insert') then
    create policy mow_feedback_insert on public.mow_feedback for insert to anon, authenticated with check (user_id is null or user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mow_feedback' and policyname = 'mow_feedback_admin_read') then
    create policy mow_feedback_admin_read on public.mow_feedback for select to authenticated using (public.mow_is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mow_feedback' and policyname = 'mow_feedback_admin_delete') then
    create policy mow_feedback_admin_delete on public.mow_feedback for delete to authenticated using (public.mow_is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mow_call_requests' and policyname = 'mow_call_requests_insert') then
    create policy mow_call_requests_insert on public.mow_call_requests for insert to anon, authenticated with check ((user_id is null or user_id = auth.uid()) and called = false and called_at is null);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mow_call_requests' and policyname = 'mow_call_requests_admin_read') then
    create policy mow_call_requests_admin_read on public.mow_call_requests for select to authenticated using (public.mow_is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mow_call_requests' and policyname = 'mow_call_requests_admin_update') then
    create policy mow_call_requests_admin_update on public.mow_call_requests for update to authenticated using (public.mow_is_admin()) with check (public.mow_is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'mow_call_requests' and policyname = 'mow_call_requests_admin_delete') then
    create policy mow_call_requests_admin_delete on public.mow_call_requests for delete to authenticated using (public.mow_is_admin());
  end if;
end $$;

grant insert on public.mow_feedback to anon, authenticated;
grant select, delete on public.mow_feedback to authenticated;
grant insert on public.mow_call_requests to anon, authenticated;
grant select, update, delete on public.mow_call_requests to authenticated;

-- ---------- David is admin (also if he already signed in before this file was run) ----------
update public.mow_profiles set role = 'admin' where lower(email) = 'david7578433@gmail.com' and role <> 'admin';

-- Done. Check: select * from public.mow_profiles;  (empty until the first sign-in — there are no test members.)


-- ============================================================================
-- Nov 8 2026: admin menu additions (same as supabase/migrations/20261108_admin_menu.sql)
-- ============================================================================
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
