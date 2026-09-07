-- ============================================================================
-- DANGER: IRREVERSIBLE LISTINGS RESET
-- ============================================================================
-- This script PERMANENTLY DELETES every listing, AI listing proposal, and
-- listing audit record in this Supabase project.
--
-- It does NOT delete user accounts, profiles, player rounds, user settings,
-- or company configuration (app_settings).
--
-- Run this ONLY in the Supabase SQL Editor, by hand, AFTER you have confirmed
-- the backup situation and you intend to wipe the listing catalog for the
-- Sherman beta-area restart.
--
-- Do not run this from the app, from a cron, or from a deployment.
-- There is no undo.
-- ============================================================================

begin;

delete from public.listing_audit;
delete from public.listing_proposals;
delete from public.listings;

commit;
