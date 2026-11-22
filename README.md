# Chackos QR ordering

Guests scan a table QR code, browse the menu, customise dishes, place an order and watch its status.
Everything else (kitchen screen, staff dashboard, payments) comes in later milestones.

Stack: Next.js 16 (App Router) · Supabase (Postgres) · Tailwind 4.

## Run it

1. Create a Supabase project and run, in order: `supabase/migrations/0001_init.sql`, `0002_public_rpc.sql`, then `supabase/seed.sql`.
2. `cp .env.example .env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (public values only; no secret key is needed).
3. `npm install && npm run dev`
4. Open `/r/chackos/t/<table token>`. Tokens are in the `dining_tables` table; print them as QR codes.

## How it works

- QR → `/r/{restaurant-slug}/t/{table-token}`. The token is random and identifies the table, so guests cannot guess other tables. Set `is_active = false` to invalidate a QR.
- The browser sends only item ids, option ids and quantities to the `place_order` database function, which prices the order from database prices, validates choices and adds GST. Orders, tables and counters have no public access; the public key can only read the menu and call three functions (`get_table`, `place_order`, `get_order`).
- The status screen polls `get_order` every 5 s.
- Money is stored as integer paise.

## Scripts

- `npm test` pricing unit tests · `npm run lint` · `npm run build`
- `npm run seed:generate` rebuilds `supabase/seed.sql` from `scripts/chackos-menu.source.json`

## Known gaps (deliberate, next milestones)

- No payment: guests pay at the counter.
- No staff view of incoming orders, and no way to change status yet (status stays `placed`).
- `/admin/tables` is protected only by `ADMIN_SECRET`; replace with real staff auth.
- Rate limiting is in-memory per instance; use a shared store before scaling out.
- No idempotency key: a double tap after a network blip could create two orders.
- Dish photos in the seed are stock images and often don't match the dish; use real photos.
