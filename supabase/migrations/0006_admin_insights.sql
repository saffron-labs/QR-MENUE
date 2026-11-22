-- Extra numbers for the richer admin dashboard. Read-only, admin PIN gated.
create or replace function admin_insights(p_slug text, p_pin text, p_days integer default 1) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_chk jsonb; v_rest uuid; v_from timestamptz; v_prev_from timestamptz;
  v_days integer := greatest(1, least(coalesce(p_days, 1), 90));
  v_late constant interval := interval '20 minutes';
begin
  v_chk := admin_check(p_slug, p_pin);
  if v_chk ? 'error' then return v_chk; end if;
  v_rest := (v_chk->>'rest')::uuid;
  v_from := (date_trunc('day', now() at time zone 'Asia/Kolkata') - make_interval(days => v_days - 1)) at time zone 'Asia/Kolkata';
  v_prev_from := v_from - make_interval(days => v_days);

  return jsonb_build_object(
    'prev', (select jsonb_build_object(
        'orders', count(*) filter (where status <> 'cancelled'),
        'revenuePaise', coalesce(sum(total_paise) filter (where status <> 'cancelled'), 0),
        'avgPaise', coalesce(round(avg(total_paise) filter (where status <> 'cancelled')), 0),
        'taxPaise', coalesce(sum(tax_paise) filter (where status <> 'cancelled'), 0))
      from orders where restaurant_id = v_rest and created_at >= v_prev_from and created_at < v_from),
    'guests', (select (select count(*) from session_guests g join table_sessions s on s.id = g.session_id
                        where s.restaurant_id = v_rest and g.joined_at >= v_from)
                     + coalesce((select sum(guest_count) from orders where restaurant_id = v_rest and session_id is null
                        and created_at >= v_from and status <> 'cancelled'), 0)),
    'prevGuests', (select (select count(*) from session_guests g join table_sessions s on s.id = g.session_id
                        where s.restaurant_id = v_rest and g.joined_at >= v_prev_from and g.joined_at < v_from)
                     + coalesce((select sum(guest_count) from orders where restaurant_id = v_rest and session_id is null
                        and created_at >= v_prev_from and created_at < v_from and status <> 'cancelled'), 0)),
    'avgTableMin', (select round(avg(extract(epoch from closed_at - opened_at) / 60))::int from table_sessions
                     where restaurant_id = v_rest and status = 'closed' and close_reason = 'paid' and closed_at >= v_from),
    'prevAvgTableMin', (select round(avg(extract(epoch from closed_at - opened_at) / 60))::int from table_sessions
                     where restaurant_id = v_rest and status = 'closed' and close_reason = 'paid' and closed_at >= v_prev_from and closed_at < v_from),
    'avgOrderMin', (select round(avg(extract(epoch from updated_at - created_at) / 60))::int from orders
                     where restaurant_id = v_rest and status in ('ready', 'served') and created_at >= v_from),
    'revByHour', (select coalesce(jsonb_agg(coalesce(x.rev, 0) order by h.hr), '[]'::jsonb) from generate_series(0, 23) h(hr)
        left join (select extract(hour from created_at at time zone 'Asia/Kolkata')::int hr, sum(total_paise)::int rev from orders
                    where restaurant_id = v_rest and created_at >= v_from and status <> 'cancelled' group by 1) x on x.hr = h.hr),
    'prevRevByHour', (select coalesce(jsonb_agg(coalesce(x.rev, 0) order by h.hr), '[]'::jsonb) from generate_series(0, 23) h(hr)
        left join (select extract(hour from created_at at time zone 'Asia/Kolkata')::int hr, sum(total_paise)::int rev from orders
                    where restaurant_id = v_rest and created_at >= v_prev_from and created_at < v_from and status <> 'cancelled' group by 1) x on x.hr = h.hr),
    'prevByDay', (select coalesce(jsonb_agg(coalesce(x.rev, 0) order by d.day), '[]'::jsonb)
        from (select g::date as day from generate_series((v_prev_from at time zone 'Asia/Kolkata')::date, ((v_from at time zone 'Asia/Kolkata')::date - 1), interval '1 day') g) d
        left join (select (created_at at time zone 'Asia/Kolkata')::date as day, sum(total_paise)::int rev from orders
                    where restaurant_id = v_rest and created_at >= v_prev_from and created_at < v_from and status <> 'cancelled' group by 1) x on x.day = d.day),
    'byCategory', (select coalesce(jsonb_agg(t order by t."revenuePaise" desc), '[]'::jsonb) from (
        select c.name, sum(i.qty * i.unit_price_paise)::int as "revenuePaise"
          from order_items i join orders o on o.id = i.order_id
          join menu_items m on m.id = i.menu_item_id join categories c on c.id = m.category_id
         where o.restaurant_id = v_rest and o.created_at >= v_from and o.status <> 'cancelled'
         group by c.name) t),
    'pipeline', (select jsonb_build_object(
        'placed', count(*) filter (where status = 'placed'),
        'preparing', count(*) filter (where status = 'preparing'),
        'ready', count(*) filter (where status = 'ready'),
        'servedOpen', count(*) filter (where status = 'served' and session_id in (select id from table_sessions where status = 'open')))
      from orders where restaurant_id = v_rest and created_at >= now() - interval '1 day'),
    'late', (select coalesce(jsonb_agg(l order by l.minutes desc), '[]'::jsonb) from (
        select o.order_number as number, t.label as "table", o.status,
               (extract(epoch from now() - o.created_at) / 60)::int as minutes
          from orders o join dining_tables t on t.id = o.table_id
         where o.restaurant_id = v_rest and o.status in ('placed', 'preparing') and now() - o.created_at > v_late limit 6) l),
    'unavailable', (select coalesce(jsonb_agg(name order by name), '[]'::jsonb) from menu_items where restaurant_id = v_rest and not is_available),
    'floor', (select coalesce(jsonb_agg(f order by f.label), '[]'::jsonb) from (
        select t.label,
               s.code, s.party_size as "party",
               (select count(*) from session_guests g where g.session_id = s.id)::int as joined,
               coalesce((select sum(o.total_paise) from orders o where o.session_id = s.id and o.status <> 'cancelled'), 0)::int as "totalPaise",
               case
                 when s.id is null then 'free'
                 when exists (select 1 from orders o where o.session_id = s.id and o.status in ('placed', 'preparing') and now() - o.created_at > v_late) then 'late'
                 when exists (select 1 from orders o where o.session_id = s.id and o.status <> 'cancelled')
                  and not exists (select 1 from orders o where o.session_id = s.id and o.status in ('placed', 'preparing', 'ready')) then 'bill'
                 else 'eating' end as state,
               (extract(epoch from now() - coalesce((select max(o.updated_at) from orders o where o.session_id = s.id), s.opened_at)) / 60)::int as "quietMin"
          from dining_tables t
          left join table_sessions s on s.table_id = t.id and s.status = 'open'
         where t.restaurant_id = v_rest and t.is_active) f),
    'recent', (select coalesce(jsonb_agg(r order by r."createdAt" desc), '[]'::jsonb) from (
        select o.order_number as number, o.status, t.label as "table", o.customer_name as customer, o.guest_count as guests,
               o.total_paise as "totalPaise", o.created_at as "createdAt",
               (select string_agg(i.qty || ' x ' || i.name, ', ' order by i.name) from order_items i where i.order_id = o.id) as items
          from orders o join dining_tables t on t.id = o.table_id
         where o.restaurant_id = v_rest order by o.created_at desc limit 8) r),
    'timeline', (select coalesce(jsonb_agg(jsonb_build_object('hour', h.hr, 'orders', coalesce(o.n, 0), 'bills', coalesce(b.n, 0), 'late', coalesce(l.n, 0)) order by h.hr), '[]'::jsonb)
        from generate_series(0, 23) h(hr)
        left join (select extract(hour from created_at at time zone 'Asia/Kolkata')::int hr, count(*) n from orders
                    where restaurant_id = v_rest and created_at >= v_from and status <> 'cancelled' group by 1) o on o.hr = h.hr
        left join (select extract(hour from closed_at at time zone 'Asia/Kolkata')::int hr, count(*) n from table_sessions
                    where restaurant_id = v_rest and status = 'closed' and closed_at >= v_from group by 1) b on b.hr = h.hr
        left join (select extract(hour from created_at at time zone 'Asia/Kolkata')::int hr, count(*) n from orders
                    where restaurant_id = v_rest and created_at >= v_from and status <> 'cancelled' and updated_at - created_at > v_late group by 1) l on l.hr = h.hr)
  );
end $$;
revoke all on function admin_insights(text, text, integer) from public;
grant execute on function admin_insights(text, text, integer) to anon, authenticated;
