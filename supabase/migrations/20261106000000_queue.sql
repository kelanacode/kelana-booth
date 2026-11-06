-- Guest queue (antrian) for busy events.
--
-- Guests scan one fixed QR (gallery Worker /q), tap "Ambil nomor" and watch
-- their place in line on their phone. The booth start screen shows whose turn
-- it is with two operator buttons: Lewati (skip a no-show) and Walk-in.
--
-- Rules:
--   * The queue only advances when a numbered guest's whole booth run finishes
--     (queue_complete). Starting, cancelling or refreshing a session never
--     moves it: queue_start only marks the head ticket as "serving", and the
--     same head is offered again until it is completed or skipped.
--   * A skipped guest can rejoin from their phone; they are placed right
--     after the next guest in line, not at the back.
--   * Walk-in sessions carry no ticket and never touch the queue.
--   * The queue is switched on per event (events.queue_enabled) and only runs
--     for the active event.
--
-- Guests and the booth run as anon, so everything goes through security
-- definer functions; anon has no direct access to queue_tickets.

alter table public.events
  add column if not exists queue_enabled boolean not null default false;

comment on column public.events.queue_enabled is
  'Guest queue on/off for this event. The queue only runs while the event is also active.';

create table if not exists public.queue_tickets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  -- Number shown to the guest, 1.. per event. Never reused.
  number integer not null,
  -- Position in line. Equal to the take order, except for rejoined guests,
  -- who get a fractional key that slots them in near the front.
  sort_key double precision not null,
  status text not null default 'waiting' check (status in ('waiting', 'serving', 'done', 'skipped')),
  -- Random id kept in the guest's browser: one active ticket per phone.
  device_id text not null default '',
  created_at timestamptz not null default now(),
  started_at timestamptz,
  done_at timestamptz,
  skipped_at timestamptz,
  unique (event_id, number)
);

comment on table public.queue_tickets is
  'Guest queue tickets. Accessed only through the queue_* functions.';

create index if not exists queue_tickets_line_idx on public.queue_tickets (event_id, status, sort_key);
create index if not exists queue_tickets_device_idx on public.queue_tickets (event_id, device_id);

alter table public.queue_tickets enable row level security;

create policy "queue_tickets_admin_select" on public.queue_tickets
  for select to authenticated using (true);
create policy "queue_tickets_admin_delete" on public.queue_tickets
  for delete to authenticated using (true);

-- The event the queue is running for: active and queue switched on.
create or replace function public.queue_event()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.events where is_active and queue_enabled limit 1;
$$;

revoke all on function public.queue_event() from public;

-- First ticket still in line (waiting or being served).
create or replace function public.queue_head(p_event uuid)
returns public.queue_tickets
language sql
stable
security definer
set search_path = public
as $$
  select * from public.queue_tickets
   where event_id = p_event and status in ('waiting', 'serving')
   order by sort_key
   limit 1;
$$;

revoke all on function public.queue_head(uuid) from public;

