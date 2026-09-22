-- Apply to the selected Supabase project before enabling the client configuration.
create table public.workout_entries (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('workout','diet')),
  day date not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 100000),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, day),
  check (payload->>'date' is not null and (payload->>'date')::date = day)
);
alter table public.workout_entries enable row level security;
create policy own_entries on public.workout_entries for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.workout_entries from anon;
grant select, insert, update on public.workout_entries to authenticated;

-- Optimistic concurrency prevents an old browser overwriting a newer device edit.
create function public.save_workout_entry(p_kind text, p_day date, p_payload jsonb, p_revision bigint)
returns setof public.workout_entries language plpgsql security invoker set search_path = public as $$
declare saved public.workout_entries;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_revision = 0 then
    insert into public.workout_entries(user_id,kind,day,payload)
      values(auth.uid(),p_kind,p_day,p_payload)
      on conflict (user_id,kind,day) do nothing returning * into saved;
  else
    update public.workout_entries set payload=p_payload, revision=revision+1, updated_at=now()
      where user_id=auth.uid() and kind=p_kind and day=p_day and revision=p_revision
      returning * into saved;
  end if;
  if saved.user_id is null then raise exception 'Record changed on another device' using errcode = '40001'; end if;
  return next saved;
end;
$$;
revoke all on function public.save_workout_entry(text,date,jsonb,bigint) from public, anon;
grant execute on function public.save_workout_entry(text,date,jsonb,bigint) to authenticated;
