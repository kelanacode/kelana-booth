-- Guest queue over WhatsApp (official Cloud API).
--
-- Guests scan a QR that opens WhatsApp with "ANTRI" typed for them; the
-- gallery Worker receives it (webhook), hands out a number and later sends
-- "almost there" / "you're next" / "your turn" / "skipped" messages. All of
-- them go out inside the 24h customer-service window the guest opened, so
-- they are free-form and free.
--
-- WhatsApp guests are ordinary queue tickets whose device_id is
-- 'wa:<phone>'. Everything here runs only through security definer functions
-- that require the shared secret kept in queue_settings (the Worker holds the
-- same value), so anon cannot read phone numbers or trigger messages.
--
-- When the queue moves (booth start / complete / skip, a guest rejoining) a
-- statement trigger pings the Worker through pg_net, which then claims and
-- sends whatever messages are due. A one-minute Worker cron does the same as
-- a safety net.

create extension if not exists pg_net with schema extensions;

-- Private settings: the Worker's tick URL and shared secret. No policies, so
-- not readable through the API at all.
create table if not exists public.queue_settings (
  key text primary key,
  value text not null default ''
);

alter table public.queue_settings enable row level security;

insert into public.queue_settings (key, value)
values ('wa_secret', encode(extensions.gen_random_bytes(24), 'hex')),
       ('wa_tick_url', 'https://gallery.ruangkelana.com/api/wa/tick')
on conflict (key) do nothing;

-- "Almost there" goes out when this many guests (or fewer) are ahead.
alter table public.events
  add column if not exists queue_notify_ahead integer not null default 3
  check (queue_notify_ahead between 1 and 20);

comment on column public.events.queue_notify_ahead is
  'WhatsApp queue: send the "almost your turn" message when this many guests or fewer are ahead.';

alter table public.queue_tickets
  add column if not exists notified_soon_at timestamptz,
  add column if not exists notified_next_at timestamptz,
  add column if not exists notified_now_at timestamptz,
  add column if not exists notified_skip_at timestamptz;

-- A guest who rejoins after a skip gets the turn messages again.
create or replace function public.queue_reset_notified()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'skipped' and new.status = 'waiting' then
    new.notified_soon_at := null;
    new.notified_next_at := null;
    new.notified_now_at := null;
    new.notified_skip_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists queue_tickets_reset_notified on public.queue_tickets;
create trigger queue_tickets_reset_notified
  before update on public.queue_tickets
  for each row
  execute function public.queue_reset_notified();

create or replace function public.queue_wa_authorized(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p_secret, '') <> ''
     and exists (select 1 from public.queue_settings where key = 'wa_secret' and value = p_secret);
$$;

revoke all on function public.queue_wa_authorized(text) from public;

