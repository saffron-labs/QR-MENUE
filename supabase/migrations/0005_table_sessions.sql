-- Shared tables: one open session per table, guests join with a short code, each guest orders for themselves,
-- the bill is made from everything served, and the attendant closes the table after payment.

create sequence if not exists bill_seq;

create table if not exists table_sessions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  table_id uuid not null references dining_tables(id) on delete cascade,
  code text not null,
  party_size integer not null check (party_size between 1 and 30),
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_at timestamptz not null default now(),
  bill_requested_at timestamptz,
  bill_number integer,
  closed_at timestamptz,
  close_reason text
);
create unique index if not exists table_sessions_one_open on table_sessions (table_id) where status = 'open';
create index if not exists table_sessions_rest_open on table_sessions (restaurant_id) where status = 'open';

create table if not exists session_guests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references table_sessions(id) on delete cascade,
  name text not null,
  secret uuid not null default gen_random_uuid(),
  joined_at timestamptz not null default now()
);
create index if not exists session_guests_session on session_guests (session_id);

create table if not exists join_attempts (
  id bigserial primary key,
  table_id uuid not null,
  at timestamptz not null default now()
);

alter table orders add column if not exists session_id uuid references table_sessions(id) on delete set null;
alter table orders add column if not exists guest_id uuid references session_guests(id) on delete set null;
create index if not exists orders_session on orders (session_id);

alter table table_sessions enable row level security;
alter table session_guests enable row level security;
alter table join_attempts enable row level security;

