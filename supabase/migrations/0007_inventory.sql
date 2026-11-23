-- Inventory: ingredients, recipes (dish -> ingredients per portion), a stock ledger, automatic deduction when
-- orders are placed, automatic sold-out/back-in-stock for dishes, and admin-only RPCs.

create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  unit text not null check (unit in ('kg', 'g', 'l', 'ml', 'pcs', 'pack')),
  category text,
  qty_on_hand numeric(12, 3) not null default 0,
  reorder_level numeric(12, 3) not null default 0 check (reorder_level >= 0),
  cost_paise integer not null default 0 check (cost_paise >= 0),
  supplier text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists inventory_items_name_uq on inventory_items (restaurant_id, lower(name)) where is_active;

create table if not exists recipe_lines (
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  inventory_item_id uuid not null references inventory_items(id) on delete cascade,
  qty_per_portion numeric(12, 4) not null check (qty_per_portion > 0),
  primary key (menu_item_id, inventory_item_id)
);
create index if not exists recipe_lines_inv_idx on recipe_lines (inventory_item_id);

create table if not exists stock_movements (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  inventory_item_id uuid not null references inventory_items(id) on delete cascade,
  delta numeric(12, 3) not null,
  reason text not null check (reason in ('opening', 'purchase', 'sale', 'cancel', 'waste', 'adjust', 'count')),
  note text,
  order_id uuid references orders(id) on delete set null,
  cost_paise integer,
  created_at timestamptz not null default now()
);
create index if not exists stock_movements_item_idx on stock_movements (inventory_item_id, created_at desc);
create index if not exists stock_movements_rest_idx on stock_movements (restaurant_id, created_at desc);

alter table menu_items add column if not exists stock_disabled boolean not null default false;

alter table inventory_items enable row level security;
alter table recipe_lines enable row level security;
alter table stock_movements enable row level security;

-- Dishes switched off by empty stock come back when every ingredient is above zero again.
create or replace function inv_reenable(p_rest uuid) returns void
language sql security definer set search_path = public as $$
  update menu_items m set is_available = true, stock_disabled = false
   where m.restaurant_id = p_rest and m.stock_disabled
     and not exists (select 1 from recipe_lines rl join inventory_items i on i.id = rl.inventory_item_id
                      where rl.menu_item_id = m.id and i.is_active and i.qty_on_hand <= 0);
$$;
revoke all on function inv_reenable(uuid) from public, anon, authenticated;

-- Selling a dish uses up its ingredients.
create or replace function inv_on_order_item() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_rest uuid; r record; v_use numeric; v_left numeric;
begin
  if new.menu_item_id is null then return new; end if;
  select restaurant_id into v_rest from orders where id = new.order_id;
  for r in select rl.inventory_item_id as inv, rl.qty_per_portion as per
             from recipe_lines rl join inventory_items i on i.id = rl.inventory_item_id
            where rl.menu_item_id = new.menu_item_id and i.is_active loop
    v_use := r.per * new.qty;
    update inventory_items set qty_on_hand = qty_on_hand - v_use, updated_at = now() where id = r.inv returning qty_on_hand into v_left;
    insert into stock_movements (restaurant_id, inventory_item_id, delta, reason, order_id) values (v_rest, r.inv, -v_use, 'sale', new.order_id);
    if v_left <= 0 then
      update menu_items set is_available = false, stock_disabled = true
       where is_available and id in (select menu_item_id from recipe_lines where inventory_item_id = r.inv);
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists order_items_inventory on order_items;
create trigger order_items_inventory after insert on order_items for each row execute function inv_on_order_item();

-- A cancelled order puts its ingredients back (once).
create or replace function inv_on_order_cancel() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.status = 'cancelled' and old.status <> 'cancelled'
     and not exists (select 1 from stock_movements where order_id = new.id and reason = 'cancel') then
    for r in select inventory_item_id as inv, sum(-delta) as qty from stock_movements where order_id = new.id and reason = 'sale' group by inventory_item_id loop
      update inventory_items set qty_on_hand = qty_on_hand + r.qty, updated_at = now() where id = r.inv;
      insert into stock_movements (restaurant_id, inventory_item_id, delta, reason, order_id) values (new.restaurant_id, r.inv, r.qty, 'cancel', new.id);
    end loop;
    perform inv_reenable(new.restaurant_id);
  end if;
  return new;
