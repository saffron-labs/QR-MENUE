-- Chackos QR ordering: core schema. All money is stored as integer paise.

create extension if not exists pgcrypto;

create table restaurants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  tagline text,
  address text,
  phone text,
  hours text,
  gst_rate_bp integer not null default 500, -- basis points: 500 = 5%
  created_at timestamptz not null default now()
);

create table dining_tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  label text not null,
  -- unguessable token printed in the QR; never the table label
  token text not null unique default encode(gen_random_bytes(12), 'hex'),
  is_active boolean not null default true,
  unique (restaurant_id, label)
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  slug text not null,
  name text not null,
  sort_order integer not null default 0,
  unique (restaurant_id, slug)
);

create table menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  name text not null,
  description text,
  price_paise integer not null check (price_paise >= 0),
  image_url text,
  prep_time text,
  tags text[] not null default '{}',
  is_available boolean not null default true,
  sort_order integer not null default 0
);
create index on menu_items (restaurant_id, category_id);

create table modifier_groups (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  name text not null,
  min_select integer not null default 0,
  max_select integer not null default 1,
  sort_order integer not null default 0,
  check (min_select >= 0 and max_select >= min_select)
);
create index on modifier_groups (menu_item_id);

create table modifier_options (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references modifier_groups(id) on delete cascade,
  name text not null,
  price_delta_paise integer not null default 0,
  is_default boolean not null default false,
  sort_order integer not null default 0
);
create index on modifier_options (group_id);

create type order_status as enum ('placed', 'preparing', 'ready', 'served', 'cancelled');

create table orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  table_id uuid not null references dining_tables(id),
  order_number integer not null,
  status order_status not null default 'placed',
  customer_name text,
  guest_count integer,
  notes text,
  subtotal_paise integer not null,
  tax_paise integer not null,
  total_paise integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, order_number)
);
create index on orders (restaurant_id, status, created_at);
create index on orders (table_id, created_at);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  menu_item_id uuid references menu_items(id) on delete set null,
  name text not null,                -- snapshot at order time
  unit_price_paise integer not null, -- base + modifiers, snapshot
  qty integer not null check (qty between 1 and 50),
  modifiers jsonb not null default '[]',
  notes text
);
create index on order_items (order_id);

-- Per-restaurant order numbers (1, 2, 3 ...) allocated atomically.
create table order_counters (
  restaurant_id uuid primary key references restaurants(id) on delete cascade,
  last_number integer not null default 0
);

create function next_order_number(p_restaurant uuid) returns integer
language plpgsql as $$
declare n integer;
begin
  insert into order_counters (restaurant_id, last_number) values (p_restaurant, 1)
  on conflict (restaurant_id) do update set last_number = order_counters.last_number + 1
  returning last_number into n;
  return n;
end $$;

-- Row level security: the public (anon key) may read the menu only.
-- Orders, tables and counters are touched exclusively by the server using the
-- service role key, so there are deliberately no policies on them.
alter table restaurants enable row level security;
alter table dining_tables enable row level security;
alter table categories enable row level security;
alter table menu_items enable row level security;
alter table modifier_groups enable row level security;
alter table modifier_options enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_counters enable row level security;

create policy "public read restaurants" on restaurants for select using (true);
create policy "public read categories" on categories for select using (true);
create policy "public read menu" on menu_items for select using (true);
create policy "public read modifier groups" on modifier_groups for select using (true);
create policy "public read modifier options" on modifier_options for select using (true);