-- Closes sessions nobody closed: bill made and 45 minutes quiet, or 3 hours with no activity.
create or replace function sweep_sessions(p_rest uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  update table_sessions s set status = 'closed', closed_at = now(), close_reason = 'auto'
   where s.restaurant_id = p_rest and s.status = 'open'
     and (
       (s.bill_number is not null
         and coalesce((select max(o.updated_at) from orders o where o.session_id = s.id), s.opened_at) < now() - interval '45 minutes'
         and not exists (select 1 from orders o where o.session_id = s.id and o.status in ('placed', 'preparing', 'ready')))
       or coalesce((select max(o.updated_at) from orders o where o.session_id = s.id), s.opened_at) < now() - interval '3 hours'
     );
end $$;

create or replace function session_guest(p_session uuid, p_guest uuid, p_secret uuid) returns table_sessions
language plpgsql security definer set search_path = public, extensions as $$
declare s table_sessions%rowtype;
begin
  select ts.* into s from table_sessions ts
    join session_guests g on g.session_id = ts.id
   where ts.id = p_session and g.id = p_guest and g.secret = p_secret;
  if not found then raise exception 'We could not find your table. Please scan the QR code again.'; end if;
  return s;
end $$;

create or replace function table_state(p_slug text, p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare t dining_tables%rowtype; s table_sessions%rowtype;
begin
  select dt.* into t from dining_tables dt join restaurants r on r.id = dt.restaurant_id
   where r.slug = p_slug and dt.token = p_token and dt.is_active;
  if not found then return null; end if;
  perform sweep_sessions(t.restaurant_id);
  select * into s from table_sessions where table_id = t.id and status = 'open';
  return jsonb_build_object('label', t.label, 'inUse', found,
    'guests', case when s.id is null then 0 else (select count(*) from session_guests where session_id = s.id) end);
end $$;

create or replace function start_session(p_slug text, p_token text, p_party integer, p_name text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare t dining_tables%rowtype; v_sid uuid; v_gid uuid; v_secret uuid; v_code text; v_name text;
  chars constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; i integer;
begin
  select dt.* into t from dining_tables dt join restaurants r on r.id = dt.restaurant_id
   where r.slug = p_slug and dt.token = p_token and dt.is_active;
  if not found then return jsonb_build_object('error', 'This QR code is no longer valid. Please ask staff for help.'); end if;
  perform sweep_sessions(t.restaurant_id);
  if exists (select 1 from table_sessions where table_id = t.id and status = 'open') then
    return jsonb_build_object('error', 'in_use');
  end if;
  v_name := nullif(left(btrim(coalesce(p_name, '')), 40), '');
  if v_name is null then v_name := 'Guest 1'; end if;
  loop
    v_code := '';
    for i in 1..4 loop v_code := v_code || substr(chars, 1 + floor(random() * length(chars))::int, 1); end loop;
    exit when not exists (select 1 from table_sessions where restaurant_id = t.restaurant_id and status = 'open' and code = v_code);
  end loop;
  insert into table_sessions (restaurant_id, table_id, code, party_size)
  values (t.restaurant_id, t.id, v_code, greatest(1, least(coalesce(p_party, 1), 30))) returning id into v_sid;
  insert into session_guests (session_id, name) values (v_sid, v_name) returning id, secret into v_gid, v_secret;
  return jsonb_build_object('sessionId', v_sid, 'guestId', v_gid, 'secret', v_secret, 'code', v_code);
exception when unique_violation then
  return jsonb_build_object('error', 'in_use');
end $$;

create or replace function join_session(p_slug text, p_token text, p_code text, p_name text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare t dining_tables%rowtype; s table_sessions%rowtype; v_gid uuid; v_secret uuid; v_name text; v_n integer;
begin
  select dt.* into t from dining_tables dt join restaurants r on r.id = dt.restaurant_id
   where r.slug = p_slug and dt.token = p_token and dt.is_active;
  if not found then return jsonb_build_object('error', 'This QR code is no longer valid. Please ask staff for help.'); end if;
  perform sweep_sessions(t.restaurant_id);
  if (select count(*) from join_attempts where table_id = t.id and at > now() - interval '5 minutes') >= 8 then
    return jsonb_build_object('error', 'Too many tries. Please wait a few minutes or ask the attendant.');
  end if;
  select * into s from table_sessions where table_id = t.id and status = 'open';
  if not found then return jsonb_build_object('error', 'no_session'); end if;
  if upper(btrim(coalesce(p_code, ''))) <> s.code then
    insert into join_attempts (table_id) values (t.id);
    return jsonb_build_object('error', 'That code does not match. Check it with the person who opened the table.');
  end if;
  select count(*) into v_n from session_guests where session_id = s.id;
  if v_n >= 30 then return jsonb_build_object('error', 'This table is full.'); end if;
  v_name := nullif(left(btrim(coalesce(p_name, '')), 40), '');
  if v_name is null then v_name := 'Guest ' || (v_n + 1); end if;
  insert into session_guests (session_id, name) values (s.id, v_name) returning id, secret into v_gid, v_secret;
  return jsonb_build_object('sessionId', s.id, 'guestId', v_gid, 'secret', v_secret, 'code', s.code);
end $$;

create or replace function get_session(p_slug text, p_token text, p_session uuid, p_guest uuid, p_secret uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s table_sessions%rowtype; v_rest restaurants%rowtype; v_label text; v_ready boolean; v_me text;
begin
  select * into s from table_sessions where id = p_session;
  if not found or not exists (select 1 from session_guests where id = p_guest and session_id = p_session and secret = p_secret) then
    return jsonb_build_object('error', 'not_found');
  end if;
  if s.status = 'closed' then return jsonb_build_object('closed', true); end if;
  select * into v_rest from restaurants where id = s.restaurant_id;
  select label into v_label from dining_tables where id = s.table_id;
  select name into v_me from session_guests where id = p_guest;
  v_ready := exists (select 1 from orders where session_id = s.id and status <> 'cancelled')
         and not exists (select 1 from orders where session_id = s.id and status in ('placed', 'preparing', 'ready'));
  if v_ready and s.bill_number is null then
    update table_sessions set bill_number = nextval('bill_seq') where id = s.id returning * into s;
  end if;
  return jsonb_build_object(
    'tableLabel', v_label, 'code', s.code, 'partySize', s.party_size, 'openedAt', s.opened_at,
    'billRequested', s.bill_requested_at is not null, 'billReady', v_ready, 'billNumber', s.bill_number,
    'me', jsonb_build_object('id', p_guest, 'name', v_me),
    'restaurant', jsonb_build_object('name', v_rest.name, 'address', v_rest.address, 'gstRateBp', v_rest.gst_rate_bp),
    'guests', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name) order by g.joined_at), '[]'::jsonb) from session_guests g where g.session_id = s.id),
    'orders', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id, 'number', o.order_number, 'status', o.status, 'guestId', o.guest_id, 'createdAt', o.created_at,
        'subtotalPaise', o.subtotal_paise, 'taxPaise', o.tax_paise, 'totalPaise', o.total_paise,
        'items', (select coalesce(jsonb_agg(jsonb_build_object('name', i.name, 'qty', i.qty, 'unitPaise', i.unit_price_paise) order by i.name), '[]'::jsonb)
                    from order_items i where i.order_id = o.id)
      ) order by o.created_at), '[]'::jsonb) from orders o where o.session_id = s.id));
end $$;

