# Moving Media on Wheels to its own Supabase project (later)

Everything Media on Wheels keeps in the database is in 5 tables, all named `mow_`:
`mow_profiles`, `mow_admin_emails`, `mow_settings`, `mow_discounts`, `mow_records` (+ functions `mow_*` and the trigger
`mow_on_auth_user_created` on `auth.users`). Nothing of the other app is needed or touched.

## Steps

1. **New project** (the client's own Supabase account; he can invite David as a member).
2. In the NEW project: SQL Editor → run `supabase/schema.sql` (same file).
3. **Copy the data** from the OLD project. In the OLD project's SQL editor run each and download as CSV
   (or use `pg_dump`, see below):
   ```sql
   select * from public.mow_settings;
   select * from public.mow_records;
   select * from public.mow_discounts;
   select * from public.mow_profiles;
   ```
   Import into the same tables in the NEW project (Table editor → Import CSV), in this order:
   `mow_settings`, then (after users exist, step 4) `mow_profiles`, then `mow_records` and `mow_discounts`
   (a client discount's `client_id` must point to the new user id, or leave it empty and keep `client_email`).
4. **Sign-in accounts.** `mow_profiles.id` points to `auth.users`. Two ways:
   - Simple: people sign up again in the new project (same email). Then run, in the NEW project, for each old
     booking owner: `update mow_records set owner_id = (select id from auth.users where email = '…'),
     data = jsonb_set(data, '{clientId}', to_jsonb((select id::text from auth.users where email = '…')))
     where collection = 'bookings' and owner_id = '<old id>';`
   - Full copy (keeps passwords and ids): with the database connection strings of both projects (Project
     Settings → Database), a developer runs
     `pg_dump --data-only --table=auth.users --table=auth.identities "<OLD>" | psql "<NEW>"` filtered to the
     Media on Wheels users only, then `pg_dump --data-only -t 'public.mow_*' "<OLD>" | psql "<NEW>"`.
     (Only Media on Wheels users: `select u.* from auth.users u join public.mow_profiles p on p.id = u.id`.)
5. **Auth settings** in the NEW project: Redirect URLs + Google provider (PRODUCTION.md §1–2); in Google Cloud add
   the new `https://<new-ref>.supabase.co/auth/v1/callback`.
6. Change `SUPABASE_URL` / `SUPABASE_ANON_KEY` in `docs/js/config.js` to the new project's, push.
7. When the new project works, clean up the OLD project (only then, and only `mow_` objects):
   ```sql
   drop trigger if exists mow_on_auth_user_created on auth.users;
   drop table if exists public.mow_records, public.mow_discounts, public.mow_settings, public.mow_profiles, public.mow_admin_emails;
   drop function if exists public.mow_handle_new_user(), public.mow_ensure_profile(text, text, text),
     public.mow_bike_holds(), public.mow_check_promo(text), public.mow_guard_booking(), public.mow_guard_profile(), public.mow_touch(), public.mow_is_admin();
   ```
