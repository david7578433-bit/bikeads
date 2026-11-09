-- Local test (Postgres 15): psql -d test -f supabase/tests/supabase-stub.sql -f supabase/schema.sql -f supabase/tests/promo_referrals_test.sql
-- Checks company promo codes (PIVOT10 only for Pivot), usage limit, referrals (claim, self-referral, first order, reward, RLS).

\set ON_ERROR_STOP 1
insert into auth.users values ('00000000-0000-0000-0000-0000000000ad','david7578433@gmail.com','{"app":"mediaonwheels","name":"David"}');
insert into auth.users values ('00000000-0000-0000-0000-00000000000a','a@fresh.test','{"app":"mediaonwheels","name":"Avi","company":"Fresh Basket","phone":"7185550001"}');
insert into auth.users values ('00000000-0000-0000-0000-0000000000a1','p@pivot.test','{"app":"mediaonwheels","name":"Pinchas","company":"Pivot Marketing","phone":"7185550002"}');
insert into auth.users values ('00000000-0000-0000-0000-0000000000a2','o@bka.test','{"app":"mediaonwheels","name":"Ozer","company":"Brooklyn Ads Agency","phone":"7185550003"}');
select id, role, company, referral_code from mow_profiles order by email;
select referral_code as acode from mow_profiles where email='a@fresh.test' \gset
insert into auth.users values ('00000000-0000-0000-0000-00000000000b','b@bakery.test', jsonb_build_object('app','mediaonwheels','name','Baruch','company','Corner Bakery','phone','7185550004','ref', :'acode'));
select 'after B signup' as step, id, code, status, referrer_name, referred_name, new_value, reward_value from mow_referrals;
-- admin makes PIVOT10
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000ad';
insert into mow_discounts (id, kind, code, pct, label, company_id, company) values ('d1','promo','PIVOT10',10,'','00000000-0000-0000-0000-0000000000a1','Pivot Marketing');
insert into mow_discounts (id, kind, code, pct, amount_type, amount_off) values ('d2','promo','SAVE100',0,'fixed',100);
insert into mow_discounts (id, kind, code, pct) values ('d3','promo','OLD5',5);
-- Pivot checks
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select 'pivot' as who, mow_promo_check('pivot10')->>'ok' ok, mow_promo_check('pivot10')->>'reason' reason, (select count(*) from mow_check_promo('PIVOT10')) old_fn, (select count(*) from mow_check_promo('OLD5')) old5;
select 'pivot sees discounts' as who, count(*) from mow_discounts;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select 'other co' as who, mow_promo_check('PIVOT10')->>'ok' ok, mow_promo_check('PIVOT10')->>'reason' reason, (select count(*) from mow_check_promo('PIVOT10')) old_fn, mow_promo_check('SAVE100')->>'ok' save100;
select 'other sees referrals' as who, count(*) from mow_referrals;
select 'other claims own' as who, mow_claim_referral((select referral_code from mow_profiles where id=auth.uid()));
-- B
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select 'B sees' as who, count(*), min(status) from mow_referrals;
select id as rid from mow_referrals limit 1 \gset
select 'B claim again' as who, mow_claim_referral('XYZ-0000')->>'reason', mow_claim_referral(:'acode')->>'reason';
insert into mow_records (collection, id, data, owner_id) values ('bookings','bk_b1', jsonb_build_object('status','pending','clientId','x','discounts', jsonb_build_array(jsonb_build_object('kind','referral','id',:'rid','pct',10,'amount',112.5))), '00000000-0000-0000-0000-00000000000b');
select 'B mark' as who, mow_referral_mark('bk_b1');
update mow_referrals set status='earned';
select 'B after mark+try update' as who, status, first_booking_id from mow_referrals;
-- admin approves
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000ad';
update mow_records set data = jsonb_set(data,'{status}','"approved"') where id='bk_b1';
select 'after approve' as who, status, earned_at is not null earned from mow_referrals;
-- A uses reward
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select 'A sees' as who, count(*), min(status) from mow_referrals;
select 'A self' as who, mow_claim_referral(:'acode')->>'reason';
insert into mow_records (collection, id, data, owner_id) values ('bookings','bk_a1', jsonb_build_object('status','pending','discounts', jsonb_build_array(jsonb_build_object('kind','reward','id',:'rid'))), '00000000-0000-0000-0000-00000000000a');
select 'A mark' as who, mow_referral_mark('bk_a1');
select 'A after' as who, status, reward_booking_id from mow_referrals;
update mow_profiles set referral_code='HACK-1' where id=auth.uid();
select 'A code kept' as who, referral_code <> 'HACK-1' from mow_profiles where id=auth.uid();
-- admin declines A's reward order -> reward back
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000ad';
update mow_records set data = jsonb_set(data,'{status}','"declined"') where id='bk_a1';
select 'after decline reward order' as who, status, reward_booking_id from mow_referrals;
-- usage limit
update mow_discounts set max_uses = 1 where id='d1';
reset role;
insert into mow_records (collection, id, data, owner_id) values ('bookings','bk_p1', '{"status":"pending","promoCode":"PIVOT10"}', '00000000-0000-0000-0000-0000000000a1');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select 'pivot after 1 use (limit 1)' as who, mow_promo_check('PIVOT10')->>'reason';
-- new client with orders cannot use referral
select 'pivot notnew' as who, mow_claim_referral(:'acode')->>'reason';
-- anon
reset role; set role anon; 
select 'anon referrals' as who, count(*) from mow_referrals;
