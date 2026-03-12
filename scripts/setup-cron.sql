-- Run this in the Supabase SQL Editor to schedule the payment-reminders Edge Function
-- Requires pg_cron extension (enabled by default in Supabase)

-- Enable pg_cron if not already enabled
create extension if not exists pg_cron;

-- Remove old job if exists
select cron.unschedule('payment-reminders') where exists (
  select 1 from cron.job where jobname = 'payment-reminders'
);

-- Schedule: daily at 9:00 AM IST = 03:30 UTC
select cron.schedule(
  'payment-reminders',
  '30 3 * * *',
  $$
  select net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/payment-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Verify cron job is scheduled
select * from cron.job where jobname = 'payment-reminders';
