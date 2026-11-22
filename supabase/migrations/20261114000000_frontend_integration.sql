-- Figma frontend integration. Preserve existing records and original retry payloads.
alter table public.profiles
  add column goals text[] not null default '{}',
  add column experience_level text not null default 'beginner' check (experience_level in ('beginner','intermediate','advanced')),
  add column preferred_time text not null default 'flexible' check (preferred_time in ('morning','midday','evening','flexible')),
  add column calendar_provider text not null default 'none' check (calendar_provider in ('google','apple','none')),
  add column onboarding_completed boolean not null default false,
  add column equipped_cosmetics jsonb not null default '{}' check (jsonb_typeof(equipped_cosmetics) = 'object'),
  add constraint profile_goals_valid check (cardinality(goals) <= 6 and goals <@ array['build-muscle','get-stronger','lose-weight','improve-endurance','stay-consistent','move-better']::text[]);

alter table public.workout_logs
  add column activity text not null default 'other' check (activity in ('strength','running','walking','cycling','yoga','sports','other')),
  add column intensity text not null default 'moderate' check (intensity in ('light','moderate','intense')),
  add column focus_area text not null default 'full-body' check (focus_area in ('arms','chest','legs','full-body')),
  add column performed_at timestamptz;
update public.workout_logs set performed_at = completed_at;
alter table public.workout_logs alter column performed_at set not null, alter column performed_at set default now();
alter table public.workout_logs add constraint workout_performed_finite check (isfinite(performed_at));

alter table public.calendar_events
  add column workout_type text not null default 'strength' check (workout_type in ('strength','cardio','mobility','sports','recovery')),
  add column request_id text check (request_id ~ '^[a-zA-Z0-9_-]{8,80}$'),
  add column creation_input jsonb,
  add constraint calendar_retry_identity unique(owner,request_id);

-- Keep legacy hat/outfit slots valid; normalize them for rendering/equipment.
alter table public.cosmetic_items drop constraint cosmetic_items_slot_check;
alter table public.cosmetic_items add constraint cosmetic_items_slot_check check (slot in ('hat','outfit','accessory','top','bottom','shoes','background'));
alter table public.cosmetic_items
  add column category text not null default 'accessories' check (category in ('clothing','accessories','backgrounds','special')),
  add column style_key text not null default 'pulse-headband' check (style_key ~ '^[a-z0-9-]{1,60}$'),
  add column primary_color text not null default '#d8fb73' check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  add column accent_color text not null default '#20352b' check (accent_color ~ '^#[0-9a-fA-F]{6}$');
update public.cosmetic_items set category='clothing' where slot='outfit';
update public.profiles p set equipped_cosmetics = jsonb_build_object(case c.slot when 'hat' then 'accessory' when 'outfit' then 'top' else c.slot end,c.id)
  from public.cosmetic_items c where c.id=p.equipped_cosmetic_id;

create function flexi_private.enum_value(input jsonb, key text, allowed text[]) returns text language plpgsql set search_path = '' as $$
declare value text := flexi_private.required_text(input,key,60);
begin
  if not value = any(allowed) then raise sqlstate 'PT400' using message = 'Invalid ' || key || '.'; end if;
  return value;
end;
$$;

create function public.flexi_save_onboarding(p_input jsonb) returns public.profiles language plpgsql security definer set search_path = '' as $$
declare p public.profiles; goal integer; chosen text[]; value jsonb;
begin
  p := flexi_private.require_profile();
  perform flexi_private.check_input(p_input,array['goals','experienceLevel','weeklyGoal','preferredTime','calendarProvider']);
  if jsonb_typeof(p_input->'goals') is distinct from 'array' then raise sqlstate 'PT400' using message='Choose fitness goals.'; end if;
  if jsonb_array_length(p_input->'goals') not between 1 and 6 then raise sqlstate 'PT400' using message='Choose 1–6 fitness goals.'; end if;
  for value in select * from jsonb_array_elements(p_input->'goals') loop
    if jsonb_typeof(value) <> 'string' then raise sqlstate 'PT400' using message='Invalid goal.'; end if;
  end loop;
  select array_agg(distinct g) into chosen from jsonb_array_elements_text(p_input->'goals') g;
  if not chosen <@ array['build-muscle','get-stronger','lose-weight','improve-endurance','stay-consistent','move-better']::text[] then raise sqlstate 'PT400' using message='Invalid goal.'; end if;
  goal := flexi_private.number_value(p_input,'weeklyGoal',1,7);
  if goal <> p.weekly_goal and (p.onboarding_completed or exists(select 1 from public.workout_logs where owner=p.id)) then
    raise sqlstate 'PT409' using message='Your weekly goal is fixed after setup or your first workout.';
  end if;
  update public.profiles set goals=chosen,
    experience_level=flexi_private.enum_value(p_input,'experienceLevel',array['beginner','intermediate','advanced']),
    preferred_time=flexi_private.enum_value(p_input,'preferredTime',array['morning','midday','evening','flexible']),
    calendar_provider=flexi_private.enum_value(p_input,'calendarProvider',array['google','apple','none']),
    weekly_goal=goal,onboarding_completed=true where id=p.id returning * into p;
  return p;