-- Latest ticket of a WhatsApp guest in the running queue event.
create or replace function public.queue_wa_latest(p_wa text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.queue_tickets
   where event_id = public.queue_event() and device_id = 'wa:' || p_wa
   order by created_at desc
   limit 1;
$$;

revoke all on function public.queue_wa_latest(text) from public;

-- Worker: guest sent ANTRI. Same number back if they already hold one.
create or replace function public.queue_wa_take(p_secret text, p_wa text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_take jsonb;
  v_status jsonb;
  v_ticket uuid;
  v_limit integer;
  v_existing uuid;
begin
  if not public.queue_wa_authorized(p_secret) then
    return jsonb_build_object('ok', false, 'reason', 'unauthorized');
  end if;
  v_existing := public.queue_wa_latest(p_wa);
  v_take := public.queue_take('wa:' || p_wa);
  if not coalesce((v_take ->> 'ok')::boolean, false) then
    return v_take;
  end if;
  v_ticket := (v_take ->> 'ticket_id')::uuid;
  v_status := public.queue_status(v_ticket);

  -- Already close when they joined: the reply says so, no separate
  -- "almost there" message.
  select queue_notify_ahead into v_limit from public.events where id = public.queue_event();
  if (v_status ->> 'ahead')::integer <= coalesce(v_limit, 3) then
    update public.queue_tickets set notified_soon_at = coalesce(notified_soon_at, now()) where id = v_ticket;
  end if;

  return v_status || jsonb_build_object(
    'ticket_id', v_ticket,
    'existing', v_existing is not null and v_existing = v_ticket
  );
end;
$$;

-- Worker: guest sent CEK.
create or replace function public.queue_wa_status(p_secret text, p_wa text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket uuid;
begin
  if not public.queue_wa_authorized(p_secret) then
    return jsonb_build_object('ok', false, 'reason', 'unauthorized');
  end if;
  if public.queue_event() is null then
    return jsonb_build_object('ok', false, 'reason', 'disabled');
  end if;
  v_ticket := public.queue_wa_latest(p_wa);
  if v_ticket is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  return public.queue_status(v_ticket) || jsonb_build_object('ticket_id', v_ticket);
end;
$$;

-- Worker: guest sent ULANG after being skipped.
create or replace function public.queue_wa_rejoin(p_secret text, p_wa text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket uuid;
  v_res jsonb;
begin
  if not public.queue_wa_authorized(p_secret) then
    return jsonb_build_object('ok', false, 'reason', 'unauthorized');
  end if;
  v_ticket := public.queue_wa_latest(p_wa);
  if v_ticket is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  v_res := public.queue_rejoin(v_ticket);
  if not coalesce((v_res ->> 'ok')::boolean, false) then
    return v_res;
  end if;
  return public.queue_status(v_ticket) || jsonb_build_object('ticket_id', v_ticket);
end;
$$;

-- Worker: which WhatsApp messages are due right now? Each one is claimed
-- (stamped) in the same statement, so it is sent at most once even if two
-- ticks overlap.
create or replace function public.queue_wa_claim(p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event uuid := public.queue_event();
  v_limit integer;
  v_head_status text;
  v_out jsonb := '[]'::jsonb;
begin
  if not public.queue_wa_authorized(p_secret) or v_event is null then
    return v_out;
  end if;
  select queue_notify_ahead into v_limit from public.events where id = v_event;
  v_head_status := (public.queue_head(v_event)).status;

  perform pg_advisory_xact_lock(hashtext('queue-wa:' || v_event::text));
  -- Our own stamping UPDATE must not ping the Worker again (that would loop).
  perform set_config('queue.wa_claiming', '1', true);

  with line as (
    select t.id, (row_number() over (order by t.sort_key) - 1)::integer as ahead
      from public.queue_tickets t
     where t.event_id = v_event and t.status in ('waiting', 'serving')
  ),
  due as (
    select t.id, t.number, substr(t.device_id, 4) as wa, l.ahead, t.rejoin_count,
           case
             when t.status = 'skipped' and t.notified_skip_at is null then 'skip'
             when t.status = 'waiting' and l.ahead = 0 and t.notified_now_at is null then 'now'
             when t.status = 'waiting' and l.ahead = 1 and v_head_status = 'serving'
                  and t.notified_next_at is null then 'next'
             when t.status = 'waiting' and l.ahead between 2 and coalesce(v_limit, 3)
                  and t.notified_soon_at is null then 'soon'
           end as kind
      from public.queue_tickets t
      left join line l on l.id = t.id
     where t.event_id = v_event and t.device_id like 'wa:%'
  ),
  marked as (
    update public.queue_tickets q
       set notified_skip_at = case when d.kind = 'skip' then now() else q.notified_skip_at end,
           -- "your turn" also covers "next"/"soon" if they were never sent.
           notified_now_at = case when d.kind = 'now' then now() else q.notified_now_at end,
           notified_next_at = case when d.kind in ('now', 'next') then coalesce(q.notified_next_at, now()) else q.notified_next_at end,
           notified_soon_at = case when d.kind in ('now', 'next', 'soon') then coalesce(q.notified_soon_at, now()) else q.notified_soon_at end
      from due d
     where q.id = d.id and d.kind is not null
    returning d.id, d.number, d.wa, d.ahead, d.kind, d.rejoin_count
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'ticket_id', id, 'number', number, 'wa', wa, 'ahead', ahead, 'kind', kind,
           'can_rejoin', rejoin_count < 1)), '[]'::jsonb)
    into v_out
    from marked;

  return v_out;
end;
$$;

-- Ping the Worker whenever the line changes. Statement-level, so one booth
-- action is one request; pg_net sends it after the transaction commits.
create or replace function public.queue_wa_ping()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  if current_setting('queue.wa_claiming', true) = '1' then
    return null;
  end if;
  select value into v_url from public.queue_settings where key = 'wa_tick_url';
  select value into v_secret from public.queue_settings where key = 'wa_secret';
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    return null;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('content-type', 'application/json', 'x-queue-secret', v_secret),
    body := '{}'::jsonb
  );
  return null;
exception when others then
  -- Never let a notification problem block the booth.
  return null;
end;
$$;

drop trigger if exists queue_tickets_wa_ping on public.queue_tickets;
create trigger queue_tickets_wa_ping
  after update on public.queue_tickets
  for each statement
  execute function public.queue_wa_ping();

revoke all on function public.queue_wa_take(text, text) from public;
revoke all on function public.queue_wa_status(text, text) from public;
revoke all on function public.queue_wa_rejoin(text, text) from public;
revoke all on function public.queue_wa_claim(text) from public;
revoke all on function public.queue_wa_ping() from public;

grant execute on function public.queue_wa_take(text, text) to anon, authenticated;
grant execute on function public.queue_wa_status(text, text) to anon, authenticated;
grant execute on function public.queue_wa_rejoin(text, text) to anon, authenticated;
grant execute on function public.queue_wa_claim(text) to anon, authenticated;

notify pgrst, 'reload schema';
