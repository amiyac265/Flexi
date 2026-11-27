-- Runs on the core schema BEFORE the coin migration, in a disposable test database only.
insert into auth.users values('90000000-0000-4000-8000-000000000001','{}');
set role authenticated;
set request.jwt.claim.sub='90000000-0000-4000-8000-000000000001';
do $$ declare r jsonb; begin
  for i in 1..26 loop
    r := flexi_log_workout(jsonb_build_object('requestId','legacy-coin-'||i,'title','Legacy gym','durationMinutes',30));
    if i in (1,26) then perform flexi_void_workout((r->'workout'->>'id')::uuid); end if;
  end loop;
end $$;
reset role;
-- All fixture RPCs run in one transaction. Give each entry its historical position
-- so the milestone and void assertions do not depend on the random UUID tie-breaker.
update public.workout_logs
set completed_at = timestamptz '2026-01-01 00:00:00+00'
  + split_part(request_id, '-', 3)::integer * interval '1 minute'
where owner = '90000000-0000-4000-8000-000000000001';
