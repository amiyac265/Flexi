-- Sharing a code allows an immediate, mutual demo friendship. Private profiles stay private.
alter table public.profiles add column friend_code text not null
  default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
  unique check (friend_code ~ '^[A-F0-9]{12}$');

create table public.friendships (
  user_low uuid not null references public.profiles(id) on delete cascade,
  user_high uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_low, user_high),
  check (user_low < user_high)
);
create index friendships_user_high on public.friendships(user_high);
alter table public.friendships enable row level security;
revoke all on public.friendships from public, anon, authenticated;
grant select on public.friendships to authenticated;
create policy own_friendships on public.friendships for select to authenticated
  using ((select auth.uid()) in (user_low, user_high));

create function public.flexi_friends() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := auth.uid(); code text; friends jsonb;
begin
  if me is null then raise sqlstate 'PT401' using message = 'Sign in with a Flexi account.'; end if;
  select friend_code into code from public.profiles where id = me;
  if not found then raise sqlstate 'PT404' using message = 'Profile not found.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'displayName', p.display_name,
    'avatar', p.avatar, 'addedAt', f.created_at) order by f.created_at desc, p.id), '[]'::jsonb)
    into friends from public.friendships f
    join public.profiles p on p.id = case when f.user_low = me then f.user_high else f.user_low end
    where me in (f.user_low, f.user_high);
  return jsonb_build_object('code', code, 'friends', friends);
end;
$$;

create function public.flexi_add_friend(p_input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); target public.profiles; code text; inserted integer; friendship public.friendships;
begin
  if me is null then raise sqlstate 'PT401' using message = 'Sign in with a Flexi account.'; end if;
  if not exists(select 1 from public.profiles where id = me) then
    raise sqlstate 'PT404' using message = 'Profile not found.';
  end if;
  perform flexi_private.check_input(p_input, array['code']);
  code := upper(flexi_private.required_text(p_input, 'code', 12));
  if code !~ '^[A-F0-9]{12}$' then raise sqlstate 'PT400' using message = 'Enter a 12-character friend code.'; end if;
  select * into target from public.profiles where friend_code = code;
  if not found then raise sqlstate 'PT404' using message = 'No friend found. Check the code and try again.'; end if;
  if target.id = me then raise sqlstate 'PT400' using message = 'That is your code. Ask a friend for theirs!'; end if;
  -- The canonical pair is the retry identity, including simultaneous reverse-direction adds.
  insert into public.friendships(user_low, user_high) values(least(me, target.id), greatest(me, target.id))
    on conflict do nothing;
  get diagnostics inserted = row_count;
  select * into friendship from public.friendships where user_low = least(me, target.id) and user_high = greatest(me, target.id);
  return jsonb_build_object('friend', jsonb_build_object('id', target.id, 'displayName', target.display_name,
    'avatar', target.avatar, 'addedAt', friendship.created_at), 'replayed', inserted = 0);
end;
$$;
revoke all on function public.flexi_friends(), public.flexi_add_friend(jsonb) from public, anon, authenticated;
grant execute on function public.flexi_friends(), public.flexi_add_friend(jsonb) to authenticated;
