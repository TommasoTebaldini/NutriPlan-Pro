-- ═══════════════════════════════════════════════════════════════
-- Migration 001: Add Subscription Fields to profiles table
-- Run this in Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- Add subscription columns to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS subscription_plan     TEXT    NOT NULL DEFAULT 'free'
                                                 CHECK (subscription_plan IN ('free','pro')),
  ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_customer_id    TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Index for webhook lookups by stripe_subscription_id
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_sub
  ON profiles(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- Index for expiry checks (cleanup jobs / reports)
CREATE INDEX IF NOT EXISTS idx_profiles_sub_expires
  ON profiles(subscription_expires_at)
  WHERE subscription_expires_at IS NOT NULL;

-- ── Auto-downgrade expired subscriptions (runs every hour via pg_cron) ──
-- Enable pg_cron in Supabase: Dashboard → Extensions → pg_cron
-- Then run:
/*
SELECT cron.schedule(
  'downgrade-expired-subs',
  '0 * * * *',   -- every hour
  $$
    UPDATE profiles
    SET subscription_plan = 'free'
    WHERE subscription_plan = 'pro'
      AND subscription_expires_at IS NOT NULL
      AND subscription_expires_at < NOW();
  $$
);
*/

-- ── Row Level Security: users can read their own subscription ──
-- (profiles table already has RLS enabled; this adds the sub fields to existing policies)

-- Allow users to read their own subscription data (should already be covered by existing RLS)
-- Allow service role to update subscription data (used by webhook)
-- No changes needed to RLS if existing SELECT policy covers all columns.
