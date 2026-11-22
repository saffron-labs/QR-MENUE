-- Admin dashboard: a third PIN role ('admin') and the owner-only functions behind /r/<slug>/admin.

alter table staff_pins drop constraint if exists staff_pins_role_check;
alter table staff_pins add constraint staff_pins_role_check check (role in ('kitchen', 'attendant', 'admin'));

-- Helper: returns the restaurant id for a valid admin PIN, or an {"error"} object.
create or replace function admin_check(p_slug text, p_pin text) returns jsonb
language sql security definer set search_path = public, extensions as $$ select staff_check(p_slug, p_pin, 'admin') $$;

-- Sales overview for the last p_days days (Asia/Kolkata calendar days; 1 = today). Cancelled orders are excluded from revenue.
create or replace function admin_overview(p_slug text, p_pin text, p_days integer default 1) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_chk jsonb; v_rest uuid; v_from timestamptz; v_days integer := greatest(1, least(coalesce(p_days, 1), 90));
begin
  v_chk := admin_check(p_slug, p_pin);
  if v_chk ? 'error' then return v_chk; end if;
  v_rest := (v_chk->>'rest')::uuid;
  v_from := (date_trunc('day', now() at time zone 'Asia/Kolkata') - make_interval(days => v_days - 1)) at time zone 'Asia/Kolkata';
  return jsonb_build_object(
    'from', v_from,
    'totals', (select jsonb_build_object(
        'orders', count(*) filter (where status <> 'cancelled'),
        'cancelled', count(*) filter (where status = 'cancelled'),
        'revenuePaise', coalesce(sum(total_paise) filter (where status <> 'cancelled'), 0),
        'subtotalPaise', coalesce(sum(subtotal_paise) filter (where status <> 'cancelled'), 0),
        'taxPaise', coalesce(sum(tax_paise) filter (where status <> 'cancelled'), 0),
        'avgPaise', coalesce(round(avg(total_paise) filter (where status <> 'cancelled')), 0),
        'open', count(*) filter (where status in ('placed', 'preparing', 'ready')))
      from orders where restaurant_id = v_rest and created_at >= v_from),
    'byDay', (select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'orders', coalesce(x.n, 0), 'revenuePaise', coalesce(x.rev, 0)) order by d.day), '[]'::jsonb)
      from (select g::date as day from generate_series((v_from at time zone 'Asia/Kolkata')::date, (now() at time zone 'Asia/Kolkata')::date, interval '1 day') g) d
      left join (select (created_at at time zone 'Asia/Kolkata')::date as day, count(*) n, sum(total_paise) rev
                   from orders where restaurant_id = v_rest and created_at >= v_from and status <> 'cancelled' group by 1) x on x.day = d.day),
    'byHour', (select coalesce(jsonb_agg(jsonb_build_object('hour', h.hr, 'orders', coalesce(x.n, 0)) order by h.hr), '[]'::jsonb)
      from generate_series(0, 23) h(hr)
      left join (select extract(hour from created_at at time zone 'Asia/Kolkata')::int as hr, count(*) n
                   from orders where restaurant_id = v_rest and created_at >= v_from and status <> 'cancelled' group by 1) x on x.hr = h.hr),
    'top', (select coalesce(jsonb_agg(t order by t.qty desc), '[]'::jsonb) from (
        select i.name, sum(i.qty)::int as qty, sum(i.qty * i.unit_price_paise)::int as "revenuePaise"
          from order_items i join orders o on o.id = i.order_id
         where o.restaurant_id = v_rest and o.created_at >= v_from and o.status <> 'cancelled'
         group by i.name order by sum(i.qty) desc limit 10) t),
    'byTable', (select coalesce(jsonb_agg(t order by t."revenuePaise" desc), '[]'::jsonb) from (
        select dt.label as "table", count(*)::int as orders, sum(o.total_paise)::int as "revenuePaise"
          from orders o join dining_tables dt on dt.id = o.table_id
         where o.restaurant_id = v_rest and o.created_at >= v_from and o.status <> 'cancelled'
         group by dt.label) t));
