-- ============================================================
-- Migration: Payment Term Confirmations
-- Run in Supabase SQL Editor
-- ============================================================

-- Track payment terms sent by trader and confirmed by each party
create table if not exists public.payment_term_confirmations (
  id            uuid primary key default uuid_generate_v4(),
  bill_id       uuid not null references public.monthly_bills(id) on delete cascade,
  party_id      uuid not null references public.users(id),
  trader_id     uuid not null references public.users(id),
  due_date      date not null,
  credit_days   int not null default 30,
  terms_note    text,
  status        text not null default 'pending'
                  check (status in ('pending', 'confirmed', 'disputed')),
  sent_at       timestamptz default now(),
  confirmed_at  timestamptz,
  dispute_note  text,
  created_at    timestamptz default now(),
  unique (bill_id, party_id)
);

alter table public.payment_term_confirmations enable row level security;

-- Trader: full access to confirmations for their bills
create policy "ptc: trader full access" on public.payment_term_confirmations
  for all using (trader_id = auth.uid());

-- Party: see and update their own confirmation
create policy "ptc: party read own" on public.payment_term_confirmations
  for select using (party_id = auth.uid());

create policy "ptc: party update own" on public.payment_term_confirmations
  for update using (party_id = auth.uid());

-- ============================================================
-- Extend notifications table to support party → trader flow
-- (notifications.user_id already targets recipient)
-- No schema change needed — parties insert with user_id = trader_id
-- ============================================================

-- Verify
select count(*) from public.payment_term_confirmations;
