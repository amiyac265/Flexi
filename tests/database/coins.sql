do $$ begin
  assert (select coalesce(array_agg(slug order by slug), '{}'::text[]) from public.cosmetic_items where category='clothing' and coin_price>0)
    = array['everyday-training-tee', 'off-duty-cap'];
  assert (select coalesce(array_agg(slug order by slug), '{}'::text[]) from public.cosmetic_items where category='accessories' and coin_price>0)
    = array['find-your-flow-mat', 'hydration-buddy'];
  assert (select coalesce(array_agg(slug order by slug), '{}'::text[]) from public.cosmetic_items where category='backgrounds' and coin_price>0)
    = array['garden-escape', 'golden-hour'];
end $$;

-- Separate accounts keep wallet invariants independent from the existing security suite.
reset role;
insert into auth.users values
('00000000-0000-4000-8000-000000000004','{"displayName":"Coin athlete"}'),
('00000000-0000-4000-8000-000000000005','{"displayName":"Empty wallet"}');
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000004';
select expect_error('update coin_wallets set balance=999999','42501');
select expect_error('insert into coin_ledger(owner,amount,source,reference) values(auth.uid(),99999,''payment'',''fake'')','42501');
select expect_error('select flexi_fulfill_coin_order(''00000000-0000-4000-8000-000000000004'',''cs_test_fake'',auth.uid(),99,''usd'')','42501');
select expect_error('select flexi_log_workout(''{"requestId":"fake-coins-123","title":"Fake","durationMinutes":10,"coinReward":50}'')','PT400');
do $$ declare i integer; r jsonb; before_balance integer; begin
  assert (flexi_wallet()->>'balance')::integer=0;
  for i in 1..101 loop
    r := flexi_log_workout(jsonb_build_object('requestId','coin-workout-'||i,'title','Strength','durationMinutes',30));
    assert (r->'workout'->>'coin_reward')::integer=case when i in (25,50,75,100) then 50 else 10 end;
    assert not (r->>'replayed')::boolean;
  end loop;
  assert (flexi_wallet()->>'balance')::integer=1170;
  assert (flexi_wallet()->>'lifetimeWorkouts')::integer=101;
  r := flexi_log_workout('{"requestId":"coin-workout-25","title":"Strength","durationMinutes":30}');
  assert (r->>'replayed')::boolean;
  assert (flexi_wallet()->>'balance')::integer=1170;
  perform flexi_void_workout((r->'workout'->>'id')::uuid);
  perform flexi_void_workout((r->'workout'->>'id')::uuid);
  assert (flexi_wallet()->>'balance')::integer=1170;
  assert (flexi_wallet()->>'lifetimeWorkouts')::integer=101;
  -- Voids preserve earned coins/ordinals; the replacement is ordinary entry 102.
  r := flexi_log_workout('{"requestId":"coin-replacement-102","title":"Strength","durationMinutes":30}');
  assert (r->'workout'->>'coin_reward')::integer=10;
  assert (flexi_wallet()->>'balance')::integer=1180;
  r := flexi_claim_cosmetic('10000000-0000-4000-8000-000000000001');
  assert not (r->>'replayed')::boolean;
  assert (r->'wallet'->>'balance')::integer=1060;
  r := flexi_claim_cosmetic('10000000-0000-4000-8000-000000000001');
  assert (r->>'replayed')::boolean;
  assert (r->'wallet'->>'balance')::integer=1060;
  assert (select sum(amount) from coin_ledger)=1060;
end $$;
select 'PASS: all 4 coin milestones, ordinary rewards after 100, retries, void ordinals, and single-charge purchases.';

-- Orders lock in the authoritative price/coin snapshot and bind request identity to one pack.
create temporary table payment_test_order as select (flexi_create_coin_order('pocket','payment-request-123')->>'id')::uuid as id;
grant select on payment_test_order to service_role;
do $$ begin
  assert (flexi_create_coin_order('pocket','payment-request-123')->>'id')::uuid=(select id from payment_test_order);
end $$;
select expect_error('select flexi_create_coin_order(''power'',''payment-request-123'')','PT409');
select expect_error('update coin_orders set status=''paid''','42501');
set role service_role;
select expect_error(format('select flexi_fulfill_coin_order(%L,''cs_test_coins123'',''00000000-0000-4000-8000-000000000004'',1,''usd'')',(select id from payment_test_order)),'PT400');
select expect_error(format('select flexi_fulfill_coin_order(%L,''cs_test_coins123'',''00000000-0000-4000-8000-000000000005'',99,''usd'')',(select id from payment_test_order)),'PT400');
select expect_error(format('select flexi_fulfill_coin_order(%L,''cs_test_coins123'',''00000000-0000-4000-8000-000000000004'',99,''eur'')',(select id from payment_test_order)),'PT400');
do $$ declare r jsonb; begin
  r := flexi_fulfill_coin_order((select id from payment_test_order),'cs_test_coins123','00000000-0000-4000-8000-000000000004',99,'usd');
  assert not (r->>'replayed')::boolean;
  r := flexi_fulfill_coin_order((select id from payment_test_order),'cs_test_coins123','00000000-0000-4000-8000-000000000004',99,'usd');
  assert (r->>'replayed')::boolean;
end $$;
select expect_error(format('select flexi_fulfill_coin_order(%L,''cs_test_other'',''00000000-0000-4000-8000-000000000004'',99,''usd'')',(select id from payment_test_order)),'PT409');
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000004';
do $$ begin
  assert (flexi_wallet()->>'balance')::integer=1160;
  assert (select sum(amount) from coin_ledger)=1160;
  assert (select count(*) from coin_ledger where source='payment')=1;
  assert (select status from coin_orders where request_id='payment-request-123')='paid';
end $$;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000005';
select expect_error('select flexi_claim_cosmetic(''10000000-0000-4000-8000-000000000001'')','PT409');
do $$ begin
  assert (select count(*) from coin_orders)=0;
  assert (select count(*) from coin_ledger)=0;
  assert (select count(*) from user_cosmetics)=0;
  assert (flexi_wallet()->>'balance')::integer=0;
end $$;
set role anon;
select expect_error('select * from coin_wallets','42501');
select expect_error('select flexi_wallet()','42501');
select expect_error('select flexi_create_coin_order(''pocket'',''unauthorized-123'')','42501');
select expect_error('select flexi_fulfill_coin_order(''00000000-0000-4000-8000-000000000004'',''cs_test_fake'',''00000000-0000-4000-8000-000000000004'',99,''usd'')','42501');
reset role;
select 'PASS: payment price/owner checks, retry identity, one-time fulfillment, insufficient funds, and private-wallet isolation.';