end $$;

create or replace function admin_orders(p_slug text, p_pin text, p_days integer default 1, p_status text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_chk jsonb; v_rest uuid; v_from timestamptz; v_days integer := greatest(1, least(coalesce(p_days, 1), 90));
begin
  v_chk := admin_check(p_slug, p_pin);
  if v_chk ? 'error' then return v_chk; end if;
  v_rest := (v_chk->>'rest')::uuid;
  v_from := (date_trunc('day', now() at time zone 'Asia/Kolkata') - make_interval(days => v_days - 1)) at time zone 'Asia/Kolkata';
  return jsonb_build_object('orders', (select coalesce(jsonb_agg(r order by r."createdAt" desc), '[]'::jsonb) from (
    select o.id, o.order_number as number, o.status, t.label as "table", o.customer_name as customer, o.guest_count as guests, o.notes,
           o.subtotal_paise as "subtotalPaise", o.tax_paise as "taxPaise", o.total_paise as "totalPaise", o.created_at as "createdAt",
           (select coalesce(jsonb_agg(jsonb_build_object('name', i.name, 'qty', i.qty, 'unitPaise', i.unit_price_paise, 'notes', i.notes, 'modifiers', i.modifiers) order by i.name), '[]'::jsonb)
              from order_items i where i.order_id = o.id) as items
      from orders o join dining_tables t on t.id = o.table_id
     where o.restaurant_id = v_rest and o.created_at >= v_from and (p_status is null or o.status::text = p_status)
     order by o.created_at desc limit 200) r));
end $$;

create or replace function admin_menu(p_slug text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_chk jsonb; v_rest uuid;
begin
  v_chk := admin_check(p_slug, p_pin);
  if v_chk ? 'error' then return v_chk; end if;
  v_rest := (v_chk->>'rest')::uuid;
  return jsonb_build_object(
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by sort_order), '[]'::jsonb) from categories where restaurant_id = v_rest),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'categoryId', m.category_id, 'name', m.name, 'description', m.description,
                'pricePaise', m.price_paise, 'available', m.is_available, 'imageUrl', m.image_url) order by c.sort_order, m.sort_order, m.name), '[]'::jsonb)
                from menu_items m join categories c on c.id = m.category_id where m.restaurant_id = v_rest));
end $$;

-- Create (no id) or update (id) a dish. Prices are integer paise.
create or replace function admin_save_item(p_slug text, p_pin text, p_item jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_chk jsonb; v_rest uuid; v_id uuid; v_cat uuid; v_price integer; v_name text;
begin
  v_chk := admin_check(p_slug, p_pin);
  if v_chk ? 'error' then return v_chk; end if;
  v_rest := (v_chk->>'rest')::uuid;
  v_name := btrim(coalesce(p_item->>'name', ''));
  v_price := (p_item->>'pricePaise')::integer;
  if v_name = '' or length(v_name) > 80 then return jsonb_build_object('error', 'Give the dish a name (up to 80 characters).'); end if;
  if v_price is null or v_price < 0 or v_price > 5000000 then return jsonb_build_object('error', 'Enter a valid price.'); end if;
  select id into v_cat from categories where id = (p_item->>'categoryId')::uuid and restaurant_id = v_rest;
  if v_cat is null then return jsonb_build_object('error', 'Pick a category.'); end if;
  if nullif(p_item->>'id', '') is not null then
    update menu_items set name = v_name, description = nullif(btrim(coalesce(p_item->>'description', '')), ''), price_paise = v_price,
           category_id = v_cat, is_available = coalesce((p_item->>'available')::boolean, is_available)
     where id = (p_item->>'id')::uuid and restaurant_id = v_rest returning id into v_id;
    if v_id is null then return jsonb_build_object('error', 'Dish not found.'); end if;
  else
    insert into menu_items (restaurant_id, category_id, name, description, price_paise, is_available, sort_order)
    values (v_rest, v_cat, v_name, nullif(btrim(coalesce(p_item->>'description', '')), ''), v_price, true,
            coalesce((select max(sort_order) + 1 from menu_items where category_id = v_cat), 0)) returning id into v_id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function admin_delete_item(p_slug text, p_pin text, p_item_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_chk jsonb; v_rest uuid;
begin
  v_chk := admin_check(p_slug, p_pin);
  if v_chk ? 'error' then return v_chk; end if;
  v_rest := (v_chk->>'rest')::uuid;
  delete from menu_items where id = p_item_id and restaurant_id = v_rest;
  return jsonb_build_object('ok', true);
end $$;

create or replace function admin_tables(p_slug text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_chk jsonb; v_rest uuid;
begin
  v_chk := admin_check(p_slug, p_pin);
  if v_chk ? 'error' then return v_chk; end if;
  v_rest := (v_chk->>'rest')::uuid;
  return jsonb_build_object('tables', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'label', label, 'token', token) order by label), '[]'::jsonb)
                                         from dining_tables where restaurant_id = v_rest and is_active));
