-- Single-user MVP. Run once through Supabase migrations, before app signup.
-- Only SELECT is granted to app roles; all mutations use bounded, authenticated RPCs.
create schema if not exists flexi_private;
revoke all on schema flexi_private from public, anon, authenticated;

create function flexi_private.valid_timezone(value text) returns boolean
language sql stable set search_path = '' as $$
  select value is not null and exists (select 1 from pg_catalog.pg_timezone_names where name = value);
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 60),
  avatar text not null default 'bunny' check (avatar in ('bunny','panda','turtle','deer')),
  timezone text not null default 'UTC' check (flexi_private.valid_timezone(timezone)),
  weekly_goal integer not null default 3 check (weekly_goal between 1 and 7),
  equipped_cosmetic_id uuid,
  created_at timestamptz not null default now()
);
create table public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles(id) on delete cascade,
  request_id text not null check (request_id ~ '^[a-zA-Z0-9_-]{8,80}$'),
  title text not null check (length(btrim(title)) between 1 and 120),
  duration_minutes integer not null check (duration_minutes between 1 and 1440),
  notes text not null default '' check (length(notes) <= 2000),
  exercises jsonb not null default '[]'::jsonb check (jsonb_typeof(exercises) = 'array' and jsonb_array_length(exercises) <= 30),
  completion_input jsonb not null,
  completed_at timestamptz not null default now(),
  local_date date not null,
  status text not null default 'completed' check (status in ('completed','voided')),
  voided_at timestamptz,
  unique(owner, request_id)
);
create index workout_history on public.workout_logs(owner, completed_at desc, id);
create index workout_days on public.workout_logs(owner, local_date) where status = 'completed';
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 120),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null check (flexi_private.valid_timezone(timezone)),
  notes text not null default '' check (length(notes) <= 2000),
  status text not null default 'planned' check (status in ('planned','completed','cancelled')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at and ends_at <= starts_at + interval '24 hours'),
  check (isfinite(starts_at) and isfinite(ends_at))
);
create index calendar_owner_range on public.calendar_events(owner, starts_at, ends_at);
create table public.training_content (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null check (length(btrim(title)) between 1 and 160),
  kind text not null check (kind in ('news','tutorial')),
  summary text not null check (length(btrim(summary)) between 1 and 2000),
  body text check (length(body) <= 30000),
  source_url text check (source_url is null or source_url ~ '^https://'),
  image_url text check (image_url is null or image_url ~ '^https://'),
  status text not null default 'draft' check (status in ('draft','published')),
  published_at timestamptz not null default now()
);
create index training_published on public.training_content(kind, published_at desc) where status = 'published';
create table public.cosmetic_items (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null check (length(btrim(name)) between 1 and 120),
  description text check (length(description) <= 2000),
  slot text not null check (slot in ('hat','outfit','accessory')),
  minimum_level integer not null default 1 check (minimum_level between 1 and 1000),
  active boolean not null default true,
  image_url text check (image_url is null or image_url ~ '^https://')
);
create table public.user_cosmetics (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles(id) on delete cascade,
  item uuid not null references public.cosmetic_items(id) on delete restrict,
  acquired_at timestamptz not null default now(),
  unique(owner,item)
);
alter table public.profiles add constraint equipped_cosmetic_fk foreign key (equipped_cosmetic_id) references public.cosmetic_items(id) on delete set null;
-- Preserve the exported frontend's editorial leaderboard contract. No user-to-user ranking logic.
create table public.leaderboard_entries (
  id uuid primary key default gen_random_uuid(),
  display_name text not null, handle text not null unique,
  points integer not null default 0 check (points >= 0),
  workouts integer not null default 0 check (workouts >= 0),
  streak integer not null default 0 check (streak >= 0),
  avatar text not null check (avatar in ('bunny','panda','turtle','deer'))
);

alter table public.profiles enable row level security;
alter table public.workout_logs enable row level security;
alter table public.calendar_events enable row level security;
alter table public.user_cosmetics enable row level security;
alter table public.training_content enable row level security;
alter table public.cosmetic_items enable row level security;
alter table public.leaderboard_entries enable row level security;
create policy own_profile on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy own_workouts on public.workout_logs for select to authenticated using (owner = (select auth.uid()));
create policy own_calendar on public.calendar_events for select to authenticated using (owner = (select auth.uid()));
create policy own_inventory on public.user_cosmetics for select to authenticated using (owner = (select auth.uid()));
create policy published_content on public.training_content for select to anon, authenticated using (status = 'published' and published_at <= now());
create policy active_cosmetics on public.cosmetic_items for select to anon, authenticated using (active);
create policy editorial_leaderboard on public.leaderboard_entries for select to anon, authenticated using (true);
revoke all on public.profiles, public.workout_logs, public.calendar_events, public.user_cosmetics, public.training_content, public.cosmetic_items, public.leaderboard_entries from anon, authenticated;
grant select on public.profiles, public.workout_logs, public.calendar_events, public.user_cosmetics to authenticated;
grant select on public.training_content, public.cosmetic_items, public.leaderboard_entries to anon, authenticated;

