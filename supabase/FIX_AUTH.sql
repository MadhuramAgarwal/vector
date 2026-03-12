-- ════════════════════════════════════════════════════════════════════════════
-- FIX_AUTH.sql — Fix NULL token columns that GoTrue can't scan
-- ════════════════════════════════════════════════════════════════════════════

UPDATE auth.users SET
  confirmation_token    = COALESCE(confirmation_token, ''),
  recovery_token        = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  email_change          = COALESCE(email_change, ''),
  phone_change          = COALESCE(phone_change, ''),
  phone_change_token    = COALESCE(phone_change_token, ''),
  reauthentication_token = COALESCE(reauthentication_token, '')
WHERE email LIKE '%@sandx.com';
