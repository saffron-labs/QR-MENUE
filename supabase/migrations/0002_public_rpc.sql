-- Server-side ordering through SECURITY DEFINER functions so the web app needs only the public
-- (publishable) key. Prices are always computed here from database prices.

create or replace function get_table(p_slug text, p_token text) returns jsonb
language sql security definer stable set search_path = public as $$
  select jsonb_build_object('label', t.label)
  from dining_tables t join restaurants r on r.id = t.restaurant_id
  where r.slug = p_slug and t.token = p_token and t.is_active
$$;

create or replace function place_order(
  p_slug text, p_token text, p_customer text, p_guests integer, p_notes text, p_lines jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_rest restaurants%rowtype;
  v_table dining_tables%rowtype;
  v_line jsonb;
  v_item menu_items%rowtype;
  v_qty integer;
  v_opts uuid[];
  v_group record;
  v_sel integer;
  v_unit integer;
  v_chosen jsonb;
  v_note text;
  v_subtotal integer := 0;
  v_tax integer;
  v_lines jsonb := '[]'::jsonb;
  v_order_id uuid;
  v_num integer;
begin
  select * into v_rest from restaurants where slug = p_slug;
  if not found then raise exception 'Restaurant not found.'; end if;

  select * into v_table from dining_tables
   where restaurant_id = v_rest.id and token = p_token and is_active;
  if not found then
    raise exception 'This QR code is no longer valid. Please ask staff for help.';
  end if;

  if exists (select 1 from orders where table_id = v_table.id and created_at > now() - interval '4 seconds') then
    raise exception 'Please wait a moment before ordering again.';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 40 then
    raise exception 'Your cart is empty.';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    select * into v_item from menu_items
     where id = (v_line->>'itemId')::uuid and restaurant_id = v_rest.id;
    if not found then raise exception 'An item in your cart no longer exists.'; end if;
    if not v_item.is_available then raise exception '% is sold out right now.', v_item.name; end if;

    v_qty := (v_line->>'qty')::integer;
    if v_qty is null or v_qty not between 1 and 20 then
      raise exception 'Invalid quantity for %.', v_item.name;
    end if;

    v_opts := array(select (jsonb_array_elements_text(coalesce(v_line->'optionIds', '[]'::jsonb)))::uuid);
    if cardinality(v_opts) > 30 or cardinality(v_opts) <> (select count(distinct x) from unnest(v_opts) x) then
      raise exception 'Invalid options for %.', v_item.name;
    end if;
    if (select count(*) from modifier_options o join modifier_groups g on g.id = o.group_id
         where o.id = any (v_opts) and g.menu_item_id = v_item.id) <> cardinality(v_opts) then
      raise exception 'Invalid options for %.', v_item.name;
    end if;

    v_unit := v_item.price_paise;
    v_chosen := '[]'::jsonb;
    for v_group in select * from modifier_groups where menu_item_id = v_item.id loop
      select count(*) into v_sel from modifier_options where group_id = v_group.id and id = any (v_opts);
      if v_sel < v_group.min_select or v_sel > v_group.max_select then
        raise exception 'Please review "%" for %.', v_group.name, v_item.name;
      end if;
      select v_chosen || coalesce(jsonb_agg(jsonb_build_object(
               'group', v_group.name, 'option', o.name, 'priceDeltaPaise', o.price_delta_paise)), '[]'::jsonb),
             v_unit + coalesce(sum(o.price_delta_paise), 0)
        into v_chosen, v_unit
        from modifier_options o where o.group_id = v_group.id and o.id = any (v_opts);
    end loop;

    v_note := nullif(left(btrim(coalesce(v_line->>'notes', '')), 200), '');
    v_subtotal := v_subtotal + v_unit * v_qty;
    v_lines := v_lines || jsonb_build_object(
      'itemId', v_item.id, 'name', v_item.name, 'unit', v_unit, 'qty', v_qty, 'chosen', v_chosen, 'notes', v_note);
  end loop;

  v_tax := round(v_subtotal * v_rest.gst_rate_bp / 10000.0)::integer;
  v_num := next_order_number(v_rest.id);

  insert into orders (restaurant_id, table_id, order_number, customer_name, guest_count, notes,
                      subtotal_paise, tax_paise, total_paise)
  values (v_rest.id, v_table.id, v_num,
          nullif(left(btrim(coalesce(p_customer, '')), 60), ''),
          case when p_guests between 1 and 30 then p_guests end,
          nullif(left(btrim(coalesce(p_notes, '')), 300), ''),
          v_subtotal, v_tax, v_subtotal + v_tax)
  returning id into v_order_id;

  insert into order_items (order_id, menu_item_id, name, unit_price_paise, qty, modifiers, notes)
  select v_order_id, (l->>'itemId')::uuid, l->>'name', (l->>'unit')::integer, (l->>'qty')::integer,
         l->'chosen', l->>'notes'
  from jsonb_array_elements(v_lines) l;

  return jsonb_build_object('orderId', v_order_id, 'orderNumber', v_num);
end $$;

create or replace function get_order(p_order_id uuid) returns jsonb
language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'status', o.status, 'orderNumber', o.order_number, 'totalPaise', o.total_paise,
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'qty', i.qty) order by i.name)
                         from order_items i where i.order_id = o.id), '[]'::jsonb))
  from orders o where o.id = p_order_id
