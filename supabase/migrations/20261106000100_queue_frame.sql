-- Guests can pick their frame on the queue page while they wait. The booth
-- then skips frame selection for that ticket and goes straight to shooting.

alter table public.queue_tickets
  add column if not exists frame_id text references public.frame_templates (id) on delete set null;

comment on column public.queue_tickets.frame_id is
  'Frame the guest picked on their phone while waiting (null = pick at the booth).';

-- Guest: pick (or clear) a frame while still in line.
create or replace function public.queue_set_frame(p_ticket uuid, p_frame text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_frame text := nullif(p_frame, '');
begin
  if v_frame is not null and not exists (
    select 1 from public.frame_templates where id = v_frame and enabled
  ) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_frame');
  end if;
  update public.queue_tickets set frame_id = v_frame
   where id = p_ticket and status in ('waiting', 'skipped');
  return jsonb_build_object('ok', found, 'frame_id', v_frame);
end;
$$;

revoke all on function public.queue_set_frame(uuid, text) from public;
grant execute on function public.queue_set_frame(uuid, text) to anon, authenticated;

-- queue_status: also return the picked frame.
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
    'avg_seconds', v_avg,
    'frame_id', v_row.frame_id
  );
end;
$$;

-- queue_booth_state: the head's picked frame, so the booth can skip selection.
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
                 else jsonb_build_object('id', v_head.id, 'number', v_head.number,
                                         'status', v_head.status, 'frame_id', v_head.frame_id) end
  );
end;
$$;

notify pgrst, 'reload schema';