-- Guest: take a number (or get back the one this phone already holds).
create or replace function public.queue_take(p_device text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event uuid := public.queue_event();
  v_device text := left(coalesce(p_device, ''), 80);
  v_row public.queue_tickets%rowtype;
  v_number integer;
  v_key double precision;
begin
  if v_event is null then
    return jsonb_build_object('ok', false, 'reason', 'disabled');
  end if;
  if length(v_device) < 8 then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  select * into v_row from public.queue_tickets
   where event_id = v_event and device_id = v_device and status in ('waiting', 'serving')
   limit 1;
  if found then
    return jsonb_build_object('ok', true, 'ticket_id', v_row.id, 'number', v_row.number);
  end if;

  -- Crude flood guard: a real event never hands out 60 numbers a minute.
  if (
    select count(*) from public.queue_tickets
     where event_id = v_event and created_at > now() - interval '1 minute'
  ) >= 60 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  -- Serialize number assignment per event.
  perform pg_advisory_xact_lock(hashtext('queue:' || v_event::text));

  select coalesce(max(number), 0) + 1, coalesce(max(sort_key), 0) + 1
    into v_number, v_key
    from public.queue_tickets where event_id = v_event;

  insert into public.queue_tickets (event_id, number, sort_key, device_id)
  values (v_event, v_number, v_key, v_device)
  returning * into v_row;

  return jsonb_build_object('ok', true, 'ticket_id', v_row.id, 'number', v_row.number);
end;
$$;

-- Guest: where am I? Polled by the /q page.
create or replace function public.queue_status(p_ticket uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.queue_tickets%rowtype;
  v_head public.queue_tickets%rowtype;
  v_enabled boolean;
  v_ahead integer := 0;
  v_avg double precision;
begin
  select * into v_row from public.queue_tickets where id = p_ticket;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select (is_active and queue_enabled) into v_enabled from public.events where id = v_row.event_id;
  v_head := public.queue_head(v_row.event_id);

  if v_row.status in ('waiting', 'serving') then
    select count(*) into v_ahead from public.queue_tickets
     where event_id = v_row.event_id
       and status in ('waiting', 'serving')
       and sort_key < v_row.sort_key;
  end if;

  -- Average booth run of the last 10 finished guests (for the wait estimate).
  select avg(extract(epoch from (done_at - started_at))) into v_avg
    from (
      select done_at, started_at from public.queue_tickets
       where event_id = v_row.event_id and status = 'done'
         and started_at is not null and done_at > started_at
       order by done_at desc
       limit 10
    ) recent;

  return jsonb_build_object(
    'ok', true,
    'enabled', coalesce(v_enabled, false),
    'number', v_row.number,
    'status', v_row.status,
    'ahead', v_ahead,
    'now_number', v_head.number,
    'now_status', v_head.status,
    'avg_seconds', v_avg
  );
end;
$$;

-- Guest: rejoin after being skipped. Placed right after the next guest.
create or replace function public.queue_rejoin(p_ticket uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.queue_tickets%rowtype;
  v_keys double precision[];
  v_key double precision;
begin
  select * into v_row from public.queue_tickets where id = p_ticket;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_row.event_id is distinct from public.queue_event() then
    return jsonb_build_object('ok', false, 'reason', 'disabled');
  end if;
  if v_row.status <> 'skipped' then
    return jsonb_build_object('ok', true, 'number', v_row.number);
  end if;

  perform pg_advisory_xact_lock(hashtext('queue:' || v_row.event_id::text));

  select coalesce(array_agg(sort_key order by sort_key), '{}') into v_keys
    from (
      select sort_key from public.queue_tickets
       where event_id = v_row.event_id and status in ('waiting', 'serving')
       order by sort_key
       limit 3
    ) line;

  v_key := case
    when cardinality(v_keys) >= 3 then (v_keys[2] + v_keys[3]) / 2
    when cardinality(v_keys) >= 1 then v_keys[cardinality(v_keys)] + 1
    else (select coalesce(max(sort_key), 0) + 1 from public.queue_tickets where event_id = v_row.event_id)
  end;

  update public.queue_tickets
     set status = 'waiting', sort_key = v_key, skipped_at = null
   where id = v_row.id;

  return jsonb_build_object('ok', true, 'number', v_row.number);
end;
$$;

-- Booth: whose turn is it? Polled by the start screen.
create or replace function public.queue_booth_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_event uuid := public.queue_event();
  v_head public.queue_tickets%rowtype;
  v_waiting integer;
begin
  if v_event is null then
    return jsonb_build_object('enabled', false);
  end if;
  v_head := public.queue_head(v_event);
  select count(*) into v_waiting from public.queue_tickets
   where event_id = v_event and status in ('waiting', 'serving');
  return jsonb_build_object(
    'enabled', true,
    'waiting', v_waiting,
    'head', case when v_head.id is null then null
                 else jsonb_build_object('id', v_head.id, 'number', v_head.number, 'status', v_head.status) end
  );
end;
$$;

-- Booth: a numbered guest's session started. Marks the head as "serving" so
-- the next guest's phone says "you're next"; it does NOT advance the queue.
create or replace function public.queue_start(p_ticket uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event uuid := public.queue_event();
begin
  if v_event is null or (public.queue_head(v_event)).id is distinct from p_ticket then
    return jsonb_build_object('ok', false);
  end if;
  update public.queue_tickets set status = 'serving', started_at = now() where id = p_ticket;
  return jsonb_build_object('ok', true);
end;
$$;

-- Booth: the numbered guest's whole run finished. The only thing that
-- advances the queue (besides skipping).
create or replace function public.queue_complete(p_ticket uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.queue_tickets
     set status = 'done', done_at = now(), started_at = coalesce(started_at, now())
   where id = p_ticket and status in ('waiting', 'serving');
  return jsonb_build_object('ok', found);
end;
$$;

-- Booth: the head guest did not show up.
create or replace function public.queue_skip(p_ticket uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event uuid := public.queue_event();
begin
  if v_event is null or (public.queue_head(v_event)).id is distinct from p_ticket then
    return jsonb_build_object('ok', false);
  end if;
  update public.queue_tickets set status = 'skipped', skipped_at = now() where id = p_ticket;
  return jsonb_build_object('ok', true);
end;
$$;

-- Gallery page: has this session been printed yet? Only the print status is
-- exposed; the sessions table itself stays admin-only.
create or replace function public.session_print_status(p_token text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select print_status from public.sessions where token = p_token;
$$;

revoke all on function public.queue_take(text) from public;
revoke all on function public.queue_status(uuid) from public;
revoke all on function public.queue_rejoin(uuid) from public;
revoke all on function public.queue_booth_state() from public;
revoke all on function public.queue_start(uuid) from public;
revoke all on function public.queue_complete(uuid) from public;
revoke all on function public.queue_skip(uuid) from public;
revoke all on function public.session_print_status(text) from public;

grant execute on function public.queue_take(text) to anon, authenticated;
grant execute on function public.queue_status(uuid) to anon, authenticated;
grant execute on function public.queue_rejoin(uuid) to anon, authenticated;
grant execute on function public.queue_booth_state() to anon, authenticated;
grant execute on function public.queue_start(uuid) to anon, authenticated;
grant execute on function public.queue_complete(uuid) to anon, authenticated;
grant execute on function public.queue_skip(uuid) to anon, authenticated;
grant execute on function public.session_print_status(text) to anon, authenticated;

notify pgrst, 'reload schema';
