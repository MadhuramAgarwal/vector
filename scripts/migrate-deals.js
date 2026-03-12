const { Client } = require('pg')

const client = new Client({
  connectionString: 'postgresql://postgres:dICg7eTGIHhclcAQ@db.usivkqiyxpycegkqpekw.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
})

const SQL = `
-- ── deals ─────────────────────────────────────────────────────────────────
create table if not exists public.deals (
  id uuid default gen_random_uuid() primary key,
  trader_id uuid references public.users(id) on delete cascade,
  party_id uuid references public.users(id) on delete cascade,
  party_role text check (party_role in ('supplier','driver','buyer')),
  material_type text default 'Sand',
  default_rate_per_mt numeric not null,
  payment_terms text check (payment_terms in ('prepaid','on_delivery','monthly','credit')),
  credit_days integer default 0,
  is_active boolean default true,
  created_at timestamp with time zone default now()
);

-- ── trip_rates ────────────────────────────────────────────────────────────
create table if not exists public.trip_rates (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid references public.trips(id) on delete cascade,
  party_id uuid references public.users(id) on delete cascade,
  party_role text check (party_role in ('supplier','driver','buyer')),
  default_rate_per_mt numeric,
  proposed_rate_per_mt numeric,
  agreed_rate_per_mt numeric,
  weight_mt numeric,
  total_amount numeric,
  rate_status text default 'pending' check (rate_status in ('pending','proposed','accepted','rejected')),
  proposed_at timestamp with time zone,
  responded_at timestamp with time zone,
  expires_at timestamp with time zone
);

-- ── monthly_bills ─────────────────────────────────────────────────────────
create table if not exists public.monthly_bills (
  id uuid default gen_random_uuid() primary key,
  trader_id uuid references public.users(id) on delete cascade,
  party_id uuid references public.users(id) on delete cascade,
  party_role text check (party_role in ('supplier','driver','buyer')),
  month integer check (month between 1 and 12),
  year integer,
  total_trips integer default 0,
  total_weight_mt numeric default 0,
  total_amount numeric default 0,
  pdf_url text,
  status text default 'unpaid' check (status in ('unpaid','partially_paid','paid')),
  amount_paid numeric default 0,
  due_date date,
  generated_at timestamp with time zone default now(),
  paid_at timestamp with time zone
);

-- ── bill_trips ────────────────────────────────────────────────────────────
create table if not exists public.bill_trips (
  id uuid default gen_random_uuid() primary key,
  bill_id uuid references public.monthly_bills(id) on delete cascade,
  trip_id uuid references public.trips(id) on delete cascade,
  bilty_no text,
  truck_number text,
  supply_date date,
  weight_at_source_mt numeric,
  weight_at_party_mt numeric,
  rate_per_mt numeric,
  amount numeric
);

-- ── payment_logs ──────────────────────────────────────────────────────────
create table if not exists public.payment_logs (
  id uuid default gen_random_uuid() primary key,
  bill_id uuid references public.monthly_bills(id) on delete cascade,
  amount numeric not null,
  payment_method text default 'simulated',
  payment_direction text check (payment_direction in ('received','sent')),
  logged_by uuid references public.users(id),
  note text,
  created_at timestamp with time zone default now()
);

-- ── trips extra columns ───────────────────────────────────────────────────
alter table public.trips add column if not exists supplier_rate_per_mt numeric;
alter table public.trips add column if not exists transport_rate_per_mt numeric;
alter table public.trips add column if not exists sale_rate_per_mt numeric;
alter table public.trips add column if not exists supplier_amount numeric;
alter table public.trips add column if not exists transport_amount numeric;
alter table public.trips add column if not exists sale_amount numeric;
alter table public.trips add column if not exists gross_margin numeric;
alter table public.trips add column if not exists margin_percentage numeric;
alter table public.trips add column if not exists bilty_no text;
alter table public.trips add column if not exists pod text;

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.deals enable row level security;
alter table public.trip_rates enable row level security;
alter table public.monthly_bills enable row level security;
alter table public.bill_trips enable row level security;
alter table public.payment_logs enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='deals' and policyname='Allow all for now') then
    create policy "Allow all for now" on public.deals for all using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='trip_rates' and policyname='Allow all for now') then
    create policy "Allow all for now" on public.trip_rates for all using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='monthly_bills' and policyname='Allow all for now') then
    create policy "Allow all for now" on public.monthly_bills for all using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='bill_trips' and policyname='Allow all for now') then
    create policy "Allow all for now" on public.bill_trips for all using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='payment_logs' and policyname='Allow all for now') then
    create policy "Allow all for now" on public.payment_logs for all using (true);
  end if;
end $$;
`

async function run() {
  await client.connect()
  console.log('Connected.')
  await client.query(SQL)
  console.log('Migration complete.')
  await client.end()
}

run().catch(e => { console.error(e.message); client.end() })
