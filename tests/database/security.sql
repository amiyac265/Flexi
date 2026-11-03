-- Test helper executes as the CURRENT role, not the owner.
create function public.expect_error(statement text, expected text) returns text language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlstate = expected then return 'PASS: rejected ' || expected; end if;
    raise exception 'Expected %, got %: %', expected, sqlstate, sqlerrm;
  end;
  raise exception 'Expected rejection %, but statement succeeded: %', expected, statement;
end;
$$;
insert into auth.users values
('00000000-0000-4000-8000-000000000001','{"displayName":"Alice","timezone":"America/New_York","weeklyGoal":3}'),
('00000000-0000-4000-8000-000000000002','{"displayName":"Bob","timezone":"Not/AZone","weeklyGoal":100,"avatar":"admin","xp":99999}');
insert into cosmetic_items(id,slug,name,slot,minimum_level,active) values
('00000000-0000-4000-8000-000000000011','starter','Starter','hat',1,true),
('00000000-0000-4000-8000-000000000012','locked','Locked','hat',2,true),
('00000000-0000-4000-8000-000000000013','parallel','Parallel','hat',1,true),
('00000000-0000-4000-8000-000000000014','archived','Archived','hat',1,false);
insert into training_content(slug,title,kind,summary,status,published_at) values
('live','Live','news','Published','published',now()-interval '1 day'),
('draft','Draft','news','Private','draft',now()),
('future','Future','news','Later','published',now()+interval '1 day');
set role anon;
select expect_error('select * from profiles','42501');
select expect_error('select flexi_log_workout(''{}'')','42501');
do $$ begin assert (select count(*) from training_content) = 1; assert (select count(*) from cosmetic_items) = 3; end $$;
select 'PASS: anonymous callers can only read published/active catalogs, not accounts or mutations.';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
do $$ begin assert (select count(*) from profiles) = 1; assert (select display_name from profiles) = 'Alice'; end $$;
select expect_error('update profiles set weekly_goal=1','42501');
select expect_error('insert into workout_logs(owner,request_id,title,duration_minutes,local_date,completion_input) values(auth.uid(),''injected-123'',''Fake'',30,current_date,''{}'')','42501');
select expect_error('insert into user_cosmetics(owner,item) values(auth.uid(),''00000000-0000-4000-8000-000000000012'')','42501');
select expect_error('select flexi_update_profile(''{"weeklyGoal":1}'')','PT400');
select expect_error('select flexi_update_profile(''{"timezone":"UTC"}'')','PT400');
select expect_error('select flexi_log_workout(''{"requestId":"injected-123","title":"Fake","durationMinutes":30,"owner":"00000000-0000-4000-8000-000000000002"}'')','PT400');
select expect_error('select flexi_log_workout(''{"requestId":"injected-123","title":"Fake","durationMinutes":30,"localDate":"1990-01-01"}'')','PT400');
select expect_error('select flexi_log_workout(''{"requestId":"injected-123","title":"Fake","durationMinutes":1.5}'')','PT400');
select expect_error('select flexi_log_workout(''{"requestId":"injected-123","title":"Fake","durationMinutes":30,"exercises":[{"name":"Squat","sets":0}]}'')','PT400');
select expect_error('select flexi_log_workout(''{"requestId":"injected-123","title":"Fake","durationMinutes":30,"exercises":null}'')','PT400');
select expect_error('select flexi_log_workout(''{"requestId":"injected-123","title":"Fake","durationMinutes":30,"notes":null}'')','PT400');
do $$ declare first jsonb; retry jsonb;
begin
  first := flexi_log_workout('{"requestId":"workout-1234","title":" Gym ","durationMinutes":30}');
  retry := flexi_log_workout('{"durationMinutes":30,"title":"Gym","requestId":"workout-1234","notes":"","exercises":[]}');
  assert first->>'replayed' = 'false'; assert retry->>'replayed' = 'true';
  assert first->'workout'->>'id' = retry->'workout'->>'id';
  assert (select local_date from workout_logs limit 1) = (now() at time zone 'America/New_York')::date;
end $$;
select expect_error('select flexi_log_workout(''{"requestId":"workout-1234","title":"Different","durationMinutes":30}'')','PT409');
select flexi_log_workout('{"requestId":"workout-5678","title":"Second","durationMinutes":20}')->>'replayed';
do $$ begin
  assert jsonb_array_length(flexi_progress_days()) = 1;
  assert (flexi_progress_days()->0->>'workouts')::integer = 2;
  assert (flexi_progress_days()->0->>'minutes')::integer = 50;
end $$;
select 'PASS: canonical retry identity, server timezone, and same-day aggregation.';
select expect_error('select flexi_claim_cosmetic(''00000000-0000-4000-8000-000000000012'')','PT403');
select expect_error('select flexi_update_profile(''{"equippedCosmeticId":"00000000-0000-4000-8000-000000000011"}'')','PT403');
select expect_error('select flexi_claim_cosmetic(''00000000-0000-4000-8000-000000000014'')','PT404');
select flexi_claim_cosmetic('00000000-0000-4000-8000-000000000011')->>'replayed';
do $$ begin
  assert flexi_claim_cosmetic('00000000-0000-4000-8000-000000000011')->>'replayed' = 'true';
  assert (flexi_update_profile('{"equippedCosmeticId":"00000000-0000-4000-8000-000000000011"}')).equipped_cosmetic_id = '00000000-0000-4000-8000-000000000011'::uuid;