end $$;
drop trigger if exists orders_inventory_cancel on orders;
create trigger orders_inventory_cancel after update of status on orders for each row execute function inv_on_order_cancel();

-- ---------- admin RPCs ----------
create or replace function admin_inventory(p_slug text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_chk jsonb; v_rest uuid; v_since timestamptz := now() - interval '7 days';
begin
  v_chk := admin_check(p_slug, p_pin);
  if v_chk ? 'error' then return v_chk; end if;
  v_rest := (v_chk->>'rest')::uuid;
  return jsonb_build_object(
    'items', (select coalesce(jsonb_agg(t order by t.status_rank, t.name), '[]'::jsonb) from (
        select i.id, i.name, i.unit, i.category, i.qty_on_hand::float8 as qty, i.reorder_level::float8 as "reorderLevel",
               i.cost_paise as "costPaise", i.supplier,
               case when i.qty_on_hand <= 0 then 'out' when i.reorder_level > 0 and i.qty_on_hand <= i.reorder_level then 'low' else 'ok' end as status,
               case when i.qty_on_hand <= 0 then 0 when i.reorder_level > 0 and i.qty_on_hand <= i.reorder_level then 1 else 2 end as status_rank,
               coalesce(u.used, 0)::float8 as "used7d",
               case when coalesce(u.used, 0) > 0 then round((i.qty_on_hand / (u.used / 7.0))::numeric, 1)::float8 end as "daysLeft",
               round(greatest(i.qty_on_hand, 0) * i.cost_paise)::bigint as "valuePaise",
               (select count(*) from recipe_lines rl where rl.inventory_item_id = i.id)::int as dishes
          from inventory_items i
          left join (select inventory_item_id, -sum(delta) as used from stock_movements
                      where restaurant_id = v_rest and reason in ('sale', 'cancel') and created_at >= v_since group by 1) u on u.inventory_item_id = i.id
         where i.restaurant_id = v_rest and i.is_active) t),
    'dishes', (select coalesce(jsonb_agg(d order by d."categoryName", d.name), '[]'::jsonb) from (
        select m.id, m.name, c.name as "categoryName", m.is_available as available, m.stock_disabled as "stockDisabled",
               (select coalesce(jsonb_agg(jsonb_build_object('itemId', rl.inventory_item_id, 'qty', rl.qty_per_portion::float8)), '[]'::jsonb)
                  from recipe_lines rl join inventory_items i on i.id = rl.inventory_item_id where rl.menu_item_id = m.id and i.is_active) as recipe
          from menu_items m join categories c on c.id = m.category_id where m.restaurant_id = v_rest) d),
    'movements', (select coalesce(jsonb_agg(x order by x."createdAt" desc), '[]'::jsonb) from (
        select s.id, i.name as "itemName", i.unit, s.delta::float8 as delta, s.reason, s.note, s.created_at as "createdAt", o.order_number as "orderNumber"
          from stock_movements s join inventory_items i on i.id = s.inventory_item_id left join orders o on o.id = s.order_id
         where s.restaurant_id = v_rest order by s.created_at desc limit 60) x),
    'wasteWeekPaise', (select coalesce(round(sum(-s.delta * coalesce(s.cost_paise, i.cost_paise))), 0)::bigint
                         from stock_movements s join inventory_items i on i.id = s.inventory_item_id
                        where s.restaurant_id = v_rest and s.reason = 'waste' and s.created_at >= v_since));
end $$;

create or replace function admin_save_inv_item(p_slug text, p_pin text, p_item jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_chk jsonb; v_rest uuid; v_id uuid; v_name text; v_unit text; v_qty numeric;
begin
  v_chk := admin_check(p_slug, p_pin);
  if v_chk ? 'error' then return v_chk; end if;
  v_rest := (v_chk->>'rest')::uuid;
  v_name := btrim(coalesce(p_item->>'name', ''));
  v_unit := coalesce(p_item->>'unit', '');
  if v_name = '' or length(v_name) > 80 then return jsonb_build_object('error', 'Give the item a name (up to 80 characters).'); end if;
  if v_unit not in ('kg', 'g', 'l', 'ml', 'pcs', 'pack') then return jsonb_build_object('error', 'Pick a unit.'); end if;
  if coalesce((p_item->>'reorderLevel')::numeric, 0) < 0 or coalesce((p_item->>'costPaise')::integer, 0) < 0 then
    return jsonb_build_object('error', 'Numbers cannot be negative.');
  end if;
  if nullif(p_item->>'id', '') is not null then
    update inventory_items set name = v_name, unit = v_unit, category = nullif(btrim(coalesce(p_item->>'category', '')), ''),
           reorder_level = coalesce((p_item->>'reorderLevel')::numeric, 0), cost_paise = coalesce((p_item->>'costPaise')::integer, 0),
           supplier = nullif(btrim(coalesce(p_item->>'supplier', '')), ''), updated_at = now()
     where id = (p_item->>'id')::uuid and restaurant_id = v_rest and is_active returning id into v_id;
    if v_id is null then return jsonb_build_object('error', 'Item not found.'); end if;
  else
    if exists (select 1 from inventory_items where restaurant_id = v_rest and is_active and lower(name) = lower(v_name)) then
      return jsonb_build_object('error', 'You already have an item with that name.');
    end if;
    v_qty := greatest(coalesce((p_item->>'qty')::numeric, 0), 0);
    insert into inventory_items (restaurant_id, name, unit, category, qty_on_hand, reorder_level, cost_paise, supplier)
    values (v_rest, v_name, v_unit, nullif(btrim(coalesce(p_item->>'category', '')), ''), v_qty, coalesce((p_item->>'reorderLevel')::numeric, 0),
            coalesce((p_item->>'costPaise')::integer, 0), nullif(btrim(coalesce(p_item->>'supplier', '')), '')) returning id into v_id;
    if v_qty > 0 then insert into stock_movements (restaurant_id, inventory_item_id, delta, reason, note) values (v_rest, v_id, v_qty, 'opening', 'Opening stock'); end if;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function admin_delete_inv_item(p_slug text, p_pin text, p_item_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_chk jsonb; v_rest uuid;
begin
  v_chk := admin_check(p_slug, p_pin);
  if v_chk ? 'error' then return v_chk; end if;
  v_rest := (v_chk->>'rest')::uuid;
  delete from recipe_lines where inventory_item_id = p_item_id and inventory_item_id in (select id from inventory_items where restaurant_id = v_rest);
  update inventory_items set is_active = false, updated_at = now() where id = p_item_id and restaurant_id = v_rest;
  perform inv_reenable(v_rest);
  return jsonb_build_object('ok', true);
end $$;

-- mode: purchase (add), waste (remove), adjust (signed change), count (set the real amount)
create or replace function admin_stock_move(p_slug text, p_pin text, p_item_id uuid, p_mode text, p_qty numeric, p_note text default null, p_cost_paise integer default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_chk jsonb; v_rest uuid; v_cur numeric; v_delta numeric; v_reason text;
begin
  v_chk := admin_check(p_slug, p_pin);
  if v_chk ? 'error' then return v_chk; end if;
  v_rest := (v_chk->>'rest')::uuid;
  if p_qty is null then return jsonb_build_object('error', 'Enter a quantity.'); end if;
  select qty_on_hand into v_cur from inventory_items where id = p_item_id and restaurant_id = v_rest and is_active for update;
  if v_cur is null then return jsonb_build_object('error', 'Item not found.'); end if;
  if p_mode = 'purchase' then
    if p_qty <= 0 then return jsonb_build_object('error', 'Enter how much arrived.'); end if;
    v_delta := p_qty; v_reason := 'purchase';
  elsif p_mode = 'waste' then
    if p_qty <= 0 then return jsonb_build_object('error', 'Enter how much was wasted.'); end if;
    if p_qty > greatest(v_cur, 0) then return jsonb_build_object('error', 'That is more than the stock on hand.'); end if;
    v_delta := -p_qty; v_reason := 'waste';
  elsif p_mode = 'adjust' then
    if p_qty = 0 then return jsonb_build_object('error', 'Enter a change other than zero.'); end if;
    v_delta := p_qty; v_reason := 'adjust';
  elsif p_mode = 'count' then
    if p_qty < 0 then return jsonb_build_object('error', 'Stock cannot be negative.'); end if;
    v_delta := p_qty - v_cur; v_reason := 'count';
    if v_delta = 0 then return jsonb_build_object('ok', true); end if;
  else
    return jsonb_build_object('error', 'Unknown action.');
  end if;
  update inventory_items set qty_on_hand = qty_on_hand + v_delta, updated_at = now(),
         cost_paise = case when v_reason = 'purchase' and p_cost_paise is not null and p_cost_paise >= 0 then p_cost_paise else cost_paise end
   where id = p_item_id;
  insert into stock_movements (restaurant_id, inventory_item_id, delta, reason, note, cost_paise)
  values (v_rest, p_item_id, v_delta, v_reason, nullif(btrim(coalesce(p_note, '')), ''), case when v_reason = 'purchase' then p_cost_paise end);
  perform inv_reenable(v_rest);
  -- stock that ran out by a count or waste also switches its dishes off
  if (select qty_on_hand from inventory_items where id = p_item_id) <= 0 then
    update menu_items set is_available = false, stock_disabled = true
     where is_available and restaurant_id = v_rest and id in (select menu_item_id from recipe_lines where inventory_item_id = p_item_id);
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function admin_save_recipe(p_slug text, p_pin text, p_menu_item_id uuid, p_lines jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_chk jsonb; v_rest uuid; l jsonb;
begin
  v_chk := admin_check(p_slug, p_pin);
  if v_chk ? 'error' then return v_chk; end if;
  v_rest := (v_chk->>'rest')::uuid;
  if not exists (select 1 from menu_items where id = p_menu_item_id and restaurant_id = v_rest) then return jsonb_build_object('error', 'Dish not found.'); end if;
  delete from recipe_lines where menu_item_id = p_menu_item_id;
  for l in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    if coalesce((l->>'qty')::numeric, 0) <= 0 then continue; end if;
    insert into recipe_lines (menu_item_id, inventory_item_id, qty_per_portion)
    select p_menu_item_id, i.id, (l->>'qty')::numeric from inventory_items i
     where i.id = (l->>'itemId')::uuid and i.restaurant_id = v_rest and i.is_active
    on conflict (menu_item_id, inventory_item_id) do update set qty_per_portion = excluded.qty_per_portion;
  end loop;
  perform inv_reenable(v_rest);
  return jsonb_build_object('ok', true);
end $$;

create or replace function admin_inv_quickstart(p_slug text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_chk jsonb; v_rest uuid;
begin
  v_chk := admin_check(p_slug, p_pin);
  if v_chk ? 'error' then return v_chk; end if;
  v_rest := (v_chk->>'rest')::uuid;
  insert into inventory_items (restaurant_id, name, unit, category)
  select v_rest, s.name, s.unit, s.category from (values
    ('Chicken', 'kg', 'Meat'), ('Mutton', 'kg', 'Meat'), ('Mandi rice', 'kg', 'Dry goods'), ('Basmati rice', 'kg', 'Dry goods'),
    ('Cooking oil', 'l', 'Dry goods'), ('Onion', 'kg', 'Vegetables'), ('Tomato', 'kg', 'Vegetables'), ('Garlic', 'kg', 'Vegetables'),
    ('Mandi spice mix', 'kg', 'Spices'), ('Shawarma bread', 'pcs', 'Bakery'), ('Mayonnaise', 'kg', 'Sauces'), ('Lemon', 'pcs', 'Vegetables'),
    ('Cold drink cans', 'pcs', 'Drinks'), ('Packaged water', 'pcs', 'Drinks')) as s(name, unit, category)
  on conflict do nothing;
  return jsonb_build_object('ok', true);
end $$;

create or replace function admin_stock_alerts(p_slug text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_chk jsonb; v_rest uuid;
begin
  v_chk := admin_check(p_slug, p_pin);
  if v_chk ? 'error' then return v_chk; end if;
  v_rest := (v_chk->>'rest')::uuid;
  return jsonb_build_object('items', (select coalesce(jsonb_agg(t order by t.rank, t.name), '[]'::jsonb) from (
    select i.name, i.unit, i.qty_on_hand::float8 as qty, i.reorder_level::float8 as "reorderLevel",
           case when i.qty_on_hand <= 0 then 'out' else 'low' end as status, case when i.qty_on_hand <= 0 then 0 else 1 end as rank
      from inventory_items i
     where i.restaurant_id = v_rest and i.is_active and (i.qty_on_hand <= 0 or (i.reorder_level > 0 and i.qty_on_hand <= i.reorder_level)) limit 12) t));
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'admin_inventory(text, text)', 'admin_save_inv_item(text, text, jsonb)', 'admin_delete_inv_item(text, text, uuid)',
    'admin_stock_move(text, text, uuid, text, numeric, text, integer)', 'admin_save_recipe(text, text, uuid, jsonb)',
    'admin_inv_quickstart(text, text)', 'admin_stock_alerts(text, text)']
  loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;
