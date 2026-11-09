-- =====================================================================================================
-- Media on Wheels — several campaigns in ONE request (David, Nov 8 2026 7:00 PM: a marketing company like "Pivot" sends
-- one order with GB 5 bikes, GG 5, Lakefront 5). Safe to run more than once.
-- Storage: each booking row in mow_records (collection 'bookings') keeps its campaigns in data->'campaigns' (jsonb array:
-- id, name, bikes, start, end, own, adText, bikeIds, setup, weekly, weeks, days, subtotal, status). Same Row Level
-- Security as the booking itself: a client sees only their own, the admin sees all.
-- 1) mow_bike_holds(): an order with campaigns holds each campaign's bikes only on that campaign's own days (one row per
--    campaign, id = '<booking id>#<campaign id>'); a declined campaign holds nothing. Other bookings: as before.
-- 2) view mow_booking_campaigns: one row per campaign (for reports), read with the caller's own rights (security_invoker).
-- =====================================================================================================

create or replace function public.mow_bike_holds()
returns table (id text, start_date text, end_date text, bike_ids jsonb, status text)
language sql stable security definer set search_path = public
as $$
  select r.id, r.data->>'start', r.data->>'end', coalesce(r.data->'bikeIds', '[]'::jsonb), r.data->>'status'
    from public.mow_records r
   where r.collection = 'bookings'
     and auth.uid() is not null
     and coalesce(r.data->>'status', '') in ('approved', 'pending')
     and (jsonb_typeof(r.data->'campaigns') is distinct from 'array' or jsonb_array_length(r.data->'campaigns') = 0)
  union all
  select r.id || '#' || coalesce(c->>'id', ''), coalesce(c->>'start', r.data->>'start'), coalesce(c->>'end', r.data->>'end'),
         coalesce(c->'bikeIds', '[]'::jsonb), r.data->>'status'
    from public.mow_records r
    cross join lateral jsonb_array_elements(r.data->'campaigns') c
   where r.collection = 'bookings'
     and auth.uid() is not null
     and coalesce(r.data->>'status', '') in ('approved', 'pending')
     and jsonb_typeof(r.data->'campaigns') = 'array'
     and coalesce(c->>'status', '') <> 'declined';
$$;
revoke all on function public.mow_bike_holds() from public, anon;
grant execute on function public.mow_bike_holds() to authenticated;

create or replace view public.mow_booking_campaigns with (security_invoker = true) as
  select r.id                                   as booking_id,
         r.owner_id                             as owner_id,
         r.data->>'company'                     as company,
         r.data->>'status'                      as order_status,
         c.ord::int                             as position,
         c.item->>'id'                          as campaign_id,
         c.item->>'name'                        as name,
         coalesce(jsonb_array_length(case when jsonb_typeof(c.item->'bikeIds') = 'array' then c.item->'bikeIds' end),
                  nullif(c.item->>'bikes', '')::int, 0) as bikes,
         c.item->>'start'                       as start_date,
         c.item->>'end'                         as end_date,
         c.item->'bikeIds'                      as bike_ids,
         nullif(c.item->>'subtotal', '')::numeric as subtotal,
         coalesce(c.item->>'status', 'active')  as status,
         c.item->>'adText'                      as description,
         r.created_at, r.updated_at
    from public.mow_records r
    cross join lateral jsonb_array_elements(case when jsonb_typeof(r.data->'campaigns') = 'array' then r.data->'campaigns' else '[]'::jsonb end)
         with ordinality as c(item, ord)
   where r.collection = 'bookings';
comment on view public.mow_booking_campaigns is 'Media on Wheels: one row per campaign of a booking (agency orders with several campaigns). Same rights as mow_records.';
revoke all on public.mow_booking_campaigns from public, anon;
grant select on public.mow_booking_campaigns to authenticated;

-- campaigns are looked up inside bookings (GIN on the json, only booking rows)
create index if not exists mow_records_campaigns_idx on public.mow_records using gin ((data->'campaigns')) where collection = 'bookings';
