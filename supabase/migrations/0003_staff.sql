-- Staff (kitchen + attendant) access. No auth users: each role has a PIN per restaurant, checked inside
-- SECURITY DEFINER functions. PINs are stored hashed; set them with staff_set_pin (see README).

create table if not exists staff_pins (
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  role text not null check (role in ('kitchen', 'attendant')),
  pin_hash text not null,
  primary key (restaurant_id, role)
);
create table if not exists staff_attempts (
  id bigint generated always as identity primary key,
  restaurant_id uuid not null,
  role text not null,
  at timestamptz not null default now()
);
alter table staff_pins enable row level security;
alter table staff_attempts enable row level security;
-- No policies: only the functions below (owner) can touch these tables.

-- Returns {"rest": <uuid>} or {"error": "..."}; wrong PINs are returned, not raised, so the attempt row is committed.
create or replace function staff_check(p_slug text, p_pin text, p_role text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_rest uuid; v_hash text;
begin
  select id into v_rest from restaurants where slug = p_slug;
  if v_rest is null then return jsonb_build_object('error', 'Unknown restaurant.'); end if;
  if (select count(*) from staff_attempts where restaurant_id = v_rest and role = p_role and at > now() - interval '5 minutes') >= 8 then
    return jsonb_build_object('error', 'Too many wrong PINs. Try again in a few minutes.');
  end if;
  select pin_hash into v_hash from staff_pins where restaurant_id = v_rest and role = p_role;
  if v_hash is null or crypt(coalesce(p_pin, ''), v_hash) <> v_hash then
    insert into staff_attempts (restaurant_id, role) values (v_rest, p_role);
    return jsonb_build_object('error', 'Wrong PIN.');
  end if;
  delete from staff_attempts where restaurant_id = v_rest and role = p_role;
  return jsonb_build_object('rest', v_rest);
end $$;

-- Live board: active orders (+ served in the last 45 min for the attendant), and every table.
create or replace function staff_board(p_slug text, p_pin text, p_role text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_rest uuid; v_chk jsonb;
begin
  v_chk := staff_check(p_slug, p_pin, p_role);
  if v_chk ? 'error' then return v_chk; end if;
  v_rest := (v_chk->>'rest')::uuid;
  return jsonb_build_object(
    'now', now(),
    'tables', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'label', t.label) order by t.label), '[]'::jsonb)
                 from dining_tables t where t.restaurant_id = v_rest),
    'orders', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id, 'number', o.order_number, 'status', o.status, 'table', t.label, 'customer', o.customer_name,
        'guests', o.guest_count, 'notes', o.notes, 'totalPaise', o.total_paise, 'createdAt', o.created_at, 'updatedAt', o.updated_at,
        'items', (select coalesce(jsonb_agg(jsonb_build_object('name', i.name, 'qty', i.qty, 'notes', i.notes, 'modifiers', i.modifiers) order by i.name), '[]'::jsonb)
                    from order_items i where i.order_id = o.id)
      ) order by o.created_at), '[]'::jsonb)
      from orders o join dining_tables t on t.id = o.table_id
      where o.restaurant_id = v_rest
        and (o.status in ('placed', 'preparing', 'ready')
             or (p_role = 'attendant' and o.status in ('served', 'cancelled') and o.updated_at > now() - interval '45 minutes'))));
end $$;

create or replace function staff_set_status(p_slug text, p_pin text, p_role text, p_order_id uuid, p_status order_status) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_rest uuid; v_chk jsonb; v_cur order_status; v_ok boolean;
begin
  v_chk := staff_check(p_slug, p_pin, p_role);
  if v_chk ? 'error' then return v_chk; end if;
  v_rest := (v_chk->>'rest')::uuid;
  select status into v_cur from orders where id = p_order_id and restaurant_id = v_rest for update;
  if v_cur is null then raise exception 'Order not found.'; end if;
  v_ok := case p_role
    when 'kitchen' then (v_cur, p_status) in (('placed','preparing'), ('preparing','ready'), ('ready','preparing'), ('preparing','placed'))
    else (v_cur, p_status) in (('ready','served'), ('placed','cancelled'), ('preparing','cancelled'), ('ready','cancelled'), ('served','ready'), ('cancelled','placed'))
  end;
  if not v_ok then raise exception 'Cannot move an order from % to %.', v_cur, p_status; end if;
  update orders set status = p_status, updated_at = now() where id = p_order_id;
  return jsonb_build_object('ok', true);
end $$;

-- Kitchen (and attendant) can mark dishes sold out / back in stock.
create or replace function staff_menu(p_slug text, p_pin text, p_role text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_rest uuid; v_chk jsonb;
begin
  v_chk := staff_check(p_slug, p_pin, p_role);
  if v_chk ? 'error' then return v_chk; end if;
  v_rest := (v_chk->>'rest')::uuid;
  return jsonb_build_object('items', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'category', c.name, 'available', m.is_available)
                                    order by c.sort_order, m.sort_order, m.name), '[]'::jsonb)
            from menu_items m join categories c on c.id = m.category_id where m.restaurant_id = v_rest));
end $$;

create or replace function staff_set_available(p_slug text, p_pin text, p_role text, p_item_id uuid, p_available boolean) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_rest uuid; v_chk jsonb;
begin
  v_chk := staff_check(p_slug, p_pin, p_role);
  if v_chk ? 'error' then return v_chk; end if;
  v_rest := (v_chk->>'rest')::uuid;
  update menu_items set is_available = p_available where id = p_item_id and restaurant_id = v_rest;
  return jsonb_build_object('ok', true);
end $$;

-- Change a PIN (owner runs this from the SQL editor; not exposed to the web).
create or replace function staff_set_pin(p_slug text, p_role text, p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_pin !~ '^[0-9]{4,8}$' then raise exception 'PIN must be 4-8 digits.'; end if;
  insert into staff_pins (restaurant_id, role, pin_hash)
  select id, p_role, crypt(p_pin, gen_salt('bf')) from restaurants where slug = p_slug
  on conflict (restaurant_id, role) do update set pin_hash = excluded.pin_hash;
end $$;

revoke all on function staff_check(text, text, text) from public, anon, authenticated;
revoke all on function staff_set_pin(text, text, text) from public, anon, authenticated;
revoke all on function staff_board(text, text, text) from public;
revoke all on function staff_set_status(text, text, text, uuid, order_status) from public;
revoke all on function staff_menu(text, text, text) from public;
revoke all on function staff_set_available(text, text, text, uuid, boolean) from public;
grant execute on function staff_board(text, text, text) to anon, authenticated;
grant execute on function staff_set_status(text, text, text, uuid, order_status) to anon, authenticated;
grant execute on function staff_menu(text, text, text) to anon, authenticated;
grant execute on function staff_set_available(text, text, text, uuid, boolean) to anon, authenticated;