-- Auth metadata is untrusted. Normalize signup preferences, never privileges or rewards.
create function flexi_private.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
        goal integer := 3; zone text := 'UTC'; avatar_name text := 'bunny'; display text := 'Athlete';
begin
  if jsonb_typeof(m->'displayName') = 'string' and length(btrim(m->>'displayName')) between 1 and 60 then display := btrim(m->>'displayName'); end if;
  if m->>'avatar' in ('bunny','panda','turtle','deer') then avatar_name := m->>'avatar'; end if;
  if flexi_private.valid_timezone(m->>'timezone') then zone := m->>'timezone'; end if;
  if jsonb_typeof(m->'weeklyGoal') = 'number' and m->>'weeklyGoal' ~ '^[1-7]$' then goal := (m->>'weeklyGoal')::integer; end if;
  insert into public.profiles(id, display_name, avatar, timezone, weekly_goal) values (new.id, display, avatar_name, zone, goal);
  return new;
end;
$$;
create trigger flexi_signup after insert on auth.users for each row execute function flexi_private.handle_new_user();
-- Preserve existing Auth accounts if this migration is applied after project signup.
insert into public.profiles(id, display_name) select id, 'Athlete' from auth.users on conflict do nothing;

create function flexi_private.require_profile() returns public.profiles language plpgsql set search_path = '' as $$
declare p public.profiles;
begin
  if auth.uid() is null then raise sqlstate 'PT401' using message = 'Sign in with a Flexi account.'; end if;
  -- Common lock order serializes reward-bearing writes and claims within an account.
  select * into p from public.profiles where id = auth.uid() for update;
  if not found then raise sqlstate 'PT404' using message = 'Profile not found.'; end if;
  return p;
end;
$$;
create function flexi_private.check_input(input jsonb, allowed text[]) returns void language plpgsql set search_path = '' as $$
begin
  if input is null or jsonb_typeof(input) <> 'object' or octet_length(input::text) > 131072 then
    raise sqlstate 'PT400' using message = 'Expected a JSON object under 128 KB.';
  end if;
  if exists (select 1 from jsonb_object_keys(input) k where not k = any(allowed)) then
    raise sqlstate 'PT400' using message = 'Unsupported fields.';
  end if;
end;
$$;
create function flexi_private.required_text(input jsonb, key text, max_length integer) returns text language plpgsql set search_path = '' as $$
declare v text := btrim(input->>key);
begin
  if jsonb_typeof(input->key) is distinct from 'string' or length(v) not between 1 and max_length then
    raise sqlstate 'PT400' using message = 'Invalid ' || key || '.';
  end if;
  return v;
end;
$$;
create function flexi_private.number_value(input jsonb, key text, low_value numeric, high_value numeric, whole boolean default true) returns numeric language plpgsql set search_path = '' as $$
declare v numeric;
begin
  if jsonb_typeof(input->key) is distinct from 'number' then raise sqlstate 'PT400' using message = 'Invalid ' || key || '.'; end if;
  v := (input->>key)::numeric;
  if v < low_value or v > high_value or (whole and v <> trunc(v)) then raise sqlstate 'PT400' using message = 'Invalid ' || key || '.'; end if;
  return v;
end;
$$;
create function flexi_private.optional_notes(input jsonb) returns text language plpgsql set search_path = '' as $$
begin
  if not input ? 'notes' or input->>'notes' = '' then return ''; end if;
  return flexi_private.required_text(input, 'notes', 2000);
end;
$$;

