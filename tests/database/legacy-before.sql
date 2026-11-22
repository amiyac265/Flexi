-- Fixtures written using only the original migration/API; never run against a hosted DB.
insert into auth.users values ('00000000-0000-4000-8000-000000000009','{"displayName":"Legacy","timezone":"America/New_York"}');
insert into cosmetic_items(id,slug,name,slot,minimum_level) values ('00000000-0000-4000-8000-000000000019','legacy-hat','Legacy Hat','hat',1);
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000009';
select flexi_log_workout('{"requestId":"legacy-retry-123","title":"Legacy workout","durationMinutes":30}');
select flexi_claim_cosmetic('00000000-0000-4000-8000-000000000019');
select flexi_update_profile('{"equippedCosmeticId":"00000000-0000-4000-8000-000000000019"}');
reset role;
