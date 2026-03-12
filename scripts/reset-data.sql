-- =============================================
-- RESET: Delete all test data
-- Run in Supabase SQL Editor
-- =============================================

-- Disable triggers temporarily to avoid cascade issues
set session_replication_role = replica;

-- Clear in dependency order (children first)
delete from public.ai_conversations;
delete from public.payment_term_confirmations;
delete from public.trip_status_log;
delete from public.trip_rates;
delete from public.weight_slips;
delete from public.royalty_passes;
delete from public.challans;
delete from public.dispatch_trucks;
delete from public.dispatch_batches;
delete from public.fleet_availability;
delete from public.buyer_demand;
delete from public.notifications;
delete from public.monthly_bills;
delete from public.trips;
delete from public.orders;

-- Re-enable triggers
set session_replication_role = default;

-- Clear storage: delete all files from documents and challans buckets
delete from storage.objects where bucket_id = 'documents';
delete from storage.objects where bucket_id = 'challans';

select 'All test data cleared.' as result;