create function public.flexi_log_workout(p_input jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.profiles; w public.workout_logs; normalized jsonb; ex jsonb; normalized_ex jsonb; exercises jsonb := '[]'; key text; moment timestamptz;
begin
  p := flexi_private.require_profile();
  perform flexi_private.check_input(p_input, array['requestId','title','durationMinutes','notes','exercises']);
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
  select * into w from public.workout_logs where owner = p.id and request_id = key;
  if found then
    if w.completion_input <> normalized then raise sqlstate 'PT409' using message = 'This requestId was already used for a different workout.'; end if;
    return jsonb_build_object('workout',to_jsonb(w) - 'completion_input','replayed',true);
  end if;
  moment := clock_timestamp();
  insert into public.workout_logs(owner,request_id,title,duration_minutes,notes,exercises,completion_input,completed_at,local_date)
    values (p.id,key,normalized->>'title',(normalized->>'durationMinutes')::integer,normalized->>'notes',exercises,normalized,moment,(moment at time zone p.timezone)::date) returning * into w;
  return jsonb_build_object('workout',to_jsonb(w) - 'completion_input','replayed',false);
end;
$$;
create function public.flexi_void_workout(p_id uuid) returns public.workout_logs language plpgsql security definer set search_path = '' as $$
declare p public.profiles; w public.workout_logs;
begin
  p := flexi_private.require_profile();
  select * into w from public.workout_logs where id = p_id and owner = p.id;
  if not found then raise sqlstate 'PT404' using message = 'Record not found.'; end if;
  if w.status <> 'voided' then
    update public.workout_logs set status = 'voided', voided_at = clock_timestamp() where id = w.id returning * into w;
  end if;
  return w;
end;
$$;

create function public.flexi_update_profile(p_input jsonb) returns public.profiles language plpgsql security definer set search_path = '' as $$
declare p public.profiles; item_id uuid;
begin
  p := flexi_private.require_profile();
  perform flexi_private.check_input(p_input, array['displayName','avatar','equippedCosmeticId']);
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
  end if;
  update public.profiles set display_name=p.display_name, avatar=p.avatar, equipped_cosmetic_id=p.equipped_cosmetic_id where id=p.id returning * into p;
  return p;
end;
$$;
create function flexi_private.calendar_values(p_input jsonb) returns public.calendar_events language plpgsql set search_path = '' as $$
declare e public.calendar_events;
begin
  perform flexi_private.check_input(p_input,array['title','startsAt','endsAt','timezone','notes','status']);
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
  return e;
end;
$$;
create function public.flexi_create_calendar(p_input jsonb) returns public.calendar_events language plpgsql security definer set search_path = '' as $$
declare p public.profiles; e public.calendar_events;
begin
  p := flexi_private.require_profile();
  e := flexi_private.calendar_values(p_input);
  insert into public.calendar_events(owner,title,starts_at,ends_at,timezone,notes,status)
    values(p.id,e.title,e.starts_at,e.ends_at,e.timezone,e.notes,e.status) returning * into e;
  return e;
end;
$$;
create function public.flexi_update_calendar(p_id uuid,p_input jsonb) returns public.calendar_events language plpgsql security definer set search_path = '' as $$
declare p public.profiles; original public.calendar_events; e public.calendar_events;
begin
  p := flexi_private.require_profile();
  perform flexi_private.check_input(p_input,array['title','startsAt','endsAt','timezone','notes','status']);
  select * into original from public.calendar_events where id=p_id and owner=p.id for update;
  if not found then raise sqlstate 'PT404' using message = 'Record not found.'; end if;
  e := flexi_private.calendar_values(jsonb_build_object('title',original.title,'startsAt',to_char(original.starts_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'endsAt',to_char(original.ends_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'timezone',original.timezone,'notes',original.notes,'status',original.status) || p_input);
  update public.calendar_events set title=e.title,starts_at=e.starts_at,ends_at=e.ends_at,timezone=e.timezone,notes=e.notes,status=e.status where id=p_id returning * into e;
  return e;
end;
$$;
create function public.flexi_claim_cosmetic(p_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.profiles; owned public.user_cosmetics; item public.cosmetic_items; current_level integer;
begin
  p := flexi_private.require_profile();
  select * into owned from public.user_cosmetics where owner=p.id and user_cosmetics.item=p_id;
  if found then return jsonb_build_object('inventory',to_jsonb(owned),'replayed',true); end if;
  select * into item from public.cosmetic_items where id=p_id and active;
  if not found then raise sqlstate 'PT404' using message = 'Record not found.'; end if;
  select 1 + (count(distinct local_date) / 5)::integer into current_level from public.workout_logs where owner=p.id and status='completed';
  if current_level < item.minimum_level then raise sqlstate 'PT403' using message = 'Reach the required level before claiming this item.'; end if;
  insert into public.user_cosmetics(owner,item) values(p.id,p_id) returning * into owned;
  return jsonb_build_object('inventory',to_jsonb(owned),'replayed',false);
end;
$$;
-- Return only reward inputs in one statement/snapshot, avoiding REST's default row cap.
create function public.flexi_progress_days() returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(d) order by d.local_date),'[]'::jsonb) from (
    select local_date, count(*)::integer as workouts, sum(duration_minutes)::integer as minutes
    from public.workout_logs where owner=auth.uid() and status='completed' group by local_date
  ) d;
$$;

revoke execute on all functions in schema flexi_private from public, anon, authenticated;
revoke execute on function public.flexi_log_workout(jsonb), public.flexi_void_workout(uuid), public.flexi_update_profile(jsonb),
  public.flexi_create_calendar(jsonb), public.flexi_update_calendar(uuid,jsonb), public.flexi_claim_cosmetic(uuid), public.flexi_progress_days() from public, anon;
grant execute on function public.flexi_log_workout(jsonb), public.flexi_void_workout(uuid), public.flexi_update_profile(jsonb),
  public.flexi_create_calendar(jsonb), public.flexi_update_calendar(uuid,jsonb), public.flexi_claim_cosmetic(uuid), public.flexi_progress_days() to authenticated;
