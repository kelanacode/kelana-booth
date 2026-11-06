-- A skipped guest may rejoin the line only once. Skipped a second time, they
-- take a new number at the back (queue_take treats a skipped ticket as no
-- longer active, so the same phone gets a fresh number).

alter table public.queue_tickets
  add column if not exists rejoin_count integer not null default 0;

comment on column public.queue_tickets.rejoin_count is
  'How many times this skipped guest rejoined the line (max 1).';

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
  if v_row.rejoin_count >= 1 then
    -- Already rejoined once and skipped again: take a new number at the back.
    return jsonb_build_object('ok', false, 'reason', 'rejoin_limit');
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
     set status = 'waiting', sort_key = v_key, skipped_at = null, rejoin_count = rejoin_count + 1
   where id = v_row.id;

  return jsonb_build_object('ok', true, 'number', v_row.number);
end;
$$;

-- queue_status: also say whether a skipped guest may still rejoin.
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
    'frame_id', v_row.frame_id,
    'can_rejoin', v_row.status = 'skipped' and v_row.rejoin_count < 1
  );
end;
$$;

notify pgrst, 'reload schema';