$$;

revoke all on function get_table(text, text) from public;
revoke all on function place_order(text, text, text, integer, text, jsonb) from public;
revoke all on function get_order(uuid) from public;
grant execute on function get_table(text, text) to anon, authenticated;
grant execute on function place_order(text, text, text, integer, text, jsonb) to anon, authenticated;
grant execute on function get_order(uuid) to anon, authenticated;

-- Photos shipped with the web app (public/menu).
update menu_items set image_url = case name
  when 'Kuzhi Mandi (with Mandi Rice)' then '/menu/kuzhi.webp'
  when 'Alfaham Mandi / Biryani Combo' then '/menu/alfaham.webp'
  when 'Shawaya Mandi / Biryani Combo' then '/menu/shawaya.webp'
  when 'Peri Peri Mandi / Biryani Combo' then '/menu/peri.webp'
  when 'Shawaya Masala Mandi / Biryani Combo' then '/menu/shawmasala.webp'
  when 'Honey Chilli Mandi / Biryani Combo' then '/menu/honey.webp'
  when 'Creamy Mandi / Biryani Combo' then '/menu/creamy.webp'
  when 'Chicken Shawarma Roll' then '/menu/roll.webp'
  when 'Full Meat Shawarma Roll' then '/menu/fullroll.webp'
  when 'Shawarma Plate' then '/menu/plate.webp'
  when 'Alfaham Classic (1 Pc)' then '/menu/alfchicken.webp'
  when 'Alfaham Peri Peri (1 Pc)' then '/menu/alfchicken.webp'
  when 'Alfaham Butter Pepper (1 Pc)' then '/menu/alfchicken.webp'
  when 'Alfaham Honey Chilli (1 Pc)' then '/menu/alfchicken.webp'
  when 'Alfaham Creamy (1 Pc)' then '/menu/alfchicken.webp'
  when 'Shawaya Classic (1 Pc)' then '/menu/shawchicken.webp'
  when 'Shawaya Masala (1 Pc)' then '/menu/shawchicken.webp'
  when 'Chackos Chicken Curry' then '/menu/curry.webp'
  when 'Kerala Porotta' then '/menu/porotta.webp'
  when 'Rumali Roti' then '/menu/rumali.webp'
  when 'Chicken Dum Biryani' then '/menu/biryani.webp'
  when 'Garlic Mayo (Toum Dip)' then '/menu/mayo.webp'
  when 'Tomato Chutney (Sahawiq/Dakkoos)' then '/menu/chutney.webp'
  when 'Mint Chutney' then '/menu/mint.webp'
  else null end;