end;
$$;

create or replace function public.flexi_log_workout(p_input jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.profiles; w public.workout_logs; normalized jsonb; ex jsonb; normalized_ex jsonb; exercises jsonb := '[]'; key text; moment timestamptz;
begin
  p := flexi_private.require_profile();
  perform flexi_private.check_input(p_input, array['requestId','title','durationMinutes','notes','exercises','activity','intensity','focusArea','performedAt']);
  key := flexi_private.required_text(p_input, 'requestId', 80);
  if key !~ '^[a-zA-Z0-9_-]{8,80}$' then raise sqlstate 'PT400' using message = 'Invalid requestId.'; end if;
  if p_input ? 'exercises' and (jsonb_typeof(p_input->'exercises') <> 'array') then raise sqlstate 'PT400' using message = 'Invalid exercises.'; end if;
  if jsonb_array_length(coalesce(p_input->'exercises', '[]')) > 30 then raise sqlstate 'PT400' using message = 'Use at most 30 exercises.'; end if;
  for ex in select value from jsonb_array_elements(coalesce(p_input->'exercises', '[]')) loop
    perform flexi_private.check_input(ex, array['name','sets','reps','weightKg','durationSeconds']);
    normalized_ex := jsonb_build_object('name', flexi_private.required_text(ex, 'name', 120));
    if ex ? 'sets' then normalized_ex := normalized_ex || jsonb_build_object('sets', flexi_private.number_value(ex,'sets',1,100)); end if;
    if ex ? 'reps' then normalized_ex := normalized_ex || jsonb_build_object('reps', flexi_private.number_value(ex,'reps',1,1000)); end if;
    if ex ? 'weightKg' then normalized_ex := normalized_ex || jsonb_build_object('weightKg', round(flexi_private.number_value(ex,'weightKg',0,2000,false),3)); end if;
    if ex ? 'durationSeconds' then normalized_ex := normalized_ex || jsonb_build_object('durationSeconds', flexi_private.number_value(ex,'durationSeconds',1,86400)); end if;
    exercises := exercises || jsonb_build_array(normalized_ex);
  end loop;
  normalized := jsonb_build_object('requestId',key,'title',flexi_private.required_text(p_input,'title',120),
    'durationMinutes',flexi_private.number_value(p_input,'durationMinutes',1,1440),'notes',flexi_private.optional_notes(p_input),'exercises',exercises);
  if p_input ? 'activity' then normalized := normalized || jsonb_build_object('activity',flexi_private.enum_value(p_input,'activity',array['strength','running','walking','cycling','yoga','sports','other'])); end if;
  if p_input ? 'intensity' then normalized := normalized || jsonb_build_object('intensity',flexi_private.enum_value(p_input,'intensity',array['light','moderate','intense'])); end if;
  if p_input ? 'focusArea' then normalized := normalized || jsonb_build_object('focusArea',flexi_private.enum_value(p_input,'focusArea',array['arms','chest','legs','full-body'])); end if;
  if p_input ? 'performedAt' then
    if flexi_private.required_text(p_input,'performedAt',60) !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then raise sqlstate 'PT400' using message='Use an ISO workout time with an offset.'; end if;
    moment := (p_input->>'performedAt')::timestamptz;
    if not isfinite(moment) or moment > clock_timestamp() or moment < '1970-01-01T00:00:00Z'::timestamptz then raise sqlstate 'PT400' using message='Choose a past workout time from 1970 onward.'; end if;
    normalized := normalized || jsonb_build_object('performedAt',to_char(moment at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
  end if;
  select * into w from public.workout_logs where owner = p.id and request_id = key;
  if found then
    if w.completion_input <> normalized then raise sqlstate 'PT409' using message = 'This requestId was already used for a different workout.'; end if;
    return jsonb_build_object('workout',to_jsonb(w) - 'completion_input','replayed',true);
  end if;
  moment := coalesce(moment, clock_timestamp());
  insert into public.workout_logs(owner,request_id,title,duration_minutes,notes,exercises,completion_input,completed_at,local_date,performed_at,activity,intensity,focus_area)
    values (p.id,key,normalized->>'title',(normalized->>'durationMinutes')::integer,normalized->>'notes',exercises,normalized,clock_timestamp(),(moment at time zone p.timezone)::date,moment,coalesce(normalized->>'activity','other'),coalesce(normalized->>'intensity','moderate'),coalesce(normalized->>'focusArea','full-body')) returning * into w;
  return jsonb_build_object('workout',to_jsonb(w) - 'completion_input','replayed',false);
end;
$$;

create or replace function public.flexi_update_profile(p_input jsonb) returns public.profiles language plpgsql security definer set search_path = '' as $$
declare p public.profiles; item_id uuid; slot_name text; item_slot text; entry record;
begin
  p := flexi_private.require_profile();
  perform flexi_private.check_input(p_input, array['displayName','avatar','equippedCosmeticId','equipped']);
  if p_input ? 'equippedCosmeticId' and p_input ? 'equipped' then raise sqlstate 'PT400' using message='Use one equipment input.'; end if;
  if p_input ? 'displayName' then p.display_name := flexi_private.required_text(p_input,'displayName',60); end if;
  if p_input ? 'avatar' then
    p.avatar := flexi_private.required_text(p_input,'avatar',20);
    if p.avatar not in ('bunny','panda','turtle','deer') then raise sqlstate 'PT400' using message = 'Invalid character.'; end if;
  end if;
  if p_input ? 'equippedCosmeticId' then
    item_id := (p_input->>'equippedCosmeticId')::uuid;
    if item_id is not null and not exists (
      select 1 from public.user_cosmetics i join public.cosmetic_items c on c.id = i.item
      where i.owner = p.id and c.id = item_id and c.active
    ) then raise sqlstate 'PT403' using message = 'Claim an active cosmetic before equipping it.'; end if;
    p.equipped_cosmetic_id := item_id;
    p.equipped_cosmetics := '{}';
    if item_id is not null then
      select case slot when 'hat' then 'accessory' when 'outfit' then 'top' else slot end into slot_name from public.cosmetic_items where id=item_id;
      p.equipped_cosmetics := jsonb_build_object(slot_name,item_id);
    end if;
  end if;
  if p_input ? 'equipped' then
    perform flexi_private.check_input(p_input->'equipped',array['top','bottom','shoes','accessory','background']);
    for entry in select * from jsonb_each(p_input->'equipped') loop
      if entry.value = 'null'::jsonb then
        p.equipped_cosmetics := p.equipped_cosmetics - entry.key;
      else
        if jsonb_typeof(entry.value) <> 'string' then raise sqlstate 'PT400' using message='Invalid equipment ID.'; end if;
        item_id := (entry.value #>> '{}')::uuid;
        select case c.slot when 'hat' then 'accessory' when 'outfit' then 'top' else c.slot end into item_slot
          from public.user_cosmetics i join public.cosmetic_items c on c.id=i.item where i.owner=p.id and c.id=item_id and c.active;
        if not found then raise sqlstate 'PT403' using message='Claim an active cosmetic before equipping it.'; end if;
        if item_slot <> entry.key then raise sqlstate 'PT400' using message='This cosmetic belongs in another slot.'; end if;
        p.equipped_cosmetics := p.equipped_cosmetics || jsonb_build_object(entry.key,item_id);
      end if;
    end loop;
    select value::uuid into p.equipped_cosmetic_id from jsonb_each_text(p.equipped_cosmetics) order by key limit 1;
  end if;
  update public.profiles set equipped_cosmetics=p.equipped_cosmetics,display_name=p.display_name, avatar=p.avatar, equipped_cosmetic_id=p.equipped_cosmetic_id where id=p.id returning * into p;
  return p;
end;
$$;

create or replace function flexi_private.calendar_values(p_input jsonb) returns public.calendar_events language plpgsql set search_path = '' as $$
declare e public.calendar_events;
begin
  perform flexi_private.check_input(p_input,array['title','startsAt','endsAt','timezone','notes','status','workoutType']);
  e.title := flexi_private.required_text(p_input,'title',120);
  if flexi_private.required_text(p_input,'startsAt',60) !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' or
     flexi_private.required_text(p_input,'endsAt',60) !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then raise sqlstate 'PT400' using message = 'Use ISO timestamps with offsets.'; end if;
  e.starts_at := (p_input->>'startsAt')::timestamptz;
  e.ends_at := (p_input->>'endsAt')::timestamptz;
  if not isfinite(e.starts_at) or not isfinite(e.ends_at) or e.ends_at <= e.starts_at or e.ends_at > e.starts_at + interval '24 hours' then
    raise sqlstate 'PT400' using message = 'Invalid calendar interval.';
  end if;
  e.timezone := flexi_private.required_text(p_input,'timezone',100);
  if not flexi_private.valid_timezone(e.timezone) then raise sqlstate 'PT400' using message = 'Invalid timezone.'; end if;
  e.notes := flexi_private.optional_notes(p_input);
  e.status := case when p_input ? 'status' then flexi_private.required_text(p_input,'status',20) else 'planned' end;
  if e.status not in ('planned','completed','cancelled') then raise sqlstate 'PT400' using message = 'Invalid calendar status.'; end if;
  e.workout_type := case when p_input ? 'workoutType' then flexi_private.enum_value(p_input,'workoutType',array['strength','cardio','mobility','sports','recovery']) else 'strength' end;
  return e;
end;
$$;
create or replace function public.flexi_create_calendar(p_input jsonb) returns public.calendar_events language plpgsql security definer set search_path = '' as $$
declare p public.profiles; e public.calendar_events; existing public.calendar_events; key text; normalized jsonb;
begin
  p := flexi_private.require_profile();
  perform flexi_private.check_input(p_input,array['title','startsAt','endsAt','timezone','notes','status','workoutType','requestId']);
  e := flexi_private.calendar_values(p_input - 'requestId');
  normalized := jsonb_build_object('title',e.title,'startsAt',to_char(e.starts_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'endsAt',to_char(e.ends_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'timezone',e.timezone,'notes',e.notes,'status',e.status,'workoutType',e.workout_type);
  if p_input ? 'requestId' then
    key := flexi_private.required_text(p_input,'requestId',80);
    if key !~ '^[a-zA-Z0-9_-]{8,80}$' then raise sqlstate 'PT400' using message='Invalid requestId.'; end if;
    select * into existing from public.calendar_events where owner=p.id and request_id=key;
    if found then
      if existing.creation_input <> normalized then raise sqlstate 'PT409' using message='This requestId was already used for a different plan.'; end if;
      return existing;
    end if;
  end if;
  insert into public.calendar_events(owner,title,starts_at,ends_at,timezone,notes,status,workout_type,request_id,creation_input)
    values(p.id,e.title,e.starts_at,e.ends_at,e.timezone,e.notes,e.status,e.workout_type,key,normalized) returning * into e;
  return e;
end;
$$;
create or replace function public.flexi_update_calendar(p_id uuid,p_input jsonb) returns public.calendar_events language plpgsql security definer set search_path = '' as $$
declare p public.profiles; original public.calendar_events; e public.calendar_events;
begin
  p := flexi_private.require_profile();
  perform flexi_private.check_input(p_input,array['title','startsAt','endsAt','timezone','notes','status','workoutType']);
  select * into original from public.calendar_events where id=p_id and owner=p.id for update;
  if not found then raise sqlstate 'PT404' using message = 'Record not found.'; end if;
  e := flexi_private.calendar_values(jsonb_build_object('title',original.title,'startsAt',to_char(original.starts_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'endsAt',to_char(original.ends_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'timezone',original.timezone,'notes',original.notes,'status',original.status,'workoutType',original.workout_type) || p_input);
  update public.calendar_events set workout_type=e.workout_type,title=e.title,starts_at=e.starts_at,ends_at=e.ends_at,timezone=e.timezone,notes=e.notes,status=e.status where id=p_id returning * into e;
  return e;
end;
$$;

revoke execute on all functions in schema flexi_private from public,anon,authenticated;
revoke execute on function public.flexi_save_onboarding(jsonb) from public,anon;
grant execute on function public.flexi_save_onboarding(jsonb) to authenticated;