end $$;
select expect_error('select flexi_create_calendar(''{"title":"Gym","startsAt":"2026-11-05T10:00:00Z","endsAt":"2026-11-05T09:00:00Z","timezone":"UTC"}'')','PT400');
select expect_error('select flexi_create_calendar(''{"title":"Gym","startsAt":"2026-11-05T10:00:00Z","endsAt":"2026-11-06T11:00:00Z","timezone":"UTC"}'')','PT400');
do $$ declare e calendar_events;
begin
  e := flexi_create_calendar('{"title":"Gym","startsAt":"2026-11-05T10:00:00Z","endsAt":"2026-11-05T11:00:00Z","timezone":"UTC"}');
  e := flexi_update_calendar(e.id,'{"notes":"Bring water","status":"completed"}');
  assert e.notes = 'Bring water'; assert e.title = 'Gym'; assert e.status = 'completed';
  assert (flexi_progress_days()->0->>'workouts')::integer = 2;
  e := flexi_update_calendar(e.id,'{"status":"cancelled"}'); assert e.status = 'cancelled';
end $$;
select 'PASS: calendar CRUD keeps progress unchanged; claims enforce eligibility and ownership.';
-- Change identity and prove there is no cross-account visibility.
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
do $$ begin
  assert (select count(*) from profiles) = 1;
  assert (select timezone from profiles) = 'UTC'; assert (select weekly_goal from profiles) = 3;
  assert (select avatar from profiles) = 'bunny';
  assert (select count(*) from workout_logs) = 0; assert (select count(*) from calendar_events) = 0;
  assert (select count(*) from user_cosmetics) = 0; assert flexi_progress_days() = '[]'::jsonb;
end $$;
-- Get Alice IDs as owner for cross-user RPC attempts, then restore Bob's role.
reset role;
create table public.test_ids as select (select id from workout_logs where request_id='workout-1234') as workout, (select id from calendar_events limit 1) as calendar;
grant select on public.test_ids to authenticated;
set role authenticated;
select expect_error(format('select flexi_void_workout(%L)', (select workout from test_ids)),'PT404');
select expect_error(format('select flexi_update_calendar(%L,''{"status":"completed"}'')', (select calendar from test_ids)),'PT404');
select expect_error('select flexi_update_profile(''{"equippedCosmeticId":"00000000-0000-4000-8000-000000000011"}'')','PT403');
select flexi_log_workout('{"requestId":"workout-1234","title":"Bob log","durationMinutes":30}')->>'replayed';
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
do $$ declare w workout_logs;
begin
  select * into w from workout_logs where request_id='workout-1234';
  perform flexi_void_workout(w.id); perform flexi_void_workout(w.id);
  assert jsonb_array_length(flexi_progress_days()) = 1;
  assert (flexi_progress_days()->0->>'workouts')::integer = 1;
  assert (flexi_log_workout('{"requestId":"workout-1234","title":"Gym","durationMinutes":30}')->'workout'->>'status') = 'voided';
  select * into w from workout_logs where request_id='workout-5678'; perform flexi_void_workout(w.id);
  assert flexi_progress_days() = '[]'::jsonb;
  assert (select count(*) from user_cosmetics) = 1;
end $$;
select 'PASS: cross-account RLS/RPC isolation; repeated voids; claims survive voids.';
reset role;
-- Fixtures beyond REST's 1,000-row cap verify aggregation is done inside PostgreSQL.
insert into workout_logs(owner,request_id,title,duration_minutes,local_date,completion_input)
select '00000000-0000-4000-8000-000000000002','fixture-'||n,'Historical',1,date '2020-01-01'+n,'{}' from generate_series(1,1100) n;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
do $$ begin assert jsonb_array_length(flexi_progress_days()) = 1101; end $$;
select 'PASS: progress includes more than 1,000 workout dates.';
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
do $$ begin
  assert flexi_claim_cosmetic('00000000-0000-4000-8000-000000000012')->>'replayed' = 'false';
end $$;
reset role;
update cosmetic_items set active=false where id='00000000-0000-4000-8000-000000000011';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
do $$ begin
  assert (select count(*) from user_cosmetics) = 1;
  assert (select count(*) from cosmetic_items where id='00000000-0000-4000-8000-000000000011') = 0;
end $$;
select expect_error('select flexi_update_profile(''{"equippedCosmeticId":"00000000-0000-4000-8000-000000000011"}'')','PT403');
select 'PASS: eligible claims succeed; archived items stay owned but cannot be equipped.';
reset role;
-- A malformed user metadata value cannot prevent account provisioning.
insert into auth.users values ('00000000-0000-4000-8000-000000000003','{"displayName":false,"weeklyGoal":"1","timezone":"GMT+garbage","equippedCosmeticId":"00000000-0000-4000-8000-000000000012"}');
do $$ begin
  assert (select display_name from profiles where id='00000000-0000-4000-8000-000000000003') = 'Athlete';
  assert (select equipped_cosmetic_id from profiles where id='00000000-0000-4000-8000-000000000003') is null;
  assert (select weekly_goal from profiles where id='00000000-0000-4000-8000-000000000003') = 3;
end $$;
select 'PASS: malicious signup metadata cannot grant equipment or override safe defaults.';
