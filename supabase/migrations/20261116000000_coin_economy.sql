-- Spendable coins are distinct from XP and leaderboard points.
-- Additive migration: existing inventory remains owned; existing cosmetics default to free.
alter table public.cosmetic_items add column coin_price integer not null default 0 check (coin_price between 0 and 1000000);
alter table public.cosmetic_items drop constraint cosmetic_items_slot_check;
alter table public.cosmetic_items add constraint cosmetic_items_slot_check check (slot in ('hat','outfit','accessory','background'));
alter table public.workout_logs add column coin_reward integer not null default 0 check (coin_reward in (0,10,50));

create table public.coin_wallets (
  owner uuid primary key references public.profiles(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  lifetime_workouts integer not null default 0 check (lifetime_workouts >= 0)
);
create table public.coin_ledger (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles(id) on delete cascade,
  amount integer not null check (amount <> 0),
  source text not null check (source in ('workout','cosmetic','payment')),
  reference text not null,
  created_at timestamptz not null default now(),
  unique(owner,source,reference)
);
create table public.coin_packs (
  id text primary key,
  coins integer not null check (coins between 1 and 1000000),
  amount_cents integer not null check (amount_cents between 50 and 100000),
  currency text not null default 'usd' check (currency = 'usd'),
  active boolean not null default true
);
create table public.coin_orders (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles(id) on delete cascade,
  request_id text not null check (request_id ~ '^[a-zA-Z0-9_-]{8,80}$'),
  pack_id text not null references public.coin_packs(id),
  coins integer not null check (coins > 0),
  amount_cents integer not null check (amount_cents >= 50),
  currency text not null check (currency = 'usd'),
  status text not null default 'pending' check (status in ('pending','paid')),
  checkout_session_id text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  unique(owner,request_id)
);
alter table public.coin_wallets enable row level security;
alter table public.coin_ledger enable row level security;
alter table public.coin_packs enable row level security;
alter table public.coin_orders enable row level security;
create policy own_wallet on public.coin_wallets for select to authenticated using (owner = (select auth.uid()));
create policy own_coin_ledger on public.coin_ledger for select to authenticated using (owner = (select auth.uid()));
create policy own_coin_orders on public.coin_orders for select to authenticated using (owner = (select auth.uid()));
create policy active_coin_packs on public.coin_packs for select to authenticated using (active);
revoke all on public.coin_wallets, public.coin_ledger, public.coin_packs, public.coin_orders from public, anon, authenticated;
grant select on public.coin_wallets, public.coin_ledger, public.coin_packs, public.coin_orders to authenticated;

-- Preserve history: grant coins for existing completed logs in original entry order.
-- Voided historical logs still occupy an ordinal, but receive no retroactive reward.
with ordered as (
 select id,status,row_number() over (partition by owner order by completed_at,id) as ordinal from public.workout_logs
) update public.workout_logs w set coin_reward=case when o.status <> 'completed' then 0 when o.ordinal in (25,50,75,100) then 50 else 10 end
from ordered o where w.id=o.id;
insert into public.coin_wallets(owner,balance,lifetime_workouts)
select p.id,coalesce(sum(w.coin_reward),0)::integer,count(w.id)::integer from public.profiles p left join public.workout_logs w on w.owner=p.id group by p.id;
insert into public.coin_ledger(owner,amount,source,reference)
select owner,coin_reward,'workout',id::text from public.workout_logs where coin_reward > 0;

create function flexi_private.reward_workout_coins() returns trigger language plpgsql security definer set search_path='' as $$
declare ordinal integer; reward integer;
begin
  -- Same lock order as all app RPCs: profile first, then wallet.
  perform 1 from public.profiles where id=new.owner for update;
  insert into public.coin_wallets(owner) values(new.owner) on conflict do nothing;
  update public.coin_wallets set lifetime_workouts=lifetime_workouts+1 where owner=new.owner returning lifetime_workouts into ordinal;
  reward := case when ordinal in (25,50,75,100) then 50 else 10 end;
  new.coin_reward := reward;
  update public.coin_wallets set balance=balance+reward where owner=new.owner;
  insert into public.coin_ledger(owner,amount,source,reference) values(new.owner,reward,'workout',new.id::text);
  return new;
end;
$$;
create trigger reward_workout_coins before insert on public.workout_logs for each row execute function flexi_private.reward_workout_coins();
revoke execute on function flexi_private.reward_workout_coins() from public, anon, authenticated;

create function public.flexi_wallet() returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.profiles; w public.coin_wallets;
begin
  p := flexi_private.require_profile();
  insert into public.coin_wallets(owner) values(p.id) on conflict do nothing;
  select * into w from public.coin_wallets where owner=p.id;
  return jsonb_build_object('balance',w.balance,'lifetimeWorkouts',w.lifetime_workouts);
end;
$$;

-- Retains the existing claim endpoint and retry semantics, now charging the server price.
create or replace function public.flexi_claim_cosmetic(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.profiles; owned public.user_cosmetics; item public.cosmetic_items; current_level integer; wallet jsonb;
begin
  p := flexi_private.require_profile();
  wallet := public.flexi_wallet();
  select * into owned from public.user_cosmetics where owner=p.id and user_cosmetics.item=p_id;
  if found then return jsonb_build_object('inventory',to_jsonb(owned),'replayed',true,'wallet',wallet); end if;
  select * into item from public.cosmetic_items where id=p_id and active;
  if not found then raise sqlstate 'PT404' using message='Record not found.'; end if;
  select 1+(count(distinct local_date)/5)::integer into current_level from public.workout_logs where owner=p.id and status='completed';
  if current_level < item.minimum_level then raise sqlstate 'PT403' using message='Reach the required level before buying this item.'; end if;
  if (wallet->>'balance')::integer < item.coin_price then raise sqlstate 'PT409' using message='Not enough coins for this item.'; end if;
  insert into public.user_cosmetics(owner,item) values(p.id,p_id) returning * into owned;
  if item.coin_price > 0 then
    update public.coin_wallets set balance=balance-item.coin_price where owner=p.id;
    insert into public.coin_ledger(owner,amount,source,reference) values(p.id,-item.coin_price,'cosmetic',p_id::text);
  end if;
  return jsonb_build_object('inventory',to_jsonb(owned),'replayed',false,'wallet',public.flexi_wallet());
end;
$$;

create function public.flexi_create_coin_order(p_pack text,p_request_id text) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.profiles; pack public.coin_packs; o public.coin_orders;
begin
  p := flexi_private.require_profile();
  if p_request_id is null or p_request_id !~ '^[a-zA-Z0-9_-]{8,80}$' then raise sqlstate 'PT400' using message='Invalid requestId.'; end if;
  select * into o from public.coin_orders where owner=p.id and request_id=p_request_id;
  if found then
    if o.pack_id is distinct from p_pack then raise sqlstate 'PT409' using message='This requestId belongs to another coin pack.'; end if;
    return to_jsonb(o);
  end if;
  select * into pack from public.coin_packs where id=p_pack and active;
  if not found then raise sqlstate 'PT404' using message='Coin pack unavailable.'; end if;
  insert into public.coin_orders(owner,request_id,pack_id,coins,amount_cents,currency)
    values(p.id,p_request_id,pack.id,pack.coins,pack.amount_cents,pack.currency) returning * into o;
  return to_jsonb(o);
end;
$$;

-- Called ONLY by the trusted, Stripe-signature-verified Edge Function, never app users.
create function public.flexi_fulfill_coin_order(p_order uuid,p_session text,p_owner uuid,p_amount integer,p_currency text) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.coin_orders;
begin
  -- Lookup owner without locking, then preserve common profile -> order -> wallet lock order.
  select * into o from public.coin_orders where id=p_order;
  if not found then raise sqlstate 'PT404' using message='Order not found.'; end if;
  perform 1 from public.profiles where id=o.owner for update;
  select * into o from public.coin_orders where id=p_order for update;
  if p_session is null or p_session !~ '^cs_[a-zA-Z0-9_]+$' or o.owner is distinct from p_owner or o.amount_cents is distinct from p_amount or o.currency is distinct from p_currency then
    raise sqlstate 'PT400' using message='Payment does not match order.';
  end if;
  if o.status='paid' then
    if o.checkout_session_id is distinct from p_session then raise sqlstate 'PT409' using message='Order already fulfilled with another payment.'; end if;
    return jsonb_build_object('replayed',true);
  end if;
  update public.coin_orders set status='paid',checkout_session_id=p_session,paid_at=clock_timestamp() where id=o.id;
  insert into public.coin_wallets(owner,balance) values(o.owner,o.coins)
    on conflict(owner) do update set balance=coin_wallets.balance+excluded.balance;
  insert into public.coin_ledger(owner,amount,source,reference) values(o.owner,o.coins,'payment',p_session);
  return jsonb_build_object('replayed',false);
end;
$$;
revoke execute on function public.flexi_wallet(), public.flexi_create_coin_order(text,text) from public, anon;
grant execute on function public.flexi_wallet(), public.flexi_create_coin_order(text,text) to authenticated;
revoke execute on function public.flexi_fulfill_coin_order(uuid,text,uuid,integer,text) from public, anon, authenticated;
grant execute on function public.flexi_fulfill_coin_order(uuid,text,uuid,integer,text) to service_role;

-- Initial USD packs. Checkout remains disabled until explicitly configured in the app.
insert into public.coin_packs(id,coins,amount_cents) values('pocket',100,99),('boost',550,499),('power',1200,999);
insert into public.cosmetic_items(id,slug,name,slot,coin_price) values
('10000000-0000-4000-8000-000000000001','everyday-training-tee','Everyday training tee','outfit',120),
('10000000-0000-4000-8000-000000000002','hydration-buddy','Hydration buddy','accessory',80),
('10000000-0000-4000-8000-000000000003','off-duty-cap','Off-duty cap','hat',100),
('10000000-0000-4000-8000-000000000004','find-your-flow-mat','Find your flow mat','accessory',150),
('10000000-0000-4000-8000-000000000005','garden-escape','Garden escape','background',200),
('10000000-0000-4000-8000-000000000006','golden-hour','Golden hour','background',200);