-- The old per-table throttle in place_order would block guests ordering at the same moment: session orders are exempt
-- (place_order_session throttles per guest instead).
do $$
declare d text;
begin
  d := pg_get_functiondef('place_order(text, text, text, integer, text, jsonb)'::regprocedure);
  d := replace(d, 'where table_id = v_table.id and created_at', 'where table_id = v_table.id and session_id is null and created_at');
  execute d;
end $$;

-- The only way to order: through a session and a guest.
create or replace function place_order_session(p_slug text, p_token text, p_session uuid, p_guest uuid, p_secret uuid, p_notes text, p_lines jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s table_sessions%rowtype; v_name text; v_res jsonb;
begin
  s := session_guest(p_session, p_guest, p_secret);
  if s.status <> 'open' then raise exception 'This table has been closed. Please scan the QR code to start a new one.'; end if;
  if (select dt.token from dining_tables dt where dt.id = s.table_id) <> p_token then raise exception 'This is a different table. Please scan your table QR code.'; end if;
  if exists (select 1 from orders where guest_id = p_guest and created_at > now() - interval '4 seconds') then
    raise exception 'Please wait a moment before ordering again.';
  end if;
  select name into v_name from session_guests where id = p_guest;
  v_res := place_order(p_slug, p_token, v_name, s.party_size, p_notes, p_lines);
  update orders set session_id = s.id, guest_id = p_guest where id = (v_res->>'orderId')::uuid;
  return v_res;
end $$;

create or replace function request_bill(p_session uuid, p_guest uuid, p_secret uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s table_sessions%rowtype;
begin
  s := session_guest(p_session, p_guest, p_secret);
  update table_sessions set bill_requested_at = coalesce(bill_requested_at, now()) where id = s.id;
  return jsonb_build_object('ok', true);
end $$;

-- Attendant: open tables with who is sitting, bill state and per-guest totals.
create or replace function staff_sessions(p_slug text, p_pin text, p_role text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_chk jsonb; v_rest uuid;
begin
  v_chk := staff_check(p_slug, p_pin, p_role);
  if v_chk ? 'error' then return v_chk; end if;
  v_rest := (v_chk->>'rest')::uuid;
  perform sweep_sessions(v_rest);
  return jsonb_build_object('sessions', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'table', t.label, 'code', s.code, 'partySize', s.party_size, 'openedAt', s.opened_at,
      'billRequested', s.bill_requested_at is not null,
      'billReady', exists (select 1 from orders o where o.session_id = s.id and o.status <> 'cancelled')
                   and not exists (select 1 from orders o where o.session_id = s.id and o.status in ('placed', 'preparing', 'ready')),
      'totalPaise', coalesce((select sum(o.total_paise) from orders o where o.session_id = s.id and o.status <> 'cancelled'), 0),
      'guests', (select coalesce(jsonb_agg(jsonb_build_object('name', g.name,
                  'totalPaise', coalesce((select sum(o.total_paise) from orders o where o.guest_id = g.id and o.status <> 'cancelled'), 0)) order by g.joined_at), '[]'::jsonb)
                   from session_guests g where g.session_id = s.id)
    ) order by s.opened_at), '[]'::jsonb)
    from table_sessions s join dining_tables t on t.id = s.table_id
    where s.restaurant_id = v_rest and s.status = 'open'));
end $$;

create or replace function staff_close_session(p_slug text, p_pin text, p_role text, p_session uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_chk jsonb; v_rest uuid;
begin
  v_chk := staff_check(p_slug, p_pin, p_role);
  if v_chk ? 'error' then return v_chk; end if;
  if p_role <> 'attendant' then return jsonb_build_object('error', 'Only the attendant can close a table.'); end if;
  v_rest := (v_chk->>'rest')::uuid;
  update table_sessions set status = 'closed', closed_at = now(),
         close_reason = case when p_reason = 'left_unpaid' then 'left_unpaid' else 'paid' end
   where id = p_session and restaurant_id = v_rest and status = 'open';
  return jsonb_build_object('ok', true);
end $$;

revoke all on function sweep_sessions(uuid) from public, anon, authenticated;
revoke all on function session_guest(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function place_order(text, text, text, integer, text, jsonb) from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array[
    'table_state(text, text)', 'start_session(text, text, integer, text)', 'join_session(text, text, text, text)',
    'get_session(text, text, uuid, uuid, uuid)', 'place_order_session(text, text, uuid, uuid, uuid, text, jsonb)',
    'request_bill(uuid, uuid, uuid)', 'staff_sessions(text, text, text)', 'staff_close_session(text, text, text, uuid, text)']
  loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;
