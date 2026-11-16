-- Historical voids occupy ordinals; completed milestone 25 receives 50, others 10.
set role authenticated;
set request.jwt.claim.sub='90000000-0000-4000-8000-000000000001';
do $$ declare r jsonb; begin
  assert (flexi_wallet()->>'balance')::integer=280;
  assert (flexi_wallet()->>'lifetimeWorkouts')::integer=26;
  assert (select count(*) from coin_ledger)=24;
  r := flexi_log_workout('{"requestId":"legacy-coin-25","title":"Legacy gym","durationMinutes":30}');
  assert (r->>'replayed')::boolean;
  assert (flexi_wallet()->>'balance')::integer=280;
  r := flexi_log_workout('{"requestId":"legacy-new-27","title":"Legacy gym","durationMinutes":30}');
  assert (r->'workout'->>'coin_reward')::integer=10;
  assert (flexi_wallet()->>'balance')::integer=290;
end $$;
reset role;
delete from auth.users where id='90000000-0000-4000-8000-000000000001';
select 'PASS: coin migration backfills existing history once, preserves void ordinals and retry identity.';
