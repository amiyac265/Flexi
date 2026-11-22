set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000009';
do $$ declare result jsonb; begin
  result := flexi_log_workout('{"requestId":"legacy-retry-123","title":"Legacy workout","durationMinutes":30}');
  assert result->>'replayed'='true';
  assert (select performed_at=completed_at from workout_logs);
  assert (select local_date=(completed_at at time zone 'America/New_York')::date from workout_logs);
  assert (select equipped_cosmetics->>'accessory'='00000000-0000-4000-8000-000000000019' from profiles);
  assert (select count(*) from user_cosmetics)=1;
end $$;
reset role;
-- Remove only these disposable migration fixtures before unrelated rule tests.
delete from auth.users where id='00000000-0000-4000-8000-000000000009';
delete from cosmetic_items where id='00000000-0000-4000-8000-000000000019';