end $$;

create or replace function admin_add_table(p_slug text, p_pin text, p_label text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_chk jsonb; v_rest uuid; v_label text := btrim(coalesce(p_label, ''));
begin
  v_chk := admin_check(p_slug, p_pin);
  if v_chk ? 'error' then return v_chk; end if;
  v_rest := (v_chk->>'rest')::uuid;
  if v_label = '' or length(v_label) > 12 then return jsonb_build_object('error', 'Table name must be 1-12 characters, like T-15.'); end if;
  if exists (select 1 from dining_tables where restaurant_id = v_rest and label = v_label) then return jsonb_build_object('error', 'That table already exists.'); end if;
  insert into dining_tables (restaurant_id, label) values (v_rest, v_label);
  return jsonb_build_object('ok', true);
end $$;

-- New secret for a table's QR; the old printed QR stops working.
create or replace function admin_rotate_token(p_slug text, p_pin text, p_table_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_chk jsonb; v_rest uuid;
begin
  v_chk := admin_check(p_slug, p_pin);
  if v_chk ? 'error' then return v_chk; end if;
  v_rest := (v_chk->>'rest')::uuid;
  update dining_tables set token = encode(gen_random_bytes(12), 'hex') where id = p_table_id and restaurant_id = v_rest;
  return jsonb_build_object('ok', true);
end $$;

create or replace function admin_set_pin(p_slug text, p_pin text, p_role text, p_new_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_chk jsonb; v_rest uuid;
begin
  v_chk := admin_check(p_slug, p_pin);
  if v_chk ? 'error' then return v_chk; end if;
  v_rest := (v_chk->>'rest')::uuid;
  if p_role not in ('kitchen', 'attendant', 'admin') then return jsonb_build_object('error', 'Unknown role.'); end if;
  if p_new_pin !~ '^[0-9]{4,8}$' then return jsonb_build_object('error', 'PIN must be 4 to 8 digits.'); end if;
  insert into staff_pins (restaurant_id, role, pin_hash) values (v_rest, p_role, crypt(p_new_pin, gen_salt('bf')))
  on conflict (restaurant_id, role) do update set pin_hash = excluded.pin_hash;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function admin_check(text, text) from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array[
    'admin_overview(text, text, integer)', 'admin_orders(text, text, integer, text)', 'admin_menu(text, text)',
    'admin_save_item(text, text, jsonb)', 'admin_delete_item(text, text, uuid)', 'admin_tables(text, text)',
    'admin_add_table(text, text, text)', 'admin_rotate_token(text, text, uuid)', 'admin_set_pin(text, text, text, text)']
  loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;
