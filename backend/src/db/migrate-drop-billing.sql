-- Migration: drop billing columns from accounts table
-- Run once against existing databases that have the old schema.
--
-- SQLite does not support DROP COLUMN before 3.35.0.
-- If your SQLite version is older, recreate the table instead.

-- Drop billing columns (requires SQLite >= 3.35.0)
ALTER TABLE accounts DROP COLUMN IF EXISTS plan;
ALTER TABLE accounts DROP COLUMN IF EXISTS stripe_customer_id;
ALTER TABLE accounts DROP COLUMN IF EXISTS stripe_subscription_id;
ALTER TABLE accounts DROP COLUMN IF EXISTS has_payment_method;
ALTER TABLE accounts DROP COLUMN IF EXISTS trial_emails_used;

-- usage_events table (if it was ever created): drop it entirely
DROP TABLE IF EXISTS usage_events;
