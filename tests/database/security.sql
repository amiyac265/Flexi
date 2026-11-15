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

-- November frontend contract: independent setup, detailed logging, safe retries and layered gear.
set role anon;
select expect_error('select flexi_save_onboarding(''{}'')','42501');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000003';
select expect_error('select flexi_save_onboarding(''{"goals":["admin"],"experienceLevel":"beginner","weeklyGoal":2,"preferredTime":"morning","calendarProvider":"none"}'')','PT400');
select expect_error('select flexi_save_onboarding(''{"goals":[null],"experienceLevel":"beginner","weeklyGoal":2,"preferredTime":"morning","calendarProvider":"none"}'')','PT400');
do $$ declare p profiles; begin
  p := flexi_save_onboarding('{"goals":["stay-consistent","build-muscle"],"experienceLevel":"beginner","weeklyGoal":2,"preferredTime":"morning","calendarProvider":"google"}');
  assert p.weekly_goal=2 and p.onboarding_completed and cardinality(p.goals)=2;
  p := flexi_save_onboarding('{"goals":["move-better"],"experienceLevel":"intermediate","weeklyGoal":2,"preferredTime":"evening","calendarProvider":"none"}');
  assert p.preferred_time='evening' and p.goals=array['move-better'];
end $$;
select expect_error('select flexi_save_onboarding(''{"goals":["stay-consistent"],"experienceLevel":"beginner","weeklyGoal":1,"preferredTime":"morning","calendarProvider":"none"}'')','PT409');
select 'PASS: onboarding saves owned preferences, validates goals and freezes the weekly reward goal.';
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
select expect_error('select flexi_save_onboarding(''{"goals":["stay-consistent"],"experienceLevel":"beginner","weeklyGoal":1,"preferredTime":"morning","calendarProvider":"none"}'')','PT409');
select expect_error('select flexi_log_workout(''{"requestId":"bad-detail-001","title":"Bad","durationMinutes":30,"activity":"admin"}'')','PT400');
select expect_error('select flexi_log_workout(''{"requestId":"bad-detail-001","title":"Bad","durationMinutes":30,"intensity":null}'')','PT400');
select expect_error('select flexi_log_workout(''{"requestId":"bad-detail-001","title":"Bad","durationMinutes":30,"focusArea":"head"}'')','PT400');
select expect_error('select flexi_log_workout(''{"requestId":"bad-detail-001","title":"Bad","durationMinutes":30,"performedAt":"2999-01-01T00:00:00Z"}'')','PT400');
select expect_error('select flexi_log_workout(''{"requestId":"bad-detail-001","title":"Bad","durationMinutes":30,"performedAt":"2020-01-01T00:00:00"}'')','PT400');
do $$ declare first jsonb; retry jsonb; begin
  first := flexi_log_workout('{"requestId":"detail-1234","title":"Leg day","durationMinutes":40,"activity":"strength","intensity":"intense","focusArea":"legs","performedAt":"2025-01-02T02:00:00Z"}');
  retry := flexi_log_workout('{"requestId":"detail-1234","title":"Leg day","durationMinutes":40,"activity":"strength","intensity":"intense","focusArea":"legs","performedAt":"2025-01-01T21:00:00-05:00"}');
  assert retry->>'replayed'='true'; assert first->'workout'->>'id'=retry->'workout'->>'id';
  assert first->'workout'->>'local_date'='2025-01-01'; assert first->'workout'->>'focus_area'='legs';
  assert (first->'workout'->>'completed_at')::timestamptz > (first->'workout'->>'performed_at')::timestamptz;
end $$;
select expect_error('select flexi_log_workout(''{"requestId":"detail-1234","title":"Leg day","durationMinutes":40,"activity":"strength","intensity":"light","focusArea":"legs","performedAt":"2025-01-02T02:00:00Z"}'')','PT409');
select 'PASS: workout details persist; timezone-derived day, immutable receipt time, canonical date retries and changed-payload conflicts.';
do $$ declare e calendar_events; retry calendar_events; body jsonb := '{"requestId":"plan-retry-123","title":"Plan","startsAt":"2026-11-15T14:00:00Z","endsAt":"2026-11-15T15:00:00Z","timezone":"America/New_York","workoutType":"mobility"}'; begin
  e := flexi_create_calendar(body); retry := flexi_create_calendar(body);
  assert e.id=retry.id and e.workout_type='mobility';
  e := flexi_update_calendar(e.id,'{"notes":"Water","workoutType":"recovery"}');
  assert e.workout_type='recovery' and e.notes='Water' and e.title='Plan';
  e := flexi_update_calendar(e.id,'{"status":"cancelled"}');
  retry := flexi_create_calendar(body); assert retry.id=e.id and retry.status='cancelled';
  perform expect_error(format('select flexi_update_calendar(%L,''{"requestId":"new-request"}'')',e.id),'PT400');
end $$;
select expect_error('select flexi_create_calendar(''{"requestId":"plan-retry-123","title":"Different","startsAt":"2026-11-15T14:00:00Z","endsAt":"2026-11-15T15:00:00Z","timezone":"America/New_York","workoutType":"mobility"}'')','PT409');
select 'PASS: calendar retries preserve identity through edits/cancellation and reject changed payloads.';
reset role;
insert into cosmetic_items(id,slug,name,slot,minimum_level) values
('00000000-0000-4000-8000-000000000021','test-top','Test top','top',1),
('00000000-0000-4000-8000-000000000022','test-shoes','Test shoes','shoes',1);
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000003';
select expect_error('select flexi_update_profile(''{"equipped":{"top":"00000000-0000-4000-8000-000000000021"}}'')','PT403');
select flexi_claim_cosmetic('00000000-0000-4000-8000-000000000021')->>'replayed';
select flexi_claim_cosmetic('00000000-0000-4000-8000-000000000022')->>'replayed';
select expect_error('select flexi_update_profile(''{"equipped":{"shoes":"00000000-0000-4000-8000-000000000021"}}'')','PT400');
select expect_error('select flexi_update_profile(''{"equipped":{"admin":null}}'')','PT400');
select expect_error('select flexi_update_profile(''{"equipped":null}'')','PT400');
select expect_error('select flexi_update_profile(''{"equipped":{},"equippedCosmeticId":null}'')','PT400');
do $$ declare p profiles; begin
  p := flexi_update_profile('{"equipped":{"top":"00000000-0000-4000-8000-000000000021"}}');
  p := flexi_update_profile('{"equipped":{"shoes":"00000000-0000-4000-8000-000000000022"}}');
  assert p.equipped_cosmetics ? 'top' and p.equipped_cosmetics ? 'shoes';
  p := flexi_update_profile('{"equipped":{"top":null}}'); assert not p.equipped_cosmetics ? 'top' and p.equipped_cosmetics ? 'shoes';
  p := flexi_update_profile('{"equippedCosmeticId":null}'); assert p.equipped_cosmetics='{}'::jsonb;
end $$;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
select expect_error('select flexi_update_profile(''{"equipped":{"top":"00000000-0000-4000-8000-000000000021"}}'')','PT403');
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000003';
reset role;
update cosmetic_items set active=false where id='00000000-0000-4000-8000-000000000021';
set role authenticated;
select expect_error('select flexi_update_profile(''{"equipped":{"top":"00000000-0000-4000-8000-000000000021"}}'')','PT403');
select 'PASS: layered outfits enforce per-slot ownership, partial merges, archive checks and legacy unequip.';
reset role;
